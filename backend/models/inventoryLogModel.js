import mongoose from "mongoose";

const inventoryLogSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ingredient",
      required: true,
    },
    type: {
      type: String,
      enum: ["import", "export", "order"],
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "order", default: null },
    stockBefore: { type: Number, default: null },
    stockAfter: { type: Number, default: null },
  },
  { timestamps: true }
);

inventoryLogSchema.index({ ingredientId: 1, createdAt: -1 });
inventoryLogSchema.index({ type: 1, createdAt: -1 });

const inventoryLogModel =
  mongoose.models.inventoryLog || mongoose.model("inventoryLog", inventoryLogSchema);

export default inventoryLogModel;

