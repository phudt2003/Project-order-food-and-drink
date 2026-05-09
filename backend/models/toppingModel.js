import mongoose from "mongoose";

const toppingIngredientSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ingredient",
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    // Đơn vị hiển thị trong công thức (khuyến nghị khớp với ingredient.unit để trừ kho đúng).
    unit: { type: String, default: "", trim: true },
    // Ghi chú thao tác (optional) - không ảnh hưởng trừ kho.
    note: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const toppingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "", trim: true },
    stock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    source: { type: String, enum: ["food", "manual"], default: "food" },
    // "Recipe" for topping: added ingredients, never scaled by sugar level.
    ingredients: { type: [toppingIngredientSchema], default: [] },
  },
  { timestamps: true }
);

toppingSchema.index({ name: 1 }, { unique: true });

const toppingModel = mongoose.models.topping || mongoose.model("topping", toppingSchema);

export default toppingModel;
