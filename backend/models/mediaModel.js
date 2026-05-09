import mongoose from "mongoose";

const linkedToSchema = new mongoose.Schema(
  {
    model: { type: String, default: "" },
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    field: { type: String, default: "" },
  },
  { _id: false }
);

const mediaSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    url: { type: String, required: true, trim: true },
    resourceType: { type: String, default: "image", trim: true },
    format: { type: String, default: "", trim: true },
    bytes: { type: Number, default: 0, min: 0 },
    width: { type: Number, default: 0, min: 0 },
    height: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["temporary", "used"],
      default: "temporary",
      index: true,
    },
    expiresAt: { type: Date, default: null, index: true },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
      index: true,
    },
    createdByAdmin: { type: String, default: "", trim: true },
    linkedTo: { type: linkedToSchema, default: () => ({}) },
  },
  { timestamps: true }
);

mediaSchema.index({ status: 1, expiresAt: 1 });

const mediaModel = mongoose.models.media || mongoose.model("media", mediaSchema);

export default mediaModel;

