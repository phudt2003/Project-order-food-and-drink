import mongoose from "mongoose";
import voucherModel from "../models/voucherModel.js";
import userVoucherModel from "../models/userVoucherModel.js";
import foodModel from "../models/foodModel.js";
import cartModel from "../models/cartModel.js";
import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";

const VOUCHER_TYPES = {
  FOOD: "FOOD",
  DRINK: "DRINK",
  FOOD_DRINK: "FOOD_DRINK",
  SHIPPING: "SHIPPING",
};

const CAMPAIGN_TYPES = {
  MANUAL: "manual",
  WELCOME: "welcome",
  BIRTHDAY: "birthday",
  COMEBACK: "comeback",
  ORDER_VALUE: "order_value",
  DELIVERY: "delivery",
  HAPPY_HOUR: "happy_hour",
  LOYALTY: "loyalty",
  MONTHLY: "monthly",
};

const ISSUE_TYPES = {
  MANUAL: "manual",
  BIRTHDAY: "birthday",
  COMEBACK: "comeback",
  MONTHLY_RANK: "monthly_rank",
  COIN_EXCHANGE: "coin_exchange",
  FLASH_SALE: "flash_sale",
  NEW_USER: "new_user",
  PERSONALIZED: "personalized",
  AUTO_BAD_REVIEW: "auto_bad_review",
};

const TEMPLATE_ONLY_ISSUE_TYPES = new Set([
  ISSUE_TYPES.BIRTHDAY,
  ISSUE_TYPES.COMEBACK,
  ISSUE_TYPES.MONTHLY_RANK,
  ISSUE_TYPES.COIN_EXCHANGE,
  ISSUE_TYPES.NEW_USER,
  ISSUE_TYPES.PERSONALIZED,
  ISSUE_TYPES.AUTO_BAD_REVIEW,
]);

const TARGET_USERS = {
  ALL: "all",
  NEW: "new",
  RANK: "rank",
};

const TARGET_RANKS = {
  MEMBER: "member",
  SILVER: "silver",
  GOLD: "gold",
  DIAMOND: "diamond",
};

const LEGACY_TYPE_BY_VOUCHER_TYPE = {
  [VOUCHER_TYPES.FOOD]: "product",
  [VOUCHER_TYPES.DRINK]: "product",
  [VOUCHER_TYPES.FOOD_DRINK]: "product",
  [VOUCHER_TYPES.SHIPPING]: "shipping",
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeVoucherCode = (value) => String(value || "").trim().toUpperCase();

const toObjectIdOrNull = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""))
    ? new mongoose.Types.ObjectId(String(value))
    : null;

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const normalizeTimeHHMM = (value) => {
  const text = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return "";
  const [hRaw, mRaw] = text.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  if (h < 0 || h > 23 || m < 0 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const normalizeVoucherType = (body = {}) => {
  const rawVoucherType = String(body.voucherType || "").trim().toUpperCase();
  if (Object.values(VOUCHER_TYPES).includes(rawVoucherType)) return rawVoucherType;

  const legacyType = String(body.type || "").trim().toLowerCase();
  if (legacyType === "shipping") return VOUCHER_TYPES.SHIPPING;
  if (legacyType === "drink") return VOUCHER_TYPES.DRINK;
  return VOUCHER_TYPES.FOOD;
};

const normalizeCampaignType = (body = {}) => {
  const raw = String(body.campaignType || body.campaign || body.promoType || "").trim().toLowerCase();
  if (Object.values(CAMPAIGN_TYPES).includes(raw)) return raw;
  return CAMPAIGN_TYPES.MANUAL;
};

const normalizeIssueType = (body = {}) => {
  const raw = String(body.issueType || body.voucherIssueType || body.issue || "").trim().toLowerCase();
  if (Object.values(ISSUE_TYPES).includes(raw)) return raw;
  return ISSUE_TYPES.MANUAL;
};

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""))
    ? new mongoose.Types.ObjectId(String(value))
    : null;

const rewardYearFromVoucherId = (voucherId) => {
  const raw = String(voucherId || "");
  const hex = raw.slice(-8);
  const parsed = parseInt(hex, 16);
  if (Number.isFinite(parsed)) return parsed;
  return Date.now();
};

const buildPersonalUserVoucherPayload = (voucher, userId) => {
  const issueType = String(voucher?.issueType || "").trim().toLowerCase();
  const isPersonalized = issueType === ISSUE_TYPES.PERSONALIZED;
  let startDate = voucher?.startDate || null;
  let endDate = voucher?.endDate || null;

  if (isPersonalized && (!startDate || !endDate)) {
    const days = Math.max(0, toNumber(voucher?.expireDays, 0));
    if (days > 0) {
      const now = new Date();
      startDate = now;
      endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    }
  }

  return {
    userId,
    rewardType: "manual",
    rewardYear: rewardYearFromVoucherId(voucher?._id),
    voucherCode: String(voucher?.voucherCode || "").trim().toUpperCase(),
    voucherName: String(voucher?.voucherName || "").trim(),
    campaignType: String(voucher?.campaignType || CAMPAIGN_TYPES.MANUAL),
    voucherType: voucher?.voucherType || VOUCHER_TYPES.FOOD,
    type: voucher?.type || LEGACY_TYPE_BY_VOUCHER_TYPE[voucher?.voucherType] || "product",
    discountType: String(voucher?.discountType || "amount"),
    discountValue: Math.max(0, toNumber(voucher?.discountValue, 0)),
    startDate,
    endDate,
    startTime: String(voucher?.startTime || ""),
    endTime: String(voucher?.endTime || ""),
    applyFor: String(voucher?.applyFor || "all"),
    categoryId: voucher?.categoryId || null,
    productIds: Array.isArray(voucher?.productIds) ? voucher.productIds : [],
    minOrderValue: Math.max(0, toNumber(voucher?.minOrderValue, 0)),
    maxUsage: Math.max(0, toNumber(voucher?.maxUsage, 0)),
    usagePerUser: Math.max(1, toNumber(voucher?.usagePerUser, 1)),
    status: String(voucher?.status || "active"),
  };
};

const syncPersonalizedUserVouchers = async (voucher) => {
  if (!voucher || String(voucher.issueType || "").toLowerCase() !== ISSUE_TYPES.PERSONALIZED) return;

  const rewardYear = rewardYearFromVoucherId(voucher._id);
  const voucherCode = String(voucher.voucherCode || "").trim().toUpperCase();
  const assignedUsersRaw = Array.isArray(voucher.assignedUsers) ? voucher.assignedUsers : [];
  const assignedUsers = assignedUsersRaw
    .map((u) => toObjectId(u?._id || u))
    .filter(Boolean);

  if (assignedUsers.length === 0) {
    await userVoucherModel.deleteMany({ rewardType: "manual", rewardYear, voucherCode });
    return;
  }

  await userVoucherModel.deleteMany({
    rewardType: "manual",
    rewardYear,
    voucherCode,
    userId: { $nin: assignedUsers },
  });

  const ops = assignedUsers.map((userId) => ({
    updateOne: {
      filter: { userId, rewardType: "manual", rewardYear },
      update: { $set: buildPersonalUserVoucherPayload(voucher, userId) },
      upsert: true,
    },
  }));

  if (ops.length > 0) {
    await userVoucherModel.bulkWrite(ops, { ordered: false });
  }
};

const resolveCampaignType = ({ body = {}, issueType }) => {
  const rawCampaign = String(body.campaignType || body.campaign || body.promoType || "").trim();
  if (rawCampaign) return normalizeCampaignType(body);

  switch (issueType) {
    case ISSUE_TYPES.BIRTHDAY:
      return CAMPAIGN_TYPES.BIRTHDAY;
    case ISSUE_TYPES.COMEBACK:
      return CAMPAIGN_TYPES.COMEBACK;
    case ISSUE_TYPES.MONTHLY_RANK:
      return CAMPAIGN_TYPES.MONTHLY;
    case ISSUE_TYPES.COIN_EXCHANGE:
    case ISSUE_TYPES.PERSONALIZED:
      return CAMPAIGN_TYPES.LOYALTY;
    case ISSUE_TYPES.FLASH_SALE:
      return CAMPAIGN_TYPES.HAPPY_HOUR;
    case ISSUE_TYPES.NEW_USER:
      return CAMPAIGN_TYPES.WELCOME;
    default:
      return CAMPAIGN_TYPES.MANUAL;
  }
};

const normalizeTargetUser = (body = {}) => {
  const raw = String(body.targetUser || body.targetAudience || body.userTarget || "").trim().toLowerCase();
  if (Object.values(TARGET_USERS).includes(raw)) return raw;
  return TARGET_USERS.ALL;
};

const normalizeTargetRank = (body = {}) => {
  const raw = String(body.targetRank || body.rank || "").trim().toLowerCase();
  if (Object.values(TARGET_RANKS).includes(raw)) return raw;
  return null;
};

const normalizeTriggerRanks = (value) => {
  const allowed = new Set(Object.values(TARGET_RANKS));
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => allowed.has(item));
};

const toNullableNumber = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isTemplateOnlyVoucher = (voucher) => {
  const issueType = String(voucher?.issueType || "").trim().toLowerCase();
  if (!issueType) return false;
  return TEMPLATE_ONLY_ISSUE_TYPES.has(issueType);
};

const normalizeTriggerCondition = (body = {}) => {
  const raw = body.triggerCondition || body.trigger_condition || {};
  const ratingRaw = raw?.ratingLte ?? raw?.rating_lte ?? null;
  const minOrderRaw = raw?.minOrderValue ?? raw?.min_order_value ?? null;
  const userRanksRaw = raw?.userRanks ?? raw?.user_rank ?? raw?.userRank ?? raw?.user_rank;

  const ratingParsed = toNullableNumber(ratingRaw);
  const minOrderParsed = toNullableNumber(minOrderRaw);
  const ratingRounded = ratingParsed == null ? null : Math.round(ratingParsed);
  const ratingLte = ratingRounded != null && ratingRounded >= 1 && ratingRounded <= 5 ? ratingRounded : null;
  const minOrderValue = minOrderParsed == null ? null : Math.max(0, minOrderParsed);
  const userRanks = normalizeTriggerRanks(userRanksRaw);

  if (ratingLte == null && minOrderValue == null && userRanks.length === 0) return null;

  return {
    ratingLte,
    userRanks,
    minOrderValue,
  };
};

const normalizePayload = (body = {}) => {
  const voucherType = normalizeVoucherType(body);
  const type = LEGACY_TYPE_BY_VOUCHER_TYPE[voucherType] || "product";
  const applicableGroup =
    voucherType === VOUCHER_TYPES.SHIPPING
      ? "ship"
      : voucherType === VOUCHER_TYPES.DRINK
        ? "drinks"
        : voucherType === VOUCHER_TYPES.FOOD
          ? "foods"
          : null;
  const issueType = normalizeIssueType(body);
  const campaignType = resolveCampaignType({ body, issueType });
  const targetUserRaw = normalizeTargetUser(body);
  const targetUser = issueType === ISSUE_TYPES.PERSONALIZED ? TARGET_USERS.ALL : targetUserRaw;
  const targetRank = targetUser === TARGET_USERS.RANK ? normalizeTargetRank(body) : null;
  const coinCost = Math.max(0, Number(body.coinCost || 0));
  const expireDays = Math.max(0, Number(body.expireDays || 0));
  const comebackAfterDays = Math.max(0, Number(body.comebackAfterDays || 0));
  const rawApplyFor = ["all", "category", "product"].includes(body.applyFor) ? body.applyFor : "all";
  const applyFor = voucherType === VOUCHER_TYPES.FOOD_DRINK ? "all" : rawApplyFor;
  const discountType = body.discountType === "percent" ? "percent" : "amount";
  const discountValue = Number(body.discountValue || 0);
  const minOrderValue = Number(body.minOrderValue || 0);
  const maxUsage = Number(body.maxUsage || 0);
  const usagePerUser = Number(body.usagePerUser || 1);
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  const startTime = normalizeTimeHHMM(body.startTime || body.flashStartTime);
  const endTime = normalizeTimeHHMM(body.endTime || body.flashEndTime);
  const noDateIssueTypes = [
    ISSUE_TYPES.BIRTHDAY,
    ISSUE_TYPES.COMEBACK,
    ISSUE_TYPES.MONTHLY_RANK,
    ISSUE_TYPES.PERSONALIZED,
    ISSUE_TYPES.AUTO_BAD_REVIEW,
  ];
  const normalizedStartDate = noDateIssueTypes.includes(issueType) ? null : startDate;
  const normalizedEndDate = noDateIssueTypes.includes(issueType) ? null : endDate;
  const categoryId = toObjectIdOrNull(body.categoryId);
  const productIds = Array.isArray(body.productIds)
    ? body.productIds
        .map((id) => toObjectIdOrNull(id))
        .filter(Boolean)
    : [];
  const assignedUsers = Array.isArray(body.assignedUsers)
    ? body.assignedUsers
        .map((id) => toObjectIdOrNull(id))
        .filter(Boolean)
    : [];
  const triggerCondition = issueType === ISSUE_TYPES.AUTO_BAD_REVIEW ? normalizeTriggerCondition(body) : null;

  return {
    voucherCode: String(body.voucherCode || "").trim().toUpperCase(),
    voucherName: String(body.voucherName || "").trim(),
    issueType,
    targetUser,
    targetRank,
    coinCost,
    expireDays,
    comebackAfterDays,
    campaignType,
    voucherType,
    applicableGroup,
    type,
    discountType: voucherType === VOUCHER_TYPES.SHIPPING ? "amount" : discountType,
    discountValue,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    startTime: issueType === ISSUE_TYPES.FLASH_SALE ? startTime : "",
    endTime: issueType === ISSUE_TYPES.FLASH_SALE ? endTime : "",
    applyFor,
    categoryId: applyFor === "category" ? categoryId : null,
    productIds: applyFor === "product" ? productIds : [],
    assignedUsers: issueType === ISSUE_TYPES.PERSONALIZED ? assignedUsers : [],
    triggerCondition,
    minOrderValue,
    maxUsage,
    usagePerUser,
    status: body.status === "inactive" ? "inactive" : "active",
  };
};

const validateVoucherScope = async (payload) => {
  if (payload.voucherType !== VOUCHER_TYPES.DRINK) return "";
  if (payload.applyFor === "all") return "";

  const isFoodType = (value) => String(value || "").trim().toLowerCase() === "food";

  if (payload.applyFor === "product") {
    const products = await foodModel.find({ _id: { $in: payload.productIds } }, "type").lean();
    if (products.length !== payload.productIds.length) return "Some selected products are invalid.";
    const hasFoodProduct = products.some((item) => isFoodType(item?.type));
    if (hasFoodProduct) return "Drink voucher can only apply to drink products.";
    return "";
  }

  if (payload.applyFor === "category") {
    const categoryProducts = await foodModel.find({ categoryId: payload.categoryId }, "type").lean();
    if (categoryProducts.length === 0) return "Selected category has no products.";
    const hasDrinkProduct = categoryProducts.some((item) => !isFoodType(item?.type));
    if (!hasDrinkProduct) return "Drink voucher requires at least one drink product in category.";
  }

  return "";
};

// Validate chặt logic "voucherType" vs "applyFor" để admin không cấu hình sai.
const validateApplicableGroup = async (payload) => {
  const isFoodType = (value) => String(value || "").trim().toLowerCase() === "food";

  // Ship: chỉ áp dụng "all"
  if (payload.voucherType === VOUCHER_TYPES.SHIPPING) {
    if (payload.applyFor !== "all") return "Phạm vi áp dụng không phù hợp với loại voucher miễn/giảm phí ship.";
    return "";
  }

  // Drink/Food: không cho applyFor=all (tránh giảm sai nhóm)
  if ((payload.voucherType === VOUCHER_TYPES.DRINK || payload.voucherType === VOUCHER_TYPES.FOOD) && payload.applyFor === "all") {
    return "Phạm vi áp dụng không phù hợp với loại voucher giảm giá cụ thể";
  }

  // Food+Drink: không cần phạm vi áp dụng -> bắt buộc all
  if (payload.voucherType === VOUCHER_TYPES.FOOD_DRINK && payload.applyFor !== "all") {
    return "Voucher giảm đồ ăn và đồ uống không cần phạm vi áp dụng (phải là 'Tất cả').";
  }

  // Nếu không chọn theo category/product thì không cần validate thêm
  if (payload.applyFor !== "category" && payload.applyFor !== "product") return "";

  const expectDrink = payload.voucherType === VOUCHER_TYPES.DRINK;

  if (payload.applyFor === "category") {
    const products = await foodModel.find({ categoryId: payload.categoryId }, "type").lean();
    if (products.length === 0) return "Selected category has no products.";

    const hasFood = products.some((p) => isFoodType(p?.type));
    const hasDrink = products.some((p) => !isFoodType(p?.type));

    if (expectDrink) {
      if (!hasDrink || hasFood) return "Danh mục không thuộc nhóm đồ uống.";
    } else {
      if (!hasFood || hasDrink) return "Danh mục không thuộc nhóm món ăn.";
    }
  }

  if (payload.applyFor === "product") {
    const products = await foodModel.find({ _id: { $in: payload.productIds } }, "type").lean();
    if (products.length !== payload.productIds.length) return "Some selected products are invalid.";

    const invalid = expectDrink
      ? products.some((p) => isFoodType(p?.type))
      : products.some((p) => !isFoodType(p?.type));

    if (invalid) return expectDrink ? "Sản phẩm không thuộc nhóm đồ uống." : "Sản phẩm không thuộc nhóm món ăn.";
  }

  return "";
};

const validatePayload = async (payload, { isUpdate = false } = {}) => {
  if (!payload.voucherCode && !isUpdate) return "Voucher code is required.";
  if (!payload.voucherName) return "Voucher name is required.";
  const requiresDate = ![
    ISSUE_TYPES.COIN_EXCHANGE,
    ISSUE_TYPES.NEW_USER,
    ISSUE_TYPES.BIRTHDAY,
    ISSUE_TYPES.COMEBACK,
    ISSUE_TYPES.MONTHLY_RANK,
    ISSUE_TYPES.PERSONALIZED,
    ISSUE_TYPES.AUTO_BAD_REVIEW,
  ].includes(payload.issueType);
  if (requiresDate && (!payload.startDate || !payload.endDate)) return "Start date and end date are required.";
  if (payload.startDate && payload.endDate && payload.startDate >= payload.endDate) return "Start date must be before end date.";
  if (!Number.isFinite(payload.discountValue) || payload.discountValue < 0) return "Invalid discount value.";
  if (payload.voucherType !== VOUCHER_TYPES.SHIPPING && payload.discountType === "percent" && payload.discountValue > 100) {
    return "Percent discount cannot exceed 100.";
  }
  if (payload.applyFor === "category" && !payload.categoryId) return "Category is required.";
  if (payload.applyFor === "product" && payload.productIds.length === 0) return "At least one product is required.";
  if (!Number.isFinite(payload.minOrderValue) || payload.minOrderValue < 0) return "Invalid minimum order value.";
  if (!Number.isFinite(payload.maxUsage) || payload.maxUsage < 0) return "Invalid maximum usage.";
  if (!Number.isFinite(payload.usagePerUser) || payload.usagePerUser < 1) return "Invalid usage per user.";

  if (payload.targetUser === TARGET_USERS.RANK && !payload.targetRank) {
    return "Target rank is required.";
  }

  if (payload.issueType === ISSUE_TYPES.PERSONALIZED && (!payload.assignedUsers || payload.assignedUsers.length === 0)) {
    return "Vui lòng chọn ít nhất 1 khách hàng.";
  }

  if (!Number.isFinite(payload.coinCost) || payload.coinCost < 0) return "Coin cost is invalid.";
  if (payload.issueType === ISSUE_TYPES.COIN_EXCHANGE && payload.coinCost <= 0) {
    return "Coin exchange voucher requires coin cost greater than 0.";
  }

  if (!Number.isFinite(payload.expireDays) || payload.expireDays < 0) return "Expire days is invalid.";
  if (!Number.isFinite(payload.comebackAfterDays) || payload.comebackAfterDays < 0) return "Comeback days is invalid.";
  if (payload.issueType === ISSUE_TYPES.COMEBACK && payload.comebackAfterDays <= 0) {
    return "Comeback voucher requires days without orders.";
  }
  if (
    [
      ISSUE_TYPES.BIRTHDAY,
      ISSUE_TYPES.COMEBACK,
      ISSUE_TYPES.MONTHLY_RANK,
      ISSUE_TYPES.PERSONALIZED,
      ISSUE_TYPES.AUTO_BAD_REVIEW,
    ].includes(payload.issueType) &&
    payload.expireDays <= 0
  ) {
    return "Auto voucher requires expire days.";
  }

  if (payload.issueType === ISSUE_TYPES.AUTO_BAD_REVIEW) {
    const condition = payload.triggerCondition || {};
    if (condition.ratingLte != null && (condition.ratingLte < 1 || condition.ratingLte > 5)) {
      return "Rating condition must be between 1 and 5.";
    }
    if (condition.minOrderValue != null && condition.minOrderValue < 0) {
      return "Minimum order value condition is invalid.";
    }
    if (Array.isArray(condition.userRanks) && condition.userRanks.length > 0) {
      const allowed = new Set(Object.values(TARGET_RANKS));
      const invalid = condition.userRanks.some((rank) => !allowed.has(String(rank || "").trim().toLowerCase()));
      if (invalid) return "User rank condition is invalid.";
    }
  }

  const groupError = await validateApplicableGroup(payload);
  if (groupError) return groupError;

  const scopeError = await validateVoucherScope(payload);
  if (scopeError) return scopeError;

  return "";
};

const withVoucherType = (voucher) => {
  const source = voucher?.toObject ? voucher.toObject() : voucher;
  const voucherType = source?.voucherType || normalizeVoucherType(source);
  const rawIssueType = String(source?.issueType || "").trim();
  const normalizedCampaign = String(source?.campaignType || "").trim().toLowerCase();
  const inferredIssueType = (() => {
    switch (normalizedCampaign) {
      case CAMPAIGN_TYPES.BIRTHDAY:
        return ISSUE_TYPES.BIRTHDAY;
      case CAMPAIGN_TYPES.COMEBACK:
        return ISSUE_TYPES.COMEBACK;
      case CAMPAIGN_TYPES.MONTHLY:
        return ISSUE_TYPES.MONTHLY_RANK;
      case CAMPAIGN_TYPES.HAPPY_HOUR:
        return ISSUE_TYPES.FLASH_SALE;
      case CAMPAIGN_TYPES.WELCOME:
        return ISSUE_TYPES.NEW_USER;
      default:
        return ISSUE_TYPES.MANUAL;
    }
  })();
  const issueType = rawIssueType ? normalizeIssueType(source) : inferredIssueType;
  const targetUser = normalizeTargetUser(source);
  const targetRank = targetUser === TARGET_USERS.RANK ? normalizeTargetRank(source) : null;
  return {
    ...source,
    voucherType,
    issueType,
    targetUser,
    targetRank,
    coinCost: Math.max(0, toNumber(source?.coinCost, 0)),
    expireDays: Math.max(0, toNumber(source?.expireDays, 0)),
    comebackAfterDays: Math.max(0, toNumber(source?.comebackAfterDays, 0)),
    campaignType: String(source?.campaignType || "").trim().toLowerCase() || CAMPAIGN_TYPES.MANUAL,
    type: LEGACY_TYPE_BY_VOUCHER_TYPE[voucherType] || source?.type || "product",
  };
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatVND = (value) => {
  const amount = Math.round(Math.max(0, toNumber(value, 0)));
  try {
    return `${amount.toLocaleString("vi-VN")}đ`;
  } catch {
    return `${amount}đ`;
  }
};

const parseTimeToMinutes = (value) => {
  const text = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return null;
  const [hRaw, mRaw] = text.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

const getTimeWindowMinutes = ({ voucher, campaignType, startDate, endDate }) => {
  const explicitStart = parseTimeToMinutes(voucher?.startTime);
  const explicitEnd = parseTimeToMinutes(voucher?.endTime);
  const hasExplicitTimeWindow = explicitStart != null && explicitEnd != null;

  const hasLegacyTimeWindow =
    !hasExplicitTimeWindow &&
    campaignType === CAMPAIGN_TYPES.HAPPY_HOUR &&
    startDate &&
    endDate &&
    Number.isFinite(startDate.getTime()) &&
    Number.isFinite(endDate.getTime()) &&
    (startDate.getHours() !== 0 ||
      startDate.getMinutes() !== 0 ||
      endDate.getHours() !== 23 ||
      endDate.getMinutes() !== 59);

  const startMinutes = hasExplicitTimeWindow
    ? explicitStart
    : hasLegacyTimeWindow
      ? startDate.getHours() * 60 + startDate.getMinutes()
      : null;
  const endMinutes = hasExplicitTimeWindow
    ? explicitEnd
    : hasLegacyTimeWindow
      ? endDate.getHours() * 60 + endDate.getMinutes()
      : null;

  const hasTimeWindow = startMinutes != null && endMinutes != null;
  return { hasTimeWindow, startMinutes, endMinutes };
};

const hasExplicitTimeWindow = (voucher) =>
  parseTimeToMinutes(voucher?.startTime) != null && parseTimeToMinutes(voucher?.endTime) != null;

const isWithinTimeWindow = ({ now, startMinutes, endMinutes }) => {
  if (startMinutes == null || endMinutes == null) return true;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return startMinutes <= endMinutes
    ? nowMinutes >= startMinutes && nowMinutes <= endMinutes
    : nowMinutes >= startMinutes || nowMinutes <= endMinutes;
};

const isFirstOrderOnlyVoucher = (voucher) => {
  const targetUser = String(voucher?.targetUser || "").trim().toLowerCase();
  const issueType = String(voucher?.issueType || "").trim().toLowerCase();
  const rewardType = String(voucher?.rewardType || "").trim().toLowerCase(); // userVoucherModel có rewardType
  const campaignType = String(voucher?.campaignType || "").trim().toLowerCase();
  return (
    targetUser === TARGET_USERS.NEW ||
    issueType === ISSUE_TYPES.NEW_USER ||
    rewardType === CAMPAIGN_TYPES.WELCOME ||
    campaignType === CAMPAIGN_TYPES.WELCOME
  );
};

const normalizeCartItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: String(item?.productId || item?._id || ""),
      lineTotal: toNumber(item?.lineTotal ?? item?.amount ?? item?.total ?? item?.price, 0),
      quantity: Math.max(1, toNumber(item?.quantity, 1)),
      productType: String(item?.productType || item?.type || "").toUpperCase(),
      categoryId: String(item?.categoryId || ""),
      categoryName: String(item?.categoryName || item?.category || "").trim(),
    }))
    .filter((item) => item.productId && item.lineTotal > 0);

const getRequestNumber = (req, key, fallback = 0) => {
  const bodyValue = req.body?.[key];
  const queryValue = req.query?.[key];
  if (bodyValue !== undefined) return toNumber(bodyValue, fallback);
  if (queryValue !== undefined) return toNumber(queryValue, fallback);
  return fallback;
};

const getCartItemsFromRequest = async (req) => {
  const bodyItems = normalizeCartItems(req.body?.cartItems);
  if (bodyItems.length > 0) return bodyItems;

  if (!req.userId) return [];
  const cart = await cartModel.findOne({ userId: req.userId }).populate("items.productId", "_id price type categoryId category").lean();
  const items = Array.isArray(cart?.items) ? cart.items : [];

  return items
    .map((item) => {
      const product = item?.productId;
      const productId = String(product?._id || item?.productId || "");
      const quantity = Math.max(1, toNumber(item?.quantity, 1));
      const lineTotal = toNumber(item?.price, 0) > 0
        ? toNumber(item?.price, 0) * quantity
        : toNumber(product?.price, 0) * quantity;

      return {
        productId,
        lineTotal,
        quantity,
        productType: String(product?.type || ""),
        categoryId: String(product?.categoryId || ""),
        categoryName: String(product?.category || "").trim(),
      };
    })
    .filter((item) => item.productId && item.lineTotal > 0);
};

const enrichCartItems = async (cartItems) => {
  if (!cartItems.length) return [];
  const ids = [...new Set(cartItems.map((item) => item.productId))];
  const products = await foodModel.find({ _id: { $in: ids } }, "_id type categoryId category").lean();
  const productMap = new Map(products.map((item) => [String(item._id), item]));

  return cartItems.map((item) => {
    const product = productMap.get(item.productId);
    const raw = String(item.productType || String(product?.type || "")).trim().toLowerCase();
    const normalizedProductType = raw === "food" ? "FOOD" : "DRINK";
    return {
      ...item,
      // Chuẩn hóa về DRINK/FOOD để logic voucherType không bị sai khi product.type = milk_tea/coffee/tea...
      productType: normalizedProductType,
      categoryId: item.categoryId || String(product?.categoryId || ""),
      categoryName: item.categoryName || String(product?.category || "").trim(),
    };
  });
};

const getUserUsageCount = (voucher, userId) => {
  if (!userId) return 0;
  const item = Array.isArray(voucher?.usedByUsers)
    ? voucher.usedByUsers.find((entry) => String(entry?.userId) === String(userId))
    : null;
  return toNumber(item?.count, 0);
};

const calculateEligibleAmount = (voucher, cartItems, shippingFee) => {
  const normalizeName = (value) => String(value || "").trim().toLowerCase();
  const voucherCategoryId = String(voucher?.categoryId?._id || voucher?.categoryId || "");
  const voucherCategoryName = normalizeName(voucher?.categoryId?.name || voucher?.categoryName || "");
  const campaignType = String(voucher?.campaignType || "").trim().toLowerCase();

  if (voucher.voucherType === VOUCHER_TYPES.SHIPPING) {
    const safeShippingFee = Math.max(0, toNumber(shippingFee, 0));
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
    .includes(campaignType) || voucher.voucherType === VOUCHER_TYPES.FOOD_DRINK;

  const targetIsDrink = voucher.voucherType === VOUCHER_TYPES.DRINK;
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

  return filteredByApplyFor.reduce((sum, item) => sum + toNumber(item.lineTotal, 0), 0);
};

const evaluateVoucher = async ({ voucher, orderAmount, shippingFee, cartItems, userId }) => {
  const now = new Date();
  if (!voucher || voucher.status !== "active") return { valid: false, message: "Voucher không hợp lệ" };
  if (isTemplateOnlyVoucher(voucher)) {
    return { valid: false, message: "Voucher này chỉ được phát tự động." };
  }

  const campaignType = String(voucher?.campaignType || "").trim().toLowerCase();
  const startDate = voucher.startDate ? new Date(voucher.startDate) : null;
  const endDate = voucher.endDate ? new Date(voucher.endDate) : null;
  const normalizeToDayBounds = campaignType !== CAMPAIGN_TYPES.HAPPY_HOUR || hasExplicitTimeWindow(voucher);
  if (startDate && normalizeToDayBounds) startDate.setHours(0, 0, 0, 0);
  if (endDate && normalizeToDayBounds) endDate.setHours(23, 59, 59, 999);

  if (startDate && now < startDate) return { valid: false, message: "Voucher chưa đến thời gian áp dụng" };
  if (endDate && now > endDate) return { valid: false, message: "Voucher đã hết hạn" };

  // Khung giờ áp dụng (Flash sale / hoặc voucher có startTime-endTime)
  const timeWindow = getTimeWindowMinutes({ voucher, campaignType, startDate, endDate });
  if (timeWindow.hasTimeWindow && !isWithinTimeWindow({ now, startMinutes: timeWindow.startMinutes, endMinutes: timeWindow.endMinutes })) {
    return { valid: false, message: "Voucher chưa đến thời gian sử dụng" };
  }

  // Voucher cá nhân hóa (global voucher nhưng giới hạn user)
  const assignedUsers = Array.isArray(voucher?.assignedUsers) ? voucher.assignedUsers : [];
  if (assignedUsers.length > 0) {
    if (!userId) return { valid: false, message: "Voucher không hợp lệ" };
    const ok = assignedUsers.some((id) => String(id?._id || id) === String(userId));
    if (!ok) return { valid: false, message: "Voucher không dành cho tài khoản này" };
  }

  // Đơn đầu tiên (welcome/new_user/targetUser=new)
  if (isFirstOrderOnlyVoucher(voucher)) {
    if (!userId) return { valid: false, message: "Voucher không hợp lệ" };
    const totalOrders = await orderModel.countDocuments({ userId, status: { $ne: "cancelled" } });
    if (totalOrders > 0) {
      return { valid: false, message: "Chỉ áp dụng cho đơn đầu tiên" };
    }
  }

  const safeOrderAmount = Math.max(0, toNumber(orderAmount, 0));
  const safeShippingFee = Math.max(0, toNumber(shippingFee, 0));

  const minOrderValue = Math.max(0, toNumber(voucher.minOrderValue, 0));
  if (minOrderValue > 0 && safeOrderAmount < minOrderValue) {
    return { valid: false, message: `Đơn chưa đủ ${formatVND(minOrderValue)}` };
  }

  const maxUsage = toNumber(voucher.maxUsage, 0);
  if (maxUsage > 0 && toNumber(voucher.usedCount, 0) >= maxUsage) {
    return { valid: false, message: "Voucher đã hết lượt sử dụng" };
  }

  const perUserLimit = toNumber(voucher.usagePerUser, 1);
  if (perUserLimit > 0 && getUserUsageCount(voucher, userId) >= perUserLimit) {
    return { valid: false, message: "Bạn đã dùng hết lượt voucher này" };
  }

  const normalizedCartItems = await enrichCartItems(normalizeCartItems(cartItems));
  const eligibleAmount = calculateEligibleAmount(voucher, normalizedCartItems, safeShippingFee);

  if (eligibleAmount <= 0) {
    return { valid: false, message: "Voucher không đúng loại sản phẩm" };
  }

  const discountValue = Math.max(0, toNumber(voucher.discountValue, 0));
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
    type: voucher.voucherType || VOUCHER_TYPES.FOOD,
    voucher: withVoucherType(voucher),
    eligibleAmount: Math.round(eligibleAmount),
  };
};

const evaluateVoucherForClaim = async ({ voucher, userId }) => {
  const now = new Date();
  if (!voucher || voucher.status !== "active") return { valid: false, message: "Voucher không hợp lệ" };
  if (isTemplateOnlyVoucher(voucher)) {
    return { valid: false, message: "Voucher này chỉ được phát tự động." };
  }

  const campaignType = String(voucher?.campaignType || "").trim().toLowerCase();
  const startDate = voucher.startDate ? new Date(voucher.startDate) : null;
  const endDate = voucher.endDate ? new Date(voucher.endDate) : null;
  const normalizeToDayBounds = campaignType !== CAMPAIGN_TYPES.HAPPY_HOUR || hasExplicitTimeWindow(voucher);
  if (startDate && normalizeToDayBounds) startDate.setHours(0, 0, 0, 0);
  if (endDate && normalizeToDayBounds) endDate.setHours(23, 59, 59, 999);

  if (startDate && now < startDate) return { valid: false, message: "Voucher chưa đến thời gian áp dụng" };
  if (endDate && now > endDate) return { valid: false, message: "Voucher đã hết hạn" };

  const timeWindow = getTimeWindowMinutes({ voucher, campaignType, startDate, endDate });
  if (timeWindow.hasTimeWindow && !isWithinTimeWindow({ now, startMinutes: timeWindow.startMinutes, endMinutes: timeWindow.endMinutes })) {
    return { valid: false, message: "Voucher chưa đến thời gian sử dụng" };
  }

  const assignedUsers = Array.isArray(voucher?.assignedUsers) ? voucher.assignedUsers : [];
  if (assignedUsers.length > 0) {
    if (!userId) return { valid: false, message: "Voucher không hợp lệ" };
    const ok = assignedUsers.some((id) => String(id?._id || id) === String(userId));
    if (!ok) return { valid: false, message: "Voucher không dành cho tài khoản này" };
  }

  if (isFirstOrderOnlyVoucher(voucher)) {
    if (!userId) return { valid: false, message: "Voucher không hợp lệ" };
    const totalOrders = await orderModel.countDocuments({ userId, status: { $ne: "cancelled" } });
    if (totalOrders > 0) return { valid: false, message: "Chỉ áp dụng cho đơn đầu tiên" };
  }

  const maxUsage = toNumber(voucher.maxUsage, 0);
  if (maxUsage > 0 && toNumber(voucher.usedCount, 0) >= maxUsage) {
    return { valid: false, message: "Voucher đã hết lượt sử dụng" };
  }

  const perUserLimit = toNumber(voucher.usagePerUser, 1);
  if (perUserLimit > 0 && getUserUsageCount(voucher, userId) >= perUserLimit) {
    return { valid: false, message: "Bạn đã dùng hết lượt voucher này" };
  }

  return { valid: true, message: "" };
};

const findVoucherByCode = async ({ code, userId, now = new Date() }) => {
  const safeCode = normalizeVoucherCode(code);
  if (!safeCode) return null;

  const personalVoucher = userId
    ? await userVoucherModel
        .findOne({
          userId,
          voucherCode: safeCode,
          status: "active",
          endDate: { $gte: now },
        })
        .sort({ endDate: -1 })
        .lean()
    : null;

  if (personalVoucher) return personalVoucher;
  return voucherModel.findOne({ voucherCode: safeCode }).populate("categoryId", "name").lean();
};

const validateVoucher = async (req, res) => {
  try {
    const code = String(req.body?.code || req.body?.voucherCode || "").trim().toUpperCase();
    if (!code) {
      return res.json({ valid: false, success: false, message: "Voucher không hợp lệ" });
    }

    const now = new Date();

    const personalVoucher = req.userId
      ? await userVoucherModel
          .findOne({
            userId: req.userId,
            voucherCode: code,
            status: "active",
            endDate: { $gte: now },
          })
          .sort({ endDate: -1 })
          .lean()
      : null;

    const voucher = personalVoucher
      ? personalVoucher
      : await voucherModel.findOne({ voucherCode: code }).populate("categoryId", "name").lean();
    if (!voucher) {
      return res.json({ valid: false, success: false, message: "Voucher không hợp lệ" });
    }

    const evaluation = await evaluateVoucher({
      voucher,
      userId: req.userId,
      orderAmount: req.body?.orderAmount,
      shippingFee: req.body?.shippingFee,
      cartItems: req.body?.cartItems,
    });

    if (!evaluation.valid) {
      return res.json({
        valid: false,
        success: false,
        message: evaluation.message || "Voucher không hợp lệ",
      });
    }

    return res.json({
      valid: true,
      success: true,
      discount: evaluation.discount,
      type: evaluation.type,
      voucher: {
        _id: evaluation.voucher._id,
        voucherCode: evaluation.voucher.voucherCode,
        voucherName: evaluation.voucher.voucherName,
        voucherType: evaluation.voucher.voucherType,
        discountType: evaluation.voucher.discountType,
        discountValue: evaluation.voucher.discountValue,
      },
      eligibleAmount: evaluation.eligibleAmount,
    });
  } catch (error) {
    console.log("VALIDATE VOUCHER ERROR:", error.message);
    return res.status(500).json({ valid: false, success: false, message: "Voucher không hợp lệ" });
  }
};

// POST /api/vouchers/claim
// Dùng khi giỏ trống: lưu voucher "pending" cho user để auto-apply khi đủ điều kiện sau.
const claimVoucher = async (req, res) => {
  try {
    const voucherId = String(req.body?.voucherId || "").trim();
    const code = String(req.body?.code || req.body?.voucherCode || "").trim().toUpperCase();
    if (!voucherId && !code) return res.status(400).json({ success: false, message: "Voucher không hợp lệ" });
    if (!req.userId) return res.status(401).json({ success: false, message: "Login First" });

    const now = new Date();

    const voucher = voucherId
      ? (await userVoucherModel.findOne({ _id: voucherId, userId: req.userId }).lean()) ||
        (await voucherModel.findById(voucherId).populate("categoryId", "name").lean())
      : await findVoucherByCode({ code, userId: req.userId, now });
    if (!voucher) return res.status(404).json({ success: false, message: "Voucher không tồn tại" });

    const claimCheck = await evaluateVoucherForClaim({ voucher, userId: req.userId });
    if (!claimCheck.valid) {
      return res.status(400).json({ success: false, message: claimCheck.message || "Không thể lưu voucher này" });
    }

    const voucherCode = normalizeVoucherCode(voucher?.voucherCode || code);
    if (!voucherCode) return res.status(400).json({ success: false, message: "Voucher không hợp lệ" });

    const pendingVoucherId = new mongoose.Types.ObjectId().toString();
    const isPersonalVoucher = Boolean(voucher?.userId); // userVoucherModel có userId
    await userModel.updateOne(
      { _id: req.userId },
      {
        $set: {
          pendingVoucher: {
            id: pendingVoucherId,
            voucherCode,
            voucherId: isPersonalVoucher ? null : voucher?._id || null,
            claimedAt: new Date(),
          },
        },
      }
    );

    return res.json({
      success: true,
      data: {
        pendingVoucherId,
        voucherCode,
        minOrderValue: Math.max(0, toNumber(voucher?.minOrderValue, 0)),
        discountType: String(voucher?.discountType || "amount"),
        discountValue: Math.max(0, toNumber(voucher?.discountValue, 0)),
        voucherType: String(voucher?.voucherType || VOUCHER_TYPES.FOOD),
      },
      message: "Voucher đã được lưu sẵn.",
    });
  } catch (error) {
    console.log("CLAIM VOUCHER ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể lưu voucher" });
  }
};

// POST /api/vouchers/apply
// Dùng khi giỏ đã có món: validate đầy đủ điều kiện và trả về discount để frontend cập nhật UI.
const applyVoucher = async (req, res) => {
  try {
    const code = String(req.body?.code || req.body?.voucherCode || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ success: false, message: "Voucher không hợp lệ" });
    if (!req.userId) return res.status(401).json({ success: false, message: "Login First" });

    const now = new Date();
    const voucher = await findVoucherByCode({ code, userId: req.userId, now });
    if (!voucher) return res.status(404).json({ success: false, message: "Voucher không tồn tại" });

    const cartItems = await getCartItemsFromRequest(req);
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Giỏ hàng đang trống, hãy chọn món để áp dụng voucher.",
      });
    }

    const derivedOrderAmount = cartItems.reduce((sum, item) => sum + toNumber(item?.lineTotal, 0), 0);
    const orderAmount = getRequestNumber(req, "orderAmount", derivedOrderAmount);
    const shippingFee = getRequestNumber(req, "shippingFee", 0);

    const evaluation = await evaluateVoucher({
      voucher,
      userId: req.userId,
      orderAmount,
      shippingFee,
      cartItems,
    });

    if (!evaluation.valid) {
      return res.status(400).json({ success: false, message: evaluation.message || "Voucher không hợp lệ" });
    }

    // Nếu trước đó user có pendingVoucher trùng code -> clear (đã apply thành công)
    await userModel.updateOne(
      { _id: req.userId, "pendingVoucher.voucherCode": normalizeVoucherCode(code) },
      { $set: { pendingVoucher: null } }
    );

    return res.json({
      success: true,
      data: {
        discount: evaluation.discount,
        eligibleAmount: evaluation.eligibleAmount,
        type: evaluation.type,
        voucher: {
          _id: evaluation.voucher?._id,
          voucherCode: evaluation.voucher?.voucherCode,
          voucherName: evaluation.voucher?.voucherName,
          voucherType: evaluation.voucher?.voucherType,
          discountType: evaluation.voucher?.discountType,
          discountValue: evaluation.voucher?.discountValue,
          minOrderValue: Math.max(0, toNumber(evaluation.voucher?.minOrderValue, 0)),
        },
      },
      message: `Đã áp dụng voucher. Giảm ${formatVND(evaluation.discount)}.`,
    });
  } catch (error) {
    console.log("APPLY VOUCHER ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể áp dụng voucher" });
  }
};

const getAvailableVouchers = async (req, res) => {
  try {
    const cartItems = await getCartItemsFromRequest(req);
    const derivedOrderAmount = cartItems.reduce((sum, item) => sum + toNumber(item?.lineTotal, 0), 0);
    const orderAmount = getRequestNumber(req, "orderAmount", derivedOrderAmount);
    const shippingFee = getRequestNumber(req, "shippingFee", 0);

    const now = new Date();
    const safeOrderAmount = Math.max(0, toNumber(orderAmount, 0));

    const personalVouchers = req.userId
      ? await userVoucherModel
          .find({ userId: req.userId, status: "active", endDate: { $gte: now } })
          .sort({ createdAt: -1 })
          .lean()
      : [];

    const vouchers = await voucherModel
      .find({
        status: "active",
        issueType: { $nin: Array.from(TEMPLATE_ONLY_ISSUE_TYPES) },
      })
      .populate("categoryId", "name")
      .sort({ createdAt: -1 })
      .lean();

    const combinedRaw = [
      ...personalVouchers.map((voucher) => ({ ...voucher, __source: "personal" })),
      ...vouchers.map((voucher) => ({ ...voucher, __source: "global" })),
    ];

    // Deduplicate by voucherCode (ưu tiên voucher cá nhân đã claim).
    const combinedMap = new Map();
    combinedRaw.forEach((voucher) => {
      const code = normalizeVoucherCode(voucher?.voucherCode);
      if (!code) {
        combinedMap.set(`${voucher?._id || Math.random()}`, voucher);
        return;
      }
      const existed = combinedMap.get(code);
      if (!existed) {
        combinedMap.set(code, voucher);
        return;
      }
      if (existed.__source === "personal") {
        if (voucher.__source === "personal") {
          const existedEnd = existed?.endDate ? new Date(existed.endDate) : null;
          const nextEnd = voucher?.endDate ? new Date(voucher.endDate) : null;
          if (nextEnd && (!existedEnd || nextEnd > existedEnd)) {
            combinedMap.set(code, voucher);
          }
        }
        return;
      }
      if (voucher.__source === "personal") {
        combinedMap.set(code, voucher);
      }
    });

    const combined = Array.from(combinedMap.values());

    const nextUnlock = (() => {
      const isActiveNow = (voucher) => {
        if (!voucher || voucher.status !== "active") return false;
        const campaignType = String(voucher?.campaignType || "").trim().toLowerCase();
        const startDate = voucher.startDate ? new Date(voucher.startDate) : null;
        const endDate = voucher.endDate ? new Date(voucher.endDate) : null;
        const normalizeToDayBounds = campaignType !== CAMPAIGN_TYPES.HAPPY_HOUR || hasExplicitTimeWindow(voucher);
        if (startDate && normalizeToDayBounds) startDate.setHours(0, 0, 0, 0);
        if (endDate && normalizeToDayBounds) endDate.setHours(23, 59, 59, 999);
        if (startDate && now < startDate) return false;
        if (endDate && now > endDate) return false;
        return true;
      };

      const candidates = combined
        .map((voucher) => {
          const normalized = withVoucherType(voucher);
          if (!isActiveNow(normalized)) return null;
          const minOrderValue = Math.max(0, toNumber(normalized?.minOrderValue, 0));
          if (!minOrderValue) return null;
          if (safeOrderAmount >= minOrderValue) return null;

          return {
            needed: Math.max(0, minOrderValue - safeOrderAmount),
            voucher: normalized,
            source: voucher.__source || "global",
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.needed !== b.needed) return a.needed - b.needed;
          return toNumber(b.voucher?.discountValue, 0) - toNumber(a.voucher?.discountValue, 0);
        });

      const top = candidates[0];
      if (!top) return null;

      return {
        amountToAdd: top.needed,
        voucherCode: top.voucher?.voucherCode || "",
        voucherName: top.voucher?.voucherName || "",
        voucherType: top.voucher?.voucherType || VOUCHER_TYPES.FOOD,
        discountType: top.voucher?.discountType || "amount",
        discountValue: toNumber(top.voucher?.discountValue, 0),
        minOrderValue: toNumber(top.voucher?.minOrderValue, 0),
        isPersonal: top.source === "personal",
      };
    })();

    const evaluated = await Promise.all(
      combined.map(async (voucher) => {
        const evaluation = await evaluateVoucher({
          voucher,
          userId: req.userId,
          orderAmount,
          shippingFee,
          cartItems,
        });
        return {
          ...evaluation,
          voucher: withVoucherType(voucher),
          source: voucher.__source || "global",
        };
      })
    );

    const available = evaluated
      .filter((item) => item.valid)
      .map((item) => ({
        _id: item.voucher._id,
        voucherCode: item.voucher.voucherCode,
        voucherName: item.voucher.voucherName,
        voucherType: item.voucher.voucherType,
        applyFor: item.voucher.applyFor,
        categoryName: item.voucher?.categoryId?.name || "",
        minOrderValue: toNumber(item.voucher.minOrderValue, 0),
        discountType: item.voucher.discountType,
        discountValue: item.voucher.discountValue,
        estimatedDiscount: item.discount,
        isPersonal: item.source === "personal",
      }));

    return res.json({ success: true, data: available, hint: nextUnlock });
  } catch (error) {
    console.log("AVAILABLE VOUCHERS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải voucher" });
  }
};

const createVoucher = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const validationError = await validatePayload(payload);
    if (validationError) return res.json({ success: false, message: validationError });

    const existed = await voucherModel.findOne({ voucherCode: payload.voucherCode });
    if (existed) {
      return res.status(400).json({ success: false, message: "Mã đã tồn tại" });
    }

    const voucher = await voucherModel.create(payload);
    await syncPersonalizedUserVouchers(voucher);
    return res.json({ success: true, message: "Voucher created.", data: withVoucherType(voucher) });
  } catch (error) {
    console.log("CREATE VOUCHER ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to create voucher." });
  }
};

const listVouchers = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    const status = String(req.query?.status || "").trim().toLowerCase();
    const voucherType = String(req.query?.voucherType || "").trim().toUpperCase();
    const issueType = String(req.query?.issueType || "").trim().toLowerCase();

    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ voucherCode: rx }, { voucherName: rx }];
    }
    if (status === "active" || status === "inactive") {
      filter.status = status;
    }
    if (Object.values(VOUCHER_TYPES).includes(voucherType)) {
      filter.voucherType = voucherType;
    }
    if (Object.values(ISSUE_TYPES).includes(issueType)) {
      filter.issueType = issueType;
    }

    const page = Math.max(1, Math.floor(Number(req.query?.page || 1)));
    const limitRaw = Math.floor(Number(req.query?.limit || 0));
    const limit = Number.isFinite(limitRaw) ? Math.max(0, Math.min(200, limitRaw)) : 0;
    const skip = limit > 0 ? (page - 1) * limit : 0;

    const baseQuery = voucherModel
      .find(filter)
      .populate("categoryId", "name")
      .populate("productIds", "name")
      .populate("assignedUsers", "name email phone")
      .sort({ createdAt: -1 })
      .lean();

    const [vouchers, total] = await Promise.all([
      (limit > 0 ? baseQuery.skip(skip).limit(limit) : baseQuery),
      voucherModel.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: vouchers.map(withVoucherType),
      pagination: { total, page, limit: limit || total },
    });
  } catch (error) {
    console.log("LIST VOUCHERS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch vouchers." });
  }
};

// Danh sách voucher tự động (voucher đã phát cho user thông qua scheduler / loyalty).
// Lấy từ collection `user_voucher`, group theo (voucherCode + rewardType + rewardYear) để admin dễ kiểm soát.
const listAutoVouchers = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    const rewardType = String(req.query?.rewardType || "").trim().toLowerCase();
    const status = String(req.query?.status || "").trim().toLowerCase();

    const page = Math.max(1, Math.floor(Number(req.query?.page || 1)));
    const limitRaw = Math.floor(Number(req.query?.limit || 50));
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
    const skip = (page - 1) * limit;

    const match = {
      campaignType: { $ne: CAMPAIGN_TYPES.MANUAL },
    };

    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      match.$or = [{ voucherCode: rx }, { voucherName: rx }];
    }

    if (status === "active" || status === "inactive") {
      match.status = status;
    }

    if (Object.values(CAMPAIGN_TYPES).includes(rewardType) && rewardType !== CAMPAIGN_TYPES.MANUAL) {
      match.rewardType = rewardType;
    }

    const basePipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            voucherCode: "$voucherCode",
            rewardType: "$rewardType",
            rewardYear: "$rewardYear",
          },
          voucherName: { $first: "$voucherName" },
          campaignType: { $first: "$campaignType" },
          voucherType: { $first: "$voucherType" },
          type: { $first: "$type" },
          discountType: { $first: "$discountType" },
          discountValue: { $first: "$discountValue" },
          minOrderValue: { $first: "$minOrderValue" },
          maxUsage: { $first: "$maxUsage" },
          usagePerUser: { $first: "$usagePerUser" },
          applyFor: { $first: "$applyFor" },
          categoryId: { $first: "$categoryId" },
          productIds: { $first: "$productIds" },
          startDate: { $min: "$startDate" },
          endDate: { $max: "$endDate" },
          status: { $first: "$status" },
          grantedCount: { $sum: 1 },
          usedCount: { $sum: "$usedCount" },
          createdAt: { $max: "$createdAt" },
          updatedAt: { $max: "$updatedAt" },
        },
      },
      { $sort: { endDate: -1, createdAt: -1 } },
    ];

    const [rows, totalRows] = await Promise.all([
      userVoucherModel.aggregate([...basePipeline, { $skip: skip }, { $limit: limit }]),
      userVoucherModel.aggregate([...basePipeline, { $count: "total" }]),
    ]);

    const total = Number(totalRows?.[0]?.total || 0);

    return res.json({
      success: true,
      data: (Array.isArray(rows) ? rows : []).map((row) => ({
        voucherCode: row?._id?.voucherCode || "",
        voucherName: row?.voucherName || "",
        rewardType: row?._id?.rewardType || "",
        rewardYear: row?._id?.rewardYear || 0,
        campaignType: row?.campaignType || "",
        voucherType: row?.voucherType || "",
        type: row?.type || "",
        discountType: row?.discountType || "",
        discountValue: row?.discountValue || 0,
        minOrderValue: row?.minOrderValue || 0,
        maxUsage: row?.maxUsage || 0,
        usagePerUser: row?.usagePerUser || 1,
        applyFor: row?.applyFor || "all",
        categoryId: row?.categoryId || null,
        productIds: Array.isArray(row?.productIds) ? row.productIds : [],
        startDate: row?.startDate || null,
        endDate: row?.endDate || null,
        status: row?.status || "active",
        grantedCount: row?.grantedCount || 0,
        usedCount: row?.usedCount || 0,
        createdAt: row?.createdAt || null,
        updatedAt: row?.updatedAt || null,
      })),
      pagination: { total, page, limit },
    });
  } catch (error) {
    console.log("LIST AUTO VOUCHERS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch auto vouchers." });
  }
};

const normalizeAutoVoucherUpdate = (body = {}) => {
  const update = {};

  if (body.voucherName != null) update.voucherName = String(body.voucherName || "").trim();

  if (body.voucherType) {
    const voucherType = normalizeVoucherType(body);
    update.voucherType = voucherType;
    update.type = LEGACY_TYPE_BY_VOUCHER_TYPE[voucherType] || "product";
  }

  if (body.discountType != null) {
    update.discountType = body.discountType === "percent" ? "percent" : "amount";
  }
  if (body.discountValue != null) update.discountValue = Math.max(0, toNumber(body.discountValue, 0));
  if (body.minOrderValue != null) update.minOrderValue = Math.max(0, toNumber(body.minOrderValue, 0));
  if (body.maxUsage != null) update.maxUsage = Math.max(0, toNumber(body.maxUsage, 0));
  if (body.usagePerUser != null) update.usagePerUser = Math.max(1, toNumber(body.usagePerUser, 1));

  if (body.status) update.status = body.status === "inactive" ? "inactive" : "active";

  if (body.applyFor != null) {
    const applyFor = ["all", "category", "product"].includes(body.applyFor) ? body.applyFor : "all";
    update.applyFor = applyFor;
    if (applyFor !== "category") update.categoryId = null;
    if (applyFor !== "product") update.productIds = [];
  }

  if (body.categoryId != null) {
    const categoryId = toObjectIdOrNull(body.categoryId);
    if (categoryId) update.categoryId = categoryId;
  }

  if (body.productIds != null) {
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.map((id) => toObjectIdOrNull(id)).filter(Boolean)
      : [];
    update.productIds = productIds;
  }

  if (body.startDate != null) {
    const startDate = parseDate(body.startDate);
    if (startDate) update.startDate = startDate;
  }
  if (body.endDate != null) {
    const endDate = parseDate(body.endDate);
    if (endDate) update.endDate = endDate;
  }

  if (String(update.voucherType || "").toUpperCase() === VOUCHER_TYPES.SHIPPING) {
    update.applyFor = "all";
    update.discountType = "amount";
  }

  return update;
};

const updateAutoVouchers = async (req, res) => {
  try {
    const voucherCode = normalizeVoucherCode(req.body?.voucherCode);
    const rewardType = String(req.body?.rewardType || "").trim().toLowerCase();
    const rewardYear = Number(req.body?.rewardYear || 0);

    if (!voucherCode || !rewardType || !Number.isFinite(rewardYear)) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin voucher tự động." });
    }

    const update = normalizeAutoVoucherUpdate(req.body);
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: "Không có dữ liệu cập nhật." });
    }

    if (update.startDate && update.endDate && update.startDate >= update.endDate) {
      return res.status(400).json({ success: false, message: "Ngày bắt đầu phải trước ngày kết thúc." });
    }

    if (
      update.discountType === "percent" &&
      String(update.voucherType || "").toUpperCase() !== VOUCHER_TYPES.SHIPPING &&
      Number(update.discountValue || 0) > 100
    ) {
      return res.status(400).json({ success: false, message: "Giảm theo % không được vượt quá 100." });
    }

    if (update.applyFor === "category" && !update.categoryId) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn danh mục." });
    }

    if (update.applyFor === "product" && (!update.productIds || update.productIds.length === 0)) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn sản phẩm." });
    }

    const result = await userVoucherModel.updateMany(
      { voucherCode, rewardType, rewardYear },
      { $set: update }
    );

    return res.json({
      success: true,
      message: "Cập nhật voucher tự động thành công.",
      updated: result?.modifiedCount || 0,
    });
  } catch (error) {
    console.log("UPDATE AUTO VOUCHERS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể cập nhật voucher tự động." });
  }
};

const deleteAutoVouchers = async (req, res) => {
  try {
    const source = req.body && Object.keys(req.body).length > 0 ? req.body : req.query;
    const voucherCode = normalizeVoucherCode(source?.voucherCode);
    const rewardType = String(source?.rewardType || "").trim().toLowerCase();
    const rewardYear = Number(source?.rewardYear || 0);

    if (!voucherCode || !rewardType || !Number.isFinite(rewardYear)) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin voucher tự động." });
    }

    const result = await userVoucherModel.deleteMany({ voucherCode, rewardType, rewardYear });
    return res.json({
      success: true,
      message: "Đã xóa voucher tự động.",
      deleted: result?.deletedCount || 0,
    });
  } catch (error) {
    console.log("DELETE AUTO VOUCHERS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xóa voucher tự động." });
  }
};

const checkVoucherCode = async (req, res) => {
  try {
    const code = normalizeVoucherCode(req.query?.code);
    const excludeIdRaw = String(req.query?.excludeId || "").trim();
    const excludeId = mongoose.Types.ObjectId.isValid(excludeIdRaw) ? excludeIdRaw : "";

    if (!code) {
      return res.status(400).json({ success: false, message: "Thiếu mã voucher", available: false });
    }

    const existed = await voucherModel.findOne({ voucherCode: code }, "_id").lean();
    const available = !existed || (excludeId && String(existed?._id || "") === String(excludeId));

    return res.json({ success: true, available, code });
  } catch (error) {
    console.log("CHECK VOUCHER CODE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể kiểm tra mã voucher", available: false });
  }
};

const getVoucherById = async (req, res) => {
  try {
    const voucher = await voucherModel
      .findById(req.params.id)
      .populate("categoryId", "name")
      .populate("productIds", "name")
      .populate("assignedUsers", "name email phone");
    if (!voucher) return res.json({ success: false, message: "Voucher not found." });

    return res.json({ success: true, data: withVoucherType(voucher) });
  } catch (error) {
    console.log("GET VOUCHER ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch voucher." });
  }
};

const updateVoucher = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const validationError = await validatePayload(payload, { isUpdate: true });
    if (validationError) return res.json({ success: false, message: validationError });

    const duplicated = await voucherModel.findOne({
      voucherCode: payload.voucherCode,
      _id: { $ne: req.params.id },
    });
    if (duplicated) {
      return res.status(400).json({ success: false, message: "Mã đã tồn tại" });
    }

    const voucher = await voucherModel.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...payload,
        },
      },
      { new: true, runValidators: true }
    );
    if (!voucher) return res.json({ success: false, message: "Voucher not found." });
    await syncPersonalizedUserVouchers(voucher);

    return res.json({ success: true, message: "Voucher updated.", data: withVoucherType(voucher) });
  } catch (error) {
    console.log("UPDATE VOUCHER ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update voucher." });
  }
};

const deleteVoucher = async (req, res) => {
  try {
    const voucher = await voucherModel.findByIdAndDelete(req.params.id);
    if (!voucher) return res.json({ success: false, message: "Voucher not found." });
    if (String(voucher.issueType || "").toLowerCase() === ISSUE_TYPES.PERSONALIZED) {
      const rewardYear = rewardYearFromVoucherId(voucher._id);
      const voucherCode = String(voucher.voucherCode || "").trim().toUpperCase();
      await userVoucherModel.deleteMany({ rewardType: "manual", rewardYear, voucherCode });
    }
    return res.json({ success: true, message: "Voucher deleted." });
  } catch (error) {
    console.log("DELETE VOUCHER ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to delete voucher." });
  }
};

const updateVoucherStatus = async (req, res) => {
  try {
    const status = req.body?.status === "inactive" ? "inactive" : "active";
    const voucher = await voucherModel.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!voucher) return res.json({ success: false, message: "Voucher not found." });
    if (String(voucher.issueType || "").toLowerCase() === ISSUE_TYPES.PERSONALIZED) {
      const rewardYear = rewardYearFromVoucherId(voucher._id);
      const voucherCode = String(voucher.voucherCode || "").trim().toUpperCase();
      await userVoucherModel.updateMany(
        { rewardType: "manual", rewardYear, voucherCode },
        { $set: { status } }
      );
    }
    return res.json({ success: true, message: "Voucher status updated.", data: withVoucherType(voucher) });
  } catch (error) {
    console.log("UPDATE VOUCHER STATUS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update voucher status." });
  }
};

export {
  createVoucher,
  listVouchers,
  listAutoVouchers,
  updateAutoVouchers,
  deleteAutoVouchers,
  checkVoucherCode,
  getVoucherById,
  updateVoucher,
  deleteVoucher,
  updateVoucherStatus,
  validateVoucher,
  claimVoucher,
  applyVoucher,
  getAvailableVouchers,
};

