import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    role: {
      type: String,
      trim: true,
      lowercase: true,
      default: "admin",
    },
    passwordHash: {
      type: String,
      required: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const adminModel = mongoose.models.admin || mongoose.model("admin", adminSchema);

export default adminModel;
