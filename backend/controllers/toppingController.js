import toppingModel from "../models/toppingModel.js";
import toppingRecipeModel from "../models/toppingRecipeModel.js";
import ingredientModel from "../models/ingredientModel.js";
import foodModel from "../models/foodModel.js";

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const normalizeToppingIngredients = (items) => {
  const list = Array.isArray(items) ? items : [];
  const map = new Map();

  list.forEach((entry) => {
    const ingredientId = String(entry?.ingredientId || "").trim();
    const quantity = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(ingredientId) || quantity <= 0) return;
    map.set(ingredientId, (map.get(ingredientId) || 0) + quantity);
  });

  return [...map.entries()].map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
};

// C?ng th?c topping (cho kho): cho ph?p unit + note.
const normalizeToppingRecipeIngredients = (items) => {
  const list = Array.isArray(items) ? items : [];
  const map = new Map();

  list.forEach((entry) => {
    const ingredientId = String(entry?.ingredientId || "").trim();
    const quantity = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(ingredientId) || quantity <= 0) return;

    const unit = String(entry?.unit || "").trim();
    const note = String(entry?.note || "").trim();

    const prev = map.get(ingredientId);
    if (!prev) {
      map.set(ingredientId, { quantity, unit, note });
      return;
    }

    map.set(ingredientId, {
      quantity: prev.quantity + quantity,
      unit: prev.unit || unit,
      note: prev.note || note,
    });
  });

  return [...map.entries()].map(([ingredientId, value]) => ({
    ingredientId,
    quantity: value.quantity,
    unit: value.unit || "",
    note: value.note || "",
  }));
};

// T? ??ng b? topping t? danh s?ch s?n ph?m (food.toppings).
// M?c ti?u: admin "C?ng th?c" c? th? th?y t?n topping ?? th?m c?ng th?c tr? kho.
const syncToppingsFromFoods = async ({ prune = false } = {}) => {
  const foods = await foodModel.find({}, "toppings").lean();
  const desiredByNormalized = new Map();

  foods.forEach((food) => {
    const list = Array.isArray(food?.toppings) ? food.toppings : [];
    list.forEach((t) => {
      const name = String(t?.name || "").trim();
      const normalized = normalizeName(name);
      if (!name) return;
      const price = Math.max(0, toNumber(t?.price, 0));
      const prev = desiredByNormalized.get(normalized);
      if (!prev) {
        desiredByNormalized.set(normalized, { name, price });
        return;
      }
      desiredByNormalized.set(normalized, {
        name: prev.name || name,
        price: Math.max(prev.price, price),
      });
    });
  });

  const existing = await toppingModel.find({}, "name price ingredients source").lean();
  const existingByNormalized = new Map();

  existing.forEach((topping) => {
    const normalized = normalizeName(topping?.name);
    if (!normalized) return;
    const group = existingByNormalized.get(normalized) || [];
    group.push(topping);
    existingByNormalized.set(normalized, group);
  });

  const ops = [];
  const deleteIds = new Set();

  desiredByNormalized.forEach((desired, normalized) => {
    const group = existingByNormalized.get(normalized) || [];
    if (group.length === 0) {
      ops.push({
        updateOne: {
          filter: { name: desired.name },
          update: { $setOnInsert: { name: desired.name, price: desired.price, ingredients: [], source: "food" } },
          upsert: true,
        },
      });
      return;
    }

    const keeper =
      group.find((item) => String(item?.source || "") === "manual") ||
      group.find((item) => String(item.name) === desired.name) ||
      group[0];
    if (String(keeper?.source || "") !== "manual" && String(keeper?.name || "") !== desired.name) {
      ops.push({
        updateOne: {
          filter: { _id: keeper._id },
          update: { $set: { name: desired.name } },
        },
      });
    }

    group.forEach((item) => {
      if (String(item._id) !== String(keeper._id)) {
        deleteIds.add(String(item._id));
      }
    });
  });

  if (prune) {
    existingByNormalized.forEach((group, normalized) => {
      if (desiredByNormalized.has(normalized)) return;
      group.forEach((item) => {
        if (String(item?.source || "food") === "manual") return;
        deleteIds.add(String(item._id));
      });
    });
  }

  try {
    if (ops.length > 0) {
      await toppingModel.bulkWrite(ops, { ordered: false });
    }
  } catch (error) {
    // Ignore duplicate key errors if there is a race condition.
    const msg = String(error?.message || "");
    if (!msg.includes("E11000")) throw error;
  }

  if (deleteIds.size > 0) {
    await toppingModel.deleteMany({ _id: { $in: Array.from(deleteIds) } });
  }

  return {
    synced: ops.length > 0 || deleteIds.size > 0,
    created: ops.length,
    removed: deleteIds.size,
  };
};

const listToppings = async (_req, res) => {
  try {
    let toppings = await toppingModel.find({}).sort({ name: 1 }).lean();

    // ??ng b? t? food.toppings, ??ng th?i lo?i b? topping kh?ng c?n t?n t?i trong s?n ph?m.
    await syncToppingsFromFoods({ prune: true });
    toppings = await toppingModel.find({}).sort({ name: 1 }).lean();

    const ids = toppings.map((t) => t._id);
    const recipes = ids.length ? await toppingRecipeModel.find({ toppingId: { $in: ids } }).lean() : [];
    const recipeById = new Map(recipes.map((r) => [String(r.toppingId), r]));

    const payload = toppings.map((t) => {
      const recipe = recipeById.get(String(t._id));
      const hasRecipe = Boolean(recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0);
      if (hasRecipe) {
        return { ...t, hasRecipe, ingredients: recipe.ingredients };
      }
      return { ...t, hasRecipe };
    });

    return res.json({ success: true, data: payload });
  } catch (error) {
    console.log("LIST TOPPINGS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Kh?ng th? t?i topping." });
  }
};

const getToppingById = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) return res.status(400).json({ success: false, message: "Topping id kh?ng h?p l?." });

    const topping = await toppingModel.findById(id).lean();
    if (!topping) return res.status(404).json({ success: false, message: "Kh?ng t?m th?y topping." });

    const recipeDoc = await toppingRecipeModel.findOne({ toppingId: id }).lean();
    const recipe = recipeDoc && Array.isArray(recipeDoc.ingredients) && recipeDoc.ingredients.length > 0
      ? recipeDoc.ingredients
      : Array.isArray(topping.ingredients)
        ? topping.ingredients
        : [];

    if (recipe.length > 0) {
      const ingredientIds = recipe.map((r) => String(r?.ingredientId || "")).filter(Boolean);
      const ingredients = await ingredientModel.find({ _id: { $in: ingredientIds } }, "name unit").lean();
      const byId = new Map(ingredients.map((i) => [String(i._id), i]));

      const hydrated = recipe.map((row) => {
        const iid = String(row?.ingredientId || "");
        const info = byId.get(iid) || null;
        return {
          ...row,
          ingredientId: info ? { _id: info._id, name: info.name, unit: info.unit } : row?.ingredientId,
        };
      });

      return res.json({ success: true, data: { ...topping, ingredients: hydrated } });
    }

    return res.json({ success: true, data: topping });
  } catch (error) {
    console.log("GET TOPPING ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Kh?ng th? t?i topping." });
  }
};

// C?p nh?t c?ng th?c topping theo id (ch? c?p nh?t `ingredients`).
const updateToppingRecipe = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) return res.status(400).json({ success: false, message: "Topping id kh?ng h?p l?." });

    const existingTopping = await toppingModel.findById(id).lean();
    if (!existingTopping) return res.status(404).json({ success: false, message: "Kh?ng t?m th?y topping." });

    const ingredients = normalizeToppingRecipeIngredients(req.body?.ingredients);
    const ingredientIds = ingredients.map((item) => item.ingredientId);

    if (ingredientIds.length > 0) {
      const existing = await ingredientModel.find({ _id: { $in: ingredientIds } }, "_id").lean();
      const set = new Set(existing.map((i) => String(i._id)));
      const invalid = ingredientIds.filter((iid) => !set.has(String(iid)));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, message: "C? nguy?n li?u kh?ng h?p l? trong c?ng th?c topping." });
      }
    }

    const recipe = await toppingRecipeModel.findOneAndUpdate(
      { toppingId: id },
      { toppingId: id, ingredients },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, data: recipe });
  } catch (error) {
    console.log("UPDATE TOPPING RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Kh?ng th? l?u c?ng th?c topping." });
  }
};

const deleteToppingRecipe = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) return res.status(400).json({ success: false, message: "Topping id kh?ng h?p l?." });

    await toppingRecipeModel.findOneAndDelete({ toppingId: id });
    await toppingModel.findByIdAndUpdate(id, { $set: { ingredients: [] } }, { new: true });

    return res.json({ success: true, message: "?? x?a c?ng th?c topping." });
  } catch (error) {
    console.log("DELETE TOPPING RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Kh?ng th? x?a c?ng th?c topping." });
  }
};

const upsertTopping = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const price = Math.max(0, toNumber(req.body?.price, 0));
    if (!name) return res.status(400).json({ success: false, message: "Thi?u t?n topping." });

    const ingredients = normalizeToppingIngredients(req.body?.ingredients);
    const ingredientIds = ingredients.map((item) => item.ingredientId);

    if (ingredientIds.length > 0) {
      const existing = await ingredientModel.find({ _id: { $in: ingredientIds } }, "_id").lean();
      const set = new Set(existing.map((i) => String(i._id)));
      const invalid = ingredientIds.filter((id) => !set.has(String(id)));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, message: "C? nguy?n li?u kh?ng h?p l? trong topping." });
      }
    }

    const topping = await toppingModel.findOneAndUpdate(
      { name },
      { name, price },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (ingredients.length > 0) {
      await toppingRecipeModel.findOneAndUpdate(
        { toppingId: topping._id },
        { toppingId: topping._id, ingredients },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return res.json({ success: true, data: topping });
  } catch (error) {
    console.log("UPSERT TOPPING ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Kh?ng th? l?u topping." });
  }
};

const deleteTopping = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) return res.status(400).json({ success: false, message: "Topping id kh?ng h?p l?." });

    const removed = await toppingModel.findByIdAndDelete(id);
    if (!removed) return res.status(404).json({ success: false, message: "Kh?ng t?m th?y topping." });

    return res.json({ success: true, message: "?? x?a topping." });
  } catch (error) {
    console.log("DELETE TOPPING ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Kh?ng th? x?a topping." });
  }
};

export { listToppings, getToppingById, updateToppingRecipe, deleteToppingRecipe, upsertTopping, deleteTopping };
