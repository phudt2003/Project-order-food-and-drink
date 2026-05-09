import mongoose from "mongoose";
import reviewModel from "../models/Review.js";
import foodModel from "../models/foodModel.js";
import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import voucherModel from "../models/voucherModel.js";
import userVoucherModel from "../models/userVoucherModel.js";
import { getOrderStatus as getFulfillmentStatus } from "../services/orderLifecycle.js";
import { buildUserVoucherPayloadFromTemplate } from "../utils/autoVoucherTemplates.js";
import { getRankBySpend, RANKS } from "../utils/loyaltyConfig.js";

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""))
    ? new mongoose.Types.ObjectId(String(value))
    : null;

const normalizeString = (value) => String(value || "").trim();

const toNullableNumber = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeRating = (value) => {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  if (rating < 1 || rating > 5) return null;
  return Math.round(rating);
};

const normalizeStatusText = (value) => String(value || "").trim().toLowerCase();

const isDeliveredStatus = (value) => {
  const status = normalizeStatusText(value);
  if (!status) return false;
  return ["completed", "done", "delivered"].includes(status);
};

const isOrderDelivered = (order, now = new Date()) => {
  if (!order) return false;
  if (isDeliveredStatus(order?.status)) return true;
  const fulfillment = normalizeStatusText(getFulfillmentStatus(order, now));
  return ["done", "completed"].includes(fulfillment);
};

const orderHasFood = (order, foodObjectId) => {
  if (!order || !foodObjectId) return false;
  const foodId = String(foodObjectId);
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.some((item) => {
    const candidates = [item?._id, item?.productId, item?.itemId, item?.foodId];
    return candidates.some((value) => value != null && String(value) === foodId);
  });
};

const normalizeStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  if (["pending", "approved", "rejected"].includes(status)) return status;
  return "";
};

const BAD_REVIEW_ISSUE_TYPE = "auto_bad_review";
const BAD_REVIEW_REWARD_TYPE = "bad_review";
const ALLOWED_RANKS = new Set((RANKS || []).map((rank) => String(rank?.key || "").trim().toLowerCase()).filter(Boolean));

const hashRewardKey = (value = "") => {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const normalizeRankList = (value) => {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => ALLOWED_RANKS.has(item));
};

const getOrderAmount = (order) => {
  const total = Number(order?.total || 0);
  const amount = Number(order?.amount || 0);
  const value = Math.max(total, amount);
  return Number.isFinite(value) ? value : 0;
};

const isTemplateActive = (template, now) => {
  const status = String(template?.status || "active").trim().toLowerCase();
  if (status !== "active") return false;

  const current = now instanceof Date ? now : new Date(now || Date.now());
  const startDate = template?.startDate ? new Date(template.startDate) : null;
  const endDate = template?.endDate ? new Date(template.endDate) : null;

  if (startDate && Number.isFinite(startDate.getTime()) && current < startDate) return false;
  if (endDate && Number.isFinite(endDate.getTime()) && current > endDate) return false;
  return true;
};

const readTriggerCondition = (template) => {
  const raw = template?.triggerCondition || template?.trigger_condition || {};
  const ratingRaw = raw?.ratingLte ?? raw?.rating_lte ?? null;
  const minOrderRaw = raw?.minOrderValue ?? raw?.min_order_value ?? null;
  const userRanksRaw = raw?.userRanks ?? raw?.user_rank ?? [];

  const ratingParsed = toNullableNumber(ratingRaw);
  const minOrderParsed = toNullableNumber(minOrderRaw);
  const ratingRounded = ratingParsed == null ? null : Math.round(ratingParsed);
  const ratingLte = ratingRounded != null && ratingRounded >= 1 && ratingRounded <= 5 ? ratingRounded : null;
  const minOrderValue = minOrderParsed == null ? null : Math.max(0, minOrderParsed);
  const userRanks = normalizeRankList(userRanksRaw);

  if (ratingLte == null && minOrderValue == null && userRanks.length === 0) return null;
  return { ratingLte, minOrderValue, userRanks };
};

const matchTriggerCondition = ({ rating, userRank, orderAmount, condition }) => {
  if (!condition) return true;
  if (condition.ratingLte != null && Number(rating || 0) > Number(condition.ratingLte)) return false;
  if (condition.minOrderValue != null && Number(orderAmount || 0) < Number(condition.minOrderValue)) return false;
  if (Array.isArray(condition.userRanks) && condition.userRanks.length > 0) {
    if (!userRank) return false;
    return condition.userRanks.includes(String(userRank || "").trim().toLowerCase());
  }
  return true;
};

const grantBadReviewVouchers = async ({ review, userId, order, userRank, now }) => {
  if (!review || !userId) return;
  const current = now instanceof Date ? now : new Date(now || Date.now());

  const templates = await voucherModel
    .find({ issueType: BAD_REVIEW_ISSUE_TYPE, status: "active" })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  if (!templates.length) return;

  const rating = Number(review?.rating || 0);
  const orderAmount = getOrderAmount(order);

  const ops = templates.map(async (template) => {
    if (!isTemplateActive(template, current)) return;

    const condition = readTriggerCondition(template);
    if (!condition) return;
    if (!matchTriggerCondition({ rating, userRank, orderAmount, condition })) return;

    const rewardYear = hashRewardKey(`${String(review?._id || "")}:${String(template?._id || template?.voucherCode || "")}`);
    const payload = buildUserVoucherPayloadFromTemplate({
      template,
      userId,
      rewardType: BAD_REVIEW_REWARD_TYPE,
      rewardYear,
      now: current,
      defaultExpireDays: 7,
    });

    if (!payload) return;

    try {
      await userVoucherModel.create(payload);
    } catch (error) {
      if (error?.code === 11000) return;
      throw error;
    }
  });

  await Promise.allSettled(ops);
};

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
};

const buildDateRange = ({ fromDate, toDate }) => {
  const start = parseDateOnly(fromDate);
  const end = parseDateOnly(toDate);

  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(23, 59, 59, 999);

  if (start && end && start > end) {
    const tmp = new Date(start);
    start.setTime(end.getTime());
    end.setTime(tmp.getTime());
  }

  const range = {};
  if (start) range.$gte = start;
  if (end) range.$lte = end;
  return Object.keys(range).length ? range : null;
};

const parseSort = (value) => {
  const sortKey = String(value || "").trim().toLowerCase();
  if (sortKey === "oldest") return { createdAt: 1 };
  if (sortKey === "rating_asc") return { rating: 1, createdAt: -1 };
  if (sortKey === "rating_desc") return { rating: -1, createdAt: -1 };
  return { createdAt: -1 };
};

const isPurchaseEnforced = () =>
  String(process.env.REVIEW_REQUIRE_PURCHASE || "").toLowerCase() === "true";

const isReviewApprovalRequired = () =>
  String(process.env.REVIEW_REQUIRE_APPROVAL || "").toLowerCase() === "true";

const getRewardCoins = () => {
  const parsed = Number(process.env.REVIEW_REWARD_COINS || 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 10;
};

const hasPurchasedFood = async ({ userId, foodId, orderId }) => {
  if (!userId || !foodId) return false;
  const foodIdString = String(foodId);

  const query = {
    userId,
    ...(orderId ? { _id: orderId } : {}),
    $or: [
      { "items._id": foodIdString },
      { "items.productId": foodIdString },
      { "items.itemId": foodIdString },
      { "items._id": foodId },
      { "items.productId": foodId },
      { "items.itemId": foodId },
    ],
    status: { $nin: ["cancelled", "canceled"] },
  };

  const order = await orderModel.findOne(query).lean();
  return Boolean(order);
};

const buildReviewResponse = (review) => {
  if (!review) return null;
  return review?.toObject ? review.toObject() : review;
};

const createReview = async (req, res) => {
  try {
    const userId = req.userId || req.body?.userId;
    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: "Login First" });
    }

    const orderObjectId = toObjectId(req.body?.orderId);
    if (!orderObjectId) {
      return res.status(400).json({ success: false, message: "Thiếu mã đơn hàng." });
    }
    const foodObjectId = toObjectId(req.body?.foodId || req.body?.productId);
    if (!foodObjectId) {
      return res.status(400).json({ success: false, message: "Invalid foodId" });
    }

    const rating = normalizeRating(req.body?.rating);
    if (!rating) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    const comment = normalizeString(req.body?.comment);
    let phone = normalizeString(req.body?.phone || req.body?.bankAccount);
    let address = normalizeString(req.body?.address);
    const userAvatar = normalizeString(
      req.body?.userAvatar || req.body?.avatar || req.body?.userImage || req.body?.imageUrl
    );

    if (!comment) {
      return res.status(400).json({ success: false, message: "Comment is required" });
    }

    const food = await foodModel.findById(foodObjectId, "name").lean();
    if (!food) {
      return res.status(404).json({ success: false, message: "Food not found" });
    }

    let userName = normalizeString(req.body?.userName);
    const userDoc = await userModel.findById(userObjectId, "name totalSpend").lean();
    if (!userName) {
      userName = normalizeString(userDoc?.name);
    }

    if (!userName) {
      return res.status(400).json({ success: false, message: "User name is required" });
    }

    const foodName = normalizeString(req.body?.foodName) || normalizeString(food?.name);
    if (!foodName) {
      return res.status(400).json({ success: false, message: "Food name is required" });
    }

    const order = await orderModel.findOne({ _id: orderObjectId, userId: userObjectId }).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }
    if (!isOrderDelivered(order)) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng chưa giao thành công, chưa thể đánh giá.",
      });
    }
    if (!orderHasFood(order, foodObjectId)) {
      return res.status(400).json({
        success: false,
        message: "Sản phẩm không thuộc đơn hàng này.",
      });
    }

    if (!phone || !address) {
      if (!phone) {
        const addr = order?.address || {};
        phone = normalizeString(order?.phone || addr?.phone);
      }
      if (!address) {
        const addr = order?.address || {};
        address = normalizeString(
          order?.addressText ||
            addr?.deliveryText ||
            [addr?.street, addr?.ward, addr?.district, addr?.city, addr?.state, addr?.country]
              .filter(Boolean)
              .join(", ")
        );
      }
    }

    const existed = await reviewModel.findOne({
      userId: userObjectId,
      foodId: foodObjectId,
      ...(orderObjectId ? { orderId: orderObjectId } : {}),
    });
    if (existed) {
      return res.status(409).json({
        success: false,
        message: "Bạn đã đánh giá món ăn này rồi",
        alreadyReviewed: true,
        review: buildReviewResponse(existed),
      });
    }

    const status = isReviewApprovalRequired() ? "pending" : "approved";

    const review = await reviewModel.create({
      userId: userObjectId,
      userName,
      foodId: foodObjectId,
      foodName,
      rating,
      comment,
      orderId: orderObjectId || null,
      phone,
      address,
      status,
      moderatedAt: status === "approved" ? new Date() : null,
      userAvatar,
    });

    try {
      const { current } = getRankBySpend(Number(userDoc?.totalSpend || 0));
      const userRank = String(current?.key || "").trim().toLowerCase();
      await grantBadReviewVouchers({
        review,
        userId: userObjectId,
        order,
        userRank,
        now: new Date(),
      });
    } catch (error) {
      console.log("AUTO BAD REVIEW VOUCHER ERROR:", error.message);
    }

    return res.json({ success: true, data: buildReviewResponse(review) });
  } catch (error) {
    if (error?.code === 11000) {
      try {
        const existed = await reviewModel.findOne({
          userId: toObjectId(req.userId || req.body?.userId),
          foodId: toObjectId(req.body?.foodId || req.body?.productId),
          ...(toObjectId(req.body?.orderId)
            ? { orderId: toObjectId(req.body?.orderId) }
            : {}),
        });
        if (existed) {
          return res.status(409).json({
            success: false,
            message: "Review already exists",
            alreadyReviewed: true,
            review: buildReviewResponse(existed),
          });
        }
      } catch {
        // fall through to default conflict
      }
      return res.status(409).json({ success: false, message: "Review already exists" });
    }
    console.log("CREATE REVIEW ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to create review" });
  }
};

const getReviewableProducts = async (req, res) => {
  try {
    const userObjectId = toObjectId(req.userId);
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: "Login First" });
    }

    const orderObjectId = toObjectId(req.params?.orderId || req.query?.orderId);
    if (!orderObjectId) {
      return res.status(400).json({ success: false, message: "Invalid orderId" });
    }

    const order = await orderModel.findOne({ _id: orderObjectId, userId: userObjectId }).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (!isOrderDelivered(order)) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng chưa giao thành công, chưa thể đánh giá.",
      });
    }

    const items = Array.isArray(order?.items) ? order.items : [];
    const productMap = new Map();

    items.forEach((item) => {
      const foodObjectId =
        toObjectId(item?.productId) ||
        toObjectId(item?._id) ||
        toObjectId(item?.itemId) ||
        toObjectId(item?.foodId);
      if (!foodObjectId) return;

      const key = String(foodObjectId);
      const quantity = Math.max(1, Number(item?.quantity || 1));
      const name = normalizeString(item?.name || item?.productName || item?.title);
      const image = normalizeString(item?.image || item?.thumbnail || item?.product?.image);

      const existing = productMap.get(key);
      if (existing) {
        existing.quantity += quantity;
        if (!existing.name && name) existing.name = name;
        if (!existing.image && image) existing.image = image;
        return;
      }

      productMap.set(key, {
        productId: key,
        name,
        image,
        quantity,
      });
    });

    const productIds = [...productMap.keys()].map((id) => new mongoose.Types.ObjectId(id));
    const reviews = await reviewModel
      .find({ userId: userObjectId, orderId: orderObjectId, foodId: { $in: productIds } })
      .lean();
    const reviewMap = new Map(reviews.map((review) => [String(review.foodId), review]));

    const products = [...productMap.values()].map((product) => {
      const review = reviewMap.get(String(product.productId)) || null;
      return {
        ...product,
        reviewed: Boolean(review?._id),
        review,
      };
    });

    const reviewedCount = products.filter((product) => product.reviewed).length;
    const pendingRewards = products.filter(
      (product) => product.review && !product.review.isRewardClaimed
    ).length;

    return res.json({
      success: true,
      data: {
        orderId: String(orderObjectId),
        products,
        totalProducts: products.length,
        reviewedCount,
        pendingRewards,
        rewardCoins: getRewardCoins(),
      },
    });
  } catch (error) {
    console.log("GET REVIEWABLE PRODUCTS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

const claimReward = async (req, res) => {
  try {
    const userObjectId = toObjectId(req.userId);
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: "Login First" });
    }

    const reviewId = toObjectId(req.params?.id);
    if (!reviewId) {
      return res.status(400).json({ success: false, message: "Invalid reviewId" });
    }

    const review = await reviewModel.findOne({ _id: reviewId, userId: userObjectId });
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (review.isRewardClaimed) {
      const user = await userModel.findById(userObjectId).select("coinBalance").lean();
      return res.json({
        success: true,
        claimed: true,
        rewardCoins: 0,
        coinBalance: Math.max(0, Number(user?.coinBalance || 0)),
        review: buildReviewResponse(review),
      });
    }

    const rewardCoins = getRewardCoins();
    review.isRewardClaimed = true;
    review.rewardClaimedAt = new Date();
    await review.save();

    const updatedUser = await userModel
      .findByIdAndUpdate(userObjectId, { $inc: { coinBalance: rewardCoins } }, { new: true })
      .select("coinBalance");

    return res.json({
      success: true,
      claimed: true,
      rewardCoins,
      coinBalance: Math.max(0, Number(updatedUser?.coinBalance || 0)),
      review: buildReviewResponse(review),
    });
  } catch (error) {
    console.log("CLAIM REVIEW REWARD ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to claim reward" });
  }
};

const parsePagination = (req, defaults = {}) => {
  const page = Math.max(1, Number(req.query?.page || defaults.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit || defaults.limit || 20)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const listMyReviews = async (req, res) => {
  try {
    const userObjectId = toObjectId(req.userId);
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: "Login First" });
    }

    const rawFoodIds = String(req.query?.foodIds || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const foodObjectIds = rawFoodIds
      .map((value) => toObjectId(value))
      .filter(Boolean);

    const filter = { userId: userObjectId };
    if (foodObjectIds.length > 0) {
      filter.foodId = { $in: foodObjectIds };
    }

    const reviews = await reviewModel.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: reviews });
  } catch (error) {
    console.log("LIST MY REVIEWS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch reviews" });
  }
};

const listReviewsByFood = async (req, res) => {
  try {
    const foodObjectId = toObjectId(req.params?.foodId);
    if (!foodObjectId) {
      return res.status(400).json({ success: false, message: "Invalid foodId" });
    }

    const { page, limit, skip } = parsePagination(req, { page: 1, limit: 20 });

    const approvalRequired = isReviewApprovalRequired();
    const statusFilter = approvalRequired ? ["approved"] : ["approved", "pending"];

    const [result] = await reviewModel.aggregate([
      {
        $match: {
          foodId: foodObjectId,
          $or: [
            { status: { $in: statusFilter } },
            { adminReply: { $exists: true, $ne: "" } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          reviews: [{ $skip: skip }, { $limit: limit }],
          stats: [
            {
              $group: {
                _id: null,
                averageRating: { $avg: "$rating" },
                reviewCount: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const reviews = result?.reviews || [];
    const stats = result?.stats?.[0] || { averageRating: 0, reviewCount: 0 };
    const averageRating = Number.isFinite(stats.averageRating)
      ? Math.round(stats.averageRating * 10) / 10
      : 0;

    return res.json({
      success: true,
      data: reviews,
      averageRating,
      reviewCount: stats.reviewCount || 0,
      page,
      limit,
    });
  } catch (error) {
    console.log("LIST REVIEWS BY FOOD ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch reviews" });
  }
};

const listReviews = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req, { page: 1, limit: 20 });
    const statusFilter = normalizeStatus(req.query?.status);
    const foodId = toObjectId(req.query?.foodId);
    const userId = toObjectId(req.query?.userId);
    const ratingFilter = normalizeRating(req.query?.rating);
    const dateRange = buildDateRange({
      fromDate: req.query?.fromDate,
      toDate: req.query?.toDate,
    });
    const searchText = normalizeString(req.query?.search);
    const sort = parseSort(req.query?.sort);

    const filter = {};
    if (statusFilter) filter.status = statusFilter;
    if (ratingFilter) filter.rating = ratingFilter;
    if (foodId) filter.foodId = foodId;
    if (userId) filter.userId = userId;
    if (dateRange) filter.createdAt = dateRange;
    if (searchText) {
      const regex = new RegExp(escapeRegex(searchText), "i");
      filter.$or = [
        { comment: { $regex: regex } },
        { userName: { $regex: regex } },
        { foodName: { $regex: regex } },
        { phone: { $regex: regex } },
        { address: { $regex: regex } },
      ];
    }

    const [reviews, total] = await Promise.all([
      reviewModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      reviewModel.countDocuments(filter),
    ]);

    const userIds = [...new Set(reviews.map((review) => String(review?.userId || "")).filter(Boolean))];
    let userEmailMap = new Map();
    if (userIds.length > 0) {
      const users = await userModel
        .find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
        .select("email")
        .lean();
      userEmailMap = new Map(users.map((user) => [String(user._id), String(user.email || "").trim()]));
    }

    const data = reviews.map((review) => ({
      ...review,
      userEmail: userEmailMap.get(String(review?.userId || "")) || "",
    }));

    return res.json({
      success: true,
      data,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.log("LIST REVIEWS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch reviews" });
  }
};

const updateReview = async (req, res) => {
  try {
    const reviewId = toObjectId(req.params?.id);
    if (!reviewId) {
      return res.status(400).json({ success: false, message: "Invalid reviewId" });
    }

    const userObjectId = toObjectId(req.userId);
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: "Login First" });
    }

    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "rating")) {
      const rating = normalizeRating(req.body?.rating);
      if (!rating) {
        return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
      }
      updates.rating = rating;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "comment")) {
      const comment = normalizeString(req.body?.comment);
      if (!comment) {
        return res.status(400).json({ success: false, message: "Comment is required" });
      }
      updates.comment = comment;
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body || {}, "phone") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "bankAccount")
    ) {
      const phone = normalizeString(req.body?.phone || req.body?.bankAccount);
      if (!phone) {
        return res.status(400).json({ success: false, message: "Phone is required" });
      }
      updates.phone = phone;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "address")) {
      const address = normalizeString(req.body?.address);
      if (!address) {
        return res.status(400).json({ success: false, message: "Address is required" });
      }
      updates.address = address;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No update data provided" });
    }

    const status = isReviewApprovalRequired() ? "pending" : "approved";
    updates.status = status;
    updates.moderatedAt = status === "approved" ? new Date() : null;

    const updated = await reviewModel.findOneAndUpdate(
      { _id: reviewId, userId: userObjectId },
      { $set: updates },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    return res.json({ success: true, data: buildReviewResponse(updated) });
  } catch (error) {
    console.log("UPDATE REVIEW ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update review" });
  }
};

const deleteReview = async (req, res) => {
  try {
    const reviewId = toObjectId(req.params?.id);
    if (!reviewId) {
      return res.status(400).json({ success: false, message: "Invalid reviewId" });
    }

    const userObjectId = toObjectId(req.userId);
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: "Login First" });
    }

    const deleted = await reviewModel.findOneAndDelete({
      _id: reviewId,
      userId: userObjectId,
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    return res.json({ success: true, message: "Review deleted" });
  } catch (error) {
    console.log("DELETE REVIEW ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to delete review" });
  }
};

const updateReviewStatus = async (req, res) => {
  try {
    const reviewId = toObjectId(req.params?.id);
    if (!reviewId) {
      return res.status(400).json({ success: false, message: "Invalid reviewId" });
    }

    const status = normalizeStatus(req.body?.status);
    if (!status) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const updated = await reviewModel.findByIdAndUpdate(
      reviewId,
      { $set: { status, moderatedAt: new Date() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    return res.json({ success: true, data: buildReviewResponse(updated) });
  } catch (error) {
    console.log("UPDATE REVIEW STATUS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update review status" });
  }
};

const updateReviewReply = async (req, res) => {
  try {
    const reviewId = toObjectId(req.params?.id);
    if (!reviewId) {
      return res.status(400).json({ success: false, message: "Invalid reviewId" });
    }

    const adminReply = normalizeString(req.body?.adminReply);
    if (!adminReply) {
      return res.status(400).json({ success: false, message: "Reply is required" });
    }

    const updated = await reviewModel.findByIdAndUpdate(
      reviewId,
      { $set: { adminReply, status: "approved", moderatedAt: new Date() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    return res.json({ success: true, data: buildReviewResponse(updated) });
  } catch (error) {
    console.log("UPDATE REVIEW REPLY ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update review reply" });
  }
};

export {
  createReview,
  getReviewableProducts,
  claimReward,
  listMyReviews,
  listReviewsByFood,
  listReviews,
  updateReview,
  deleteReview,
  updateReviewStatus,
  updateReviewReply,
};
