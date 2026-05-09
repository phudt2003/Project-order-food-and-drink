import foodModel from "../models/foodModel.js";
import ingredientModel from "../models/ingredientModel.js";
import productRecipeModel from "../models/productRecipeModel.js";
import toppingModel from "../models/toppingModel.js";

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeIngredientItems = (items) => {
  const list = Array.isArray(items) ? items : [];
  const map = new Map();

  list.forEach((entry) => {
    const ingredientId = String(entry?.ingredient_id || entry?.ingredientId || "").trim();
    const quantity = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(ingredientId) || quantity <= 0) return;

    const prev = map.get(ingredientId);
    if (!prev) {
      map.set(ingredientId, { ingredientId, quantity, isSweetener: Boolean(entry?.isSweetener) });
      return;
    }
    map.set(ingredientId, {
      ingredientId,
      quantity: prev.quantity + quantity,
      isSweetener: prev.isSweetener || Boolean(entry?.isSweetener),
    });
  });

  return Array.from(map.values());
};

const normalizeToppingItems = (items) => {
  const list = Array.isArray(items) ? items : [];
  const map = new Map();

  list.forEach((entry) => {
    const toppingId = String(entry?.topping_id || entry?.toppingId || "").trim();
    const quantity = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(toppingId) || quantity <= 0) return;
    map.set(toppingId, (map.get(toppingId) || 0) + quantity);
  });

  return Array.from(map.entries()).map(([toppingId, quantity]) => ({ toppingId, quantity }));
};

const buildRecipeItems = ({ ingredients, toppings }) => [
  ...ingredients.map((row) => ({
    ingredientId: row.ingredientId,
    quantity: row.quantity,
    isSweetener: Boolean(row.isSweetener),
  })),
  ...toppings.map((row) => ({
    toppingId: row.toppingId,
    quantity: row.quantity,
  })),
];

const serializeForList = (recipeDoc, productName = "N/A") => {
  const rows = Array.isArray(recipeDoc?.ingredients) ? recipeDoc.ingredients : [];
  const ingredients = rows
    .filter((r) => r?.ingredientId)
    .map((r) => ({
      ingredientId: r.ingredientId,
      quantity: r.quantity,
      isSweetener: Boolean(r.isSweetener),
    }));

  return {
    productId: recipeDoc?.productId || null,
    productName,
    ingredients,
    updatedAt: recipeDoc?.updatedAt || null,
  };
};

const upsertProductRecipe = async (req, res) => {
  try {
    const productId = String(req.body?.product_id || req.body?.productId || "").trim();
    if (!isMongoId(productId)) {
      return res.status(400).json({ success: false, message: "Product id không hợp lệ." });
    }

    const product = await foodModel.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm." });
    }

    const ingredients = normalizeIngredientItems(req.body?.ingredients);
    const toppings = normalizeToppingItems(req.body?.toppings);

    const ingredientIds = ingredients.map((i) => i.ingredientId);
    if (ingredientIds.length > 0) {
      const existing = await ingredientModel.find({ _id: { $in: ingredientIds } }, "_id").lean();
      const set = new Set(existing.map((i) => String(i._id)));
      const invalid = ingredientIds.filter((id) => !set.has(String(id)));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, message: "Có nguyên liệu không hợp lệ trong công thức." });
      }
    }

    const toppingIds = toppings.map((t) => t.toppingId);
    if (toppingIds.length > 0) {
      const existing = await toppingModel.find({ _id: { $in: toppingIds } }, "_id").lean();
      const set = new Set(existing.map((t) => String(t._id)));
      const invalid = toppingIds.filter((id) => !set.has(String(id)));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, message: "Có topping không hợp lệ trong công thức." });
      }
    }

    const items = buildRecipeItems({ ingredients, toppings });

    const recipe = await productRecipeModel.findOneAndUpdate(
      { productId },
      { productId, ingredients: items },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, data: recipe });
  } catch (error) {
    console.log("UPSERT PRODUCT RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể lưu công thức sản phẩm." });
  }
};

const listProductRecipes = async (req, res) => {
  try {
    const productId = String(req.query?.productId || "").trim();
    const filter = {};
    if (productId) {
      if (!isMongoId(productId)) {
        return res.status(400).json({ success: false, message: "Product id không hợp lệ." });
      }
      filter.productId = productId;
    }

    const docs = await productRecipeModel.find(filter).lean();
    const productIds = docs.map((d) => String(d?.productId || "")).filter(Boolean);
    const products = productIds.length
      ? await foodModel.find({ _id: { $in: productIds } }, "name").lean()
      : [];
    const productById = new Map(products.map((p) => [String(p._id), String(p?.name || "").trim() || "N/A"]));

    const payload = docs
      .map((doc) => serializeForList(doc, productById.get(String(doc?.productId || "")) || "N/A"))
      .sort((a, b) => {
        const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

    return res.json({ success: true, data: payload });
  } catch (error) {
    console.log("LIST PRODUCT RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải danh sách công thức sản phẩm." });
  }
};

const getProductRecipe = async (req, res) => {
  try {
    const productId = String(req.params?.productId || "").trim();
    if (!isMongoId(productId)) {
      return res.status(400).json({ success: false, message: "Product id không hợp lệ." });
    }

    const primary = await productRecipeModel.findOne({ productId }).lean();
    if (!primary) return res.json({ success: true, data: null });

    const rows = Array.isArray(primary?.ingredients) ? primary.ingredients : [];
    const ingredients = rows
      .filter((r) => r?.ingredientId)
      .map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity, isSweetener: Boolean(r.isSweetener) }));
    const toppings = rows
      .filter((r) => r?.toppingId)
      .map((r) => ({ toppingId: r.toppingId, quantity: r.quantity }));

    return res.json({
      success: true,
      data: { productId, ingredients, toppings },
    });
  } catch (error) {
    console.log("GET PRODUCT RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải công thức sản phẩm." });
  }
};

const deleteProductRecipe = async (req, res) => {
  try {
    const productId = String(req.params?.productId || "").trim();
    if (!isMongoId(productId)) {
      return res.status(400).json({ success: false, message: "Product id không hợp lệ." });
    }

    await productRecipeModel.findOneAndDelete({ productId });

    return res.json({ success: true, message: "Đã xóa công thức sản phẩm." });
  } catch (error) {
    console.log("DELETE PRODUCT RECIPE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xóa công thức sản phẩm." });
  }
};

export { listProductRecipes, upsertProductRecipe, getProductRecipe, deleteProductRecipe };
