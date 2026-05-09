import mongoose from "mongoose";

const voucherSchema = new mongoose.Schema(
  {
    voucherCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    voucherName: { type: String, required: true, trim: true },

    // Loại phát voucher (manual/birthday/monthly_rank/coin_exchange/flash_sale/new_user/personalized/auto_bad_review)
    issueType: {
      type: String,
      enum: [
        "manual",
        "birthday",
        "comeback",
        "monthly_rank",
        "coin_exchange",
        "flash_sale",
        "new_user",
        "personalized",
        "auto_bad_review",
      ],
      default: "manual",
      index: true,
    },

    // Đối tượng người dùng nhận voucher
    targetUser: {
      type: String,
      enum: ["all", "new", "rank"],
      default: "all",
      index: true,
    },

    // Rank áp dụng (khi targetUser = rank)
    targetRank: {
      type: String,
      enum: ["member", "silver", "gold", "diamond"],
      default: null,
      index: true,
    },

    // Voucher cá nhân hóa: chỉ những user trong danh sách này mới dùng được voucher.
    assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "user", default: [] }],

    // Xu cần để đổi (khi issueType = coin_exchange)
    coinCost: { type: Number, default: 0, min: 0 },

    // Hạn sử dụng sau khi phát (ngày) - dùng cho birthday/monthly...
    expireDays: { type: Number, default: 0, min: 0 },

    // ?i?u ki?n quay l?i: s? ng?y ch?a mua h?ng
    comebackAfterDays: { type: Number, default: 0, min: 0 },

    // Cấu hình trigger động cho voucher tự động (ví dụ: auto_bad_review)
    triggerCondition: {
      ratingLte: { type: Number, default: null, min: 1, max: 5 },
      userRanks: {
        type: [String],
        enum: ["member", "silver", "gold", "diamond"],
        default: [],
      },
      minOrderValue: { type: Number, default: null, min: 0 },
    },

    campaignType: {
      type: String,
      enum: ["manual", "welcome", "birthday", "comeback", "order_value", "delivery", "happy_hour", "loyalty", "monthly"],
      default: "manual",
      index: true,
    },

    voucherType: {
      type: String,
      enum: ["FOOD", "DRINK", "FOOD_DRINK", "SHIPPING"],
      required: true,
      default: "FOOD",
    },

    // Group áp dụng để query/validate nhanh (drinks/foods/ship). Optional.
    applicableGroup: {
      type: String,
      enum: ["drinks", "foods", "ship", null],
      default: null,
      index: true,
    },
    // Legacy field for backward compatibility
    type: { type: String, enum: ["product", "shipping"], default: "product" },

    discountType: { type: String, enum: ["amount", "percent"], default: "amount" },
    discountValue: { type: Number, required: true, min: 0 },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    // Optional daily time window (HH:mm)
    startTime: { type: String, default: "", trim: true },
    endTime: { type: String, default: "", trim: true },

    applyFor: { type: String, enum: ["all", "category", "product"], default: "all" },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "category", default: null },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "product" }],

    minOrderValue: { type: Number, default: 0, min: 0 },
    maxUsage: { type: Number, default: 0, min: 0 },
    usagePerUser: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    usedByUsers: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
          count: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true, minimize: false }
);

voucherSchema.index({ voucherCode: 1 }, { unique: true });

const voucherModel = mongoose.models.voucher || mongoose.model("voucher", voucherSchema);
export default voucherModel;
