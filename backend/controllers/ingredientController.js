import ingredientModel from "../models/ingredientModel.js";
import productRecipeModel from "../models/productRecipeModel.js";
import toppingRecipeModel from "../models/toppingRecipeModel.js";
import toppingModel from "../models/toppingModel.js";
import inventoryLogModel from "../models/inventoryLogModel.js";
import mongoose from "mongoose";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const createIngredient = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const unit = String(req.body?.unit || "").trim();
    const stock = Math.max(0, toNumber(req.body?.stock, 0));
    const minStock = Math.max(0, toNumber(req.body?.minStock, 0));

    if (!name) return res.status(400).json({ success: false, message: "Tên nguyên liệu là bắt buộc." });
    if (!unit) return res.status(400).json({ success: false, message: "Đơn vị là bắt buộc." });

    const ingredient = await ingredientModel.create({ name, unit, stock, minStock });
    return res.json({ success: true, data: ingredient });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Nguyên liệu đã tồn tại." });
    }
    console.log("CREATE INGREDIENT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tạo nguyên liệu." });
  }
};

const listIngredients = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    const lowStockOnly = String(req.query?.lowStockOnly || "").trim() === "1";

    const filter = {};
    if (q) filter.name = { $regex: q, $options: "i" };

    let ingredients = await ingredientModel.find(filter).sort({ createdAt: -1 }).lean();
    if (lowStockOnly) {
      ingredients = ingredients.filter((item) => Number(item.stock || 0) <= Number(item.minStock || 0));
    }

    return res.json({ success: true, data: ingredients });
  } catch (error) {
    console.log("LIST INGREDIENTS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải danh sách nguyên liệu." });
  }
};

const updateIngredient = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) return res.status(400).json({ success: false, message: "Ingredient id không hợp lệ." });

    const payload = {};
    if (req.body?.name !== undefined) payload.name = String(req.body.name || "").trim();
    if (req.body?.unit !== undefined) payload.unit = String(req.body.unit || "").trim();
    if (req.body?.minStock !== undefined) payload.minStock = Math.max(0, toNumber(req.body.minStock, 0));

    if (payload.name !== undefined && !payload.name) {
      return res.status(400).json({ success: false, message: "Tên nguyên liệu không hợp lệ." });
    }
    if (payload.unit !== undefined && !payload.unit) {
      return res.status(400).json({ success: false, message: "Đơn vị không hợp lệ." });
    }

    const ingredient = await ingredientModel.findByIdAndUpdate(id, payload, { new: true });
    if (!ingredient) return res.status(404).json({ success: false, message: "Không tìm thấy nguyên liệu." });

    return res.json({ success: true, data: ingredient });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Tên nguyên liệu đã tồn tại." });
    }
    console.log("UPDATE INGREDIENT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể cập nhật nguyên liệu." });
  }
};

const deleteIngredient = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) return res.status(400).json({ success: false, message: "Ingredient id không hợp lệ." });

    const ingredientObjectId = new mongoose.Types.ObjectId(id);
    const ingredientRefFilter = {
      $or: [
        { "ingredients.ingredientId": ingredientObjectId },
        { "ingredients.ingredientId": id },
      ],
    };

    const [usedInProductRecipes, usedInToppingRecipes, usedInLegacyToppings] = await Promise.all([
      productRecipeModel.countDocuments(ingredientRefFilter),
      toppingRecipeModel.countDocuments(ingredientRefFilter),
      toppingModel.countDocuments(ingredientRefFilter),
    ]);

    if (usedInProductRecipes + usedInToppingRecipes + usedInLegacyToppings > 0) {
      return res.status(409).json({
        success: false,
        message:
          `Nguyên liệu đang được dùng trong công thức (SP: ${usedInProductRecipes}, Topping: ${usedInToppingRecipes + usedInLegacyToppings}), không thể xóa.`,
      });
    }

    const hasLogs = await inventoryLogModel.countDocuments({
      $or: [{ ingredientId: ingredientObjectId }, { ingredientId: id }],
    });
    if (hasLogs > 0) {
      return res.status(409).json({
        success: false,
        message: "Nguyên liệu đã có lịch sử kho, không thể xóa.",
      });
    }

    const deleted = await ingredientModel.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Không tìm thấy nguyên liệu." });

    return res.json({ success: true, message: "Đã xóa nguyên liệu." });
  } catch (error) {
    console.log("DELETE INGREDIENT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xóa nguyên liệu." });
  }
};

export { createIngredient, listIngredients, updateIngredient, deleteIngredient };

