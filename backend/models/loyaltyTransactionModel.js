import mongoose from "mongoose";

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    amount: { type: Number, required: true },
    reason: {
      type: String,
      enum: ["checkin", "order", "mission", "redeem", "referral", "adjust"],
      required: true,
      index: true,
    },
    ymd: { type: Number, default: 0, index: true },
    meta: { type: Object, default: {} },
    balanceAfter: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false }
);

loyaltyTransactionSchema.index({ userId: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ userId: 1, reason: 1, ymd: 1 });

const loyaltyTransactionModel =
  mongoose.models.loyalty_transaction || mongoose.model("loyalty_transaction", loyaltyTransactionSchema);

export default loyaltyTransactionModel;

