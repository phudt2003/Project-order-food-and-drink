import { expirePendingSepayOrders } from "../services/orderPaymentTimeout.js";

const everyMinutes = () => {
  const raw = Number(process.env.ORDER_PAYMENT_TIMEOUT_CHECK_MINUTES ?? 1);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(60, Math.floor(raw));
};

export const runOrderPaymentTimeoutJob = async () => {
  const startedAt = new Date();

  try {
    const result = await expirePendingSepayOrders({ now: startedAt });
    console.log(
      "[ORDER PAYMENT TIMEOUT]",
      new Date().toISOString(),
      `matched: ${result.matchedCount}`,
      `expired: ${result.modifiedCount}`
    );
    return { ok: true, ...result };
  } catch (error) {
    console.log("[ORDER PAYMENT TIMEOUT] job error:", error?.message || error);
    return { ok: false, matchedCount: 0, modifiedCount: 0 };
  }
};

export const startOrderPaymentTimeoutScheduler = () => {
  if (process.env.ORDER_PAYMENT_TIMEOUT_JOB_DISABLED === "1") {
    console.log("[ORDER PAYMENT TIMEOUT] Disabled via ORDER_PAYMENT_TIMEOUT_JOB_DISABLED=1");
    return;
  }

  const intervalMs = everyMinutes() * 60 * 1000;
  console.log("[ORDER PAYMENT TIMEOUT] Running every", everyMinutes(), "minute(s)");

  const tick = async () => {
    try {
      await runOrderPaymentTimeoutJob();
    } finally {
      setTimeout(tick, intervalMs);
    }
  };

  // Small delay so startup can finish first.
  setTimeout(tick, 10 * 1000);
};
