import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "" },
    productId: { type: String, default: "" },
    name: { type: String, default: "" },
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    image: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    type: { type: String, default: "" },
    size: { type: String, default: "" },
    sugarLevel: { type: String, default: "" },
    iceLevel: { type: String, default: "" },
    toppings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    note: { type: String, default: "" },
  },
  { _id: false, strict: false }
);

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },

  orderCode: {
    type: String,
    default: "",
  },

  customerName: {
    type: String,
    default: "",
  },

  phone: {
    type: String,
    default: "",
  },

  addressText: {
    type: String,
    default: "",
  },

  total: {
    type: Number,
    default: 0,
  },

  items: {
    type: [orderItemSchema],
    default: [],
  },

  note: {
    type: String,
    default: "",
  },

  amount: {
    type: Number,
    required: true,
  },

  paymentMethod: {
    type: String,
    default: "sepay",
  },

  paymentTransactionId: {
    type: String,
    default: "",
  },

  paymentReferenceCode: {
    type: String,
    default: "",
  },

  lastWebhookAt: {
    type: Date,
    default: null,
  },

  transferContent: {
    type: String,
    default: "",
  },

  qrCode: {
    type: String,
    default: "",
  },

  address: {
    type: Object,
    required: true,
  },

  storeLocation: {
    lat: Number,
    lng: Number,
  },

  deliveryAddress: {
    text: String,
    lat: Number,
    lng: Number,
  },

  distanceKm: {
    type: Number,
    default: 0,
  },
  distance: {
    type: Number,
    default: 0,
  },
  deliveryTime: {
    type: Number,
    default: 0,
  },
  prepTime: {
    type: Number,
    default: 0,
  },
  queueDelay: {
    type: Number,
    default: 0,
  },
  eta: {
    type: Number,
    default: 0,
  },
  ordersBefore: {
    type: Number,
    default: 0,
  },
  startPrepAt: {
    type: Date,
    default: null,
  },
  startDeliveryAt: {
    type: Date,
    default: null,
  },
  finishAt: {
    type: Date,
    default: null,
  },

  deliveryFee: {
    type: Number,
    default: 0,
  },

  // External shipping fee (paid to delivery partner)
  externalShippingFee: {
    type: Number,
    default: 0,
  },

  vouchers: {
    order: {
      voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "voucher", default: null },
      voucherCode: { type: String, default: "" },
      voucherType: { type: String, default: "" },
      discount: { type: Number, default: 0 },
    },
    shipping: {
      voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "voucher", default: null },
      voucherCode: { type: String, default: "" },
      voucherType: { type: String, default: "" },
      discount: { type: Number, default: 0 },
    },
  },

  status: {
    type: String,
    default: "pending",
  },

  completedBy: {
    type: String,
    enum: ["user", "admin", "system"],
    default: null,
  },

  completedAt: {
    type: Date,
    default: null,
  },

  deliveredAt: {
    type: Date,
    default: null,
  },

  date: {
    type: Date,
    default: Date.now,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  paidAt: {
    type: Date,
    default: null,
  },

  payment: {
    type: Boolean,
    default: false,
  },

  inventory: {
    status: {
      type: String,
      enum: ["pending", "deducted", "failed"],
      default: "pending",
    },
    deductedAt: {
      type: Date,
      default: null,
    },
    error: {
      type: String,
      default: "",
    },
  },

  parentOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "order",
    default: null,
  },
  type: {
    type: String,
    enum: ["MAIN", "ADD_ON"],
    default: "MAIN",
  },
  paymentStatus: {
    type: String,
    enum: ["UNPAID", "PAID"],
    default: "UNPAID",
  },
});

// Query helpers for queue/ETA logic
orderSchema.index({ finishAt: 1 });
orderSchema.index({ startDeliveryAt: 1 });
orderSchema.index({ payment: 1, startDeliveryAt: 1 });
orderSchema.index({ parentOrderId: 1 });
orderSchema.index({ paymentMethod: 1, payment: 1, status: 1, createdAt: 1 });

const orderModel =
  mongoose.models.order || mongoose.model("order", orderSchema);

export default orderModel;
