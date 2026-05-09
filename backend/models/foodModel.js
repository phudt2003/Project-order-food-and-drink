import mongoose from "mongoose";

const sizeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const toppingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "category",
    required: true,
  },
  // Keep text category for storefront compatibility
  category: { type: String, required: true, trim: true },
  type: {
    type: String,
    // Legacy values: Drink/Food
    // New beverage types (do NOT infer by name): milk_tea / coffee / tea / juice
    enum: ["Drink", "Food", "milk_tea", "coffee", "tea", "juice"],
    default: "Drink",
  },
  allowSugar: {
    type: Boolean,
    default: function () {
      return String(this.type || "").toLowerCase() !== "food";
    },
  },
  sweetenerType: {
    type: String,
    enum: ["syrup", "condensed_milk", null],
    default: null,
  },
  sizes: {
    type: [sizeSchema],
    default: [],
  },
  toppings: {
    type: [toppingSchema],
    default: [],
  },
  // Keep for storefront compatibility
  price: { type: Number, required: true, min: 0 },
  // Flash Sale (optional)
  isFlashSale: { type: Boolean, default: false },
  startTime: { type: Date, default: null },
  endTime: { type: Date, default: null },
  flashSaleDiscountType: { type: String, enum: ["amount", "percent", null], default: null },
  flashSaleDiscountValue: { type: Number, default: 0, min: 0 },
  // Cloudinary secure URL (preferred) or legacy local filename (fallback)
  image: { type: String, required: true },
  // Cloudinary public_id for secure deletion/cleanup
  imagePublicId: { type: String, default: "", trim: true, index: true },
  // Selling status
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.pre("validate", function () {
  // If a product doesn't allow sugar, it should not have a sweetenerType.
  if (this.allowSugar === false) {
    this.sweetenerType = null;
  }
});

const productModel = mongoose.models.product || mongoose.model("product", productSchema);

export default productModel;
