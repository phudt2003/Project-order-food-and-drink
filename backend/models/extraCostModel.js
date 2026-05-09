import mongoose from "mongoose";

const extraCostSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["ship"], required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

const extraCostModel =
  mongoose.models.extraCost || mongoose.model("extraCost", extraCostSchema);

export default extraCostModel;
