import mongoose from "mongoose";
import ingredientModel from "../models/ingredientModel.js";
import productRecipeModel from "../models/productRecipeModel.js";
import productModel from "../models/productModel.js";
import toppingModel from "../models/toppingModel.js";
import inventoryLogModel from "../models/inventoryLogModel.js";
import toppingStockLogModel from "../models/toppingStockLogModel.js";

// % sugar level is UI-only. Backend maps to real quantities (ml/gram).
export const SWEETENER_CONFIG = {
  syrup: {
    0: 0,
    30: 5,
    50: 10,
    70: 15,
    100: 20,
  },
  condensed_milk: {
    0: 0,
    30: 10,
    50: 20,
    70: 25,
    100: 30,
  },
};

class InventoryError extends Error {
  constructor(message, { status = 400, code = "INVENTORY_ERROR", details = null } = {}) {
    super(message);
    this.name = "InventoryError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSugarLevel = (value) => {
  if (value == null) return 100;
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (!text) return 100;
  const cleaned = text.endsWith("%") ? text.slice(0, -1) : text;
  return toNumber(cleaned, 100);
};

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * applySugarLevel()
 * - If ingredient.isSweetener: ignore recipe quantity and use SWEETENER_CONFIG mapping.
 * - If product.allowSugar=false: enforce sweetener quantity = 0 (sugarLevel must be 0).
 */
export const applySugarLevel = ({ ingredients, allowSugar, sweetenerType, sugarLevel }) => {
  const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
  const level = normalizeSugarLevel(sugarLevel);
  const allowedLevels = new Set([0, 30, 50, 70, 100]);

  if (!allowedLevels.has(level)) {
    throw new InventoryError("Mức đường không hợp lệ.", {
      status: 400,
      code: "INVALID_SUGAR_LEVEL",
      details: { sugarLevel: level, allowed: Array.from(allowedLevels) },
    });
  }

  const allow = Boolean(allowSugar);
  if (!allow && level !== 0) {
    throw new InventoryError("Sản phẩm này không cho phép chọn mức đường.", {
      status: 400,
      code: "SUGAR_NOT_ALLOWED",
      details: { sugarLevel: level },
    });
  }

  // Backward-compatible default: if allowSugar=true but missing sweetenerType, use "syrup".
  const type = allow ? (String(sweetenerType || "").trim() || "syrup") : "";

  const mapping = allow ? SWEETENER_CONFIG[type] : null;
  if (allow && !mapping) {
    throw new InventoryError("sweetenerType không hợp lệ.", {
      status: 400,
      code: "INVALID_SWEETENER_TYPE",
      details: { sweetenerType: type },
    });
  }

  const mappedQty = allow ? toNumber(mapping[level], 0) : 0;

  return safeIngredients.map((entry) => {
    const isSweetener = Boolean(entry?.isSweetener);
    if (!isSweetener) return entry;

    return {
      ...entry,
      quantity: mappedQty,
    };
  });
};

/**
 * calculateIngredients()
 * Input:
 *  { productId, quantity, sugarLevel, toppings: [{toppingId, quantity}] }
 * Output:
 *  { product, requirements: [{ingredientId, quantity}] }
 */
export const calculateIngredients = async ({ productId, quantity, sugarLevel, toppings, session } = {}) => {
  const pid = String(productId || "").trim();
  if (!isMongoId(pid)) {
    throw new InventoryError("productId không hợp lệ.", { status: 400, code: "INVALID_PRODUCT_ID" });
  }

  const orderQty = Math.max(1, Math.round(toNumber(quantity, 1)));
  const normalizedSugarLevel = normalizeSugarLevel(sugarLevel);

  const product = await productModel.findById(pid).session(session || null).lean();
  if (!product) {
    throw new InventoryError("Không tìm thấy sản phẩm.", { status: 404, code: "PRODUCT_NOT_FOUND" });
  }

  const productRecipe = await productRecipeModel
    .findOne({ productId: pid })
    .session(session || null)
    .lean();
  const recipe = productRecipe;

  if (!recipe) {
    throw new InventoryError("Thi???u c??ng th???c (recipe) cho s???n ph???m.", {
      status: 409,
      code: "RECIPE_NOT_FOUND",
      details: { productId: pid },
    });
  }

  const recipeItems = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const ingredientItems = [];
  const toppingItems = [];

  recipeItems.forEach((entry) => {
    const ingredientId = entry?.ingredientId || entry?.ingredient_id || "";
    const toppingId = entry?.toppingId || entry?.topping_id || "";
    if (ingredientId) {
      ingredientItems.push(entry);
      return;
    }
    if (toppingId) {
      toppingItems.push(entry);
    }
  });

  const scaledRecipeIngredients = applySugarLevel({
    ingredients: ingredientItems,
    allowSugar: product.allowSugar,
    sweetenerType: product.sweetenerType,
    sugarLevel: normalizedSugarLevel,
  });

  const requirementsMap = new Map();

  const addRequirement = (ingredientId, need) => {
    const id = String(ingredientId || "").trim();
    const qty = Math.max(0, toNumber(need, 0));
    if (!isMongoId(id) || qty <= 0) return;
    requirementsMap.set(id, (requirementsMap.get(id) || 0) + qty);
  };

  // Base recipe * order quantity
  (Array.isArray(scaledRecipeIngredients) ? scaledRecipeIngredients : []).forEach((entry) => {
    addRequirement(entry?.ingredientId, toNumber(entry?.quantity, 0) * orderQty);
  });

  // Base topping recipe (from product recipe)
  const baseToppingMap = new Map();
  (Array.isArray(toppingItems) ? toppingItems : []).forEach((entry) => {
    const toppingId = String(entry?.toppingId || entry?.topping_id || "").trim();
    const qty = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(toppingId) || qty <= 0) return;
    baseToppingMap.set(toppingId, (baseToppingMap.get(toppingId) || 0) + qty * orderQty);
  });

  if (baseToppingMap.size > 0) {
    const baseIds = Array.from(baseToppingMap.keys());
    const baseDocs = await toppingModel
      .find({ _id: { $in: baseIds } })
      .session(session || null)
      .lean();
    const baseById = new Set(baseDocs.map((t) => String(t._id)));
    const missingToppings = baseIds.filter((id) => !baseById.has(id));
    if (missingToppings.length > 0) {
      throw new InventoryError("Topping kh??ng t???n t???i.", {
        status: 400,
        code: "TOPPING_NOT_FOUND",
        details: { missingToppings },
      });
    }
  }

  // Topping selections (deduct topping stock separately)
  const toppingLines = Array.isArray(toppings) ? toppings : [];
  const toppingQtyMap = new Map();
  const toppingNameQtyMap = new Map();
  const toppingsUsed = [];

  toppingLines.forEach((line) => {
    const tid = String(line?.toppingId || line?.id || "").trim();
    const name = String(line?.name || line?.toppingName || "").trim();
    const tq = Math.max(1, Math.round(toNumber(line?.quantity, 1)));
    if (tq <= 0) return;
    if (isMongoId(tid)) {
      toppingQtyMap.set(tid, (toppingQtyMap.get(tid) || 0) + tq);
      return;
    }
    const normalizedName = normalizeName(name);
    if (!normalizedName) return;
    const prev = toppingNameQtyMap.get(normalizedName) || { name, quantity: 0 };
    toppingNameQtyMap.set(normalizedName, { name: prev.name || name, quantity: prev.quantity + tq });
  });

  if (toppingQtyMap.size > 0) {
    const toppingIds = Array.from(toppingQtyMap.keys());
    const toppingDocs = await toppingModel
      .find({ _id: { $in: toppingIds } })
      .session(session || null)
      .lean();
    const toppingById = new Map(toppingDocs.map((t) => [String(t._id), t]));

    const missingToppings = toppingIds.filter((id) => !toppingById.has(id));
    if (missingToppings.length > 0) {
      throw new InventoryError("Topping không tồn tại.", {
        status: 400,
        code: "TOPPING_NOT_FOUND",
        details: { missingToppings },
      });
    }

    toppingIds.forEach((toppingId) => {
      const toppingDoc = toppingById.get(toppingId);
      const tq = toppingQtyMap.get(toppingId) || 0;
      toppingsUsed.push({
        toppingId,
        name: String(toppingDoc?.name || ""),
        price: Math.max(0, toNumber(toppingDoc?.price, 0)),
        quantity: tq,
      });
    });
  }

  if (toppingNameQtyMap.size > 0) {
    const nameRequests = Array.from(toppingNameQtyMap.values());
    const nameOrFilters = nameRequests.map((entry) => ({
      name: new RegExp(`^${escapeRegex(entry.name)}$`, "i"),
    }));

    const toppingDocsByName = nameOrFilters.length
      ? await toppingModel.find({ $or: nameOrFilters }).session(session || null).lean()
      : [];
    const toppingByName = new Map(
      toppingDocsByName.map((t) => [normalizeName(t.name), t])
    );

    const missingToppings = [];
    Array.from(toppingNameQtyMap.entries()).forEach(([normalized, entry]) => {
      const toppingDoc = toppingByName.get(normalized);
      const tq = entry.quantity || 0;
      if (!toppingDoc) {
        missingToppings.push({ name: entry.name });
        return;
      }
      toppingsUsed.push({
        toppingId: String(toppingDoc._id),
        name: String(toppingDoc?.name || entry.name),
        price: Math.max(0, toNumber(toppingDoc?.price, 0)),
        quantity: tq,
      });
    });

    if (missingToppings.length > 0) {
      throw new InventoryError("Topping khÃ´ng tá»“n táº¡i.", {
        status: 400,
        code: "TOPPING_NOT_FOUND",
        details: { missingToppings },
      });
    }
  }

  const requirements = Array.from(requirementsMap.entries()).map(([ingredientId, qty]) => ({
    ingredientId,
    quantity: qty,
  }));

  const toppingMap = new Map();
  baseToppingMap.forEach((quantity, toppingId) => {
    const id = String(toppingId || "").trim();
    if (!isMongoId(id)) return;
    toppingMap.set(id, { toppingId: id, quantity, name: "" });
  });
  (Array.isArray(toppingsUsed) ? toppingsUsed : []).forEach((t) => {
    const id = String(t?.toppingId || "").trim();
    const qty = Math.max(0, toNumber(t?.quantity, 0));
    if (!isMongoId(id) || qty <= 0) return;
    const prev = toppingMap.get(id) || { toppingId: id, quantity: 0, name: String(t?.name || "") };
    toppingMap.set(id, { ...prev, quantity: prev.quantity + qty, name: prev.name || String(t?.name || "") });
  });

  return {
    product,
    recipeId: String(recipe._id || ""),
    requirements,
    orderQty,
    sugarLevel: normalizedSugarLevel,
    toppingsUsed,
    toppingRequirements: Array.from(toppingMap.values()),
  };
};

/**
 * checkStock()
 * Returns shortages (if any) but does NOT deduct.
 */
export const checkStock = async ({ requirements, session } = {}) => {
  const list = Array.isArray(requirements) ? requirements : [];
  const ids = list.map((r) => String(r?.ingredientId || "").trim()).filter(isMongoId);

  const ingredients = await ingredientModel
    .find({ _id: { $in: ids } })
    .session(session || null)
    .lean();
  const byId = new Map(ingredients.map((i) => [String(i._id), i]));

  const missingIngredients = ids.filter((id) => !byId.has(id));
  if (missingIngredients.length > 0) {
    throw new InventoryError("Công thức có nguyên liệu không tồn tại.", {
      status: 409,
      code: "INGREDIENT_NOT_FOUND",
      details: { missingIngredients },
    });
  }

  const shortages = [];
  list.forEach((req) => {
    const id = String(req?.ingredientId || "").trim();
    const need = Math.max(0, toNumber(req?.quantity, 0));
    if (!isMongoId(id) || need <= 0) return;

    const ing = byId.get(id);
    const stock = Math.max(0, toNumber(ing?.stock, 0));
    if (stock < need) {
      shortages.push({
        ingredientId: id,
        name: ing?.name,
        unit: ing?.unit,
        stock,
        need,
      });
    }
  });

  return {
    ok: shortages.length === 0,
    shortages,
    ingredients: ingredients.map((i) => ({
      _id: String(i._id),
      name: i.name,
      unit: i.unit,
      stock: Math.max(0, toNumber(i.stock, 0)),
    })),
  };
};

/**
 * checkToppingStock()
 * Returns shortages (if any) but does NOT deduct.
 */
export const checkToppingStock = async ({ toppings, session } = {}) => {
  const list = Array.isArray(toppings) ? toppings : [];
  const ids = list.map((r) => String(r?.toppingId || "").trim()).filter(isMongoId);

  if (ids.length === 0) {
    return { ok: true, shortages: [], toppings: [] };
  }

  const toppingsDocs = await toppingModel
    .find({ _id: { $in: ids } })
    .session(session || null)
    .lean();
  const byId = new Map(toppingsDocs.map((t) => [String(t._id), t]));

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new InventoryError("Topping không tồn tại.", {
      status: 400,
      code: "TOPPING_NOT_FOUND",
      details: { missingToppings: missing },
    });
  }

  const shortages = [];
  list.forEach((req) => {
    const id = String(req?.toppingId || "").trim();
    const need = Math.max(0, toNumber(req?.quantity, 0));
    if (!isMongoId(id) || need <= 0) return;

    const t = byId.get(id);
    const stock = Math.max(0, toNumber(t?.stock, 0));
    if (stock < need) {
      shortages.push({
        toppingId: id,
        name: t?.name,
        unit: t?.unit,
        stock,
        need,
      });
    }
  });

  return {
    ok: shortages.length === 0,
    shortages,
    toppings: toppingsDocs.map((t) => ({
      _id: String(t._id),
      name: t.name,
      unit: t.unit,
      stock: Math.max(0, toNumber(t.stock, 0)),
    })),
  };
};

/**
 * deductStock()
 * - Must be called inside a MongoDB transaction (session).
 * - Uses conditional updates (stock >= need) to avoid race conditions.
 */
export const deductStock = async ({ requirements, orderId, reason = "", session } = {}) => {
  const list = Array.isArray(requirements) ? requirements : [];
  const canRollback = !session;
  const snapshots = [];

  for (const req of list) {
    const ingredientId = String(req?.ingredientId || "").trim();
    const need = Math.max(0, toNumber(req?.quantity, 0));
    if (!isMongoId(ingredientId) || need <= 0) continue;

    const updated = await ingredientModel
      .findOneAndUpdate(
        { _id: ingredientId, stock: { $gte: need } },
        { $inc: { stock: -need } },
        { new: true }
      )
      .session(session || null);

    if (!updated) {
      if (canRollback && snapshots.length > 0) {
        await Promise.allSettled(
          snapshots.map((snap) =>
            ingredientModel.updateOne(
              { _id: snap.ingredientId },
              { $inc: { stock: snap.quantity } }
            )
          )
        );
      }
      throw new InventoryError("Không đủ tồn kho nguyên liệu (có thay đổi đồng thời).", {
        status: 409,
        code: "STOCK_CHANGED",
        details: { ingredientId, need },
      });
    }

    const stockAfter = Math.max(0, toNumber(updated.stock, 0));
    snapshots.push({
      ingredientId: updated._id,
      quantity: need,
      stockBefore: stockAfter + need,
      stockAfter,
    });
  }

  if (snapshots.length === 0) return { ok: true, logs: [] };

  const orderObjectId = isMongoId(orderId) ? new mongoose.Types.ObjectId(String(orderId)) : null;

  const logs = await inventoryLogModel.insertMany(
    snapshots.map((snap) => ({
      ingredientId: snap.ingredientId,
      type: "order",
      quantity: snap.quantity,
      note: String(reason || ""),
      orderId: orderObjectId,
      stockBefore: snap.stockBefore,
      stockAfter: snap.stockAfter,
    })),
    session ? { session } : {}
  );

  return { ok: true, logs };
};

/**
 * deductToppingStock()
 * - Must be called inside a MongoDB transaction (session) if possible.
 * - Uses conditional updates (stock >= need) to avoid race conditions.
 */
export const deductToppingStock = async ({ toppings, orderId, reason = "", session } = {}) => {
  const list = Array.isArray(toppings) ? toppings : [];
  const canRollback = !session;
  const snapshots = [];

  for (const req of list) {
    const toppingId = String(req?.toppingId || "").trim();
    const need = Math.max(0, toNumber(req?.quantity, 0));
    if (!isMongoId(toppingId) || need <= 0) continue;

    const updated = await toppingModel
      .findOneAndUpdate(
        { _id: toppingId, stock: { $gte: need } },
        { $inc: { stock: -need } },
        { new: true }
      )
      .session(session || null);

    if (!updated) {
      if (canRollback && snapshots.length > 0) {
        await Promise.allSettled(
          snapshots.map((snap) =>
            toppingModel.updateOne(
              { _id: snap.toppingId },
              { $inc: { stock: snap.quantity } }
            )
          )
        );
      }
      throw new InventoryError("Không đủ tồn kho topping (có thay đổi đồng thời).", {
        status: 409,
        code: "TOPPING_OUT_OF_STOCK",
        details: { toppingId, need },
      });
    }

    const stockAfter = Math.max(0, toNumber(updated.stock, 0));
    snapshots.push({
      toppingId: updated._id,
      quantity: need,
      stockBefore: stockAfter + need,
      stockAfter,
    });
  }

  if (snapshots.length === 0) return { ok: true, logs: [] };

  const orderObjectId = isMongoId(orderId) ? new mongoose.Types.ObjectId(String(orderId)) : null;

  const logs = await toppingStockLogModel.insertMany(
    snapshots.map((snap) => ({
      toppingId: snap.toppingId,
      type: "order",
      quantity: snap.quantity,
      note: String(reason || ""),
      orderId: orderObjectId,
      stockBefore: snap.stockBefore,
      stockAfter: snap.stockAfter,
    })),
    session ? { session } : {}
  );

  return { ok: true, logs };
};

export const runWithMongoTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return { ok: true, result };
  } catch (error) {
    const message = String(error?.message || "");
    const isTxnUnsupported =
      message.includes("Transaction numbers are only allowed") ||
      message.includes("replica set") ||
      message.includes("mongos");
    return { ok: false, error, isTxnUnsupported };
  } finally {
    session.endSession();
  }
};

export const asInventoryErrorResponse = (error) => {
  if (error?.name === "InventoryError") {
    return {
      status: error.status || 400,
      message: error.message || "Inventory error",
      code: error.code || "INVENTORY_ERROR",
      details: error.details || null,
    };
  }

  return {
    status: 500,
    message: "Không thể xử lý tồn kho.",
    code: "INTERNAL_ERROR",
    details: null,
  };
};
