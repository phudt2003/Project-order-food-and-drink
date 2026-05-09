import mongoose from "mongoose";

const exportLogSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    itemType: { type: String, enum: ["nguyen_lieu", "thanh_pham", "san_pham"], required: true },
    quantity: { type: Number, required: true, min: 0 },
    reason: { type: String, enum: ["hu_hong", "do_vo", "khac"], default: "khac" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.export_log || mongoose.model("export_log", exportLogSchema);
