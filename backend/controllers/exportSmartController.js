import mongoose from "mongoose";
import ingredientModel from "../models/ingredientModel.js";
import toppingModel from "../models/toppingModel.js";
import productRecipeModel from "../models/productRecipeModel.js";
import toppingRecipeModel from "../models/toppingRecipeModel.js";
import inventoryLogModel from "../models/inventoryLogModel.js";
import toppingStockLogModel from "../models/toppingStockLogModel.js";
import exportLogModel from "../models/exportLogModel.js";

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));
const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const VALID_ITEM_TYPES = new Set(["nguyen_lieu", "thanh_pham", "san_pham"]);
const VALID_REASONS = new Set(["hu_hong", "do_vo", "khac"]);
const INGREDIENT_LOG_TYPE = "export";
const TOPPING_LOG_TYPE = "adjust";

const withStatus = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const logIngredient = async ({ ingredientId, delta, note, type, session }) => {
  const qty = Math.abs(delta);
  const filter = delta < 0 ? { _id: ingredientId, stock: { $gte: qty } } : { _id: ingredientId };
  const updated = await ingredientModel.findOneAndUpdate(filter, { $inc: { stock: delta } }, { new: true, session });
  if (!updated) {
    const existed = await ingredientModel.findById(ingredientId).session(session);
    if (!existed) throw withStatus("Khong tim thay nguyen lieu.", 404);
    throw withStatus(`Khong du ton kho nguyen lieu: ${existed.name}`, 409);
  }
  const stockAfter = Number(updated.stock || 0);
  await inventoryLogModel.create(
    [
      {
        ingredientId,
        type,
        quantity: qty,
        note: note || "",
        stockBefore: stockAfter - delta,
        stockAfter,
      },
    ],
    { session }
  );
};

const logTopping = async ({ toppingId, delta, note, type, session }) => {
  const qty = Math.abs(delta);
  const filter = delta < 0 ? { _id: toppingId, stock: { $gte: qty } } : { _id: toppingId };
  const updated = await toppingModel.findOneAndUpdate(filter, { $inc: { stock: delta } }, { new: true, session });
  if (!updated) {
    const existed = await toppingModel.findById(toppingId).session(session);
    if (!existed) throw withStatus("Khong tim thay thanh pham.", 404);
    throw withStatus(`Khong du ton kho thanh pham: ${existed.name}`, 409);
  }
  const stockAfter = Number(updated.stock || 0);
  await toppingStockLogModel.create(
    [
      {
        toppingId,
        type,
        quantity: qty,
        note: note || "",
        stockBefore: stockAfter - delta,
        stockAfter,
      },
    ],
    { session }
  );
};

export const smartExport = async (req, res) => {
  const itemId = String(req.body?.itemId || "").trim();
  const itemType = String(req.body?.itemType || "").trim(); // nguyen_lieu | thanh_pham | san_pham
  const quantity = toNumber(req.body?.quantity, Number.NaN);
  const reason = String(req.body?.reason || "khac").trim(); // hu_hong | do_vo | khac
  const note = String(req.body?.note || "").trim();

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: "So luong phai lon hon 0." });
  }

  if (
    !isMongoId(itemId) ||
    !VALID_ITEM_TYPES.has(itemType) ||
    !VALID_REASONS.has(reason)
  ) {
    return res.status(400).json({ success: false, message: "Du lieu khong hop le" });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (itemType === "thanh_pham") {
        if (reason === "hu_hong") {
          // hu hong: tru thang thanh pham
          await logTopping({
            toppingId: itemId,
            delta: -quantity,
            note,
            type: TOPPING_LOG_TYPE,
            session,
          });
        } else {
          // do vo: khong tru thanh pham, tru nguyen lieu theo recipe topping
          const recipe = await toppingRecipeModel.findOne({ toppingId: itemId }).lean().session(session);
          const items = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
          for (const row of items) {
            const ingId = String(row?.ingredientId || "");
            const baseQty = Math.max(0, toNumber(row?.quantity, 0));
            if (!isMongoId(ingId) || baseQty <= 0) continue;
            await logIngredient({
              ingredientId: ingId,
              delta: -(baseQty * quantity),
              note: "Bu do topping",
              type: INGREDIENT_LOG_TYPE,
              session,
            });
          }
        }
      } else if (itemType === "nguyen_lieu") {
        // tru truc tiep nguyen lieu
        await logIngredient({
          ingredientId: itemId,
          delta: -quantity,
          note,
          type: INGREDIENT_LOG_TYPE,
          session,
        });
      } else if (itemType === "san_pham") {
        // san pham hoan chinh bi do: tru nguyen lieu (va topping) theo recipe san pham
        const recipe = await productRecipeModel.findOne({ productId: itemId }).lean().session(session);
        const items = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
        for (const row of items) {
          const ingId = String(row?.ingredientId || "");
          const topId = String(row?.toppingId || "");
          const baseQty = Math.max(0, toNumber(row?.quantity, 0));
          if (baseQty <= 0) continue;
          if (isMongoId(ingId)) {
            await logIngredient({
              ingredientId: ingId,
              delta: -(baseQty * quantity),
              note: "Bu san pham do",
              type: INGREDIENT_LOG_TYPE,
              session,
            });
          } else if (isMongoId(topId)) {
            await logTopping({
              toppingId: topId,
              delta: -(baseQty * quantity),
              note: "Bu san pham do",
              type: TOPPING_LOG_TYPE,
              session,
            });
          }
        }
      } else {
        throw withStatus("itemType khong hop le", 400);
      }

      await exportLogModel.create(
        [
          {
            itemId,
            itemType,
            quantity,
            reason,
            note,
          },
        ],
        { session }
      );
    });

    return res.json({ success: true });
  } catch (error) {
    console.log("SMART EXPORT ERROR:", error.message);
    const status = Number(error?.status);
    return res
      .status(Number.isFinite(status) && status > 0 ? status : 500)
      .json({ success: false, message: error.message || "Xuat kho that bai" });
  } finally {
    session.endSession();
  }
};
