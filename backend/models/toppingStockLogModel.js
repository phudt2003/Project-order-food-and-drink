import mongoose from "mongoose";

const toppingUsedIngredientSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ingredient",
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const toppingStockLogSchema = new mongoose.Schema(
  {
    toppingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "topping",
      required: true,
    },
    type: {
      type: String,
      enum: ["produce", "order", "adjust"],
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    usedIngredients: { type: [toppingUsedIngredientSchema], default: [] },
    note: { type: String, default: "" },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "order", default: null },
    stockBefore: { type: Number, default: null },
    stockAfter: { type: Number, default: null },
  },
  { timestamps: true }
);

toppingStockLogSchema.index({ toppingId: 1, createdAt: -1 });
toppingStockLogSchema.index({ type: 1, createdAt: -1 });

const toppingStockLogModel =
  mongoose.models.toppingStockLog || mongoose.model("toppingStockLog", toppingStockLogSchema);

export default toppingStockLogModel;

