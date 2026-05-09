import orderModel from "../models/orderModel.js";

// Business constants (can be overridden via env later if needed)
export const PREP_MINUTES_DRINK = 3;
export const PREP_MINUTES_FOOD = 2;
export const TRAVEL_MINUTES_PER_KM = 2.5;
export const KITCHEN_CAPACITY = 2;
export const AVG_PREP_TIME_MINUTES_FALLBACK = 8;

const MINUTE_MS = 60 * 1000;

const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "expired", "failed"]);

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const isCancelledOrder = (order) => {
  const statusLower = normalizeText(order?.status);
  if (!statusLower) return false;
  if (statusLower.includes("cancel")) return true;
  return CANCELLED_STATUSES.has(statusLower);
};

const isPaidOrder = (order) => {
  if (order?.payment === true) return true;
  const statusLower = normalizeText(order?.status);
  if (!statusLower) return false;
  return ["paid", "success", "completed", "done"].some((keyword) => statusLower.includes(keyword));
};

/**
 * PREPARATION TIME RULES
 * - Drink: 3 minutes each
 * - Food : 2 minutes each
 * prepTime = sum(qty * minutesPerItem)
 */
export const calculatePrepMetrics = (items = []) => {
  const safeItems = Array.isArray(items) ? items : [];

  let drinkCount = 0;
  let foodCount = 0;
  const DRINK_TYPES = new Set(["milk_tea", "coffee", "tea", "juice"]);

  for (const item of safeItems) {
    const qty = Math.max(0, Math.round(Number(item?.quantity || 0)));
    if (!qty) continue;

    const type = normalizeText(item?.type || item?.productType);

    const isDrink =
      type.includes("drink") ||
      type.includes("beverage") ||
      DRINK_TYPES.has(type) ||
      // Some drink variants are detected by options typically used for drinks.
      Boolean(item?.sugarLevel || item?.iceLevel);

    if (isDrink) {
      drinkCount += qty;
    } else {
      foodCount += qty;
    }
  }

  const prepTime = drinkCount * PREP_MINUTES_DRINK + foodCount * PREP_MINUTES_FOOD;
  return { drinkCount, foodCount, prepTime };
};

/**
 * DELIVERY TIME RULE
 * deliveryTime = distance(km) * 2.5 minutes
 */
export const calculateDeliveryTimeMinutes = (distanceKm) => {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return Math.max(1, Math.ceil(distance * TRAVEL_MINUTES_PER_KM));
};

/**
 * QUEUE LOGIC
 * - capacity = 2 orders at the same time
 * - ordersWaiting = count orders with ["pending", "preparing"] (i.e. not started delivery yet)
 * - avgPrepTime = 8 minutes (fallback)
 * queueDelay = floor(ordersWaiting / capacity) * avgPrepTime
 */
export const calculateQueueDelayMinutes = ({
  ordersWaiting,
  capacity = KITCHEN_CAPACITY,
  avgPrepTime = AVG_PREP_TIME_MINUTES_FALLBACK,
}) => {
  const safeWaiting = Math.max(0, Math.floor(Number(ordersWaiting || 0)));
  const safeCapacity = Math.max(1, Math.floor(Number(capacity || 0)));
  const safeAvg = Math.max(0, Math.floor(Number(avgPrepTime || 0)));

  return Math.floor(safeWaiting / safeCapacity) * safeAvg;
};

/**
 * FINAL ETA
 * ETA = queueDelay + prepTime + deliveryTime
 */
export const calculateETA = (order, distanceKm, context = {}) => {
  const { prepTime, drinkCount, foodCount } = calculatePrepMetrics(order?.items);
  const deliveryTime = calculateDeliveryTimeMinutes(distanceKm);

  const ordersWaiting = Math.max(0, Math.floor(Number(context?.ordersWaiting || 0)));
  const capacity = context?.capacity ?? KITCHEN_CAPACITY;
  const avgPrepTime = context?.avgPrepTime ?? AVG_PREP_TIME_MINUTES_FALLBACK;
  const queueDelay = calculateQueueDelayMinutes({ ordersWaiting, capacity, avgPrepTime });

  const eta = queueDelay + prepTime + deliveryTime;

  return {
    prepTime,
    deliveryTime,
    queueDelay,
    eta,
    ordersWaiting,
    capacity,
    avgPrepTime,
    prepBreakdown: { drinkCount, foodCount },
  };
};

export const buildLifecycleTimestamps = ({ baseAt, queueDelay, prepTime, deliveryTime }) => {
  const base = baseAt instanceof Date ? baseAt : new Date(baseAt || Date.now());
  const baseTime = Number.isFinite(base.getTime()) ? base.getTime() : Date.now();

  const startPrepAt = new Date(baseTime + Math.max(0, Number(queueDelay || 0)) * MINUTE_MS);
  const startDeliveryAt = new Date(startPrepAt.getTime() + Math.max(0, Number(prepTime || 0)) * MINUTE_MS);
  const finishAt = new Date(startDeliveryAt.getTime() + Math.max(0, Number(deliveryTime || 0)) * MINUTE_MS);

  return { startPrepAt, startDeliveryAt, finishAt };
};

/**
 * AUTO STATUS SYSTEM (no setTimeout)
 * Calculate dynamically from timestamps:
 * if now < startPrepAt      -> "pending"
 * if now < startDeliveryAt  -> "preparing"
 * if now < finishAt         -> "delivering"
 * else                      -> "done"
 */
export const getOrderStatus = (order, now = new Date()) => {
  if (!order) return "pending";
  if (isCancelledOrder(order)) return "cancelled";
  if (!isPaidOrder(order)) return "pending";

  const current = now instanceof Date ? now : new Date(now || Date.now());
  const currentTime = current.getTime();
  if (!Number.isFinite(currentTime)) return "pending";

  const startPrepAt = order?.startPrepAt ? new Date(order.startPrepAt) : null;
  const startDeliveryAt = order?.startDeliveryAt ? new Date(order.startDeliveryAt) : null;
  const finishAt = order?.finishAt ? new Date(order.finishAt) : null;

  if (!startPrepAt || !startDeliveryAt || !finishAt) return "pending";
  if (!Number.isFinite(startPrepAt.getTime()) || !Number.isFinite(startDeliveryAt.getTime()) || !Number.isFinite(finishAt.getTime())) {
    return "pending";
  }

  if (currentTime < startPrepAt.getTime()) return "pending";
  if (currentTime < startDeliveryAt.getTime()) return "preparing";
  if (currentTime < finishAt.getTime()) return "delivering";
  return "done";
};

export const countOrdersWaitingForKitchen = async ({ now = new Date(), excludeOrderId } = {}) => {
  const current = now instanceof Date ? now : new Date(now || Date.now());

  const query = {
    payment: true,
    status: { $nin: Array.from(CANCELLED_STATUSES) },
    startDeliveryAt: { $gt: current },
  };

  if (excludeOrderId) {
    query._id = { $ne: excludeOrderId };
  }

  return orderModel.countDocuments(query);
};

export const countActiveOrders = async ({ now = new Date() } = {}) => {
  const current = now instanceof Date ? now : new Date(now || Date.now());

  return orderModel.countDocuments({
    payment: true,
    status: { $nin: Array.from(CANCELLED_STATUSES) },
    finishAt: { $gt: current },
  });
};

export const getQueueStats = async ({ now = new Date() } = {}) => {
  const current = now instanceof Date ? now : new Date(now || Date.now());

  const [ordersWaiting, activeOrders] = await Promise.all([
    countOrdersWaitingForKitchen({ now: current }),
    countActiveOrders({ now: current }),
  ]);

  const [avgResult] = await orderModel.aggregate([
    {
      $match: {
        payment: true,
        status: { $nin: Array.from(CANCELLED_STATUSES) },
        finishAt: { $gt: current },
      },
    },
    {
      $project: {
        remainingMinutes: {
          $divide: [{ $subtract: ["$finishAt", current] }, MINUTE_MS],
        },
        eta: { $ifNull: ["$eta", 0] },
      },
    },
    {
      $group: {
        _id: null,
        avgRemainingMinutes: { $avg: "$remainingMinutes" },
        avgEtaMinutes: { $avg: "$eta" },
      },
    },
  ]);

  return {
    capacity: KITCHEN_CAPACITY,
    ordersWaiting,
    activeOrders,
    avgEtaMinutes: avgResult?.avgEtaMinutes != null ? Math.round(Number(avgResult.avgEtaMinutes)) : 0,
    avgRemainingMinutes:
      avgResult?.avgRemainingMinutes != null ? Math.max(0, Math.round(Number(avgResult.avgRemainingMinutes))) : 0,
  };
};
