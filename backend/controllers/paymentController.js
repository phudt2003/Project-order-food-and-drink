import orderModel from "../models/orderModel.js";
import voucherModel from "../models/voucherModel.js";
import userVoucherModel from "../models/userVoucherModel.js";
import userModel from "../models/userModel.js";
import cartModel from "../models/cartModel.js";
import { deductInventoryForOrder } from "../utils/inventoryDeduction.js";
import loyaltyTransactionModel from "../models/loyaltyTransactionModel.js";
import { getRankBySpend } from "../utils/loyaltyConfig.js";
import {
  AVG_PREP_TIME_MINUTES_FALLBACK,
  KITCHEN_CAPACITY,
  buildLifecycleTimestamps,
  calculateETA,
  countOrdersWaitingForKitchen,
} from "../services/orderLifecycle.js";
import { expirePendingSepayOrderById } from "../services/orderPaymentTimeout.js";

const WEBHOOK_LOOKBACK_HOURS = 72;

const parseNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toAmountInteger = (value) => Math.round(parseNumber(value, 0));

const getFirstString = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const parseJsonObject = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeSecretToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const canonicalizeText = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();

const hasAnyKeyword = (text, keywords) =>
  Array.isArray(keywords) && keywords.some((keyword) => text.includes(keyword));

const isSuccessStatusText = (text) => hasAnyKeyword(text, ["success", "paid", "completed", "done"]);
const isFailureStatusText = (text) =>
  hasAnyKeyword(text, ["fail", "failed", "cancel", "cancelled", "expired", "error", "declined"]);

const getWebhookPayload = (req) => {
  const payloadFromDataObject =
    req.body?.data && typeof req.body.data === "object" ? req.body.data : null;
  const payloadFromDataString = parseJsonObject(req.body?.data);
  return payloadFromDataObject || payloadFromDataString || req.body || {};
};

const isPlaceholderSecret = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "sk_123456789abcdef") return true;
  if (normalized === "foodapp_secret_123") return true;
  return false;
};

const isWebhookSecretValid = (req, payload) => {
  const expectedValues = [
    String(process.env.SEPAY_WEBHOOK_API_KEY || "").trim(),
    String(process.env.SEPAY_WEBHOOK_SECRET || "").trim(),
  ].filter(Boolean);

  const hasRealSecrets = expectedValues.some((value) => !isPlaceholderSecret(value));
  if (!hasRealSecrets) return true;

  const authorization = String(req.headers.authorization || "");
  const bearerToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const apikeyToken = authorization.toLowerCase().startsWith("apikey ")
    ? authorization.slice(7).trim()
    : "";

  const received = getFirstString(
    req.headers["x-sepay-secret"],
    req.headers["x-sepay-api-key"],
    req.headers["x-api-key"],
    req.headers["x-webhook-secret"],
    payload?.secret,
    payload?.webhook_secret,
    bearerToken,
    apikeyToken,
    authorization.trim()
  );

  if (!received) return false;

  if (expectedValues.includes(received)) {
    return true;
  }

  const normalizedReceived = normalizeSecretToken(received);
  if (!normalizedReceived) return false;

  return expectedValues
    .map((value) => normalizeSecretToken(value))
    .filter(Boolean)
    .includes(normalizedReceived);
};

const getIncomingContent = (payload, req) =>
  getFirstString(
    payload?.transferContent,
    payload?.transfer_content,
    payload?.content,
    payload?.transactionContent,
    payload?.transaction_content,
    payload?.description,
    payload?.body,
    payload?.code,
    req.body?.transferContent,
    req.body?.transfer_content,
    req.body?.content,
    req.body?.transactionContent,
    req.body?.transaction_content,
    req.body?.description,
    req.body?.body,
    req.body?.code
  );

const getIncomingAmount = (payload, req) =>
  toAmountInteger(
    payload?.transferAmount ??
      payload?.transfer_amount ??
      payload?.amount ??
      payload?.amountIn ??
      payload?.amount_in ??
      payload?.in ??
      req.body?.transferAmount ??
      req.body?.transfer_amount ??
      req.body?.amount ??
      req.body?.amountIn ??
      req.body?.amount_in ??
      req.body?.in
  );

const extractMongoIdsFromContent = (content) => {
  const matches = String(content || "").match(/[a-f\d]{24}/gi) || [];
  return [...new Set(matches.map((value) => value.toLowerCase()))];
};

const buildExpectedTransferContent = (order) => {
  const orderId = String(order?._id || "");
  const existingContent = String(order?.transferContent || "").trim();
  return existingContent || `ORDER_${orderId}`;
};

const isAmountMatched = (orderAmount, incomingAmount) =>
  toAmountInteger(orderAmount) > 0 && toAmountInteger(orderAmount) === toAmountInteger(incomingAmount);

const isContentMatched = (content, order) => {
  const canonicalContent = canonicalizeText(content);
  if (!canonicalContent) return false;

  const orderId = canonicalizeText(order?._id);
  const expectedTransferContent = canonicalizeText(buildExpectedTransferContent(order));

  if (orderId && canonicalContent.includes(orderId)) return true;
  if (expectedTransferContent && canonicalContent.includes(expectedTransferContent)) return true;

  return false;
};

const isOrderMatchedByWebhook = (order, incomingAmount, content) =>
  Boolean(order) && isAmountMatched(order.amount, incomingAmount) && isContentMatched(content, order);

const findOrderByWebhook = async ({ incomingAmount, content }) => {
  const idsFromContent = extractMongoIdsFromContent(content);

  for (const id of idsFromContent) {
    const order = await orderModel.findById(id);
    if (isOrderMatchedByWebhook(order, incomingAmount, content)) {
      return order;
    }
  }

  const lookbackDate = new Date(Date.now() - WEBHOOK_LOOKBACK_HOURS * 60 * 60 * 1000);
  const candidates = await orderModel
    .find({
      paymentMethod: "sepay",
      amount: incomingAmount,
      createdAt: { $gte: lookbackDate },
      status: { $nin: ["failed", "cancelled", "canceled", "expired"] },
    })
    .sort({ createdAt: -1 })
    .limit(50);

  const matchedOrders = candidates.filter((order) => isOrderMatchedByWebhook(order, incomingAmount, content));
  if (matchedOrders.length === 0) return null;

  const unpaidOrder = matchedOrders.find(
    (order) => String(order?.status || "").toLowerCase() !== "paid" && !order?.payment
  );

  return unpaidOrder || matchedOrders[0];
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

const TIMEZONE = String(process.env.LOYALTY_TZ || process.env.BIRTHDAY_TZ || "Asia/Ho_Chi_Minh");

const getDatePartsInTimeZone = (date, timeZone) => {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(lookup.year),
      month: Number(lookup.month),
      day: Number(lookup.day),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }
};

const buildKeyYMD = (year, month, day) => year * 10000 + month * 100 + day;

const calcOrderCoins = (orderAmount, multiplier) => {
  const amount = Math.max(0, Number(orderAmount || 0));
  const base = Math.max(1, Math.floor(amount / 10000));
  const coins = Math.round(base * Math.max(1, Number(multiplier || 1)));
  return Math.max(0, coins);
};

const awardCoinsForPaidOrder = async (order) => {
  const userId = String(order?.userId || "");
  if (!userId) return;

  const amount = Math.max(0, Number(order?.amount || 0));
  if (amount <= 0) return;

  const user = await userModel.findById(userId).select("totalSpend coinBalance").lean();
  if (!user) return;

  const totalSpendBefore = Math.max(0, Number(user.totalSpend || 0));
  const { current } = getRankBySpend(totalSpendBefore);
  const coins = calcOrderCoins(amount, current?.coinMultiplier || 1);

  const updated = await userModel.findByIdAndUpdate(
    userId,
    { $inc: { totalSpend: amount, coinBalance: coins } },
    { new: true }
  ).select("coinBalance totalSpend");

  const paidAt = order?.paidAt ? new Date(order.paidAt) : new Date();
  const parts = getDatePartsInTimeZone(paidAt, TIMEZONE);
  const ymd = buildKeyYMD(parts.year, parts.month, parts.day);

  await loyaltyTransactionModel.create({
    userId,
    amount: coins,
    reason: "order",
    ymd,
    meta: {
      orderId: String(order?._id || ""),
      orderCode: String(order?.orderCode || order?.transferContent || ""),
      multiplier: Number(current?.coinMultiplier || 1),
      rank: String(current?.key || ""),
      orderAmount: amount,
    },
    balanceAfter: Math.max(0, Number(updated?.coinBalance || 0)),
  });
};

const webhookSepay = async (req, res) => {
  try {
    const payload = getWebhookPayload(req);

    if (!isWebhookSecretValid(req, payload)) {
      return res.status(401).json({ success: false, message: "Invalid webhook secret" });
    }

    const transferType = String(payload?.transferType || payload?.transfer_type || "").toLowerCase();
    if (transferType && transferType !== "in") {
      return res.status(200).json({ success: true });
    }

    const incomingAmount = getIncomingAmount(payload, req);
    const incomingContent = getIncomingContent(payload, req);

    if (!incomingAmount || !incomingContent) {
      return res.status(400).json({ success: false, message: "Missing amount or content" });
    }

    const statusText = String(payload?.status || req.body?.status || "").toLowerCase();
    if (statusText && !isSuccessStatusText(statusText)) {
      if (isFailureStatusText(statusText)) {
        return res.status(200).json({ success: true });
      }
      return res.status(200).json({ success: true });
    }

    const order = await findOrderByWebhook({
      incomingAmount,
      content: incomingContent,
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const expectedAmount = toAmountInteger(order.amount);
    if (incomingAmount !== expectedAmount) {
      return res.status(400).json({ success: false, message: "Amount mismatch" });
    }

    if (!isContentMatched(incomingContent, order)) {
      return res.status(400).json({ success: false, message: "Content mismatch" });
    }
    const expiredOrder = await expirePendingSepayOrderById({ orderId: order._id, now: new Date() });
    if (expiredOrder) {
      return res.status(409).json({ success: false, message: "Order payment window expired" });
    }

    const paymentTransactionId = getFirstString(
      payload?.transactionId,
      payload?.transaction_id,
      payload?.referenceCode,
      payload?.reference_code,
      payload?.id
    );

    const paymentReferenceCode = getFirstString(payload?.referenceCode, payload?.reference_code);

    const updatedOrder = await orderModel.findOneAndUpdate(
      {
        _id: order._id,
        payment: { $ne: true },
      },
      {
        $set: {
          status: "paid",
          payment: true,
          paymentMethod: "sepay",
          paidAt: new Date(),
          transferContent: buildExpectedTransferContent(order),
          paymentTransactionId,
          paymentReferenceCode,
          lastWebhookAt: new Date(),
        },
      },
      { new: true }
    );

    const targetOrder = updatedOrder || order;

    if (updatedOrder) {
      // Finalize queue-based ETA at payment time (fully automated lifecycle, no manual admin clicks).
      // This recalculates queueDelay using the latest queue load.
      try {
        const paidAt = updatedOrder.paidAt || new Date();
        const distanceKm = parseNumber(updatedOrder.distanceKm ?? updatedOrder.distance, 0);
        const ordersWaiting = await countOrdersWaitingForKitchen({
          now: paidAt,
          excludeOrderId: updatedOrder._id,
        });
        const etaInfo = calculateETA(updatedOrder, distanceKm, {
          ordersWaiting,
          capacity: KITCHEN_CAPACITY,
          avgPrepTime: AVG_PREP_TIME_MINUTES_FALLBACK,
        });
        const lifecycle = buildLifecycleTimestamps({
          baseAt: paidAt,
          queueDelay: etaInfo.queueDelay,
          prepTime: etaInfo.prepTime,
          deliveryTime: etaInfo.deliveryTime,
        });

        await orderModel.updateOne(
          { _id: updatedOrder._id },
          {
            $set: {
              deliveryTime: etaInfo.deliveryTime,
              prepTime: etaInfo.prepTime,
              queueDelay: etaInfo.queueDelay,
              eta: etaInfo.eta,
              ordersBefore: ordersWaiting,
              startPrepAt: lifecycle.startPrepAt,
              startDeliveryAt: lifecycle.startDeliveryAt,
              finishAt: lifecycle.finishAt,
            },
          }
        );
      } catch (etaError) {
        console.log("SEPAY WEBHOOK ETA ERROR:", etaError.message);
      }

      try {
        await increaseVoucherUsage(updatedOrder);
      } catch (voucherError) {
        console.log("SEPAY WEBHOOK VOUCHER ERROR:", voucherError.message);
      }

      try {
        await awardCoinsForPaidOrder(updatedOrder);
      } catch (loyaltyError) {
        console.log("SEPAY WEBHOOK LOYALTY ERROR:", loyaltyError.message);
      }

      try {
        const inventoryResult = await deductInventoryForOrder({
          orderId: String(updatedOrder._id),
          reason: `ORDER_${updatedOrder._id}`,
        });

        if (!inventoryResult.ok) {
          await orderModel.updateOne(
            { _id: updatedOrder._id },
            { $set: { inventory: { status: "failed", deductedAt: null, error: inventoryResult.message || "Deduct failed" } } }
          );
          console.log("SEPAY WEBHOOK INVENTORY ERROR:", inventoryResult.message);
        }
      } catch (inventoryError) {
        console.log("SEPAY WEBHOOK INVENTORY ERROR:", inventoryError.message);
      }
    }

    await Promise.allSettled([
      userModel.findByIdAndUpdate(targetOrder.userId, { cartData: {} }),
      cartModel.findOneAndUpdate(
        { userId: targetOrder.userId },
        { items: [] },
        { new: true }
      ),
    ]);

    if (!updatedOrder) {
      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.log("SEPAY WEBHOOK ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
};

export { webhookSepay };
