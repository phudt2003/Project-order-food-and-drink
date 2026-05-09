import mongoose from "mongoose";

const toppingRecipeIngredientSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ingredient",
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    // Keep optional unit/note to preserve legacy recipe details.
    unit: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const toppingRecipeSchema = new mongoose.Schema(
  {
    toppingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "topping",
      required: true,
      unique: true,
    },
    ingredients: { type: [toppingRecipeIngredientSchema], default: [] },
  },
  { timestamps: true }
);

toppingRecipeSchema.index({ toppingId: 1 }, { unique: true });

const toppingRecipeModel =
  mongoose.models.topping_recipe || mongoose.model("topping_recipe", toppingRecipeSchema);

export default toppingRecipeModel;
