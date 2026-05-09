import mongoose from "mongoose";

const userVoucherSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },

    rewardType: {
      type: String,
      enum: [
        "manual",
        "welcome",
        "birthday",
        "comeback",
        "order_value",
        "delivery",
        "happy_hour",
        "loyalty",
        "monthly",
        "bad_review",
      ],
      required: true,
      default: "birthday",
      index: true,
    },
    rewardYear: { type: Number, required: true, index: true },

    voucherCode: { type: String, required: true, trim: true, uppercase: true },
    voucherName: { type: String, required: true, trim: true },

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
    // Legacy field for backward compatibility with frontend/order schema
    type: { type: String, enum: ["product", "shipping"], default: "product" },

    discountType: { type: String, enum: ["amount", "percent"], default: "amount" },
    discountValue: { type: Number, required: true, min: 0 },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    // Optional daily time window (HH:mm)
    startTime: { type: String, default: "", trim: true },
    endTime: { type: String, default: "", trim: true },

    applyFor: { type: String, enum: ["all", "category", "product"], default: "all" },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "category", default: null },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "product" }],

    minOrderValue: { type: Number, default: 0, min: 0 },
    maxUsage: { type: Number, default: 1, min: 0 },
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

userVoucherSchema.index({ userId: 1, rewardType: 1, rewardYear: 1 }, { unique: true });

const userVoucherModel =
  mongoose.models.user_voucher || mongoose.model("user_voucher", userVoucherSchema);

export default userVoucherModel;
