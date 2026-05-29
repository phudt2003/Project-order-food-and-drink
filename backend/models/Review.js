import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
      default: null,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product",
      required: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    isRewardClaimed: {
      type: Boolean,
      default: false,
      index: true,
    },
    rewardClaimedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
    adminReply: {
      type: String,
      default: "",
      trim: true,
    },
    userAvatar: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

reviewSchema.index({ productId: 1, createdAt: -1 });
// Enforce "1 review per product per order" (legacy reviews without orderId are ignored by this unique index).
reviewSchema.index(
  { userId: 1, orderId: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: { orderId: { $type: "objectId" } },
  }
);

const reviewModel = mongoose.models.review || mongoose.model("review", reviewSchema);

export default reviewModel;
