import mongoose from "mongoose";
import ingredientModel from "../models/ingredientModel.js";
import inventoryLogModel from "../models/inventoryLogModel.js";
import orderModel from "../models/orderModel.js";
import toppingModel from "../models/toppingModel.js";
import toppingStockLogModel from "../models/toppingStockLogModel.js";
import { calculateIngredients } from "../services/orderInventoryService.js";

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildRequirementsFromOrder = async (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const reqMap = new Map();
  const toppingMap = new Map();
  const missingRecipeProductIds = new Set();
  const missingToppings = [];

  for (const item of items) {
    const productId = String(item?.productId || item?._id || item?.itemId || item?.foodId || "").trim();
    const qty = Math.max(0, Math.round(toNumber(item?.quantity, 0)));
    if (!isMongoId(productId) || qty <= 0) continue;

    try {
      const result = await calculateIngredients({
        productId,
        quantity: qty,
        sugarLevel: item?.sugarLevel,
        toppings: Array.isArray(item?.toppings) ? item.toppings : [],
      });

      (Array.isArray(result?.requirements) ? result.requirements : []).forEach((req) => {
        const ingredientId = String(req?.ingredientId || "").trim();
        const need = Math.max(0, toNumber(req?.quantity, 0));
        if (!isMongoId(ingredientId) || need <= 0) return;
        reqMap.set(ingredientId, (reqMap.get(ingredientId) || 0) + need);
      });

      const toppingList = Array.isArray(result?.toppingRequirements)
        ? result.toppingRequirements
        : Array.isArray(result?.toppingsUsed)
        ? result.toppingsUsed
        : [];

      toppingList.forEach((t) => {
        const toppingId = String(t?.toppingId || "").trim();
        const qty = Math.max(0, Math.round(toNumber(t?.quantity, 0)));
        if (!isMongoId(toppingId) || qty <= 0) return;
        toppingMap.set(toppingId, (toppingMap.get(toppingId) || 0) + qty);
      });
    } catch (error) {
      if (error?.name === "InventoryError" && error?.code === "RECIPE_NOT_FOUND") {
        missingRecipeProductIds.add(productId);
        continue;
      }
      if (error?.name === "InventoryError" && error?.code === "TOPPING_NOT_FOUND") {
        const list = Array.isArray(error?.details?.missingToppings) ? error.details.missingToppings : [];
        missingToppings.push(...list);
        continue;
      }
      throw error;
    }
  }

  return {
    requirements: [...reqMap.entries()].map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
    toppingRequirements: [...toppingMap.entries()].map(([toppingId, quantity]) => ({ toppingId, quantity })),
    missingRecipeProductIds: Array.from(missingRecipeProductIds),
    missingToppings,
  };
};

const tryRunWithTransaction = async (work) => {
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

const deductInventoryForOrder = async ({ orderId, reason = "Trừ kho theo đơn hàng" }) => {
  if (!isMongoId(orderId)) {
    return { ok: false, status: 400, message: "Order id không hợp lệ." };
  }

  const work = async (session) => {
    const canRollback = !session;
    const order = await orderModel.findById(orderId).session(session || null);
    if (!order) return { ok: false, status: 404, message: "Không tìm thấy đơn hàng." };

    const alreadyDeductedAt = order?.inventory?.deductedAt || null;
    if (alreadyDeductedAt) return { ok: true, status: 200, message: "Đơn đã trừ kho trước đó." };

    const { requirements, toppingRequirements, missingRecipeProductIds, missingToppings } =
      await buildRequirementsFromOrder(order);

    if (missingRecipeProductIds.length > 0) {
      return {
        ok: false,
        status: 409,
        message: "Thiếu công thức cho một số sản phẩm.",
        details: { missingRecipeProductIds },
      };
    }

    if (missingToppings.length > 0) {
      return {
        ok: false,
        status: 400,
        message: "Topping khÃ´ng tá»“n táº¡i.",
        details: { missingToppings },
      };
    }

    if (requirements.length === 0 && (!toppingRequirements || toppingRequirements.length === 0)) {
      order.inventory = { status: "deducted", deductedAt: new Date(), error: "" };
      await order.save({ session });
      return { ok: true, status: 200, message: "Khong co nguyen lieu/topping de tru kho." };
    }

    const ingredientIds = requirements.map((r) => r.ingredientId);
    const ingredients = await ingredientModel
      .find({ _id: { $in: ingredientIds } })
      .session(session || null)
      .lean();
    const ingredientById = new Map(ingredients.map((i) => [String(i._id), i]));

    const missingIngredients = ingredientIds.filter((id) => !ingredientById.has(String(id)));
    if (missingIngredients.length > 0) {
      return { ok: false, status: 409, message: "Công thức có nguyên liệu không tồn tại.", details: { missingIngredients } };
    }

    const shortages = [];
    requirements.forEach((req) => {
      const ing = ingredientById.get(String(req.ingredientId));
      const stock = toNumber(ing?.stock, 0);
      const need = Math.max(0, toNumber(req.quantity, 0));
      if (stock < need) {
        shortages.push({
          ingredientId: String(ing._id),
          name: ing.name,
          unit: ing.unit,
          stock,
          need,
        });
      }
    });

    if (shortages.length > 0) {
      return { ok: false, status: 409, message: "Không đủ tồn kho nguyên liệu.", details: { shortages } };
    }

    const toppingIds = (Array.isArray(toppingRequirements) ? toppingRequirements : []).map((r) => r.toppingId);
    let toppingById = new Map();

    if (toppingIds.length > 0) {
      const toppingDocs = await toppingModel
        .find({ _id: { $in: toppingIds } })
        .session(session || null)
        .lean();
      toppingById = new Map(toppingDocs.map((t) => [String(t._id), t]));

      const missingToppingDocs = toppingIds.filter((id) => !toppingById.has(String(id)));
      if (missingToppingDocs.length > 0) {
        return {
          ok: false,
          status: 400,
          message: "Topping khong ton tai.",
          details: { missingToppings: missingToppingDocs },
        };
      }

      const toppingShortages = [];
      (Array.isArray(toppingRequirements) ? toppingRequirements : []).forEach((req) => {
        const t = toppingById.get(String(req.toppingId));
        const stock = toNumber(t?.stock, 0);
        const need = Math.max(0, toNumber(req.quantity, 0));
        if (stock < need) {
          toppingShortages.push({
            toppingId: String(t._id),
            name: t.name,
            unit: t.unit,
            stock,
            need,
          });
        }
      });

      if (toppingShortages.length > 0) {
        return { ok: false, status: 409, message: "Khong du ton kho topping.", details: { shortages: toppingShortages } };
      }
    }

    const updatedSnapshots = [];
    const toppingSnapshots = [];
    const rollback = async () => {
      if (!canRollback) return;
      await Promise.allSettled(
        updatedSnapshots.map((snap) =>
          ingredientModel.updateOne(
            { _id: snap.ingredientId },
            { $inc: { stock: snap.quantity } }
          )
        )
      );
      await Promise.allSettled(
        toppingSnapshots.map((snap) =>
          toppingModel.updateOne(
            { _id: snap.toppingId },
            { $inc: { stock: snap.quantity } }
          )
        )
      );
    };

    try {
      for (const req of requirements) {
        const need = Math.max(0, toNumber(req.quantity, 0));
        const updated = await ingredientModel
          .findOneAndUpdate(
            { _id: req.ingredientId, stock: { $gte: need } },
            { $inc: { stock: -need } },
            { new: true }
          )
          .session(session || null);

        if (!updated) {
          await rollback();
          return { ok: false, status: 409, message: "Tồn kho thay đổi, vui lòng thử lại." };
        }

        const stockAfter = toNumber(updated.stock, 0);
        updatedSnapshots.push({
          ingredientId: updated._id,
          quantity: need,
          stockBefore: stockAfter + need,
          stockAfter,
        });
      }

      await inventoryLogModel.insertMany(
        updatedSnapshots.map((snap) => ({
          ingredientId: snap.ingredientId,
          type: "order",
          quantity: snap.quantity,
          note: reason,
          orderId: order._id,
          stockBefore: snap.stockBefore,
          stockAfter: snap.stockAfter,
        })),
        session ? { session } : {}
      );
      for (const req of toppingRequirements || []) {
        const need = Math.max(0, toNumber(req.quantity, 0));
        const updated = await toppingModel
          .findOneAndUpdate(
            { _id: req.toppingId, stock: { $gte: need } },
            { $inc: { stock: -need } },
            { new: true }
          )
          .session(session || null);

        if (!updated) {
          await rollback();
          return { ok: false, status: 409, message: "Ton kho topping thay doi, vui long thu lai." };
        }

        const stockAfter = toNumber(updated.stock, 0);
        toppingSnapshots.push({
          toppingId: updated._id,
          quantity: need,
          stockBefore: stockAfter + need,
          stockAfter,
        });
      }

      if (toppingSnapshots.length > 0) {
        await toppingStockLogModel.insertMany(
          toppingSnapshots.map((snap) => ({
            toppingId: snap.toppingId,
            type: "order",
            quantity: snap.quantity,
            note: reason,
            orderId: order._id,
            stockBefore: snap.stockBefore,
            stockAfter: snap.stockAfter,
          })),
          session ? { session } : {}
        );
      }


      order.inventory = { status: "deducted", deductedAt: new Date(), error: "" };
      await order.save(session ? { session } : {});
    } catch (error) {
      await rollback();
      throw error;
    }

    return { ok: true, status: 200, message: "Đã trừ kho theo đơn hàng." };
  };

  const tx = await tryRunWithTransaction(work);
  if (tx.ok) return tx.result;

  if (!tx.isTxnUnsupported) {
    console.log("DEDUCT INVENTORY TX ERROR:", tx.error?.message || tx.error);
    return { ok: false, status: 500, message: "Không thể trừ kho (transaction)." };
  }

  // Fallback (no transaction support)
  try {
    const result = await work(null);
    return result;
  } catch (error) {
    console.log("DEDUCT INVENTORY FALLBACK ERROR:", error.message);
    return { ok: false, status: 500, message: "Không thể trừ kho." };
  }
};

export { deductInventoryForOrder };
