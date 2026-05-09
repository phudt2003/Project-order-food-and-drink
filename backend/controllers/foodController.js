import foodModel from "../models/foodModel.js";
import categoryModel from "../models/categoryModel.js";
import productRecipeModel from "../models/productRecipeModel.js";
import { ensureUncategorizedCategory } from "./categoryController.js";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { uploadsDir } from "../utils/paths.js";
import orderModel from "../models/orderModel.js";
import { uploadImageBuffer, deleteByPublicId } from "../services/cloudinaryService.js";
import { claimMediaAsUsed, createTemporaryMedia, deleteMediaRecord } from "../services/mediaService.js";

const parseDynamicList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeItems = (items) =>
  items
    .map((item) => ({
      name: String(item?.name || "").trim(),
      price: Number(item?.price),
    }))
    .filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0);

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const findDuplicateNames = (items) => {
  const seen = new Set();
  const duplicates = new Set();
  const list = Array.isArray(items) ? items : [];

  list.forEach((item) => {
    const name = normalizeName(item?.name);
    if (!name) return;
    if (seen.has(name)) {
      duplicates.add(name);
      return;
    }
    seen.add(name);
  });

  return Array.from(duplicates);
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (["true", "1", "yes", "y", "on"].includes(text)) return true;
  if (["false", "0", "no", "n", "off"].includes(text)) return false;
  return null;
};

const normalizeProductType = (raw) => {
  const text = String(raw || "").trim();
  if (text === "Food") return "Food";
  if (text === "Drink") return "Drink";

  const lower = text.toLowerCase();
  if (["milk_tea", "coffee", "tea", "juice"].includes(lower)) return lower;
  return "Drink";
};

const normalizeSweetenerType = (raw) => {
  const text = String(raw || "").trim().toLowerCase();
  if (text === "syrup") return "syrup";
  if (text === "condensed_milk") return "condensed_milk";
  return null;
};

const normalizeNullableDate = (value) => {
  if (value === null) return null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const d = new Date(text);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
};

const normalizeFlashDiscountType = (raw) => {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "amount") return "amount";
  if (text === "percent") return "percent";
  return null;
};

const normalizeProductActive = (value) => {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (["true", "1", "yes", "y", "on", "active", "selling", "dang_ban", "dangban"].includes(text)) return true;
  if (["false", "0", "no", "n", "off", "inactive", "stopped", "stop", "ngung_ban", "ngungban"].includes(text)) return false;
  return null;
};

const getMinSizePrice = (sizes) => {
  if (!sizes.length) return 0;
  return Math.min(...sizes.map((size) => size.price));
};

const resolveCategory = async (categoryId) => {
  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    const found = await categoryModel.findById(categoryId);
    if (found) return found;
  }
  return ensureUncategorizedCategory();
};

const actorFromRequest = (req) => ({
  userId: req.userId || null,
  adminUsername: req.admin?.username || "admin",
});

const isImageReferencedInOrders = async ({ url, publicId }) => {
  const imageUrl = String(url || "").trim();
  const pid = String(publicId || "").trim();

  if (!imageUrl && !pid) return false;

  const match = {
    $or: [
      ...(imageUrl ? [{ "items.image": imageUrl }] : []),
      ...(pid ? [{ "items.imagePublicId": pid }] : []),
    ],
  };

  if (!match.$or.length) return false;
  return await orderModel.exists(match);
};

// add food item

const addFood = async (req,res) => {
  try {
    let imageUrl = String(req.body?.imageUrl || "").trim();
    let imagePublicId = String(req.body?.imagePublicId || "").trim();

    if (req.file?.buffer) {
      const uploaded = await uploadImageBuffer({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        tags: ["food"],
      });
      imageUrl = uploaded.secure_url;
      imagePublicId = uploaded.public_id;
      await createTemporaryMedia({ cloudinaryResult: uploaded, actor: actorFromRequest(req) }).catch(() => {});
    }

    if (!imageUrl || !imagePublicId) {
      return res.json({ success: false, message: "Image (url + publicId) is required" });
    }

    const sizes = normalizeItems(parseDynamicList(req.body.sizes));
    const type = normalizeProductType(req.body.type);
    const toppings = normalizeItems(parseDynamicList(req.body.toppings));
    const duplicateToppings = findDuplicateNames(toppings);
    if (duplicateToppings.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Topping bị trùng tên.",
        details: { duplicateToppings },
      });
    }
    const price = getMinSizePrice(sizes);
    const category = await resolveCategory(req.body.categoryId);

    const allowSugarFromReq = normalizeBoolean(req.body.allowSugar);
    const allowSugar = allowSugarFromReq ?? String(type).toLowerCase() !== "food";
    const sweetenerType = allowSugar ? (normalizeSweetenerType(req.body.sweetenerType) || "syrup") : null;

    const isFlashSale = normalizeBoolean(req.body.isFlashSale) ?? false;
    const startTime = normalizeNullableDate(req.body.startTime);
    const endTime = normalizeNullableDate(req.body.endTime);
    const flashSaleDiscountType = normalizeFlashDiscountType(req.body.flashSaleDiscountType);
    const flashSaleDiscountValue = Math.max(0, Number(req.body.flashSaleDiscountValue || 0) || 0);

    const food = new foodModel({
      name: req.body.name,
      description: req.body.description,
      categoryId: category._id,
      category: category.name,
      type,
      allowSugar,
      sweetenerType,
      sizes,
      toppings,
      price,
      isFlashSale,
      startTime,
      endTime,
      flashSaleDiscountType,
      flashSaleDiscountValue,
      image: imageUrl,
      imagePublicId,
    });

    await food.save();

    await claimMediaAsUsed({
      publicId: imagePublicId,
      url: imageUrl,
      actor: actorFromRequest(req),
      linkedTo: { model: "product", id: food._id, field: "image" },
    });

    res.json({ success: true, message: "Product added", data: food });
  } catch (error) {
    console.log("ADD PRODUCT ERROR:", error?.message || error);
    res.status(500).json({
      success: false,
      message: error?.message || "Error",
      details: process.env.NODE_ENV === "production" ? undefined : error?.stack || "",
    });
  }
};

// all food list
const listFood = async (req,res) => {
    try {
        const foods = await foodModel
          .find({})
          .populate("categoryId", "name")
          .sort({ createdAt: -1 })
          .lean();

        const primaryRecipes = await productRecipeModel.find({}, "productId").lean();
        const recipeSet = new Set(primaryRecipes.map((r) => String(r.productId)));
        
        const payload = foods.map(f => ({
          ...f,
          hasRecipe: recipeSet.has(String(f._id))
        }));

        res.json({success:true,data:payload})
    } catch (error) {
        console.log(error);
        res.json({success:false,message:"Error"})
    }
}

const getFoodById = async (req, res) => {
  try {
    const food = await foodModel.findById(req.params.id).populate("categoryId", "name").lean();
    if (!food) {
      return res.json({ success: false, message: "Product not found" });
    }
    
    // Check if it has a recipe
    const primary = await productRecipeModel.exists({ productId: String(food._id) });
    food.hasRecipe = Boolean(primary);

    res.json({ success: true, data: food });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

const updateFood = async (req, res) => {
  try {
    const existing = await foodModel.findById(req.params.id);
    if (!existing) {
      return res.json({ success: false, message: "Product not found" });
    }

    let nextImageUrl = String(req.body?.imageUrl || "").trim();
    let nextImagePublicId = String(req.body?.imagePublicId || "").trim();

    if (req.file?.buffer) {
      const uploaded = await uploadImageBuffer({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        tags: ["food"],
      });
      nextImageUrl = uploaded.secure_url;
      nextImagePublicId = uploaded.public_id;
      await createTemporaryMedia({ cloudinaryResult: uploaded, actor: actorFromRequest(req) }).catch(() => {});
    } else if (nextImageUrl || nextImagePublicId) {
      if (!nextImageUrl || !nextImagePublicId) {
        return res.status(400).json({ success: false, message: "imageUrl and imagePublicId are required together" });
      }
    }

    const sizes = normalizeItems(parseDynamicList(req.body.sizes));
    const type = normalizeProductType(req.body.type);
    const toppings = normalizeItems(parseDynamicList(req.body.toppings));
    const duplicateToppings = findDuplicateNames(toppings);
    if (duplicateToppings.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Topping bị trùng tên.",
        details: { duplicateToppings },
      });
    }
    const price = getMinSizePrice(sizes);
    const category = await resolveCategory(req.body.categoryId);

    const allowSugarFromReq = normalizeBoolean(req.body.allowSugar);
    const allowSugar = allowSugarFromReq ?? String(type).toLowerCase() !== "food";
    const sweetenerType = allowSugar ? (normalizeSweetenerType(req.body.sweetenerType) || "syrup") : null;

    const payload = {
      name: req.body.name,
      description: req.body.description,
      categoryId: category._id,
      category: category.name,
      type,
      allowSugar,
      sweetenerType,
      sizes,
      toppings,
      price,
    };

    const isFlashSale = normalizeBoolean(req.body.isFlashSale);
    if (isFlashSale !== null) payload.isFlashSale = isFlashSale;

    if (Object.prototype.hasOwnProperty.call(req.body, "startTime")) {
      payload.startTime = normalizeNullableDate(req.body.startTime);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "endTime")) {
      payload.endTime = normalizeNullableDate(req.body.endTime);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "flashSaleDiscountType")) {
      payload.flashSaleDiscountType = normalizeFlashDiscountType(req.body.flashSaleDiscountType);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "flashSaleDiscountValue")) {
      payload.flashSaleDiscountValue = Math.max(0, Number(req.body.flashSaleDiscountValue || 0) || 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "isActive")) {
      const isActive = normalizeProductActive(req.body.isActive);
      if (isActive !== null) payload.isActive = isActive;
    }

    const isNewImage = Boolean(nextImageUrl && nextImagePublicId);
    if (isNewImage) {
      payload.image = nextImageUrl;
      payload.imagePublicId = nextImagePublicId;
    }

    const updated = await foodModel.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (isNewImage) {
      if (existing.imagePublicId && existing.imagePublicId !== nextImagePublicId) {
        const referenced = await isImageReferencedInOrders({
          url: existing.image,
          publicId: existing.imagePublicId,
        });
        if (!referenced) {
          await deleteByPublicId({ publicId: existing.imagePublicId, resourceType: "image" }).catch(() => {});
          await deleteMediaRecord(existing.imagePublicId).catch(() => {});
        }
      } else if (!existing.imagePublicId && existing.image) {
        // Legacy local file cleanup
        fs.unlink(path.join(uploadsDir, existing.image), () => {});
      }

      await claimMediaAsUsed({
        publicId: nextImagePublicId,
        url: nextImageUrl,
        actor: actorFromRequest(req),
        linkedTo: { model: "product", id: existing._id, field: "image" },
      });
    }

    res.json({ success: true, message: "Product updated", data: updated });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

const updateFoodStatus = async (req, res) => {
  try {
    const isActive = normalizeProductActive(req.body?.isActive);
    if (isActive === null) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const updated = await foodModel.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    );

    if (!updated) {
      return res.json({ success: false, message: "Product not found" });
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.log("UPDATE PRODUCT STATUS ERROR:", error?.message || error);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

// remove food item
const removeFood = async (req,res) => {
    try {
        const food = await foodModel.findById(req.body.id);
        if (!food) {
          return res.json({ success: false, message: "Product not found" });
        }

        if (food.imagePublicId) {
          const referenced = await isImageReferencedInOrders({
            url: food.image,
            publicId: food.imagePublicId,
          });
          if (!referenced) {
            await deleteByPublicId({ publicId: food.imagePublicId, resourceType: "image" }).catch(() => {});
            await deleteMediaRecord(food.imagePublicId).catch(() => {});
          }
        } else if (food.image) {
          fs.unlink(path.join(uploadsDir, food.image), () => {});
        }

        await foodModel.findByIdAndDelete(req.body.id);
        res.json({success:true,message:"Food Removed"})
    } catch (error) {
        console.log(error);
        res.json({success:false,message:"Error"})
    }
}


export {addFood,listFood,removeFood,getFoodById,updateFood,updateFoodStatus}
