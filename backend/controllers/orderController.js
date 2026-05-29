import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import cartModel from "../models/cartModel.js";
import voucherModel from "../models/voucherModel.js";
import userVoucherModel from "../models/userVoucherModel.js";
import foodModel from "../models/foodModel.js";
import reviewModel from "../models/Review.js";
import mongoose from "mongoose";
import { deductInventoryForOrder } from "../utils/inventoryDeduction.js";
import { createPosOrder } from "./posOrderController.js";
import { calculateIngredients, checkStock, checkToppingStock } from "../services/orderInventoryService.js";
import {
  AVG_PREP_TIME_MINUTES_FALLBACK,
  KITCHEN_CAPACITY,
  buildLifecycleTimestamps,
  calculateETA,
  countOrdersWaitingForKitchen,
  getOrderStatus as getFulfillmentStatus,
} from "../services/orderLifecycle.js";
import { expirePendingSepayOrderById, expirePendingSepayOrders } from "../services/orderPaymentTimeout.js";

const STORE_ADDRESS =
  "Tổ 16, ấp Thành Phú, xã Thành Lợi, huyện Bình Tân, tỉnh Vĩnh Long, Việt Nam";

const parseNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const extractOrderItemFoodId = (item) => {
  const raw = item?.productId || item?._id || item?.itemId || item?.foodId || "";
  const id = String(raw || "").trim();
  return isMongoId(id) ? id : "";
};

const buildInventoryRequirementsFromItems = async (items = []) => {
  const safeItems = Array.isArray(items) ? items : [];
  const reqMap = new Map();
  const toppingMap = new Map();
  const missingRecipeProductIds = new Set();
  const missingToppings = [];

  const addToMap = (map, id, quantity) => {
    const qty = Math.max(0, parseNumber(quantity, 0));
    const key = String(id || "").trim();
    if (!isMongoId(key) || qty <= 0) return;
    map.set(key, (map.get(key) || 0) + qty);
  };

  for (const item of safeItems) {
    const productId = extractOrderItemFoodId(item);
    const quantity = Math.max(1, Math.round(parseNumber(item?.quantity, 1)));
    if (!productId || quantity <= 0) continue;

    try {
      const result = await calculateIngredients({
        productId,
        quantity,
        sugarLevel: item?.sugarLevel,
        toppings: Array.isArray(item?.toppings) ? item.toppings : [],
      });

      (Array.isArray(result?.requirements) ? result.requirements : []).forEach((req) => {
        addToMap(reqMap, req?.ingredientId, req?.quantity);
      });

      (Array.isArray(result?.toppingRequirements) ? result.toppingRequirements : []).forEach((req) => {
        addToMap(toppingMap, req?.toppingId, req?.quantity);
      });
    } catch (error) {
      if (error?.name === "InventoryError" && error?.code === "RECIPE_NOT_FOUND") {
        missingRecipeProductIds.add(productId);
        continue;
      }
      if (error?.name === "InventoryError" && error?.code === "TOPPING_NOT_FOUND") {
        const list = Array.isArray(error?.details?.missingToppings) ? error.details.missingToppings : [];
        missingToppings.push(...list);
        continue;
      }
      throw error;
    }
  }

  return {
    requirements: Array.from(reqMap.entries()).map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
    toppingRequirements: Array.from(toppingMap.entries()).map(([toppingId, quantity]) => ({ toppingId, quantity })),
    missingRecipeProductIds: Array.from(missingRecipeProductIds),
    missingToppings,
  };
};

const precheckInventoryForItems = async (items = []) => {
  try {
    const { requirements, toppingRequirements, missingRecipeProductIds, missingToppings } =
      await buildInventoryRequirementsFromItems(items);

    if (missingRecipeProductIds.length > 0) {
      return {
        ok: false,
        status: 409,
        message: "Thiếu công thức cho một số sản phẩm.",
        details: { missingRecipeProductIds },
      };
    }

    if (missingToppings.length > 0) {
      return {
        ok: false,
        status: 400,
        message: "Topping không tồn tại.",
        details: { missingToppings },
      };
    }

    const ingredientCheck = await checkStock({ requirements });
    if (!ingredientCheck.ok) {
      return {
        ok: false,
        status: 409,
        message: "Không đủ tồn kho nguyên liệu.",
        details: { shortages: ingredientCheck.shortages },
      };
    }

    const toppingCheck = await checkToppingStock({ toppings: toppingRequirements });
    if (!toppingCheck.ok) {
      return {
        ok: false,
        status: 409,
        message: "Không đủ tồn kho topping.",
        details: { shortages: toppingCheck.shortages },
      };
    }

    return { ok: true };
  } catch (error) {
    if (error?.name === "InventoryError") {
      return {
        ok: false,
        status: error?.status || 400,
        message: error?.message || "Không đủ tồn kho.",
        details: error?.details || null,
      };
    }
    throw error;
  }
};

const buildReviewSummaryMapForOrders = async ({ userId, orders }) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(String(userId || ""))
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  if (!userObjectId) return new Map();

  const orderIds = Array.isArray(orders) ? orders.map((order) => order?._id).filter(Boolean) : [];
  if (orderIds.length === 0) return new Map();

  const results = await reviewModel.aggregate([
    { $match: { userId: userObjectId, orderId: { $in: orderIds } } },
    {
      $group: {
        _id: { orderId: "$orderId", productId: { $ifNull: ["$productId", "$foodId"] } },
        isRewardClaimed: { $max: "$isRewardClaimed" },
      },
    },
    {
      $group: {
        _id: "$_id.orderId",
        reviewedCount: { $sum: 1 },
        pendingRewards: {
          $sum: {
            $cond: [{ $eq: ["$isRewardClaimed", true] }, 0, 1],
          },
        },
      },
    },
  ]);

  return new Map(results.map((row) => [String(row._id), row]));
};

const VOUCHER_TYPES = {
  FOOD: "FOOD",
  DRINK: "DRINK",
  SHIPPING: "SHIPPING",
};

const CAMPAIGN_TYPES = {
  WELCOME: "welcome",
  BIRTHDAY: "birthday",
  COMEBACK: "comeback",
  ORDER_VALUE: "order_value",
  HAPPY_HOUR: "happy_hour",
  DELIVERY: "delivery",
  LOYALTY: "loyalty",
  MONTHLY: "monthly",
  MANUAL: "manual",
};

const getUserUsageCount = (voucher, userId) => {
  if (!userId) return 0;
  const item = Array.isArray(voucher?.usedByUsers)
    ? voucher.usedByUsers.find((entry) => String(entry?.userId) === String(userId))
    : null;
  return parseNumber(item?.count, 0);
};

const normalizeVoucherType = (voucher) => {
  const voucherType = String(voucher?.voucherType || "").trim().toUpperCase();
  if (voucherType === VOUCHER_TYPES.SHIPPING) return VOUCHER_TYPES.SHIPPING;
  if (voucherType === VOUCHER_TYPES.DRINK) return VOUCHER_TYPES.DRINK;
  if (voucherType === VOUCHER_TYPES.FOOD) return VOUCHER_TYPES.FOOD;

  const legacyType = String(voucher?.type || "").trim().toLowerCase();
  if (legacyType === "shipping") return VOUCHER_TYPES.SHIPPING;
  return VOUCHER_TYPES.FOOD;
};

const normalizeOrderItemsForVoucher = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const productId = String(item?.productId || item?._id || "").trim();
      if (!productId) return null;
      const unitPrice = parseNumber(item?.price, 0);
      const quantity = Math.max(1, Math.round(parseNumber(item?.quantity, 1)));
      const lineTotal = Math.max(0, unitPrice) * quantity;
      return {
        productId,
        price: unitPrice,
        quantity,
        lineTotal,
        productType: String(item?.type || "").toUpperCase(),
        categoryId: String(item?.categoryId || ""),
        categoryName: String(item?.categoryName || item?.category || "").trim(),
      };
    })
    .filter(Boolean);

const enrichCartItems = async (cartItems) => {
  if (!cartItems.length) return [];
  const ids = [...new Set(cartItems.map((item) => item.productId).filter((id) => isMongoId(id)))];
  const products = await foodModel.find({ _id: { $in: ids } }, "_id type categoryId category").lean();
  const productMap = new Map(products.map((item) => [String(item._id), item]));

  return cartItems.map((item) => {
    const product = productMap.get(item.productId);
    return {
      ...item,
      productType: (item.productType || String(product?.type || "")).toUpperCase(),
      categoryId: item.categoryId || String(product?.categoryId || ""),
      categoryName: item.categoryName || String(product?.category || "").trim(),
    };
  });
};

// =========== ADD-ON ORDER ==============
const createAddOnOrder = async (req, res) => {
  try {
    const parentId = String(req.params?.id || "").trim();
    if (!isMongoId(parentId)) {
      return res.status(400).json({ success: false, message: "Order id không hợp lệ" });
    }

    const parentOrder = await orderModel.findById(parentId);
    if (!parentOrder) return res.status(404).json({ success: false, message: "Không tìm thấy đơn gốc" });
    if (!["preparing", "delivering"].includes(String(parentOrder.status || "").toLowerCase())) {
      return res.status(400).json({ success: false, message: "Đơn gốc không cho phép đặt thêm" });
    }
    if (String(parentOrder.userId) !== String(req.userId || req.user?._id || "")) {
      return res.status(403).json({ success: false, message: "Không có quyền đặt thêm đơn này" });
    }

    const itemsInput = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!itemsInput.length) return res.status(400).json({ success: false, message: "Thiếu danh sách sản phẩm" });

    const normalized = itemsInput
      .map((item) => {
        const productId = extractOrderItemFoodId(item);
        const quantity = Math.max(1, parseNumber(item?.quantity, 1));
        if (!productId || quantity <= 0) return null;
        return {
          productId,
          quantity,
          toppings: Array.isArray(item?.toppings) ? item.toppings : [],
          size: item?.size || "",
          sugarLevel: item?.sugarLevel || "",
          iceLevel: item?.iceLevel || "",
          note: item?.note || "",
        };
      })
      .filter(Boolean);

    if (!normalized.length) {
      return res.status(400).json({ success: false, message: "Sản phẩm không hợp lệ" });
    }

    const productIds = [...new Set(normalized.map((i) => i.productId))];
    const products = await foodModel.find({ _id: { $in: productIds } }, "_id name price type category").lean();
    const map = new Map(products.map((p) => [String(p._id), p]));

    let total = 0;
    const orderItems = normalized.map((n) => {
      const p = map.get(n.productId);
      const price = Number(p?.price || 0);
      total += price * n.quantity;
      return {
        productId: n.productId,
        name: p?.name || "",
        price,
        quantity: n.quantity,
        type: p?.type || "",
        category: p?.category || "",
        toppings: n.toppings,
        size: n.size,
        sugarLevel: n.sugarLevel,
        iceLevel: n.iceLevel,
        note: n.note,
      };
    });

    const addOnOrder = await orderModel.create({
      userId: parentOrder.userId,
      parentOrderId: parentOrder._id,
      type: "ADD_ON",
      orderCode: `AO-${Date.now().toString().slice(-6)}`,
      address: parentOrder.address,
      addressText: parentOrder.addressText,
      deliveryAddress: parentOrder.deliveryAddress,
      total,
      amount: total,
      items: orderItems,
      deliveryFee: parentOrder.deliveryFee || 0,
      externalShippingFee: Math.max(
        0,
        parseNumber(req.body?.externalShippingFee ?? parentOrder.externalShippingFee, 0)
      ),
      status: "pending",
      paymentStatus: "UNPAID",
      payment: false,
    });

    return res.json({ success: true, data: addOnOrder });
  } catch (error) {
    console.log("CREATE ADDON ORDER ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tạo đơn đặt thêm" });
  }
};

const calculateEligibleAmount = (voucher, cartItems, shippingFee) => {
  const normalizeName = (value) => String(value || "").trim().toLowerCase();
  const voucherCategoryId = String(voucher?.categoryId?._id || voucher?.categoryId || "");
  const voucherCategoryName = normalizeName(voucher?.categoryId?.name || voucher?.categoryName || "");
  const campaignType = String(voucher?.campaignType || "").trim().toLowerCase();

  const voucherType = normalizeVoucherType(voucher);

  if (voucherType === VOUCHER_TYPES.SHIPPING) {
    const safeShippingFee = Math.max(0, parseNumber(shippingFee, 0));
    if (safeShippingFee <= 0) return 0;

    if (voucher.applyFor === "all") return safeShippingFee;

    const matched = cartItems.some((item) => {
      if (voucher.applyFor === "category") {
        const byId = voucherCategoryId && String(item.categoryId) === voucherCategoryId;
        const byName = voucherCategoryName && normalizeName(item.categoryName) === voucherCategoryName;
        return byId || byName;
      }
      if (voucher.applyFor === "product") {
        return (
          Array.isArray(voucher.productIds) &&
          voucher.productIds.some((productId) => String(productId) === String(item.productId))
        );
      }
      return false;
    });

    return matched ? safeShippingFee : 0;
  }

  const applyAllProductTypes = [
    CAMPAIGN_TYPES.WELCOME,
    CAMPAIGN_TYPES.BIRTHDAY,
    CAMPAIGN_TYPES.COMEBACK,
    CAMPAIGN_TYPES.ORDER_VALUE,
    CAMPAIGN_TYPES.LOYALTY,
    CAMPAIGN_TYPES.MONTHLY,
  ]
    .includes(campaignType);

  const targetIsDrink = voucherType === VOUCHER_TYPES.DRINK;
  const scopeItems = applyAllProductTypes
    ? cartItems
    : cartItems.filter((item) => {
        const itemIsDrink = String(item.productType || "").toUpperCase() === "DRINK";
        if (targetIsDrink) return itemIsDrink;
        return !itemIsDrink;
      });

  const filteredByApplyFor = scopeItems.filter((item) => {
    if (voucher.applyFor === "all") return true;
    if (voucher.applyFor === "category") {
      const byId = voucherCategoryId && String(item.categoryId) === voucherCategoryId;
      const byName = voucherCategoryName && normalizeName(item.categoryName) === voucherCategoryName;
      return byId || byName;
    }
    if (voucher.applyFor === "product") {
      return Array.isArray(voucher.productIds)
        && voucher.productIds.some((productId) => String(productId) === String(item.productId));
    }
    return false;
  });

  return filteredByApplyFor.reduce((sum, item) => sum + parseNumber(item.lineTotal, 0), 0);
};

const evaluateVoucher = async ({ voucher, orderAmount, shippingFee, cartItems, userId }) => {
  const now = new Date();
  if (!voucher || voucher.status !== "active") return { valid: false, message: "Voucher không hợp lệ" };

  const campaignType = String(voucher?.campaignType || "").trim().toLowerCase();
  const startDate = voucher.startDate ? new Date(voucher.startDate) : null;
  const endDate = voucher.endDate ? new Date(voucher.endDate) : null;
  const normalizeToDayBounds = campaignType !== CAMPAIGN_TYPES.HAPPY_HOUR;
  if (startDate && normalizeToDayBounds) startDate.setHours(0, 0, 0, 0);
  if (endDate && normalizeToDayBounds) endDate.setHours(23, 59, 59, 999);

  if (startDate && now < startDate) return { valid: false, message: "Voucher chưa đến thời gian áp dụng" };
  if (endDate && now > endDate) return { valid: false, message: "Voucher đã hết hạn" };

  const safeOrderAmount = Math.max(0, parseNumber(orderAmount, 0));
  const safeShippingFee = Math.max(0, parseNumber(shippingFee, 0));

  if (safeOrderAmount < parseNumber(voucher.minOrderValue, 0)) {
    return { valid: false, message: "Đơn hàng chưa đủ điều kiện" };
  }

  const maxUsage = parseNumber(voucher.maxUsage, 0);
  if (maxUsage > 0 && parseNumber(voucher.usedCount, 0) >= maxUsage) {
    return { valid: false, message: "Voucher đã hết lượt sử dụng" };
  }

  const perUserLimit = parseNumber(voucher.usagePerUser, 1);
  if (perUserLimit > 0 && getUserUsageCount(voucher, userId) >= perUserLimit) {
    return { valid: false, message: "Bạn đã dùng hết lượt voucher này" };
  }

  const normalizedCartItems = await enrichCartItems(normalizeOrderItemsForVoucher(cartItems));
  const eligibleAmount = calculateEligibleAmount(voucher, normalizedCartItems, safeShippingFee);

  if (eligibleAmount <= 0) {
    return { valid: false, message: "Voucher không đúng điều kiện áp dụng" };
  }

  const discountValue = Math.max(0, parseNumber(voucher.discountValue, 0));
  const rawDiscount = voucher.discountType === "percent"
    ? (eligibleAmount * discountValue) / 100
    : discountValue;
  const discount = Math.min(Math.round(rawDiscount), Math.round(eligibleAmount));

  if (discount <= 0) {
    return { valid: false, message: "Voucher không hợp lệ" };
  }

  return {
    valid: true,
    discount,
    voucherType: normalizeVoucherType(voucher),
  };
};

const resolveVoucherById = async ({ voucherId, userId }) => {
  if (!voucherId || !isMongoId(voucherId)) return null;

  const globalVoucher = await voucherModel.findById(voucherId).lean();
  if (globalVoucher) return globalVoucher;

  const personalVoucher = await userVoucherModel.findOne({ _id: voucherId, userId }).lean();
  return personalVoucher || null;
};

const computeVoucherEntry = async ({ entry, userId, orderAmount, shippingFee, cartItems }) => {
  if (!entry || typeof entry !== "object") return { voucherId: null, voucherCode: "", voucherType: "", discount: 0 };

  const voucherId = String(entry?.voucherId || "").trim();
  if (!voucherId) return { voucherId: null, voucherCode: "", voucherType: "", discount: 0 };

  const voucher = await resolveVoucherById({ voucherId, userId });
  if (!voucher) return { error: "Voucher không hợp lệ" };

  const requestedCode = String(entry?.voucherCode || "").trim().toUpperCase();
  const actualCode = String(voucher?.voucherCode || "").trim().toUpperCase();
  if (requestedCode && actualCode && requestedCode !== actualCode) {
    return { error: "Voucher không hợp lệ" };
  }

  const evaluation = await evaluateVoucher({
    voucher,
    userId,
    orderAmount,
    shippingFee,
    cartItems,
  });

  if (!evaluation.valid) {
    return { error: evaluation.message || "Voucher không hợp lệ" };
  }

  return {
    voucherId: voucher._id,
    voucherCode: actualCode,
    voucherType: evaluation.voucherType,
    discount: evaluation.discount,
  };
};

const buildTransferContent = (orderId) => `ORDER_${orderId}`;

const getCustomerNameFromAddress = (addressPayload = {}) => {
  const fullName = [addressPayload?.firstName, addressPayload?.lastName]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .trim();

  return (
    (typeof addressPayload?.name === "string" && addressPayload.name.trim()) ||
    fullName ||
    ""
  );
};

const getPhoneFromAddress = (addressPayload = {}, fallback = "") =>
  (typeof addressPayload?.phone === "string" && addressPayload.phone.trim()) ||
  String(fallback || "").trim();

const getAddressText = (addressPayload = {}, deliveryAddress = {}) =>
  (typeof addressPayload?.deliveryText === "string" && addressPayload.deliveryText.trim()) ||
  (typeof deliveryAddress?.text === "string" && deliveryAddress.text.trim()) ||
  [addressPayload?.street, addressPayload?.ward, addressPayload?.district, addressPayload?.city, addressPayload?.state, addressPayload?.country]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ")
    .trim();

const normalizeOrderForResponse = (order, now = new Date()) => {
  if (!order) return null;
  const addressPayload = order.address || {};
  const deliveryAddress = order.deliveryAddress || {};

  const orderCode = String(
    order.orderCode || order.transferContent || buildTransferContent(order._id)
  );
  const customerName = String(
    order.customerName || getCustomerNameFromAddress(addressPayload) || ""
  );
  const phone = String(order.phone || getPhoneFromAddress(addressPayload) || "");
  const addressText = String(
    order.addressText || getAddressText(addressPayload, deliveryAddress) || ""
  );
  const total = parseNumber(order.total ?? order.amount, 0);
  const normalizeVoucherEntry = (entry = {}) => ({
    voucherId: entry?.voucherId || null,
    voucherCode: String(entry?.voucherCode || "").trim(),
    voucherType: String(entry?.voucherType || "").trim(),
    discount: Math.max(0, parseNumber(entry?.discount, 0)),
  });
  const vouchers = {
    order: normalizeVoucherEntry(order?.vouchers?.order),
    shipping: normalizeVoucherEntry(order?.vouchers?.shipping),
  };

  return {
    _id: order._id,
    orderCode,
    customerName,
    phone,
    address: addressText,
    items: Array.isArray(order.items) ? order.items : [],
    note: String(order.note || ""),
    total,
    vouchers,
    distanceKm: parseNumber(order.distanceKm ?? order.distance, 0),
    deliveryTime: parseNumber(order.deliveryTime ?? order.durationMinutes ?? order.duration, 0),
    storeLocation: order.storeLocation || null,
    deliveryAddress: order.deliveryAddress || null,
    deliveryFee: parseNumber(order.deliveryFee, 0),
    externalShippingFee: parseNumber(order.externalShippingFee, 0),
    status: String(order.status || "pending"),
    completedBy: order.completedBy || null,
    completedAt: order.completedAt || null,
    deliveredAt: order.deliveredAt || null,
    fulfillmentStatus: getFulfillmentStatus(order, now),
    timing: {
      prepTime: parseNumber(order.prepTime, 0),
      queueDelay: parseNumber(order.queueDelay, 0),
      deliveryTime: parseNumber(order.deliveryTime ?? order.durationMinutes ?? order.duration, 0),
      eta: parseNumber(order.eta, 0),
      startPrepAt: order.startPrepAt || null,
      startDeliveryAt: order.startDeliveryAt || null,
      finishAt: order.finishAt || null,
      ordersBefore: parseNumber(order.ordersBefore, 0),
    },
    paymentMethod: String(order.paymentMethod || "unknown"),
    createdAt: order.createdAt || order.date || null,
  };
};

const buildSepayQrCode = ({ amount, transferContent }) => {
  const bankBin = String(process.env.SEPAY_BANK_BIN || "");
  const bankAccount = String(process.env.SEPAY_BANK_ACCOUNT || "");
  const accountName = String(process.env.SEPAY_ACCOUNT_NAME || "");
  const template = String(process.env.SEPAY_QR_TEMPLATE || "compact2");

  if (!bankBin || !bankAccount) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("amount", String(Math.max(0, Math.round(parseNumber(amount, 0)))));
  params.set("addInfo", String(transferContent || ""));
  if (accountName) {
    params.set("accountName", accountName);
  }

  return `https://img.vietqr.io/image/${bankBin}-${bankAccount}-${template}.png?${params.toString()}`;
};

const isSepayConfigReady = () => {
  const bankBin = String(process.env.SEPAY_BANK_BIN || "").trim();
  const bankAccount = String(process.env.SEPAY_BANK_ACCOUNT || "").trim();
  const accountName = String(process.env.SEPAY_ACCOUNT_NAME || "").trim().toLowerCase();

  if (!bankBin || !bankAccount) return false;
  if (bankAccount === "1234567890") return false;
  if (accountName === "sepay demo") return false;
  return true;
};

const getJson = async (endpoint, params = {}) => {
  const url = new URL(endpoint);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
};

const haversineDistanceKm = (origin, destination) => {
  const toRad = (value) => (value * Math.PI) / 180;

  const lat1 = parseNumber(origin.lat);
  const lng1 = parseNumber(origin.lng);
  const lat2 = parseNumber(destination.lat);
  const lng2 = parseNumber(destination.lng);

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const R = 6371;

  return R * c;
};

const calcDeliveryFee = (distanceKm) => {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  if (distanceKm <= 2) return 15000;
  const extraKm = Math.ceil(distanceKm - 2);
  return 15000 + extraKm * 5000;
};

const getStoreLocation = async () => {
  const lat = parseNumber(process.env.STORE_LAT, null);
  const lng = parseNumber(process.env.STORE_LNG, null);

  if (lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  const geocodeKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!geocodeKey) {
    return { lat: 10.1041, lng: 105.7519 };
  }

  try {
    const data = await getJson("https://maps.googleapis.com/maps/api/geocode/json", {
      address: STORE_ADDRESS,
      key: geocodeKey,
    });

    const location = data?.results?.[0]?.geometry?.location;
    if (location?.lat && location?.lng) {
      return { lat: Number(location.lat), lng: Number(location.lng) };
    }
  } catch (error) {
    console.log("STORE GEOCODE ERROR:", error.message);
  }

  return { lat: 10.1041, lng: 105.7519 };
};

const geocodeAddressText = async (addressText) => {
  const geocodeKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!geocodeKey || !addressText) return null;

  try {
    const data = await getJson("https://maps.googleapis.com/maps/api/geocode/json", {
      address: addressText,
      key: geocodeKey,
    });

    const location = data?.results?.[0]?.geometry?.location;
    if (location?.lat && location?.lng) {
      return { lat: Number(location.lat), lng: Number(location.lng) };
    }
  } catch (error) {
    console.log("ADDRESS GEOCODE ERROR:", error.message);
  }

  return null;
};

const getDistanceFromApiOrHaversine = async (storeLocation, deliveryLocation) => {
  const distanceKey = process.env.GOOGLE_MAPS_SERVER_KEY;

  if (distanceKey) {
    try {
      const data = await getJson("https://maps.googleapis.com/maps/api/distancematrix/json", {
        origins: `${storeLocation.lat},${storeLocation.lng}`,
        destinations: `${deliveryLocation.lat},${deliveryLocation.lng}`,
        mode: "driving",
        key: distanceKey,
      });

      const meters = data?.rows?.[0]?.elements?.[0]?.distance?.value;
      if (Number.isFinite(meters)) {
        return meters / 1000;
      }
    } catch (error) {
      console.log("DISTANCE MATRIX ERROR:", error.message);
    }
  }

  return haversineDistanceKm(storeLocation, deliveryLocation);
};

const getDurationFromDistance = (distanceKm) => {
  // Fallback speed: ~25km/h for urban delivery traffic
  const minutes = Math.max(1, Math.round((distanceKm / 25) * 60));
  return {
    durationMinutes: minutes,
    durationText: `${minutes} mins`,
  };
};

const fetchOsrmRoute = async (storeLocation, deliveryLocation) => {
  const storeLat = parseNumber(storeLocation?.lat, NaN);
  const storeLng = parseNumber(storeLocation?.lng, NaN);
  const customerLat = parseNumber(deliveryLocation?.lat, NaN);
  const customerLng = parseNumber(deliveryLocation?.lng, NaN);

  if (![storeLat, storeLng, customerLat, customerLng].every(Number.isFinite)) return null;

  const url = `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${customerLng},${customerLat}?overview=false`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    const distanceKm = Number((route.distance / 1000).toFixed(2));
    const durationMinutes = Math.ceil(route.duration / 60);

    return {
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
    };
  } catch (error) {
    console.log("OSRM ROUTE ERROR:", error.message);
    return null;
  }
};

const increaseVoucherUsageEntry = async (order, voucherEntry) => {
  const voucherId = voucherEntry?.voucherId;
  const discount = parseNumber(voucherEntry?.discount, 0);
  if (!voucherId || discount <= 0) return;

  let voucher = await voucherModel.findById(voucherId);
  if (!voucher) {
    voucher = await userVoucherModel.findById(voucherId);
  }
  if (!voucher) return;

  voucher.usedCount = parseNumber(voucher.usedCount, 0) + 1;

  const userId = String(order.userId || "");
  if (userId) {
    if (!Array.isArray(voucher.usedByUsers)) voucher.usedByUsers = [];
    const existing = voucher.usedByUsers.find((entry) => String(entry?.userId) === userId);
    if (existing) {
      existing.count = parseNumber(existing.count, 0) + 1;
    } else {
      voucher.usedByUsers.push({ userId: order.userId, count: 1 });
    }
  }

  await voucher.save();
};

const increaseVoucherUsage = async (order) => {
  const orderVoucher = order?.vouchers?.order || order?.voucher || null;
  const shippingVoucher = order?.vouchers?.shipping || null;
  await increaseVoucherUsageEntry(order, orderVoucher);
  await increaseVoucherUsageEntry(order, shippingVoucher);
};

const quoteDelivery = async (req, res) => {
  try {
    const storeLocation = await getStoreLocation();

    const providedLat = parseNumber(req.body?.lat, NaN);
    const providedLng = parseNumber(req.body?.lng, NaN);

    let deliveryLocation = null;

    if (Number.isFinite(providedLat) && Number.isFinite(providedLng)) {
      deliveryLocation = { lat: providedLat, lng: providedLng };
    } else if (req.body?.addressText) {
      deliveryLocation = await geocodeAddressText(req.body.addressText);
    }

    if (!deliveryLocation) {
      return res.json({
        success: false,
        message: "Không lấy được tọa độ địa chỉ giao hàng",
      });
    }

    let durationText = "";
    let durationMinutes = 0;
    let distanceKmRaw = null;

    const distanceKey = process.env.GOOGLE_MAPS_SERVER_KEY;
    if (distanceKey) {
      try {
        const data = await getJson("https://maps.googleapis.com/maps/api/distancematrix/json", {
          origins: `${storeLocation.lat},${storeLocation.lng}`,
          destinations: `${deliveryLocation.lat},${deliveryLocation.lng}`,
          mode: "driving",
          key: distanceKey,
        });

        const element = data?.rows?.[0]?.elements?.[0];
        const meters = element?.distance?.value;
        const durationSec = element?.duration?.value;

        if (Number.isFinite(meters)) {
          distanceKmRaw = meters / 1000;
        }
        if (Number.isFinite(durationSec)) {
          durationMinutes = Math.max(1, Math.round(durationSec / 60));
          durationText = element?.duration?.text || `${durationMinutes} mins`;
        }
      } catch (error) {
        console.log("QUOTE DISTANCE MATRIX ERROR:", error.message);
      }
    }

    if (!Number.isFinite(distanceKmRaw)) {
      distanceKmRaw = await getDistanceFromApiOrHaversine(storeLocation, deliveryLocation);
    }

    const distanceKm = Number(distanceKmRaw.toFixed(2));
    if (!durationMinutes || !durationText) {
      const fallbackDuration = getDurationFromDistance(distanceKm);
      durationMinutes = fallbackDuration.durationMinutes;
      durationText = fallbackDuration.durationText;
    }

    const deliveryFee = calcDeliveryFee(distanceKm);

    res.json({
      success: true,
      storeAddress: STORE_ADDRESS,
      storeLocation,
      deliveryAddress: {
        text: req.body?.addressText || "",
        lat: deliveryLocation.lat,
        lng: deliveryLocation.lng,
      },
      distanceKm,
      durationMinutes,
      durationText,
      deliveryFee,
    });
  } catch (error) {
    console.log("QUOTE DELIVERY ERROR:", error.message);
    res.json({ success: false, message: "Không thể tính phí giao hàng" });
  }
};

// =============================
// ETA PREVIEW (queue-based)
// =============================
const previewOrderEta = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const distanceKm = Math.max(0, parseNumber(req.body?.distanceKm ?? req.body?.distance, 0));

    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "Missing items" });
    }

    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return res.status(400).json({ success: false, message: "Missing distanceKm" });
    }

    const now = new Date();
    const ordersWaiting = await countOrdersWaitingForKitchen({ now });
    const etaInfo = calculateETA({ items }, distanceKm, {
      ordersWaiting,
      capacity: KITCHEN_CAPACITY,
      avgPrepTime: AVG_PREP_TIME_MINUTES_FALLBACK,
    });

    return res.json({
      success: true,
      data: {
        distanceKm,
        ordersBefore: ordersWaiting,
        ...etaInfo,
      },
    });
  } catch (error) {
    console.log("PREVIEW ETA ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tính ETA" });
  }
};

// =============================
// PLACE ORDER
// =============================
const placeOrder = async (req, res) => {
  try {
    if (!req.body.items || req.body.items.length === 0) {
      return res.json({
        success: false,
        message: "Cart empty",
      });
    }

    const note = String(req.body?.note || "").trim();
    const deliveryFee = Math.max(
      0,
      parseNumber(req.body.deliveryFee ?? req.body.delivery_fee, 0)
    );
    const externalShippingFee = Math.max(
      0,
      parseNumber(req.body?.externalShippingFee, 0)
    );
    let distanceKm = parseNumber(req.body.distanceKm ?? req.body.distance_km, 0);
    let deliveryTime = parseNumber(req.body.deliveryTime ?? req.body.delivery_time ?? req.body.durationMinutes ?? 0, 0);
    const parseVoucherEntry = (entry) =>
      entry && typeof entry === "object"
        ? {
            voucherId: entry.voucherId || null,
            voucherCode: String(entry.voucherCode || ""),
            voucherType: String(entry.voucherType || ""),
            discount: Math.max(0, parseNumber(entry.discount, 0)),
          }
        : {
            voucherId: null,
            voucherCode: "",
            voucherType: "",
            discount: 0,
          };

    const voucherPayload = {
      order: parseVoucherEntry(req.body?.vouchers?.order),
      shipping: parseVoucherEntry(req.body?.vouchers?.shipping),
    };

    if (voucherPayload.order.voucherId && voucherPayload.shipping.voucherId) {
      return res.status(400).json({
        success: false,
        message: "Chỉ được áp dụng 1 voucher cho mỗi đơn hàng.",
      });
    }

    const normalizedLineItems = normalizeOrderItemsForVoucher(req.body.items);
    const subtotal = normalizedLineItems.reduce((sum, item) => sum + parseNumber(item.lineTotal, 0), 0);

    const computedOrderVoucher = voucherPayload.order.voucherId
      ? await computeVoucherEntry({
          entry: voucherPayload.order,
          userId: String(req.userId || ""),
          orderAmount: subtotal,
          shippingFee: deliveryFee,
          cartItems: req.body.items,
        })
      : { voucherId: null, voucherCode: "", voucherType: "", discount: 0 };

    if (computedOrderVoucher?.error) {
      return res.status(400).json({ success: false, message: computedOrderVoucher.error });
    }

    const computedShippingVoucher = voucherPayload.shipping.voucherId
      ? await computeVoucherEntry({
          entry: voucherPayload.shipping,
          userId: String(req.userId || ""),
          orderAmount: subtotal,
          shippingFee: deliveryFee,
          cartItems: req.body.items,
        })
      : { voucherId: null, voucherCode: "", voucherType: "", discount: 0 };

    if (computedShippingVoucher?.error) {
      return res.status(400).json({ success: false, message: computedShippingVoucher.error });
    }

    const serverVoucherPayload = {
      order: computedOrderVoucher,
      shipping: computedShippingVoucher,
    };

    const voucherDiscount =
      Math.max(0, parseNumber(computedOrderVoucher.discount, 0)) +
      Math.max(0, parseNumber(computedShippingVoucher.discount, 0));
    const amount = Math.max(0, Math.round(subtotal + deliveryFee - voucherDiscount));

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    const addressPayload =
      (req.body?.addressInfo && typeof req.body.addressInfo === "object" && req.body.addressInfo) ||
      (req.body?.address && typeof req.body.address === "object" && req.body.address) || {
        name: String(req.body?.receiver_name || ""),
        phone: String(req.body?.phone || ""),
        deliveryText: String(req.body?.address || ""),
      };

    const nextOrderId = new mongoose.Types.ObjectId();
    const orderCode = buildTransferContent(nextOrderId);
    const customerName = getCustomerNameFromAddress(addressPayload);
    const phone = getPhoneFromAddress(addressPayload, req.body?.phone);
    const addressText = getAddressText(addressPayload, req.body?.deliveryAddress);

    const storeLocation = req.body.storeLocation || null;
    const deliveryAddress = req.body.deliveryAddress || null;

    const hasProvidedDistance = Number.isFinite(distanceKm) && distanceKm > 0;
    const hasProvidedTime = Number.isFinite(deliveryTime) && deliveryTime > 0;

    const osrmRoute = await fetchOsrmRoute(storeLocation, deliveryAddress);
    if (!hasProvidedDistance && osrmRoute?.distanceKm != null) distanceKm = osrmRoute.distanceKm;
    if (!hasProvidedTime && osrmRoute?.durationMinutes != null) deliveryTime = osrmRoute.durationMinutes;

    const newOrder = new orderModel({
      _id: nextOrderId,
      userId: req.userId,
      orderCode,
      customerName,
      phone,
      addressText,
      total: amount,
      items: req.body.items,
      note,
      amount,
      address: addressPayload,
      transferContent: orderCode,
      storeLocation,
      deliveryAddress,
      distanceKm,
      distance: distanceKm,
      deliveryTime,
      deliveryFee,
      externalShippingFee,
      vouchers: serverVoucherPayload,
    });

    await newOrder.save();

    const inventoryResult = await deductInventoryForOrder({
      orderId: String(newOrder._id),
      reason: `ORDER_${newOrder._id}`,
    });

    if (!inventoryResult.ok) {
      await orderModel.findByIdAndDelete(newOrder._id);
      return res.status(inventoryResult.status || 409).json({
        success: false,
        message: inventoryResult.message || "Không thể trừ kho cho đơn hàng.",
        details: inventoryResult.details || null,
      });
    }

    await userModel.findByIdAndUpdate(req.userId, {
      cartData: {},
    });
    await cartModel.findOneAndUpdate(
      { userId: req.userId },
      { items: [] },
      { new: true }
    );
    await increaseVoucherUsage(newOrder);

    res.json({
      success: true,
      orderId: String(newOrder._id),
      message: "Đặt hàng thành công",
    });
  } catch (error) {
    console.log("PLACE ORDER ERROR:", error.message);
    res.json({ success: false, message: "Không thể đặt hàng" });
  }
};

const createOrder = async (req, res) => {
  try {
    // POS / Cafe flow: { productId, quantity, sugarLevel, toppings }
    if (req.body?.productId) {
      return createPosOrder(req, res);
    }

    if (!isSepayConfigReady()) {
      return res.status(500).json({
        success: false,
        message: "Sepay config chua dung. Khong tao duoc QR thanh toan.",
      });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart empty",
      });
    }

    const inventoryCheck = await precheckInventoryForItems(items);
    if (!inventoryCheck.ok) {
      return res.status(inventoryCheck.status || 409).json({
        success: false,
        message: inventoryCheck.message || "Không đủ tồn kho.",
        details: inventoryCheck.details || null,
      });
    }

    const note = String(req.body?.note || "").trim();

    const addressPayload =
      (req.body?.addressInfo && typeof req.body.addressInfo === "object" && req.body.addressInfo) ||
      (req.body?.address && typeof req.body.address === "object" && req.body.address) || {
        name: String(req.body?.receiver_name || ""),
        phone: String(req.body?.phone || ""),
        deliveryText: String(req.body?.address || ""),
      };

    const deliveryFee = Math.max(
      0,
      parseNumber(req.body?.deliveryFee ?? req.body?.delivery_fee, 0)
    );
    const externalShippingFee = Math.max(
      0,
      parseNumber(req.body?.externalShippingFee, 0)
    );
    let distanceKm = Math.max(
      0,
      parseNumber(req.body?.distanceKm ?? req.body?.distance_km, 0)
    );
    let deliveryTime = Math.max(
      0,
      parseNumber(req.body?.deliveryTime ?? req.body?.delivery_time ?? req.body?.durationMinutes, 0)
    );
    const parseVoucherEntry = (entry) =>
      entry && typeof entry === "object"
        ? {
            voucherId: entry.voucherId || null,
            voucherCode: String(entry.voucherCode || ""),
            voucherType: String(entry.voucherType || ""),
            discount: Math.max(0, parseNumber(entry.discount, 0)),
          }
        : {
            voucherId: null,
            voucherCode: "",
            voucherType: "",
            discount: 0,
          };
    const voucherPayload = {
      order: parseVoucherEntry(req.body?.vouchers?.order),
      shipping: parseVoucherEntry(req.body?.vouchers?.shipping),
    };

    if (voucherPayload.order.voucherId && voucherPayload.shipping.voucherId) {
      return res.status(400).json({
        success: false,
        message: "Chỉ được áp dụng 1 voucher cho mỗi đơn hàng.",
      });
    }

    const normalizedLineItems = normalizeOrderItemsForVoucher(items);
    const subtotal = normalizedLineItems.reduce((sum, item) => sum + parseNumber(item.lineTotal, 0), 0);

    const computedOrderVoucher = voucherPayload.order.voucherId
      ? await computeVoucherEntry({
          entry: voucherPayload.order,
          userId: String(req.userId || ""),
          orderAmount: subtotal,
          shippingFee: deliveryFee,
          cartItems: items,
        })
      : { voucherId: null, voucherCode: "", voucherType: "", discount: 0 };

    if (computedOrderVoucher?.error) {
      return res.status(400).json({ success: false, message: computedOrderVoucher.error });
    }

    const computedShippingVoucher = voucherPayload.shipping.voucherId
      ? await computeVoucherEntry({
          entry: voucherPayload.shipping,
          userId: String(req.userId || ""),
          orderAmount: subtotal,
          shippingFee: deliveryFee,
          cartItems: items,
        })
      : { voucherId: null, voucherCode: "", voucherType: "", discount: 0 };

    if (computedShippingVoucher?.error) {
      return res.status(400).json({ success: false, message: computedShippingVoucher.error });
    }

    const serverVoucherPayload = {
      order: computedOrderVoucher,
      shipping: computedShippingVoucher,
    };

    const voucherDiscount =
      Math.max(0, parseNumber(computedOrderVoucher.discount, 0)) +
      Math.max(0, parseNumber(computedShippingVoucher.discount, 0));
    const amount = Math.max(0, Math.round(subtotal + deliveryFee - voucherDiscount));

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    const nextOrderId = new mongoose.Types.ObjectId();
    const transferContent = buildTransferContent(nextOrderId);
    const qrCode = buildSepayQrCode({
      amount,
      transferContent,
    });

    const customerName = getCustomerNameFromAddress(addressPayload);
    const phone = getPhoneFromAddress(addressPayload, req.body?.phone);
    const addressText = getAddressText(addressPayload, req.body?.deliveryAddress);

    const storeLocation = req.body?.storeLocation || null;
    const deliveryAddress = req.body?.deliveryAddress || null;

    const hasProvidedDistance = Number.isFinite(distanceKm) && distanceKm > 0;
    const hasProvidedTime = Number.isFinite(deliveryTime) && deliveryTime > 0;

    const osrmRoute = await fetchOsrmRoute(storeLocation, deliveryAddress);
    if (!hasProvidedDistance && osrmRoute?.distanceKm != null) distanceKm = osrmRoute.distanceKm;
    if (!hasProvidedTime && osrmRoute?.durationMinutes != null) deliveryTime = osrmRoute.durationMinutes;

    // Queue-based ETA (no setTimeout): compute once and store timestamps.
    const createdAt = new Date();
    const ordersWaiting = await countOrdersWaitingForKitchen({ now: createdAt });
    const etaInfo = calculateETA({ items }, distanceKm, {
      ordersWaiting,
      capacity: KITCHEN_CAPACITY,
      avgPrepTime: AVG_PREP_TIME_MINUTES_FALLBACK,
    });
    const lifecycle = buildLifecycleTimestamps({
      baseAt: createdAt,
      queueDelay: etaInfo.queueDelay,
      prepTime: etaInfo.prepTime,
      deliveryTime: etaInfo.deliveryTime,
    });

    const newOrder = await orderModel.create({
      _id: nextOrderId,
      userId: req.userId,
      orderCode: transferContent,
      customerName,
      phone,
      addressText,
      total: amount,
      items,
      note,
      amount,
      address: addressPayload,
      status: "pending",
      paymentMethod: "sepay",
      transferContent,
      qrCode,
      storeLocation,
      deliveryAddress,
      distanceKm,
      distance: distanceKm,
      deliveryTime: etaInfo.deliveryTime,
      prepTime: etaInfo.prepTime,
      queueDelay: etaInfo.queueDelay,
      eta: etaInfo.eta,
      ordersBefore: ordersWaiting,
      startPrepAt: lifecycle.startPrepAt,
      startDeliveryAt: lifecycle.startDeliveryAt,
      finishAt: lifecycle.finishAt,
      deliveryFee,
    externalShippingFee,
      vouchers: serverVoucherPayload,
      createdAt,
      date: createdAt,
    });

    return res.json({
      success: true,
      orderId: String(newOrder._id),
      qrCode,
      amount,
      transferContent,
      status: newOrder.status,
      fulfillmentStatus: getFulfillmentStatus(newOrder, new Date()),
      timing: {
        prepTime: etaInfo.prepTime,
        queueDelay: etaInfo.queueDelay,
        deliveryTime: etaInfo.deliveryTime,
        eta: etaInfo.eta,
        startPrepAt: lifecycle.startPrepAt,
        startDeliveryAt: lifecycle.startDeliveryAt,
        finishAt: lifecycle.finishAt,
        ordersBefore: ordersWaiting,
      },
    });
  } catch (error) {
    console.log("CREATE ORDER ERROR:", { message: error?.message, code: error?.code, keyValue: error?.keyValue });
      return res.status(500).json({
        success: false,
        message: "Khong the tao don hang",
      });
  }
};

const getOrderStatus = async (req, res) => {
  try {
    const id = String(req.params?.orderId || req.params?.id || "").trim();
    if (!isMongoId(id)) {
      return res.status(400).json({
        success: false,
        message: "Order id khong hop le",
      });
    }

    let order = await orderModel.findById(id);
    if (!order) {
      const transferContent = buildTransferContent(id);
      order = await orderModel.findOne({ transferContent });
    }
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Khong tim thay don hang",
      });
    }

    if (String(order.userId) !== String(req.userId)) {
      return res.status(403).json({
        success: false,
        message: "Ban khong co quyen truy cap don hang nay",
      });
    }
    const expiredOrder = await expirePendingSepayOrderById({ orderId: order._id, now: new Date() });
    if (expiredOrder) {
      order = expiredOrder;
    }

    const transferContent = order.transferContent || buildTransferContent(order._id);
    const qrCode = order.qrCode || buildSepayQrCode({ amount: order.amount, transferContent });
    const normalizedStatus = String(order.status || "pending").toLowerCase();
    const isPaid =
      order.payment === true ||
      ["paid", "success", "completed", "done"].some((keyword) => normalizedStatus.includes(keyword));

    return res.json({
      success: true,
      data: {
        orderId: String(order._id),
        amount: parseNumber(order.amount, 0),
        status: String(order.status || "pending"),
        payment: Boolean(order.payment),
        isPaid,
        completedBy: order.completedBy || null,
        completedAt: order.completedAt || null,
        deliveredAt: order.deliveredAt || null,
        fulfillmentStatus: getFulfillmentStatus(order, new Date()),
        timing: {
          prepTime: parseNumber(order.prepTime, 0),
          queueDelay: parseNumber(order.queueDelay, 0),
          deliveryTime: parseNumber(order.deliveryTime, 0),
          eta: parseNumber(order.eta, 0),
          startPrepAt: order.startPrepAt || null,
          startDeliveryAt: order.startDeliveryAt || null,
          finishAt: order.finishAt || null,
          ordersBefore: parseNumber(order.ordersBefore, 0),
        },
        paymentMethod: String(order.paymentMethod || "sepay"),
        transferContent,
        qrCode,
      },
    });
  } catch (error) {
    console.log("GET ORDER STATUS ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Khong the lay trang thai don hang",
    });
  }
};

const userOrders = async (req, res) => {
  try {
    await expirePendingSepayOrders({ now: new Date() });
    const orders = await orderModel.find({
      userId: req.userId,
    });

    res.json({ success: true, data: orders });
  } catch (error) {
    console.log(error);
    res.json({ success: false });
  }
};

const listOrders = async (req, res) => {
  try {
    await expirePendingSepayOrders({ now: new Date() });
    const orders = await orderModel.find({});
    const normalizedOrders = orders.map((order) => {
      const address = order?.address || {};
      const fullName = [address?.firstName, address?.lastName]
        .filter((part) => typeof part === "string" && part.trim())
        .join(" ")
        .trim();

      const customerName =
        (typeof address?.name === "string" && address.name.trim()) ||
        fullName ||
        "";

      const customerAddress =
        (typeof address?.deliveryText === "string" && address.deliveryText.trim()) ||
        (typeof order?.deliveryAddress?.text === "string" && order.deliveryAddress.text.trim()) ||
        [address?.street, address?.ward, address?.district, address?.city, address?.state, address?.country]
          .filter((part) => typeof part === "string" && part.trim())
          .join(", ")
          .trim();

      const customer = {
        name: customerName,
        phone: typeof address?.phone === "string" ? address.phone : "",
        address: customerAddress,
        city: typeof address?.city === "string" ? address.city : "",
        district: typeof address?.district === "string" ? address.district : "",
        ward: typeof address?.ward === "string" ? address.ward : "",
      };

      const totalItems = Array.isArray(order?.items)
        ? order.items.reduce((sum, item) => sum + parseNumber(item?.quantity, 0), 0)
        : 0;

      return {
        ...order.toObject(),
        orderId: String(order?._id || ""),
        customer,
        totalItems,
        totalPrice: parseNumber(order?.amount, 0),
      };
    });

    res.json({ success: true, data: normalizedOrders });
  } catch (error) {
    res.json({ success: false });
  }
};

const listOrdersV2 = async (req, res) => {
  try {
    await expirePendingSepayOrders({ now: new Date() });
    const query = req.isAdmin ? {} : { userId: req.userId };
    const orders = await orderModel.find(query).sort({ createdAt: -1 });
    const now = new Date();
    const data = orders.map((order) => normalizeOrderForResponse(order, now)).filter(Boolean);

    if (!req.isAdmin) {
      const reviewAggMap = await buildReviewSummaryMapForOrders({ userId: req.userId, orders });

      const reviewableCountMap = new Map();
      orders.forEach((order) => {
        const set = new Set();
        (Array.isArray(order?.items) ? order.items : []).forEach((item) => {
          const id = extractOrderItemFoodId(item);
          if (id) set.add(id);
        });
        reviewableCountMap.set(String(order?._id || ""), set.size);
      });

      data.forEach((orderData) => {
        const key = String(orderData?._id || "");
        const reviewableCount = Math.max(0, Number(reviewableCountMap.get(key) || 0));
        const agg = reviewAggMap.get(key) || {};
        const reviewedCount = Math.max(0, Number(agg.reviewedCount || 0));
        const pendingRewards = Math.max(0, Number(agg.pendingRewards || 0));

        orderData.reviewSummary = {
          reviewableCount,
          reviewedCount: Math.min(reviewableCount, reviewedCount),
          pendingRewards: Math.min(reviewableCount, pendingRewards),
        };
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.log("LIST ORDERS V2 ERROR:", error.message);
    res.status(500).json({ success: false, message: "Không thể tải đơn hàng" });
  }
};

const listOrdersForUser = async (req, res) => {
  try {
    await expirePendingSepayOrders({ now: new Date() });
    const orders = await orderModel.find({ userId: req.userId }).sort({ createdAt: -1 });
    const now = new Date();
    const data = orders.map((order) => normalizeOrderForResponse(order, now)).filter(Boolean);

    const reviewAggMap = await buildReviewSummaryMapForOrders({ userId: req.userId, orders });

    const reviewableCountMap = new Map();
    orders.forEach((order) => {
      const set = new Set();
      (Array.isArray(order?.items) ? order.items : []).forEach((item) => {
        const id = extractOrderItemFoodId(item);
        if (id) set.add(id);
      });
      reviewableCountMap.set(String(order?._id || ""), set.size);
    });

    data.forEach((orderData) => {
      const key = String(orderData?._id || "");
      const reviewableCount = Math.max(0, Number(reviewableCountMap.get(key) || 0));
      const agg = reviewAggMap.get(key) || {};
      const reviewedCount = Math.max(0, Number(agg.reviewedCount || 0));
      const pendingRewards = Math.max(0, Number(agg.pendingRewards || 0));

      orderData.reviewSummary = {
        reviewableCount,
        reviewedCount: Math.min(reviewableCount, reviewedCount),
        pendingRewards: Math.min(reviewableCount, pendingRewards),
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.log("LIST USER ORDERS ERROR:", error.message);
    res.status(500).json({ success: false, message: "Không thể tải đơn hàng" });
  }
};

const getOrderById = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) {
      return res.status(400).json({ success: false, message: "Order id không hợp lệ" });
    }

    let order = await orderModel.findById(id);
    if (!order) {
      const transferContent = buildTransferContent(id);
      order = await orderModel.findOne({
        $or: [{ transferContent }, { orderCode: transferContent }],
      });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    if (!req.isAdmin && String(order.userId) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    const expiredOrder = await expirePendingSepayOrderById({ orderId: order._id, now: new Date() });
    if (expiredOrder) {
      order = expiredOrder;
    }

    return res.json({ success: true, data: normalizeOrderForResponse(order, new Date()) });
  } catch (error) {
    console.log("GET ORDER BY ID ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải đơn hàng" });
  }
};

const updateOrderStatusById = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    const rawStatus = String(req.body?.status || "").trim().toLowerCase();
    const force =
      req.body?.force === true ||
      req.body?.force === "true" ||
      req.query?.force === "true";
    const legacyMap = {
      paid: "preparing",
      shipping: "delivering",
      done: "completed",
    };
    const status = legacyMap[rawStatus] || rawStatus;
    const allowed = new Set(["pending", "preparing", "delivering", "completed", "cancelled"]);

    if (!isMongoId(id)) {
      return res.status(400).json({ success: false, message: "Order id không hợp lệ" });
    }

    if (!allowed.has(status)) {
      return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
    }

    const existingOrder = await orderModel.findById(id);
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    const currentStatus = String(existingOrder.status || "").toLowerCase();
    const isPaid =
      existingOrder.payment === true ||
      ["paid", "success", "completed", "done"].includes(currentStatus);

    const paymentMethod = String(existingOrder.paymentMethod || "").toLowerCase();
    const requiresPayment = paymentMethod === "sepay";

    if (requiresPayment && !isPaid && !force) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng chưa thanh toán, không thể cập nhật trạng thái.",
      });
    }

    if (status === "completed") {
      const inventoryResult = await deductInventoryForOrder({
        orderId: id,
        reason: `ORDER_${id}`,
      });

      if (!inventoryResult.ok) {
        return res.status(inventoryResult.status || 409).json({
          success: false,
          message: inventoryResult.message || "Không thể trừ kho cho đơn hàng.",
          details: inventoryResult.details || null,
        });
      }
    }

    const buildTimingUpdates = (nextStatus, order) => {
      const now = new Date();
      const shouldOverrideTime = (value) => {
        if (!value) return true;
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) return true;
        return parsed.getTime() > now.getTime();
      };
      const updates = {};

      if (nextStatus === "preparing" && shouldOverrideTime(order.startPrepAt)) {
        updates.startPrepAt = now;
      }

      if (nextStatus === "delivering") {
        if (shouldOverrideTime(order.startPrepAt)) updates.startPrepAt = now;
        if (shouldOverrideTime(order.startDeliveryAt)) updates.startDeliveryAt = now;
      }

      if (nextStatus === "completed") {
        if (shouldOverrideTime(order.startPrepAt)) updates.startPrepAt = now;
        if (shouldOverrideTime(order.startDeliveryAt)) updates.startDeliveryAt = now;
        if (shouldOverrideTime(order.finishAt)) updates.finishAt = now;
      }

      return updates;
    };

    const buildCompletionUpdates = (nextStatus, order, completedBy) => {
      const now = new Date();
      const updates = {};

      if (nextStatus === "completed") {
        updates.completedBy = completedBy;
        updates.completedAt = now;
        updates.deliveredAt = order?.deliveredAt || now;
        return updates;
      }

      if (String(order?.status || "").toLowerCase() === "completed") {
        updates.completedBy = null;
        updates.completedAt = null;
        updates.deliveredAt = null;
      }

      return updates;
    };

    const timingUpdates = buildTimingUpdates(status, existingOrder);
    const completionUpdates = buildCompletionUpdates(status, existingOrder, "admin");
    const order = await orderModel.findByIdAndUpdate(
      id,
      { status, ...timingUpdates, ...completionUpdates },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    return res.json({ success: true, data: normalizeOrderForResponse(order, new Date()) });
  } catch (error) {
    console.log("UPDATE ORDER STATUS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể cập nhật đơn hàng" });
  }
};

const updateExternalShippingFee = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    const fee = parseNumber(req.body?.externalShippingFee, NaN);

    if (!isMongoId(id)) {
      return res.status(400).json({ success: false, message: "Order id không hợp lệ" });
    }

    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({ success: false, message: "Phí ship thuê ngoài phải >= 0" });
    }

    const order = await orderModel.findByIdAndUpdate(
      id,
      { externalShippingFee: fee },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    return res.json({ success: true, data: normalizeOrderForResponse(order, new Date()) });
  } catch (error) {
    console.log("UPDATE EXTERNAL SHIPPING ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể cập nhật phí ship thuê ngoài" });
  }
};

const deleteOrderById = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) {
      return res.status(400).json({ success: false, message: "Order id không hợp lệ" });
    }

    const order = await orderModel.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    const status = String(order.status || "").toLowerCase();
    if (status !== "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Chỉ có thể xóa đơn ở trạng thái đã hủy.",
      });
    }

    const childOrderCount = await orderModel.countDocuments({ parentOrderId: order._id });
    if (childOrderCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Không thể xóa đơn cha vì còn ${childOrderCount} đơn con.`,
      });
    }

    await orderModel.findByIdAndDelete(id);
    return res.json({ success: true, message: "Đã xóa đơn hàng." });
  } catch (error) {
    console.log("DELETE ORDER ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xóa đơn hàng" });
  }
};

const updateStatus = async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || "").trim();
    const rawStatus = String(req.body?.status || "").trim().toLowerCase();
    const legacyMap = {
      paid: "preparing",
      shipping: "delivering",
      done: "completed",
    };
    const status = legacyMap[rawStatus] || rawStatus;

    if (status === "completed") {
      const inventoryResult = await deductInventoryForOrder({
        orderId,
        reason: `ORDER_${orderId}`,
      });

      if (!inventoryResult.ok) {
        return res.status(inventoryResult.status || 409).json({
          success: false,
          message: inventoryResult.message || "Không thể trừ kho cho đơn hàng.",
          details: inventoryResult.details || null,
        });
      }
    }

    const existingOrder = await orderModel.findById(orderId);
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    const buildTimingUpdates = (nextStatus, order) => {
      const now = new Date();
      const shouldOverrideTime = (value) => {
        if (!value) return true;
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) return true;
        return parsed.getTime() > now.getTime();
      };
      const updates = {};

      if (nextStatus === "preparing" && shouldOverrideTime(order.startPrepAt)) {
        updates.startPrepAt = now;
      }

      if (nextStatus === "delivering") {
        if (shouldOverrideTime(order.startPrepAt)) updates.startPrepAt = now;
        if (shouldOverrideTime(order.startDeliveryAt)) updates.startDeliveryAt = now;
      }

      if (nextStatus === "completed") {
        if (shouldOverrideTime(order.startPrepAt)) updates.startPrepAt = now;
        if (shouldOverrideTime(order.startDeliveryAt)) updates.startDeliveryAt = now;
        if (shouldOverrideTime(order.finishAt)) updates.finishAt = now;
      }

      return updates;
    };

    const buildCompletionUpdates = (nextStatus, order, completedBy) => {
      const now = new Date();
      const updates = {};

      if (nextStatus === "completed") {
        updates.completedBy = completedBy;
        updates.completedAt = now;
        updates.deliveredAt = order?.deliveredAt || now;
        return updates;
      }

      if (String(order?.status || "").toLowerCase() === "completed") {
        updates.completedBy = null;
        updates.completedAt = null;
        updates.deliveredAt = null;
      }

      return updates;
    };

    const timingUpdates = buildTimingUpdates(status, existingOrder);
    const completionUpdates = buildCompletionUpdates(status, existingOrder, "admin");

    await orderModel.findByIdAndUpdate(orderId, {
      status,
      ...timingUpdates,
      ...completionUpdates,
    });

    res.json({
      success: true,
      message: "Status Updated",
    });
  } catch (error) {
    res.json({ success: false });
  }
};

const confirmOrderDelivered = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) {
      return res.status(400).json({ success: false, message: "Order id không hợp lệ" });
    }

    const order = await orderModel.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    if (String(order.userId) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: "Không có quyền xác nhận đơn hàng này" });
    }

    const currentStatus = String(order.status || "").toLowerCase();
    if (currentStatus !== "delivering") {
      return res.status(400).json({ success: false, message: "Trạng thái đơn hàng không hợp lệ" });
    }

    const normalizedStatus = String(order.status || "pending").toLowerCase();
    const isPaid =
      order.payment === true ||
      ["paid", "success", "completed", "done"].some((keyword) => normalizedStatus.includes(keyword));

    const paymentMethod = String(order.paymentMethod || "").toLowerCase();
    const requiresPayment = paymentMethod === "sepay";
    if (requiresPayment && !isPaid) {
      return res.status(400).json({ success: false, message: "Đơn hàng chưa thanh toán, không thể xác nhận." });
    }

    const inventoryResult = await deductInventoryForOrder({
      orderId: id,
      reason: `ORDER_${id}`,
    });

    if (!inventoryResult.ok) {
      return res.status(inventoryResult.status || 409).json({
        success: false,
        message: inventoryResult.message || "Không thể trừ kho cho đơn hàng.",
        details: inventoryResult.details || null,
      });
    }

    const now = new Date();
    order.status = "completed";
    order.completedBy = "user";
    order.completedAt = now;
    order.deliveredAt = order.deliveredAt || now;
    if (!order.finishAt) order.finishAt = now;

    await order.save();

    return res.json({ success: true, data: normalizeOrderForResponse(order, new Date()) });
  } catch (error) {
    console.log("CONFIRM ORDER DELIVERED ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xác nhận đơn hàng" });
  }
};

export {
  quoteDelivery,
  previewOrderEta,
  placeOrder,
  createOrder,
  getOrderStatus,
  userOrders,
  listOrders,
  listOrdersV2,
  listOrdersForUser,
  getOrderById,
  updateStatus,
  updateOrderStatusById,
  updateExternalShippingFee,
  deleteOrderById,
  confirmOrderDelivered,
  createAddOnOrder,
};


