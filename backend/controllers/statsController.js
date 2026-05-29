import mongoose from "mongoose";
import ExcelJS from "exceljs";
import orderModel from "../models/orderModel.js";
import reviewModel from "../models/Review.js";
import { getQueueStats } from "../services/orderLifecycle.js";

const toStartOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const parseRange = (range) => {
  const now = new Date();
  const end = new Date(now);
  let start = toStartOfDay(now);

  switch (String(range || "").toLowerCase()) {
    case "today":
      start = toStartOfDay(now);
      break;
    case "7d":
      start = toStartOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
      break;
    case "30d":
      start = toStartOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
      break;
    case "3m":
      start = toStartOfDay(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()));
      break;
    case "1y":
      start = toStartOfDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
      break;
    default:
      start = toStartOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
  }

  return { start, end };
};

const getDateMatchStage = (range) => {
  const { start, end } = parseRange(range);
  return {
    $and: [
      { orderDate: { $gte: start } },
      { orderDate: { $lte: end } },
    ],
  };
};

const REVENUE_STATUSES = [
  "paid",
  "shipping",
  "completed",
  "delivered",
  "food processing",
  "out for delivery",
  "success",
  "done",
];

const CANCELLED_STATUSES = ["cancelled", "canceled"];

const cleanNumber = (val) => {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const str = String(val).replace(/,/g, "").trim();
  if (!str) return null;
  if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
};

const toNumber = (value, fallback = 0) => {
  const parsed = cleanNumber(value);
  return parsed == null ? fallback : parsed;
};

const normalizeNumber = (value) => toNumber(value, 0);

const toSeries = (raw = []) =>
  raw.map((item) => ({
    date: item._id,
    label: item._id,
    value: normalizeNumber(item.value),
  }));

const toHourSeries = (raw = []) => {
  const map = new Map(
    raw.map((item) => [Number(item._id), normalizeNumber(item.value)])
  );

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    value: map.get(hour) || 0,
  }));
};

const bucketPaymentMethod = (value = "") => {
  const text = String(value || "").toLowerCase();
  if (text.includes("cod") || text.includes("cash")) return "cod";
  if (text.includes("sepay") || text.includes("bank") || text.includes("transfer")) return "sepay";
  return "other";
};

const getRevenueSeries = async (req, res) => {
  try {
    const range = req.query?.range;
    const pipeline = [
      {
        $addFields: {
          orderDate: { $ifNull: ["$paidAt", "$date", "$createdAt"] },
          statusLower: { $toLower: { $ifNull: ["$status", "pending"] } },
        },
      },
      { $match: getDateMatchStage(range) },
      { $match: { statusLower: { $in: REVENUE_STATUSES } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
          },
          value: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const data = await orderModel.aggregate(pipeline);
    const formatted = data.map((item) => ({
      date: item._id,
      label: item._id,
      value: normalizeNumber(item.value),
    }));

    return res.json({ success: true, data: formatted });
  } catch (error) {
    console.log("STATS REVENUE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch revenue stats" });
  }
};

const getSummary = async (req, res) => {
  try {
    const range = req.query?.range;
    const { start, end } = parseRange(range);

    const [totalOrders, revenueAgg, itemsAgg, customersAgg, ratingAgg] = await Promise.all([
      orderModel.countDocuments({
        $or: [
          { date: { $gte: start, $lte: end } },
          { createdAt: { $gte: start, $lte: end } },
        ],
      }),
      orderModel.aggregate([
        {
          $addFields: {
            orderDate: { $ifNull: ["$paidAt", "$date", "$createdAt"] },
            statusLower: { $toLower: { $ifNull: ["$status", "pending"] } },
            amountValue: { $ifNull: ["$amount", "$total"] },
            voucherOrderDiscount: { $ifNull: ["$vouchers.order.discount", 0] },
            voucherShippingDiscount: { $ifNull: ["$vouchers.shipping.discount", 0] },
            voucherLegacyDiscount: { $ifNull: ["$voucher.discount", 0] },
            externalShippingFeeValue: { $ifNull: ["$externalShippingFee", 0] },
          },
        },
        { $match: getDateMatchStage(range) },
        { $match: { statusLower: { $in: REVENUE_STATUSES } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amountValue" },
            totalDiscount: {
              $sum: {
                $add: [
                  "$voucherOrderDiscount",
                  "$voucherShippingDiscount",
                  "$voucherLegacyDiscount",
                ],
              },
            },
            totalExternalShipping: { $sum: "$externalShippingFeeValue" },
          },
        },
      ]),
      orderModel.aggregate([
        {
          $addFields: {
            orderDate: { $ifNull: ["$paidAt", "$date", "$createdAt"] },
            statusLower: { $toLower: { $ifNull: ["$status", "pending"] } },
          },
        },
        { $match: getDateMatchStage(range) },
        { $match: { statusLower: { $in: REVENUE_STATUSES } } },
        { $unwind: "$items" },
        { $group: { _id: null, totalItemsSold: { $sum: { $ifNull: ["$items.quantity", 0] } } } },
      ]),
      orderModel.aggregate([
        {
          $addFields: {
            orderDate: { $ifNull: ["$date", "$createdAt"] },
          },
        },
        { $match: getDateMatchStage(range) },
        { $group: { _id: "$userId" } },
        { $count: "totalCustomers" },
      ]),
      reviewModel.aggregate([
        {
          $match: {
            status: "approved",
            createdAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: null, avgRating: { $avg: "$rating" } } },
      ]),
    ]);

    const totalRevenue = normalizeNumber(revenueAgg?.[0]?.totalRevenue);
    const totalItemsSold = normalizeNumber(itemsAgg?.[0]?.totalItemsSold);
    const totalCustomers = normalizeNumber(customersAgg?.[0]?.totalCustomers);
    const avgRating = normalizeNumber(ratingAgg?.[0]?.avgRating);
    const totalExternalShipping = normalizeNumber(revenueAgg?.[0]?.totalExternalShipping);
    const totalDiscount = normalizeNumber(revenueAgg?.[0]?.totalDiscount);

    return res.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders,
        totalCustomers,
        totalItemsSold,
        avgRating,
        totalExternalShipping,
        totalDiscount,
        netRevenue: Math.max(0, totalRevenue - totalDiscount - totalExternalShipping),
      },
    });
  } catch (error) {
    console.log("STATS SUMMARY ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch summary stats" });
  }
};

const getTopProducts = async (req, res) => {
  try {
    const range = req.query?.range;
    const pipeline = [
      {
        $addFields: {
          orderDate: { $ifNull: ["$paidAt", "$date", "$createdAt"] },
          statusLower: { $toLower: { $ifNull: ["$status", "pending"] } },
        },
      },
      { $match: getDateMatchStage(range) },
      { $match: { statusLower: { $in: REVENUE_STATUSES } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items._id",
          name: { $first: "$items.name" },
          sold: { $sum: { $ifNull: ["$items.quantity", 0] } },
          revenue: {
            $sum: {
              $multiply: [
                { $ifNull: ["$items.price", 0] },
                { $ifNull: ["$items.quantity", 0] },
              ],
            },
          },
        },
      },
      { $sort: { sold: -1 } },
      { $limit: 5 },
    ];

    const top = await orderModel.aggregate(pipeline);
    const ids = top
      .map((item) => (mongoose.Types.ObjectId.isValid(String(item._id)) ? new mongoose.Types.ObjectId(String(item._id)) : null))
      .filter(Boolean);

    const reviews = ids.length
      ? await reviewModel.aggregate([
          { $match: { $or: [{ productId: { $in: ids } }, { foodId: { $in: ids } }], status: "approved" } },
          { $group: { _id: { $ifNull: ["$productId", "$foodId"] }, count: { $sum: 1 } } },
        ])
      : [];

    const reviewMap = new Map(reviews.map((item) => [String(item._id), item.count]));

    const data = top.map((item) => ({
      productId: String(item._id || ""),
      name: item.name || "Sáº£n pháº©m",
      sold: normalizeNumber(item.sold),
      revenue: normalizeNumber(item.revenue),
      reviewCount: reviewMap.get(String(item._id)) || 0,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.log("STATS TOP PRODUCTS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch top products" });
  }
};

const getOrderStatusStats = async (req, res) => {
  try {
    const range = req.query?.range;
    const pipeline = [
      {
        $addFields: {
          orderDate: { $ifNull: ["$date", "$createdAt"] },
          statusLower: { $toLower: { $ifNull: ["$status", "pending"] } },
        },
      },
      { $match: getDateMatchStage(range) },
      {
        $addFields: {
          statusBucket: {
            $switch: {
              branches: [
                { case: { $in: ["$statusLower", ["completed", "delivered"]] }, then: "delivered" },
                { case: { $in: ["$statusLower", ["cancelled", "canceled"]] }, then: "cancelled" },
                { case: { $in: ["$statusLower", ["pending", "paid", "shipping", "food processing", "out for delivery", "processing"]] }, then: "preparing" },
              ],
              default: "preparing",
            },
          },
        },
      },
      { $group: { _id: "$statusBucket", count: { $sum: 1 } } },
    ];

    const raw = await orderModel.aggregate(pipeline);
    const map = new Map(raw.map((item) => [item._id, item.count]));

    const data = [
      { key: "delivered", label: "Đã giao", count: map.get("delivered") || 0 },
      { key: "preparing", label: "Đang chuẩn bị", count: map.get("preparing") || 0 },
      { key: "cancelled", label: "Đã hủy", count: map.get("cancelled") || 0 },
    ];

    return res.json({ success: true, data });
  } catch (error) {
    console.log("STATS ORDER STATUS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch order status stats" });
  }
};

export { getRevenueSeries, getSummary, getTopProducts, getOrderStatusStats };

export const getDashboardStats = async (req, res) => {
  try {
    const range = req.query?.range;
    const { start, end } = parseRange(range);

    const baseStages = [
      {
        $addFields: {
          orderDate: { $ifNull: ["$paidAt", "$date", "$createdAt"] },
          statusLower: { $toLower: { $ifNull: ["$status", "pending"] } },
          paymentMethodLower: {
            $toLower: { $ifNull: ["$paymentMethod", "unknown"] },
          },
          amountValue: { $ifNull: ["$amount", "$total"] },
          deliveryFeeValue: { $ifNull: ["$deliveryFee", "$shippingFee", 0] },
          externalShippingFeeValue: { $ifNull: ["$externalShippingFee", 0] },
          voucherOrderDiscount: { $ifNull: ["$vouchers.order.discount", 0] },
          voucherShippingDiscount: { $ifNull: ["$vouchers.shipping.discount", 0] },
          voucherLegacyDiscount: { $ifNull: ["$voucher.discount", 0] },
        },
      },
      {
        $addFields: {
          shippingNetValue: {
            $subtract: ["$deliveryFeeValue", "$externalShippingFeeValue"],
          },
          discountTotal: {
            $add: [
              "$voucherOrderDiscount",
              "$voucherShippingDiscount",
              "$voucherLegacyDiscount",
            ],
          },
          voucherCount: {
            $add: [
              {
                $cond: [{ $gt: ["$voucherOrderDiscount", 0] }, 1, 0],
              },
              {
                $cond: [{ $gt: ["$voucherShippingDiscount", 0] }, 1, 0],
              },
              {
                $cond: [{ $gt: ["$voucherLegacyDiscount", 0] }, 1, 0],
              },
            ],
          },
          isRevenueStatus: { $in: ["$statusLower", REVENUE_STATUSES] },
          isCancelled: { $in: ["$statusLower", CANCELLED_STATUSES] },
        },
      },
      { $match: getDateMatchStage(range) },
    ];

    const [facetResult] = await orderModel.aggregate([
      ...baseStages,
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: {
                  $sum: { $cond: ["$isRevenueStatus", "$amountValue", 0] },
                },
                totalShipping: {
                  $sum: { $cond: ["$isRevenueStatus", "$shippingNetValue", 0] },
                },
                totalExternalShipping: {
                  $sum: { $cond: ["$isRevenueStatus", "$externalShippingFeeValue", 0] },
                },
                totalDiscount: {
                  $sum: { $cond: ["$isRevenueStatus", "$discountTotal", 0] },
                },
                paidOrders: { $sum: { $cond: ["$isRevenueStatus", 1, 0] } },
                cancelledOrders: { $sum: { $cond: ["$isCancelled", 1, 0] } },
                voucherUsed: { $sum: "$voucherCount" },
              },
            },
          ],
          itemsSold: [
            { $match: { isRevenueStatus: true } },
            { $unwind: "$items" },
            {
              $group: {
                _id: null,
                totalItemsSold: {
                  $sum: { $ifNull: ["$items.quantity", 0] },
                },
              },
            },
          ],
          customers: [
            { $group: { _id: "$userId" } },
            { $count: "totalCustomers" },
          ],
          revenueByDay: [
            { $match: { isRevenueStatus: true } },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$orderDate",
                    timezone: "Asia/Ho_Chi_Minh",
                  },
                },
                value: { $sum: "$amountValue" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          revenueByMonth: [
            { $match: { isRevenueStatus: true } },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m",
                    date: "$orderDate",
                    timezone: "Asia/Ho_Chi_Minh",
                  },
                },
                value: { $sum: "$amountValue" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          revenueByHour: [
            { $match: { isRevenueStatus: true } },
            {
              $group: {
                _id: {
                  $hour: { date: "$orderDate", timezone: "Asia/Ho_Chi_Minh" },
                },
                value: { $sum: "$amountValue" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          orderStatus: [
            {
              $addFields: {
                statusBucket: {
                  $switch: {
                    branches: [
                      {
                        case: { $in: ["$statusLower", ["completed", "delivered"]] },
                        then: "delivered",
                      },
                      {
                        case: { $in: ["$statusLower", CANCELLED_STATUSES] },
                        then: "cancelled",
                      },
                      {
                        case: {
                          $in: [
                            "$statusLower",
                            [
                              "pending",
                              "paid",
                              "shipping",
                              "food processing",
                              "out for delivery",
                              "processing",
                            ],
                          ],
                        },
                        then: "preparing",
                      },
                    ],
                    default: "preparing",
                  },
                },
              },
            },
            { $group: { _id: "$statusBucket", count: { $sum: 1 } } },
          ],
          paymentMethods: [
            {
              $group: {
                _id: "$paymentMethodLower",
                count: { $sum: 1 },
                revenue: {
                  $sum: { $cond: ["$isRevenueStatus", "$amountValue", 0] },
                },
              },
            },
          ],
          topProducts: [
            { $match: { isRevenueStatus: true } },
            { $unwind: "$items" },
            {
              $addFields: {
                itemId: { $ifNull: ["$items._id", "$items.productId"] },
              },
            },
            {
              $group: {
                _id: "$itemId",
                name: { $first: "$items.name" },
                sold: { $sum: { $ifNull: ["$items.quantity", 0] } },
                revenue: {
                  $sum: {
                    $multiply: [
                      { $ifNull: ["$items.price", 0] },
                      { $ifNull: ["$items.quantity", 0] },
                    ],
                  },
                },
              },
            },
            { $sort: { sold: -1 } },
            { $limit: 5 },
          ],
          slowProducts: [
            { $match: { isRevenueStatus: true } },
            { $unwind: "$items" },
            {
              $addFields: {
                itemId: { $ifNull: ["$items._id", "$items.productId"] },
              },
            },
            {
              $group: {
                _id: "$itemId",
                name: { $first: "$items.name" },
                sold: { $sum: { $ifNull: ["$items.quantity", 0] } },
                revenue: {
                  $sum: {
                    $multiply: [
                      { $ifNull: ["$items.price", 0] },
                      { $ifNull: ["$items.quantity", 0] },
                    ],
                  },
                },
              },
            },
            { $sort: { sold: 1 } },
            { $limit: 5 },
          ],
        },
      },
    ]);

    const summary = facetResult?.summary?.[0] || {};
    const itemsSold = facetResult?.itemsSold?.[0] || {};
    const customers = facetResult?.customers?.[0] || {};

    const totalRevenue = normalizeNumber(summary.totalRevenue);
    const totalOrders = normalizeNumber(summary.totalOrders);
    const totalShipping = normalizeNumber(summary.totalShipping);
    const totalExternalShipping = normalizeNumber(summary.totalExternalShipping);
    const totalDiscount = normalizeNumber(summary.totalDiscount);
    const totalItemsSold = normalizeNumber(itemsSold.totalItemsSold);
    const totalCustomers = normalizeNumber(customers.totalCustomers);
    const paidOrders = normalizeNumber(summary.paidOrders);
    const cancelledOrders = normalizeNumber(summary.cancelledOrders);
    const voucherUsed = normalizeNumber(summary.voucherUsed);

    const averageOrderValue = paidOrders > 0 ? totalRevenue / paidOrders : 0;
    const cancelledOrderRate =
      totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

    const orderStatusMap = new Map(
      (facetResult?.orderStatus || []).map((item) => [item._id, item.count])
    );

    const orderStatus = [
      { key: "delivered", label: "Đã giao", count: orderStatusMap.get("delivered") || 0 },
      { key: "preparing", label: "Đang chuẩn bị", count: orderStatusMap.get("preparing") || 0 },
      { key: "cancelled", label: "Đã hủy", count: orderStatusMap.get("cancelled") || 0 },
    ];

    const paymentBuckets = {
      cod: { key: "cod", label: "COD", count: 0, revenue: 0 },
      sepay: { key: "sepay", label: "Sepay", count: 0, revenue: 0 },
      other: { key: "other", label: "Khác", count: 0, revenue: 0 },
    };

    (facetResult?.paymentMethods || []).forEach((item) => {
      const bucket = bucketPaymentMethod(item._id);
      paymentBuckets[bucket].count += normalizeNumber(item.count);
      paymentBuckets[bucket].revenue += normalizeNumber(item.revenue);
    });

    const paymentMethods = Object.values(paymentBuckets);

    const topProducts = (facetResult?.topProducts || []).map((item) => ({
      productId: String(item._id || ""),
      name: item.name || "San pham",
      sold: normalizeNumber(item.sold),
      revenue: normalizeNumber(item.revenue),
    }));

    const slowProducts = (facetResult?.slowProducts || []).map((item) => ({
      productId: String(item._id || ""),
      name: item.name || "San pham",
      sold: normalizeNumber(item.sold),
      revenue: normalizeNumber(item.revenue),
    }));

    const reviewIds = [...topProducts, ...slowProducts]
      .map((item) =>
        mongoose.Types.ObjectId.isValid(String(item.productId))
          ? new mongoose.Types.ObjectId(String(item.productId))
          : null
      )
      .filter(Boolean);

    const reviews = reviewIds.length
      ? await reviewModel.aggregate([
          { $match: { $or: [{ productId: { $in: reviewIds } }, { foodId: { $in: reviewIds } }], status: "approved" } },
          { $group: { _id: { $ifNull: ["$productId", "$foodId"] }, count: { $sum: 1 } } },
        ])
      : [];

    const reviewMap = new Map(reviews.map((item) => [String(item._id), item.count]));

    const enrichReviews = (items) =>
      items.map((item) => ({
        ...item,
        reviewCount: reviewMap.get(String(item.productId)) || 0,
      }));

    const [ratingAgg, customerSegmentAgg] = await Promise.all([
      reviewModel.aggregate([
        {
          $match: {
            status: "approved",
            createdAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: null, avgRating: { $avg: "$rating" } } },
      ]),
      orderModel.aggregate([
        {
          $addFields: {
            orderDate: { $ifNull: ["$date", "$createdAt", "$paidAt"] },
          },
        },
        {
          $group: {
            _id: "$userId",
            firstOrderDate: { $min: "$orderDate" },
            inRangeCount: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ["$orderDate", start] }, { $lte: ["$orderDate", end] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $match: { inRangeCount: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            newCustomers: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ["$firstOrderDate", start] }, { $lte: ["$firstOrderDate", end] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const avgRating = normalizeNumber(ratingAgg?.[0]?.avgRating);
    const segmentData = customerSegmentAgg?.[0] || {};
    const newCustomers = normalizeNumber(segmentData.newCustomers);
    const returningCustomers = Math.max(
      0,
      normalizeNumber(segmentData.totalCustomers) - newCustomers
    );

    const queue = await getQueueStats({ now: new Date() });

    return res.json({
      success: true,
      data: {
        revenue: totalRevenue,
        totalOrders,
        totalCustomers,
        totalProductsSold: totalItemsSold,
        totalDiscount,
        totalShipping,
        totalExternalShipping,
        netRevenue: Math.max(0, totalRevenue - totalDiscount - totalExternalShipping),
        averageOrderValue,
        cancelledOrderRate,
        voucherUsed,
        avgRating,
        newCustomers,
        returningCustomers,
        revenueByDay: toSeries(facetResult?.revenueByDay),
        revenueByMonth: toSeries(facetResult?.revenueByMonth),
        revenueByHour: toHourSeries(facetResult?.revenueByHour),
        orderStatus,
        paymentMethods,
        topProducts: enrichReviews(topProducts),
        slowProducts: enrichReviews(slowProducts),
        queue,
      },
    });
  } catch (error) {
    console.log("STATS DASHBOARD ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch dashboard stats" });
  }
};




const toVnDateString = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(date);

const parseExportRange = (startDate, endDate) => {
  const now = new Date();
  const endStr = String(endDate || toVnDateString(now));
  const startStr = String(
    startDate || toVnDateString(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000))
  );

  const start = new Date(`${startStr}T00:00:00+07:00`);
  const end = new Date(`${endStr}T23:59:59.999+07:00`);

  return { start, end, startStr, endStr };
};

const formatOrderDate = (value) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const exportRevenueReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query || {};
    const { start, end, endStr } = parseExportRange(startDate, endDate);
    const debug = String(req.query?.debug || "").trim() === "1";

    const orders = await orderModel.aggregate([
      {
        $addFields: {
          orderDate: { $ifNull: ["$paidAt", "$date", "$createdAt"] },
          statusLower: { $toLower: { $ifNull: ["$status", "pending"] } },
        },
      },
      {
        $match: {
          orderDate: { $gte: start, $lte: end },
          $or: [{ payment: true }, { statusLower: { $in: REVENUE_STATUSES } }],
        },
      },
      { $sort: { orderDate: 1 } },
    ]);

    const rows = orders.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsCount = items.reduce(
        (sum, item) => sum + toNumber(item?.quantity || 0, 0),
        0
      );
      const productTotal = items.reduce(
        (sum, item) =>
          sum + toNumber(item?.price || 0, 0) * toNumber(item?.quantity || 0, 0),
        0
      );

      const shippingFee = toNumber(order?.deliveryFee ?? order?.shippingFee ?? 0, 0);
      const externalShippingFee = toNumber(order?.externalShippingFee ?? 0, 0);
      const shippingNet = shippingFee - externalShippingFee;
      const discount =
        toNumber(order?.vouchers?.order?.discount || 0, 0) +
        toNumber(order?.vouchers?.shipping?.discount || 0, 0) +
        toNumber(order?.voucher?.discount || 0, 0);

      const total = toNumber(
        order?.amount ?? order?.total ?? productTotal + shippingFee - discount,
        0
      );

      const customerName =
        order?.customerName || order?.address?.name || order?.userName || "Khách hàng";
      const phone = order?.phone || order?.address?.phone || "";

      return {
        date: formatOrderDate(order.orderDate),
        orderCode: order?.orderCode || order?._id || "",
        customer: customerName,
        phone,
        itemsCount,
        productTotal,
        shippingFee,
        externalShippingFee,
        shippingNet,
        discount,
        total,
        payment: order?.paymentMethod || "",
        status: order?.status || "",
      };
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Revenue Report");

    worksheet.columns = [
      { header: "Ngày", key: "date" },
      { header: "Mã đơn", key: "orderCode" },
      { header: "Khách hàng", key: "customer" },
      { header: "SĐT", key: "phone" },
      { header: "Số sản phẩm", key: "itemsCount" },
      { header: "Tiền sản phẩm", key: "productTotal" },
      { header: "Phí ship", key: "shippingFee" },
      { header: "Phí ship thuê ngoài", key: "externalShippingFee" },
      { header: "Phí ship thực nhận", key: "shippingNet" },
      { header: "Giảm giá", key: "discount" },
      { header: "Tổng tiền", key: "total" },
      { header: "Thanh toán", key: "payment" },
      { header: "Trạng thái", key: "status" },
    ];

    let logged = false;
    rows.forEach((row) => {
      if (debug && !logged) {
        const types = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v]));
        console.log("[EXPORT] sample row Revenue Report", row, types);
        logged = true;
      }
      worksheet.addRow(row);
    });
    worksheet.getRow(1).font = { bold: true };

    [
      "itemsCount",
      "productTotal",
      "shippingFee",
      "externalShippingFee",
      "shippingNet",
      "discount",
      "total",
    ].forEach((key) => {
      worksheet.getColumn(key).numFmt = "0";
    });

    worksheet.columns.forEach((col) => {
      let max = col.header ? String(col.header).length : 10;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const cellValue = cell?.value ?? "";
        const len = String(cellValue).length;
        if (len > max) max = len;
      });
      col.width = Math.min(Math.max(max + 2, 12), 40);
    });

    const fileName = `revenue-report-${endStr}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const buffer = await workbook.xlsx.writeBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.log("EXPORT REVENUE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Failed to export revenue report" });
  }
};
