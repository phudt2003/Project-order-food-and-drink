import voucherModel from "../models/voucherModel.js";

const ISSUE_TYPES = {
  NEW_USER: "new_user",
  BIRTHDAY: "birthday",
  COMEBACK: "comeback",
  MONTHLY_RANK: "monthly_rank",
};

const addDays = (date, days) => new Date(date.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeApplyFor = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "category" || raw === "product") return raw;
  return "all";
};

export const findAutoVoucherTemplate = async ({ issueType, targetRank, now }) => {
  if (!issueType) return null;

  const current = now instanceof Date ? now : new Date(now || Date.now());

  const noDateIssueTypes = new Set([ISSUE_TYPES.BIRTHDAY, ISSUE_TYPES.COMEBACK, ISSUE_TYPES.MONTHLY_RANK]);

  const filter = {
    issueType: String(issueType || "").trim().toLowerCase(),
    status: "active",
  };

  if (!noDateIssueTypes.has(filter.issueType)) {
    filter.startDate = { $lte: current };
    filter.endDate = { $gte: current };
  }

  if (filter.issueType === ISSUE_TYPES.MONTHLY_RANK) {
    const normalizedRank = String(targetRank || "").trim().toLowerCase();
    if (normalizedRank) {
      const rankTemplate = await voucherModel
        .findOne({
          ...filter,
          targetUser: "rank",
          targetRank: normalizedRank,
        })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();

      if (rankTemplate) return rankTemplate;
    }

    const allTemplate = await voucherModel
      .findOne({
        ...filter,
        targetUser: "all",
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    return allTemplate || null;
  }

  if (filter.issueType === ISSUE_TYPES.NEW_USER) {
    filter.targetUser = { $in: ["new", "all"] };
  }

  const template = await voucherModel
    .findOne(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  return template || null;
};

export const buildUserVoucherPayloadFromTemplate = ({
  template,
  userId,
  rewardType,
  rewardYear,
  now,
  defaultExpireDays = 7,
}) => {
  if (!template) return null;

  const current = now instanceof Date ? now : new Date(now || Date.now());
  const voucherType = String(template?.voucherType || "FOOD").toUpperCase();
  const isShipping = voucherType === "SHIPPING";
  const applyFor = isShipping ? "all" : normalizeApplyFor(template?.applyFor);
  const expireDaysRaw = toNumber(template?.expireDays, 0);
  const expireDays = expireDaysRaw > 0 ? expireDaysRaw : Math.max(1, Number(defaultExpireDays || 7));
  const endDate = addDays(current, expireDays);

  const maxUsage = toNumber(template?.maxUsage, 1);
  const usagePerUser = Math.max(1, toNumber(template?.usagePerUser, 1));

  return {
    userId,
    rewardType,
    rewardYear,
    voucherCode: String(template?.voucherCode || "").trim().toUpperCase(),
    voucherName: String(template?.voucherName || "").trim(),
    campaignType: String(template?.campaignType || rewardType || "manual"),
    voucherType,
    type: isShipping ? "shipping" : String(template?.type || "product"),
    discountType: isShipping ? "amount" : String(template?.discountType || "amount"),
    discountValue: Math.max(0, toNumber(template?.discountValue, 0)),
    startDate: current,
    endDate,
    applyFor,
    categoryId: applyFor === "category" ? template?.categoryId || null : null,
    productIds: applyFor === "product" && Array.isArray(template?.productIds) ? template.productIds : [],
    minOrderValue: Math.max(0, toNumber(template?.minOrderValue, 0)),
    maxUsage: Number.isFinite(maxUsage) ? Math.max(0, maxUsage) : 1,
    usagePerUser,
    status: String(template?.status || "active") === "inactive" ? "inactive" : "active",
  };
};
