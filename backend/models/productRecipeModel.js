import mongoose from "mongoose";

const productRecipeItemSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ingredient",
      default: null,
    },
    toppingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "topping",
      default: null,
    },
    quantity: { type: Number, required: true, min: 0 },
    // Preserve sweetener flag if product recipe stores it.
    isSweetener: { type: Boolean, default: false },
  },
  { _id: false }
);

const productRecipeSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product",
      required: true,
      unique: true,
    },
    // This list can include ingredientId or toppingId per row.
    ingredients: { type: [productRecipeItemSchema], default: [] },
  },
  { timestamps: true }
);

productRecipeSchema.index({ productId: 1 }, { unique: true });

const productRecipeModel =
  mongoose.models.product_recipe || mongoose.model("product_recipe", productRecipeSchema);

export default productRecipeModel;
