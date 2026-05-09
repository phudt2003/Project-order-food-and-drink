import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import reviewModel from "../models/Review.js";
import voucherModel from "../models/voucherModel.js";
import userVoucherModel from "../models/userVoucherModel.js";
import loyaltyTransactionModel from "../models/loyaltyTransactionModel.js";
import loyaltyMissionClaimModel from "../models/loyaltyMissionClaimModel.js";
import { MISSIONS, REDEEM_SHOP, RANKS, getRankBySpend } from "../utils/loyaltyConfig.js";
import { buildUserVoucherPayloadFromTemplate, findAutoVoucherTemplate } from "../utils/autoVoucherTemplates.js";

const TIMEZONE = String(process.env.LOYALTY_TZ || "Asia/Ho_Chi_Minh");

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

const buildKeyYMD = (year, month, day) => year * 10000 + month * 100 + day;

const buildKeyYearMonth = (year, month) => year * 100 + month;

const randomCode = (length = 6) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const ensureReferralCode = async (userId) => {
  const existing = await userModel.findById(userId).select("referralCode").lean();
  if (existing?.referralCode) return String(existing.referralCode);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `CB${randomCode(6)}`;
    try {
      await userModel.updateOne({ _id: userId, referralCode: null }, { $set: { referralCode: candidate } });
      const updated = await userModel.findById(userId).select("referralCode").lean();
      if (updated?.referralCode) return String(updated.referralCode);
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  return "";
};

const ensureMonthlyVoucher = async ({ userId, now, rank }) => {
  if (!rank?.monthlyVoucher) return null;

  const parts = getDatePartsInTimeZone(now, TIMEZONE);
  const rewardYear = buildKeyYearMonth(parts.year, parts.month);
  const existed = await userVoucherModel.findOne({ userId, rewardType: "monthly", rewardYear }).lean();
  if (existed) return existed;

  const startDate = new Date(now);
  const fallbackExpireDays = Number(rank.monthlyVoucher.expireDays || 7);
  const endDate = addDays(now, fallbackExpireDays);
  const template = await findAutoVoucherTemplate({ issueType: "monthly_rank", targetRank: rank.key, now });
  const templatePayload = buildUserVoucherPayloadFromTemplate({
    template,
    userId,
    rewardType: "monthly",
    rewardYear,
    now,
    defaultExpireDays: fallbackExpireDays,
  });

  try {
    const created = await userVoucherModel.create(
      templatePayload || {
        userId,
        rewardType: "monthly",
        rewardYear,
        voucherCode: rank.monthlyVoucher.code,
        voucherName: `Voucher tháng - Giảm ${Number(rank.monthlyVoucher.discountValue || 0).toLocaleString("vi-VN")}đ`,
        campaignType: "monthly",
        voucherType: "FOOD",
        type: "product",
        discountType: "amount",
        discountValue: Number(rank.monthlyVoucher.discountValue || 0),
        startDate,
        endDate,
        applyFor: "all",
        minOrderValue: Number(rank.monthlyVoucher.minOrderValue || 0),
        maxUsage: 1,
        usagePerUser: 1,
        status: "active",
      }
    );
    return created?.toObject ? created.toObject() : created;
  } catch (error) {
    if (error?.code === 11000) {
      return userVoucherModel.findOne({ userId, rewardType: "monthly", rewardYear }).lean();
    }
    throw error;
  }
};

const getPaidOrderToday = async (userId, todayYmd) => {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const orders = await orderModel
    .find({ userId, $or: [{ payment: true }, { status: "paid" }], createdAt: { $gte: since } })
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(20)
    .select("paidAt createdAt")
    .lean();
  return orders.some((order) => {
    const at = order?.paidAt || order?.createdAt;
    if (!at) return false;
    const parts = getDatePartsInTimeZone(new Date(at), TIMEZONE);
    return buildKeyYMD(parts.year, parts.month, parts.day) === todayYmd;
  });
};

const getReviewToday = async (userId, todayYmd) => {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const reviews = await reviewModel
    .find({ userId, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("createdAt")
    .lean();
  return reviews.some((review) => {
    const at = review?.createdAt;
    if (!at) return false;
    const parts = getDatePartsInTimeZone(new Date(at), TIMEZONE);
    return buildKeyYMD(parts.year, parts.month, parts.day) === todayYmd;
  });
};

const getCheckinToday = async (userId, todayYmd) =>
  Boolean(await loyaltyTransactionModel.exists({ userId, reason: "checkin", ymd: todayYmd }));

// Lấy danh sách "shop đổi xu" từ voucher do admin tạo (issueType=coin_exchange).
// Nếu DB chưa có thì vẫn fallback sang cấu hình tĩnh `REDEEM_SHOP`.
const buildRedeemShopFromDb = async ({ now, rankKey, isNewUser }) => {
  const time = now instanceof Date ? now : new Date();
  const rank = String(rankKey || "").trim().toLowerCase();
  const newUser = Boolean(isNewUser);

  const templates = await voucherModel
    .find({
      status: "active",
      $or: [{ issueType: "coin_exchange" }, { campaignType: "loyalty" }],
      coinCost: { $gt: 0 },
      startDate: { $lte: time },
      endDate: { $gte: time },
    })
    .sort({ coinCost: 1, discountValue: -1, createdAt: -1 })
    .lean();

  const rows = (Array.isArray(templates) ? templates : []).filter((voucher) => {
    const targetUser = String(voucher?.targetUser || "all").trim().toLowerCase();
    if (targetUser === "all") return true;
    if (targetUser === "new") return newUser;
    if (targetUser === "rank") return String(voucher?.targetRank || "").trim().toLowerCase() === rank;
    return true;
  });

  return rows.map((voucher) => {
    const expireDaysRaw = Math.max(0, Number(voucher?.expireDays || 0));
    const expireDays = expireDaysRaw > 0 ? expireDaysRaw : 7; // coin exchange nếu admin không set expireDays thì default 7

    return {
      id: `voucher:${String(voucher?._id || "")}`,
      coinCost: Math.max(0, Number(voucher?.coinCost || 0)),
      // giữ shape giống FE đang dùng: item.voucher.*
      voucher: {
        id: String(voucher?._id || ""),
        code: String(voucher?.voucherCode || "").toUpperCase(),
        name: String(voucher?.voucherName || "").trim(),
        voucherType: String(voucher?.voucherType || "").toUpperCase(),
        type: String(voucher?.type || "").toLowerCase(),
        discountType: String(voucher?.discountType || "amount").toLowerCase(),
        discountValue: Number(voucher?.discountValue || 0),
        minOrderValue: Number(voucher?.minOrderValue || 0),
        expireDays,
        applyFor: String(voucher?.applyFor || "all"),
        categoryId: voucher?.categoryId || null,
        productIds: Array.isArray(voucher?.productIds) ? voucher.productIds : [],
        maxUsage: Number(voucher?.maxUsage || 1),
        usagePerUser: Number(voucher?.usagePerUser || 1),
      },
    };
  });
};

export const getCheckinCalendar = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const now = new Date();
    const parts = getDatePartsInTimeZone(now, TIMEZONE);
    const year = Number(parts.year);
    const month = Number(parts.month); // 1..12
    const today = Number(parts.day);

    const user = await userModel.findById(userId).select("totalSpend").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const { current } = getRankBySpend(Number(user.totalSpend || 0));
    const rewardCoinsPerDay = Math.max(0, Number(current.checkinCoins || 0));

    const daysInMonth = new Date(year, month, 0).getDate();
    const startYmd = buildKeyYMD(year, month, 1);
    const endYmd = buildKeyYMD(year, month, daysInMonth);

    const checkins = await loyaltyTransactionModel
      .find({ userId, reason: "checkin", ymd: { $gte: startYmd, $lte: endYmd } })
      .select("ymd")
      .lean();

    const checkedSet = new Set(
      checkins
        .map((item) => Number(item?.ymd || 0) % 100)
        .filter((day) => Number.isFinite(day) && day >= 1 && day <= daysInMonth)
    );

    const checkedDays = [...checkedSet].sort((a, b) => a - b);
    const checkedInToday = checkedSet.has(today);

    return res.json({
      success: true,
      data: {
        year,
        month,
        daysInMonth,
        today,
        checkedDays,
        checkedInToday,
        rewardCoinsPerDay,
        rankKey: current.key,
      },
    });
  } catch (error) {
    console.log("CHECKIN CALENDAR ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải lịch điểm danh" });
  }
};

export const getCheckinStatus = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const now = new Date();
    const parts = getDatePartsInTimeZone(now, TIMEZONE);
    const todayYmd = buildKeyYMD(parts.year, parts.month, parts.day);

    const user = await userModel.findById(userId).select("totalSpend").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const checkedToday = await getCheckinToday(userId, todayYmd);
    const { current } = getRankBySpend(Number(user.totalSpend || 0));
    const rewardCoins = Math.max(0, Number(current.checkinCoins || 0));

    return res.json({
      success: true,
      data: {
        checkedToday,
        rewardCoins,
        rankKey: current.key,
      },
    });
  } catch (error) {
    console.log("CHECKIN STATUS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải trạng thái điểm danh" });
  }
};

const buildSummary = async (userId) => {
  const now = new Date();
  const todayParts = getDatePartsInTimeZone(now, TIMEZONE);
  const todayYmd = buildKeyYMD(todayParts.year, todayParts.month, todayParts.day);

  const user = await userModel
    .findById(userId)
    .select("name email totalSpend coinBalance referralCode referralsCount referredBy")
    .lean();
  if (!user) return { ok: false, status: 404, message: "User not found." };

  let totalSpend = Math.max(0, Number(user.totalSpend || 0));
  if (!totalSpend) {
    const aggregate = await orderModel.aggregate([
      { $match: { userId: user._id, $or: [{ payment: true }, { status: "paid" }] } },
      { $group: { _id: "$userId", total: { $sum: "$amount" } } },
    ]);
    const computed = Math.max(0, Number(aggregate?.[0]?.total || 0));
    if (computed > 0) {
      totalSpend = computed;
      await userModel.updateOne({ _id: userId }, { $set: { totalSpend: computed } });
    }
  }

  const { current, next } = getRankBySpend(totalSpend);
  const referralCode = user.referralCode ? String(user.referralCode) : await ensureReferralCode(userId);

  const checkedInToday = await getCheckinToday(userId, todayYmd);

  const last7Ymds = Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(now, -(6 - index));
    const parts = getDatePartsInTimeZone(date, TIMEZONE);
    return buildKeyYMD(parts.year, parts.month, parts.day);
  });
  const checkins = await loyaltyTransactionModel
    .find({ userId, reason: "checkin", ymd: { $in: last7Ymds } })
    .select("ymd")
    .lean();
  const checkedYmdSet = new Set(checkins.map((item) => Number(item.ymd)));

  const claimed = await loyaltyMissionClaimModel.find({ userId, ymd: todayYmd }).select("missionKey").lean();
  const claimedSet = new Set(claimed.map((c) => String(c.missionKey)));

  const [hasOrderToday, hasReviewToday] = await Promise.all([
    getPaidOrderToday(userId, todayYmd),
    getReviewToday(userId, todayYmd),
  ]);

  const missions = MISSIONS.map((mission) => {
    const done = mission.key === "order_today" ? hasOrderToday : mission.key === "review_today" ? hasReviewToday : false;
    const alreadyClaimed = claimedSet.has(mission.key);
    return {
      key: mission.key,
      title: mission.title,
      description: mission.description,
      rewardCoins: mission.rewardCoins,
      done,
      claimed: alreadyClaimed,
      claimable: done && !alreadyClaimed,
    };
  });

  const monthlyVoucher = await ensureMonthlyVoucher({ userId, now, rank: current });

  const personalizedVoucher = await userVoucherModel
    .findOne({
      userId,
      voucherCode: { $in: ["MILKTEA20", "FAVORITE20"] },
      status: "active",
      endDate: { $gte: now },
    })
    .sort({ endDate: -1 })
    .lean();

  const recentTransactions = await loyaltyTransactionModel
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const nextMin = next?.minSpend ?? totalSpend;
  const segmentStart = current?.minSpend ?? 0;
  const segmentSize = next ? Math.max(1, nextMin - segmentStart) : 0;
  const progressRaw = next ? (totalSpend - segmentStart) / segmentSize : 1;
  const progress = Math.max(0, Math.min(1, Number.isFinite(progressRaw) ? progressRaw : 0));

  // Shop đổi xu: ưu tiên lấy từ DB (voucher issueType=coin_exchange), vẫn giữ các gói mặc định.
  const dbRedeemShop = await buildRedeemShopFromDb({ now, rankKey: current.key, isNewUser: totalSpend <= 0 });
  const redeemShop = [...dbRedeemShop, ...REDEEM_SHOP];

  return {
    ok: true,
    data: {
      user: {
        _id: String(user._id),
        name: String(user.name || ""),
        email: String(user.email || ""),
        coinBalance: Math.max(0, Number(user.coinBalance || 0)),
        totalSpend: Math.max(0, totalSpend),
        referralCode,
        referralsCount: Math.max(0, Number(user.referralsCount || 0)),
        hasReferred: Boolean(user.referredBy),
      },
      rank: {
        current: { key: current.key, label: current.label, color: current.color },
        next: next ? { key: next.key, label: next.label, minSpend: next.minSpend } : null,
        totalSpend: Math.max(0, totalSpend),
        progress,
        segment: next ? { currentMin: segmentStart, nextMin } : null,
      },
      benefits: {
        current: {
          label: current.label,
          benefits: current.benefits,
          checkinCoins: current.checkinCoins,
          coinMultiplier: current.coinMultiplier,
        },
        compare: RANKS.map((rank) => ({
          key: rank.key,
          label: rank.label,
          minSpend: rank.minSpend,
          color: rank.color,
          checkinCoins: rank.checkinCoins,
          monthlyVoucher: rank.monthlyVoucher,
          coinMultiplier: rank.coinMultiplier,
          benefits: rank.benefits,
        })),
      },
      checkin: {
        canCheckIn: !checkedInToday,
        todayReward: current.checkinCoins,
        last7Days: last7Ymds.map((ymd) => ({ ymd, checked: checkedYmdSet.has(ymd) })),
      },
      missions,
      redeemShop,
      monthlyVoucher,
      personalizedVoucher,
      transactions: recentTransactions,
    },
  };
};

export const getLoyaltySummary = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const summary = await buildSummary(userId);
    if (!summary.ok) return res.status(summary.status || 400).json({ success: false, message: summary.message || "Error" });
    return res.json({ success: true, data: summary.data });
  } catch (error) {
    console.log("LOYALTY SUMMARY ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải Loyalty" });
  }
};

export const checkinToday = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const now = new Date();
    const parts = getDatePartsInTimeZone(now, TIMEZONE);
    const todayYmd = buildKeyYMD(parts.year, parts.month, parts.day);

    const user = await userModel.findById(userId).select("totalSpend coinBalance").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    try {
      await loyaltyMissionClaimModel.create({ userId, missionKey: "checkin", ymd: todayYmd, claimedAt: now });
    } catch (error) {
      if (error?.code === 11000) {
        await userModel.updateOne({ _id: userId }, { $set: { lastCheckInDate: now } });
        const checkedUser = await userModel.findById(userId).select("coinBalance").lean();
        return res.json({
          success: true,
          alreadyCheckedIn: true,
          rewardCoins: 0,
          coinBalance: Number(checkedUser?.coinBalance || 0),
        });
      }
      throw error;
    }

    const { current } = getRankBySpend(Number(user.totalSpend || 0));
    const rewardCoins = Math.max(0, Number(current.checkinCoins || 0));

    const updated = await userModel.findOneAndUpdate(
      { _id: userId },
      { $inc: { coinBalance: rewardCoins }, $set: { lastCheckInDate: now } },
      { new: true }
    ).select("coinBalance");

    const coinBalance = Math.max(0, Number(updated?.coinBalance || 0));

    await loyaltyTransactionModel.create({
      userId,
      amount: rewardCoins,
      reason: "checkin",
      ymd: todayYmd,
      meta: { rank: current.key },
      balanceAfter: coinBalance,
    });

    return res.json({ success: true, alreadyCheckedIn: false, rewardCoins, coinBalance });
  } catch (error) {
    console.log("LOYALTY CHECKIN ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể check-in" });
  }
};

export const claimMission = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const key = String(req.body?.key || "").trim();
    const mission = MISSIONS.find((m) => m.key === key);
    if (!mission) return res.status(400).json({ success: false, message: "Nhiệm vụ không hợp lệ" });

    const now = new Date();
    const parts = getDatePartsInTimeZone(now, TIMEZONE);
    const todayYmd = buildKeyYMD(parts.year, parts.month, parts.day);

    const existed = await loyaltyMissionClaimModel.findOne({ userId, missionKey: key, ymd: todayYmd }).lean();
    if (existed) return res.json({ success: true, claimed: true, rewardCoins: 0 });

    const done = key === "order_today"
      ? await getPaidOrderToday(userId, todayYmd)
      : key === "review_today"
        ? await getReviewToday(userId, todayYmd)
        : false;

    if (!done) return res.status(400).json({ success: false, message: "Bạn chưa hoàn thành nhiệm vụ này" });

    const rewardCoins = Math.max(0, Number(mission.rewardCoins || 0));

    const updated = await userModel.findOneAndUpdate(
      { _id: userId },
      { $inc: { coinBalance: rewardCoins } },
      { new: true }
    ).select("coinBalance");
    const coinBalance = Math.max(0, Number(updated?.coinBalance || 0));

    await loyaltyMissionClaimModel.create({ userId, missionKey: key, ymd: todayYmd, claimedAt: now });
    await loyaltyTransactionModel.create({
      userId,
      amount: rewardCoins,
      reason: "mission",
      ymd: todayYmd,
      meta: { missionKey: key },
      balanceAfter: coinBalance,
    });

    return res.json({ success: true, claimed: true, rewardCoins, coinBalance });
  } catch (error) {
    console.log("LOYALTY CLAIM MISSION ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể nhận thưởng" });
  }
};

export const redeemVoucherByCoins = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const redeemId = String(req.body?.id || "").trim();

    const user = await userModel.findById(userId).select("coinBalance totalSpend").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    let totalSpend = Math.max(0, Number(user.totalSpend || 0));
    if (!totalSpend) {
      const aggregate = await orderModel.aggregate([
        { $match: { userId: user._id, $or: [{ payment: true }, { status: "paid" }] } },
        { $group: { _id: "$userId", total: { $sum: "$amount" } } },
      ]);
      const computed = Math.max(0, Number(aggregate?.[0]?.total || 0));
      if (computed > 0) {
        totalSpend = computed;
        await userModel.updateOne({ _id: userId }, { $set: { totalSpend: computed } });
      }
    }

    const { current } = getRankBySpend(totalSpend);
    const dbRedeemShop = await buildRedeemShopFromDb({ now: new Date(), rankKey: current.key, isNewUser: totalSpend <= 0 });
    const shop = [...dbRedeemShop, ...REDEEM_SHOP];

    const item = shop.find((x) => x.id === redeemId);
    if (!item) return res.status(400).json({ success: false, message: "Gói đổi xu không hợp lệ" });

    const coinCost = Math.max(0, Number(item.coinCost || 0));
    const currentCoins = Math.max(0, Number(user.coinBalance || 0));
    if (currentCoins < coinCost) return res.status(400).json({ success: false, message: "Bạn không đủ xu" });

    const now = new Date();
    const parts = getDatePartsInTimeZone(now, TIMEZONE);
    const todayYmd = buildKeyYMD(parts.year, parts.month, parts.day);

    const startDate = now;
    const expireDaysRaw = Math.max(0, Number(item.voucher?.expireDays || 0));
    const expireDays = expireDaysRaw > 0 ? expireDaysRaw : 7;
    const endDate = addDays(now, expireDays);
    const rewardYear = Date.now();

    const templateVoucherType = String(item.voucher?.voucherType || "FOOD").toUpperCase();
    const legacyType = templateVoucherType === "SHIPPING" ? "shipping" : String(item.voucher?.type || "product");
    const discountType = templateVoucherType === "SHIPPING" ? "amount" : String(item.voucher?.discountType || "amount");
    const applyFor = String(item.voucher?.applyFor || "all");
    const categoryId = applyFor === "category" ? item.voucher?.categoryId || null : null;
    const productIds = applyFor === "product" && Array.isArray(item.voucher?.productIds) ? item.voucher.productIds : [];

    const voucher = await userVoucherModel.create({
      userId,
      rewardType: "loyalty",
      rewardYear,
      voucherCode: String(item.voucher.code || "").toUpperCase(),
      voucherName:
        String(item.voucher?.name || "").trim() ||
        `Voucher đổi xu - Giảm ${Number(item.voucher.discountValue || 0).toLocaleString("vi-VN")}đ`,
      campaignType: "loyalty",
      voucherType: ["FOOD", "DRINK", "SHIPPING"].includes(templateVoucherType) ? templateVoucherType : "FOOD",
      type: legacyType === "shipping" ? "shipping" : "product",
      discountType: discountType === "percent" ? "percent" : "amount",
      discountValue: Number(item.voucher.discountValue || 0),
      startDate,
      endDate,
      applyFor: ["all", "category", "product"].includes(applyFor) ? applyFor : "all",
      categoryId,
      productIds,
      minOrderValue: Number(item.voucher.minOrderValue || 0),
      maxUsage: Math.max(1, Number(item.voucher?.maxUsage || 1)),
      usagePerUser: Math.max(1, Number(item.voucher?.usagePerUser || 1)),
      status: "active",
    });

    const updated = await userModel.findOneAndUpdate(
      { _id: userId, coinBalance: { $gte: coinCost } },
      { $inc: { coinBalance: -coinCost } },
      { new: true }
    ).select("coinBalance");

    if (!updated) {
      await userVoucherModel.deleteOne({ _id: voucher._id });
      return res.status(400).json({ success: false, message: "Bạn không đủ xu" });
    }

    const coinBalance = Math.max(0, Number(updated.coinBalance || 0));

    await loyaltyTransactionModel.create({
      userId,
      amount: -coinCost,
      reason: "redeem",
      ymd: todayYmd,
      meta: { redeemId, voucherId: String(voucher._id), voucherCode: voucher.voucherCode },
      balanceAfter: coinBalance,
    });

    return res.json({
      success: true,
      coinCost,
      coinBalance,
      voucher: voucher?.toObject ? voucher.toObject() : voucher,
    });
  } catch (error) {
    console.log("LOYALTY REDEEM ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể đổi xu" });
  }
};

export const listCoinTransactions = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const limit = Math.min(100, Math.max(10, Number(req.query?.limit || 50)));
    const items = await loyaltyTransactionModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, data: items });
  } catch (error) {
    console.log("LOYALTY TRANSACTIONS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải lịch sử xu" });
  }
};

export const applyReferralCode = async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ success: false, message: "Vui lòng nhập mã giới thiệu" });

    const user = await userModel.findById(userId).select("referralCode referredBy coinBalance").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (user.referredBy) return res.status(400).json({ success: false, message: "Bạn đã nhập mã giới thiệu rồi" });
    if (String(user.referralCode || "").toUpperCase() === code) {
      return res.status(400).json({ success: false, message: "Không thể nhập mã của chính bạn" });
    }

    const inviter = await userModel.findOne({ referralCode: code }).select("_id coinBalance referralsCount").lean();
    if (!inviter) return res.status(404).json({ success: false, message: "Mã giới thiệu không tồn tại" });

    const now = new Date();
    const parts = getDatePartsInTimeZone(now, TIMEZONE);
    const todayYmd = buildKeyYMD(parts.year, parts.month, parts.day);

    const rewardCoins = 50;

    const updatedUser = await userModel.findOneAndUpdate(
      { _id: userId, referredBy: null },
      { $set: { referredBy: inviter._id }, $inc: { coinBalance: rewardCoins } },
      { new: true }
    ).select("coinBalance referredBy");

    if (!updatedUser?.referredBy) {
      return res.status(400).json({ success: false, message: "Không thể áp dụng mã giới thiệu" });
    }

    const updatedInviter = await userModel.findByIdAndUpdate(
      inviter._id,
      { $inc: { coinBalance: rewardCoins, referralsCount: 1 } },
      { new: true }
    ).select("coinBalance referralsCount");

    await Promise.allSettled([
      loyaltyTransactionModel.create({
        userId,
        amount: rewardCoins,
        reason: "referral",
        ymd: todayYmd,
        meta: { inviterId: String(inviter._id), code },
        balanceAfter: Math.max(0, Number(updatedUser?.coinBalance || 0)),
      }),
      loyaltyTransactionModel.create({
        userId: String(inviter._id),
        amount: rewardCoins,
        reason: "referral",
        ymd: todayYmd,
        meta: { invitedUserId: userId, code },
        balanceAfter: Math.max(0, Number(updatedInviter?.coinBalance || 0)),
      }),
    ]);

    return res.json({
      success: true,
      rewardCoins,
      coinBalance: Math.max(0, Number(updatedUser?.coinBalance || 0)),
      inviter: { referralsCount: Math.max(0, Number(updatedInviter?.referralsCount || 0)) },
    });
  } catch (error) {
    console.log("LOYALTY APPLY REFERRAL ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể áp dụng mã giới thiệu" });
  }
};
