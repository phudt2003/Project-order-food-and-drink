import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import userVoucherModel from "../models/userVoucherModel.js";
import { buildUserVoucherPayloadFromTemplate, findAutoVoucherTemplate } from "../utils/autoVoucherTemplates.js";

const TIMEZONE = String(process.env.VOUCHER_JOB_TZ || process.env.BIRTHDAY_TZ || "Asia/Ho_Chi_Minh");

const addDays = (date, days) => new Date(date.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);

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

const buildKeyYearMonth = (year, month) => year * 100 + month;

const upsertUserVoucher = async (filter, payload) => {
  const update = { $setOnInsert: payload };
  const result = await userVoucherModel.updateOne(filter, update, { upsert: true });
  return Boolean(result?.upsertedCount);
};

export const runVoucherDailyJob = async () => {
  const startedAt = new Date();
  const today = getDatePartsInTimeZone(startedAt, TIMEZONE);
  const currentYear = Number(today.year);
  const now = startedAt;

  const stats = {
    birthdayCandidates: 0,
    birthdayGranted: 0,
    comebackCandidates: 0,
    comebackGranted: 0,
  };

  try {
    const birthdayUsers = await userModel
      .find({
        birthday: { $ne: null },
        lastBirthdayRewardYear: { $ne: currentYear },
      })
      .select("_id birthday lastBirthdayRewardYear")
      .lean();

    const birthdayMatches = birthdayUsers.filter((user) => {
      if (!user?.birthday) return false;
      const birth = getDatePartsInTimeZone(new Date(user.birthday), TIMEZONE);
      return birth.day === today.day && birth.month === today.month;
    });

    stats.birthdayCandidates = birthdayMatches.length;

    if (birthdayMatches.length) {
      const birthdayTemplate = await findAutoVoucherTemplate({ issueType: "birthday", now });
      const ops = birthdayMatches.map(async (user) => {
        const userId = String(user._id);
        const templatePayload = buildUserVoucherPayloadFromTemplate({
          template: birthdayTemplate,
          userId,
          rewardType: "birthday",
          rewardYear: currentYear,
          now,
          defaultExpireDays: 3,
        });
        const fallbackPayload = {
          userId,
          rewardType: "birthday",
          rewardYear: currentYear,
          voucherCode: "BIRTHDAY30",
          voucherName: "Voucher sinh nhật - Giảm 30.000đ",
          campaignType: "birthday",
          voucherType: "FOOD",
          type: "product",
          discountType: "amount",
          discountValue: 30000,
          startDate: now,
          endDate: addDays(now, 3),
          applyFor: "all",
          minOrderValue: 60000,
          maxUsage: 1,
          usagePerUser: 1,
          status: "active",
        };

        const created = await upsertUserVoucher(
          { userId, rewardType: "birthday", rewardYear: currentYear },
          templatePayload || fallbackPayload
        );

        await userModel.updateOne({ _id: userId }, { $set: { lastBirthdayRewardYear: currentYear } });

        if (created) stats.birthdayGranted += 1;
      });

      await Promise.allSettled(ops);
    }
  } catch (error) {
    console.log("VOUCHER DAILY JOB (BIRTHDAY) ERROR:", error.message);
  }

  try {
    const comebackTemplate = await findAutoVoucherTemplate({ issueType: "comeback", now });
    const comebackThreshold = Math.max(1, Number(comebackTemplate?.comebackAfterDays || 14));
    const cutoff = new Date(now.getTime() - comebackThreshold * 24 * 60 * 60 * 1000);

    const lastOrders = await orderModel.aggregate([
      {
        $match: {
          $or: [{ payment: true }, { status: "paid" }],
        },
      },
      {
        $group: {
          _id: "$userId",
          lastOrderAt: {
            $max: {
              $ifNull: ["$paidAt", "$createdAt"],
            },
          },
        },
      },
      {
        $match: {
          lastOrderAt: { $lte: cutoff },
        },
      },
      {
        $project: {
          userId: "$_id",
          lastOrderAt: 1,
        },
      },
    ]);

    const comebackUsers = lastOrders
      .map((row) => String(row?.userId || ""))
      .filter(Boolean);

    stats.comebackCandidates = comebackUsers.length;

    if (comebackUsers.length) {
      const rewardYear = buildKeyYearMonth(currentYear, today.month);

      const ops = comebackUsers.map(async (userId) => {
        const templatePayload = buildUserVoucherPayloadFromTemplate({
          template: comebackTemplate,
          userId,
          rewardType: "comeback",
          rewardYear,
          now,
          defaultExpireDays: 5,
        });
        const fallbackPayload = {
          userId,
          rewardType: "comeback",
          rewardYear,
          voucherCode: "COMEBACK20",
          voucherName: "Voucher quay lại - Giảm 20.000đ",
          campaignType: "comeback",
          voucherType: "FOOD",
          type: "product",
          discountType: "amount",
          discountValue: 20000,
          startDate: now,
          endDate: addDays(now, 5),
          applyFor: "all",
          minOrderValue: 60000,
          maxUsage: 1,
          usagePerUser: 1,
          status: "active",
        };
        const created = await upsertUserVoucher(
          { userId, rewardType: "comeback", rewardYear },
          templatePayload || fallbackPayload
        );

        if (created) stats.comebackGranted += 1;
      });

      await Promise.allSettled(ops);
    }
  } catch (error) {
    console.log("VOUCHER DAILY JOB (COMEBACK) ERROR:", error.message);
  }

  const finishedAt = new Date();
  console.log(
    "[VOUCHER DAILY JOB]",
    finishedAt.toISOString(),
    `birthday: ${stats.birthdayGranted}/${stats.birthdayCandidates}`,
    `comeback: ${stats.comebackGranted}/${stats.comebackCandidates}`
  );

  return { ok: true, stats };
};

const scheduleNext = () => {
  const now = new Date();
  const hour = Number(process.env.VOUCHER_JOB_HOUR ?? 0);
  const minute = Number(process.env.VOUCHER_JOB_MINUTE ?? 5);

  const next = new Date(now);
  next.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 5, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  const delayMs = Math.max(1000, next.getTime() - now.getTime());
  setTimeout(async () => {
    try {
      await runVoucherDailyJob();
    } finally {
      scheduleNext();
    }
  }, delayMs);

  console.log("[VOUCHER DAILY JOB] Next run at", next.toString());
};

export const startVoucherScheduler = () => {
  if (process.env.VOUCHER_JOB_DISABLED === "1") {
    console.log("[VOUCHER DAILY JOB] Disabled via VOUCHER_JOB_DISABLED=1");
    return;
  }

  scheduleNext();
};
