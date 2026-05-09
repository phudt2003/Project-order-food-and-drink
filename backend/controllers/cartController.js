import mongoose from "mongoose";
import cartModel from "../models/cartModel.js";
import userModel from "../models/userModel.js";

const slugify = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const normalizeToppings = (toppings) => {
  if (!Array.isArray(toppings)) return [];

  const selectionMap = new Map();

  toppings.forEach((item) => {
    if (!item) return;

    if (typeof item === "string") {
      const name = item.trim();
      if (!name) return;

      const toppingId = slugify(name) || name;

      const existing = selectionMap.get(toppingId);
      if (existing) {
        existing.quantity += 1;
      } else {
        selectionMap.set(toppingId, { toppingId, name, quantity: 1 });
      }
      return;
    }

    if (typeof item === "object") {
      const rawId = String(
        item?.toppingId || item?.id || item?.name || item?.toppingName || ""
      ).trim();
      const rawName = String(item?.name || item?.toppingName || "").trim();
      const toppingId = slugify(rawId) || slugify(rawName) || rawId || rawName;
      if (!toppingId) return;

      const quantityRaw = Number(item?.quantity ?? 1);
      const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.round(quantityRaw)) : 1;
      const name = rawName || rawId || toppingId;

      const existing = selectionMap.get(toppingId);
      if (existing) {
        existing.quantity += quantity;
        if (!existing.name && name) existing.name = name;
      } else {
        selectionMap.set(toppingId, { toppingId, name, quantity });
      }
    }
  });

  return Array.from(selectionMap.values()).sort((a, b) =>
    String(a.toppingId).localeCompare(String(b.toppingId))
  );
};

const toppingsKey = (toppings) =>
  JSON.stringify(
    normalizeToppings(toppings).map((item) => ({
      toppingId: String(item?.toppingId || ""),
      quantity: Number(item?.quantity || 0),
    }))
  );

const sameCartItemConfig = (existingItem, payload) => {
  return (
    String(existingItem.productId) === String(payload.productId) &&
    String(existingItem.size || "") === String(payload.size || "") &&
    String(existingItem.sugarLevel || "") === String(payload.sugarLevel || "") &&
    String(existingItem.iceLevel || "") === String(payload.iceLevel || "") &&
    toppingsKey(existingItem.toppings) === toppingsKey(payload.toppings)
  );
};

const getProductIdKey = (productId) => {
  if (!productId) return "";
  if (typeof productId === "string") return productId;
  if (productId?._id) return String(productId._id);
  return String(productId);
};

const toCartDataMap = (items = []) => {
  return items.reduce((acc, item) => {
    const key = getProductIdKey(item.productId);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + Number(item.quantity || 0);
    return acc;
  }, {});
};

const toCartLineItems = (items = []) =>
  items
    .map((item) => {
      const product = item.productId && typeof item.productId === "object" ? item.productId : null;
      if (!product || !product._id) return null;

      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.price) > 0 ? Number(item.price) : Number(product.price || 0);

      return {
        productId: String(product._id),
        quantity,
        size: String(item.size || ""),
        toppings: normalizeToppings(item.toppings),
        sugarLevel: String(item.sugarLevel || ""),
        iceLevel: String(item.iceLevel || ""),
        unitPrice,
        lineTotal: unitPrice * quantity,
        product: {
          _id: String(product._id),
          name: product.name || "",
          image: product.image || "",
          price: Number(product.price || 0),
          type: String(product.type || ""),
          categoryId: product.categoryId ? String(product.categoryId) : "",
          category: product.category || "",
          description: product.description || "",
        },
      };
    })
    .filter((item) => item && item.quantity > 0);

const enrichCartForResponse = async (cart) => {
  await cart.populate("items.productId");
  return toCartLineItems(cart.items);
};

const ensureCartDocument = async (userId) => {
  let cart = await cartModel.findOne({ userId });
  if (cart) return cart;

  const user = await userModel.findById(userId).lean();
  const legacyCartData = user?.cartData && typeof user.cartData === "object" ? user.cartData : {};
  const migratedItems = Object.entries(legacyCartData)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([productId, quantity]) => ({
      productId: new mongoose.Types.ObjectId(productId),
      quantity: Number(quantity),
      size: "",
      toppings: [],
      sugarLevel: "",
      iceLevel: "",
      price: 0,
    }));

  cart = await cartModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, items: migratedItems } },
    { new: true, upsert: true }
  );

  return cart;
};

const addToCart = async (req, res) => {
  try {
    const userId = req.userId;
    const productId = req.body.productId || req.body.itemId;

    if (!productId) {
      return res.json({ success: false, message: "Thiếu productId" });
    }

    const payload = {
      productId: String(productId),
      quantity: Math.max(1, Number(req.body.quantity) || 1),
      size: String(req.body.size || ""),
      toppings: normalizeToppings(req.body.toppings),
      sugarLevel: String(req.body.sugarLevel || ""),
      iceLevel: String(req.body.iceLevel || ""),
      price: Number(req.body.price) || 0,
    };

    const cart = await ensureCartDocument(userId);
    const existingItem = cart.items.find((item) => sameCartItemConfig(item, payload));

    if (existingItem) {
      existingItem.quantity += payload.quantity;
      existingItem.toppings = normalizeToppings(existingItem.toppings);
    } else {
      cart.items.push(payload);
    }

    await cart.save();
    const cartData = toCartDataMap(cart.items);
    const cartItems = await enrichCartForResponse(cart);

    res.json({
      success: true,
      message: "Đã thêm vào giỏ hàng",
      cartData,
      cartItems,
      cart,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Lỗi" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.userId;
    const productId = req.body.productId || req.body.itemId;

    if (!productId) {
      return res.json({ success: false, message: "Thiếu productId" });
    }

    const payload = {
      productId: String(productId),
      size: String(req.body.size || ""),
      toppings: normalizeToppings(req.body.toppings),
      sugarLevel: String(req.body.sugarLevel || ""),
      iceLevel: String(req.body.iceLevel || ""),
    };
    const removeAll = req.body.removeAll === true || String(req.body.removeAll || "").toLowerCase() === "true";
    const removeQuantityRaw = Number(req.body.removeQuantity ?? req.body.quantity ?? 1);
    const removeQuantity = Number.isFinite(removeQuantityRaw)
      ? Math.max(1, Math.round(removeQuantityRaw))
      : 1;

    const cart = await ensureCartDocument(userId);
    const targetIndex = cart.items.findIndex((item) => {
      if (payload.size || payload.sugarLevel || payload.iceLevel || payload.toppings.length > 0) {
        return sameCartItemConfig(item, payload);
      }
      return String(item.productId) === String(payload.productId);
    });

    if (targetIndex !== -1) {
      if (removeAll) {
        cart.items.splice(targetIndex, 1);
      } else {
        cart.items[targetIndex].quantity -= removeQuantity;
        if (cart.items[targetIndex].quantity <= 0) {
          cart.items.splice(targetIndex, 1);
        }
      }
      await cart.save();
    }

    const cartData = toCartDataMap(cart.items);
    const cartItems = await enrichCartForResponse(cart);

    res.json({
      success: true,
      message: "Đã xóa khỏi giỏ hàng",
      cartData,
      cartItems,
      cart,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Lỗi" });
  }
};

const getCart = async (req, res) => {
  try {
    const cart = await ensureCartDocument(req.userId);
    const cartData = toCartDataMap(cart.items);
    const cartItems = await enrichCartForResponse(cart);

    res.json({
      success: true,
      cartData,
      cartItems,
      cart,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Lỗi" });
  }
};

const getCartByUserId = async (req, res) => {
  try {
    if (String(req.params.userId) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const cart = await ensureCartDocument(req.userId);
    const cartData = toCartDataMap(cart.items);
    const cartItems = await enrichCartForResponse(cart);

    res.json({
      success: true,
      cartData,
      cartItems,
      cart,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Lỗi" });
  }
};

export { addToCart, removeFromCart, getCart, getCartByUserId };
