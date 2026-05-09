import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    size: {
      type: String,
      default: "",
    },
    toppings: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    sugarLevel: {
      type: String,
      default: "",
    },
    iceLevel: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const cartModel = mongoose.models.cart || mongoose.model("cart", cartSchema);

export default cartModel;
