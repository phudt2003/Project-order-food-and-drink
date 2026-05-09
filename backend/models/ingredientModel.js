import mongoose from "mongoose";

const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    stock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

ingredientSchema.index({ name: 1 }, { unique: true });

const ingredientModel =
  mongoose.models.ingredient || mongoose.model("ingredient", ingredientSchema);

export default ingredientModel;

