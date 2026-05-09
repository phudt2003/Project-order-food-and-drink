import orderModel from "../models/orderModel.js";

const DEFAULT_TIMEOUT_MINUTES = 10;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const isSepayMethod = (paymentMethod) => normalizeText(paymentMethod) === "sepay";

const isPendingStatus = (status) => normalizeText(status) === "pending";

export const getOrderPaymentTimeoutMinutes = () =>
  parsePositiveInt(process.env.ORDER_PAYMENT_TIMEOUT_MINUTES, DEFAULT_TIMEOUT_MINUTES);

export const getOrderPaymentTimeoutMs = () => getOrderPaymentTimeoutMinutes() * 60 * 1000;

export const isPendingSepayOrder = (order) => {
  if (!order) return false;
  if (order.payment === true) return false;
  if (!isSepayMethod(order.paymentMethod)) return false;
  return isPendingStatus(order.status);
};

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
};

export const getOrderPaymentDeadline = (order) => {
  if (!isPendingSepayOrder(order)) return null;
  const createdAt = toDate(order.createdAt || order.date);
  if (!createdAt) return null;
  return new Date(createdAt.getTime() + getOrderPaymentTimeoutMs());
};

export const isPendingSepayOrderExpired = (order, now = new Date()) => {
  const deadline = getOrderPaymentDeadline(order);
  if (!deadline) return false;
  const current = toDate(now) || new Date();
  return current.getTime() >= deadline.getTime();
};

const buildExpiredPendingSepayFilter = (now = new Date()) => {
  const timeoutMs = getOrderPaymentTimeoutMs();
  const cutoff = new Date(now.getTime() - timeoutMs);
  return {
    payment: { $ne: true },
    paymentMethod: { $regex: /^sepay$/i },
    status: "pending",
    createdAt: { $lte: cutoff },
  };
};

const buildExpireUpdate = (now = new Date()) => ({
  $set: {
    status: "cancelled",
    completedBy: "system",
    completedAt: now,
    finishAt: now,
    paymentStatus: "UNPAID",
  },
});

export const expirePendingSepayOrders = async ({ now = new Date() } = {}) => {
  const filter = buildExpiredPendingSepayFilter(now);
  const update = buildExpireUpdate(now);
  const result = await orderModel.updateMany(filter, update);
  return {
    matchedCount: Number(result?.matchedCount || 0),
    modifiedCount: Number(result?.modifiedCount || 0),
  };
};

export const expirePendingSepayOrderById = async ({ orderId, now = new Date() }) => {
  const id = String(orderId || "").trim();
  if (!id) return null;
  const filter = { _id: id, ...buildExpiredPendingSepayFilter(now) };
  const update = buildExpireUpdate(now);
  return orderModel.findOneAndUpdate(filter, update, { new: true });
};
