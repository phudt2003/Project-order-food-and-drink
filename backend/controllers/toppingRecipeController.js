import toppingModel from "../models/toppingModel.js";
import toppingRecipeModel from "../models/toppingRecipeModel.js";
import ingredientModel from "../models/ingredientModel.js";

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeIngredients = (items) => {
  const list = Array.isArray(items) ? items : [];
  const map = new Map();

  list.forEach((entry) => {
    const ingredientId = String(entry?.ingredient_id || entry?.ingredientId || "").trim();
    const quantity = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(ingredientId) || quantity <= 0) return;

    const unit = String(entry?.unit || "").trim();
    const note = String(entry?.note || "").trim();

    const prev = map.get(ingredientId);
    if (!prev) {
      map.set(ingredientId, { ingredientId, quantity, unit, note });
      return;
    }
    map.set(ingredientId, {
      ingredientId,
      quantity: prev.quantity + quantity,
      unit: prev.unit || unit,
      note: prev.note || note,
    });
  });

  return Array.from(map.values());
};

const upsertToppingRecipe = async (req, res) => {
  try {
    const toppingId = String(req.body?.topping_id || req.body?.toppingId || "").trim();
    if (!isMongoId(toppingId)) {
      return res.status(400).json({ success: false, message: "Topping id không hợp lệ." });
    }

    const topping = await toppingModel.findById(toppingId).lean();
    if (!topping) {
      return res.status(404).json({ success: false, message: "Không tìm thấy topping." });
    }

    const ingredients = normalizeIngredients(req.body?.ingredients);
    const ingredientIds = ingredients.map((i) => i.ingredientId);

    if (ingredientIds.length > 0) {
      const existing = await ingredientModel.find({ _id: { $in: ingredientIds } }, "_id").lean();
      const set = new Set(existing.map((i) => String(i._id)));
      const invalid = ingredientIds.filter((id) => !set.has(String(id)));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, message: "Có nguyên liệu không hợp lệ trong công thức topping." });
      }
    }

    const recipe = await toppingRecipeModel.findOneAndUpdate(
      { toppingId },
      { toppingId, ingredients },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Keep legacy field in sync for fallback readers.
    await toppingModel.findByIdAndUpdate(toppingId, { $set: { ingredients } }, { new: true });

    return res.json({ success: true, data: recipe });
  } catch (error) {
    console.log("UPSERT TOPPING RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể lưu công thức topping." });
  }
};

const getToppingRecipe = async (req, res) => {
  try {
    const toppingId = String(req.params?.toppingId || "").trim();
    if (!isMongoId(toppingId)) {
      return res.status(400).json({ success: false, message: "Topping id không hợp lệ." });
    }

    const recipe = await toppingRecipeModel.findOne({ toppingId }).lean();
    if (recipe) return res.json({ success: true, data: recipe });

    const legacy = await toppingModel.findById(toppingId).lean();
    if (!legacy) return res.status(404).json({ success: false, message: "Không tìm thấy topping." });

    return res.json({
      success: true,
      data: {
        toppingId,
        ingredients: Array.isArray(legacy?.ingredients) ? legacy.ingredients : [],
      },
    });
  } catch (error) {
    console.log("GET TOPPING RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải công thức topping." });
  }
};

const deleteToppingRecipe = async (req, res) => {
  try {
    const toppingId = String(req.params?.toppingId || "").trim();
    if (!isMongoId(toppingId)) {
      return res.status(400).json({ success: false, message: "Topping id không hợp lệ." });
    }

    await toppingRecipeModel.findOneAndDelete({ toppingId });
    await toppingModel.findByIdAndUpdate(toppingId, { $set: { ingredients: [] } }, { new: true });

    return res.json({ success: true, message: "Đã xóa công thức topping." });
  } catch (error) {
    console.log("DELETE TOPPING RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xóa công thức topping." });
  }
};

export { upsertToppingRecipe, getToppingRecipe, deleteToppingRecipe };
