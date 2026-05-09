import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import {
  asInventoryErrorResponse,
  calculateIngredients,
  checkStock,
  checkToppingStock,
  deductStock,
  deductToppingStock,
  runWithMongoTransaction,
} from "../services/orderInventoryService.js";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePosPayload = (body = {}) => {
  const productId = String(body?.productId || "").trim();
  const quantity = Math.max(1, Math.round(toNumber(body?.quantity, 1)));
  const sugarLevel = body?.sugarLevel ?? 100;

  const toppings = Array.isArray(body?.toppings)
    ? body.toppings.map((t) => ({
        toppingId: String(t?.toppingId || "").trim(),
        quantity: Math.max(1, Math.round(toNumber(t?.quantity, 1))),
      }))
    : [];

  return { productId, quantity, sugarLevel, toppings };
};

const joinRequirementsWithIngredients = ({ requirements, ingredients }) => {
  const byId = new Map((Array.isArray(ingredients) ? ingredients : []).map((i) => [String(i._id), i]));
  return (Array.isArray(requirements) ? requirements : []).map((r) => {
    const info = byId.get(String(r.ingredientId)) || {};
    return {
      ingredientId: String(r.ingredientId),
      quantity: Math.max(0, toNumber(r.quantity, 0)),
      name: info.name,
      unit: info.unit,
      stock: info.stock,
    };
  });
};

// BONUS: Preview ingredients to be deducted (no stock update).
const previewOrderIngredients = async (req, res) => {
  try {
    const payload = normalizePosPayload(req.body);

    const calc = await calculateIngredients(payload);
    const stock = await checkStock({ requirements: calc.requirements });
    const toppingStock = await checkToppingStock({ toppings: calc.toppingRequirements || [] });

    const combinedShortages = [
      ...(Array.isArray(stock.shortages) ? stock.shortages : []),
      ...(Array.isArray(toppingStock.shortages) ? toppingStock.shortages : []).map((s) => ({
        ...s,
        ingredientId: s.toppingId,
        type: "topping",
      })),
    ];

    return res.json({
      success: true,
      data: {
        productId: payload.productId,
        quantity: calc.orderQty,
        sugarLevel: calc.sugarLevel,
        toppings: calc.toppingsUsed,
        requirements: joinRequirementsWithIngredients({
          requirements: calc.requirements,
          ingredients: stock.ingredients,
        }),
        shortages: combinedShortages,
        toppingRequirements: calc.toppingRequirements || [],
        toppingShortages: toppingStock.shortages,
        ok: stock.ok && toppingStock.ok,
      },
    });
  } catch (error) {
    const err = asInventoryErrorResponse(error);
    return res.status(err.status).json({ success: false, message: err.message, code: err.code, details: err.details });
  }
};

const createPosOrder = async (req, res) => {
  const payload = normalizePosPayload(req.body);

  const work = async (session) => {
    const calc = await calculateIngredients({ ...payload, session });

    const stock = await checkStock({ requirements: calc.requirements, session });
    if (!stock.ok) {
      const err = new Error("Thiếu nguyên liệu.");
      err.name = "InventoryError";
      err.status = 409;
      err.code = "OUT_OF_STOCK";
      err.details = { shortages: stock.shortages };
      throw err;
    }

    const toppingStock = await checkToppingStock({ toppings: calc.toppingRequirements || [], session });
    if (!toppingStock.ok) {
      const err = new Error("Thiáº¿u topping.");
      err.name = "InventoryError";
      err.status = 409;
      err.code = "TOPPING_OUT_OF_STOCK";
      err.details = { shortages: toppingStock.shortages };
      throw err;
    }

    const nextOrderId = new mongoose.Types.ObjectId();
    const toppingsTotal = (Array.isArray(calc.toppingsUsed) ? calc.toppingsUsed : []).reduce(
      (sum, t) => sum + Math.max(0, toNumber(t.price, 0)) * Math.max(0, toNumber(t.quantity, 0)),
      0
    );
    const productUnitPrice = Math.max(0, toNumber(calc.product?.price, 0));
    const itemsTotal = productUnitPrice * calc.orderQty + toppingsTotal;

    const createdAt = new Date();

    const [order] = await orderModel.create(
      [
        {
          _id: nextOrderId,
          userId: req.userId,
          customerName: String(req.body?.customerName || "").trim(),
          phone: String(req.body?.phone || "").trim(),
          addressText: "POS",
          total: itemsTotal,
          items: [
            {
              _id: String(payload.productId),
              productId: String(payload.productId),
              name: String(calc.product?.name || ""),
              price: productUnitPrice,
              quantity: calc.orderQty,
              image: String(calc.product?.image || ""),
              type: String(calc.product?.type || ""),
              sugarLevel: String(calc.sugarLevel),
              toppings: calc.toppingsUsed,
            },
          ],
          note: String(req.body?.note || "").trim(),
          amount: itemsTotal,
          paymentMethod: "cash",
          address: req.body?.address && typeof req.body.address === "object" ? req.body.address : {},
          status: "paid",
          payment: true,
          paidAt: createdAt,
          createdAt,
          date: createdAt,
          inventory: { status: "pending", deductedAt: null, error: "" },
        },
      ],
      session ? { session } : {}
    );

    await deductStock({
      requirements: calc.requirements,
      orderId: String(nextOrderId),
      reason: `POS_ORDER_${nextOrderId}`,
      session,
    });

    await deductToppingStock({
      toppings: calc.toppingRequirements || [],
      orderId: String(nextOrderId),
      reason: `POS_ORDER_${nextOrderId}`,
      session,
    });

    await orderModel.updateOne(
      { _id: nextOrderId },
      { $set: { "inventory.status": "deducted", "inventory.deductedAt": new Date(), "inventory.error": "" } },
      session ? { session } : {}
    );

    return { orderId: String(order._id), amount: itemsTotal };
  };

  try {
    const tx = await runWithMongoTransaction(work);
    if (tx.ok) {
      return res.json({ success: true, data: tx.result });
    }

    if (tx.isTxnUnsupported) {
      const result = await work(null);
      return res.json({ success: true, data: result });
    }

    throw tx.error;
  } catch (error) {
    const err = asInventoryErrorResponse(error);
    return res.status(err.status).json({ success: false, message: err.message, code: err.code, details: err.details });
  }
};

export { createPosOrder, previewOrderIngredients };
