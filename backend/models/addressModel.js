import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    detail_address: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    is_default: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
  },
  { minimize: false }
);

const addressModel = mongoose.models.address || mongoose.model("address", addressSchema);
export default addressModel;
