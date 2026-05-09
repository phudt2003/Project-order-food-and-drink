import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, trim: true, unique: true },
    // Cloudinary secure URL (preferred) or legacy/placeholder string
    image: { type: String, default: "" },
    // Cloudinary public_id for secure deletion/cleanup
    imagePublicId: { type: String, default: "", trim: true, index: true },
    description: { type: String, default: "" },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const categoryModel =
  mongoose.models.category || mongoose.model("category", categorySchema);

export default categoryModel;
