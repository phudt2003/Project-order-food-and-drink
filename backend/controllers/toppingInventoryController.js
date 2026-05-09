import mongoose from "mongoose";
import ExcelJS from "exceljs";
import toppingModel from "../models/toppingModel.js";
import toppingRecipeModel from "../models/toppingRecipeModel.js";
import ingredientModel from "../models/ingredientModel.js";
import inventoryLogModel from "../models/inventoryLogModel.js";
import toppingStockLogModel from "../models/toppingStockLogModel.js";
import { runWithMongoTransaction } from "../services/orderInventoryService.js";

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const cleanNumber = (val) => {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const str = String(val).replace(/,/g, "").trim();
  if (!str) return null;
  if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
};

const toNumber = (value, fallback = 0) => {
  const parsed = cleanNumber(value);
  return parsed == null ? fallback : parsed;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const toYmd = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const VIETNAM_TZ = "Asia/Ho_Chi_Minh";

const formatVietnamDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: VIETNAM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const normalizeRecipeIngredients = (items, quantity) => {
  const list = Array.isArray(items) ? items : [];
  const map = new Map();

  list.forEach((entry) => {
    const ingredientId = String(entry?.ingredientId || "").trim();
    const baseQty = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(ingredientId) || baseQty <= 0) return;

    const total = baseQty * quantity;
    const prev = map.get(ingredientId);
    const unit = String(entry?.unit || "").trim();
    const note = String(entry?.note || "").trim();

    if (!prev) {
      map.set(ingredientId, { ingredientId, quantity: total, unit, note });
      return;
    }

    map.set(ingredientId, {
      ingredientId,
      quantity: prev.quantity + total,
      unit: prev.unit || unit,
      note: prev.note || note,
    });
  });

  return Array.from(map.values());
};

const listToppingInventory = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    const lowStockOnly = String(req.query?.lowStockOnly || "") === "1";

    const filter = {};
    if (q) {
      filter.name = { $regex: q, $options: "i" };
    }

    let toppings = await toppingModel.find(filter).sort({ name: 1 }).lean();
    if (lowStockOnly) {
      toppings = toppings.filter(
        (t) => Number(t.stock || 0) <= Number(t.minStock || 0)
      );
    }

    return res.json({ success: true, data: toppings });
  } catch (error) {
    console.log("LIST TOPPING INVENTORY ERROR:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Không thể tải topping." });
  }
};

const createToppingInventory = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const price = Math.max(0, toNumber(req.body?.price, 0));
    const unit = String(req.body?.unit || "").trim();
    const minStock = Math.max(0, toNumber(req.body?.minStock, 0));
    const stockInput = req.body?.stock;

    if (!name) {
      return res.status(400).json({ success: false, message: "Thiếu tên topping." });
    }

    const existing = await toppingModel.findOne({ name }).lean();
    const stockBefore = Math.max(0, toNumber(existing?.stock, 0));

    const update = {
      name,
      price,
      unit,
      minStock,
    };

    if (stockInput != null) {
      update.stock = Math.max(0, toNumber(stockInput, 0));
    }

    const topping = await toppingModel.findOneAndUpdate(
      { name },
      {
        $set: update,
        $setOnInsert: { source: "manual" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (stockInput != null) {
      const stockAfter = Math.max(0, toNumber(topping?.stock, 0));
      const delta = stockAfter - stockBefore;
      if (delta !== 0) {
        await toppingStockLogModel.create({
          toppingId: topping._id,
          type: "adjust",
          quantity: Math.abs(delta),
          note: String(req.body?.note || "Điều chỉnh tồn kho"),
          stockBefore,
          stockAfter,
        });
      }
    }

    return res.json({ success: true, data: topping });
  } catch (error) {
    console.log("CREATE TOPPING INVENTORY ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tạo topping." });
  }
};

const updateToppingInventory = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!isMongoId(id)) {
      return res.status(400).json({ success: false, message: "Topping id không hợp lệ." });
    }

    const payload = {};
    if (req.body?.unit != null) {
      payload.unit = String(req.body.unit || "").trim();
    }
    if (req.body?.minStock != null) {
      payload.minStock = Math.max(0, toNumber(req.body.minStock, 0));
    }

    const topping = await toppingModel.findById(id).lean();
    if (!topping) {
      return res.status(404).json({ success: false, message: "Không tìm thấy topping." });
    }

    let stockBefore = toNumber(topping.stock, 0);
    let stockAfter = stockBefore;
    let adjustDelta = 0;

    if (req.body?.stock != null) {
      const nextStock = Math.max(0, toNumber(req.body.stock, 0));
      adjustDelta = nextStock - stockBefore;
      stockAfter = nextStock;
      payload.stock = nextStock;
    }

    const updated = await toppingModel.findByIdAndUpdate(id, { $set: payload }, { new: true });

    if (adjustDelta !== 0) {
      await toppingStockLogModel.create({
        toppingId: id,
        type: "adjust",
        quantity: Math.abs(adjustDelta),
        note: String(req.body?.note || "Điều chỉnh tồn kho"),
        stockBefore,
        stockAfter,
      });
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.log("UPDATE TOPPING INVENTORY ERROR:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Không thể cập nhật topping." });
  }
};

const previewToppingProduction = async (req, res) => {
  try {
    const toppingId = String(req.body?.toppingId || "").trim();
    const quantity = Math.max(1, Math.round(toNumber(req.body?.quantity, 1)));

    if (!isMongoId(toppingId)) {
      return res.status(400).json({ success: false, message: "Topping id không hợp lệ." });
    }

    const topping = await toppingModel.findById(toppingId).lean();
    if (!topping) {
      return res.status(404).json({ success: false, message: "Không tìm thấy topping." });
    }

    const recipeDoc = await toppingRecipeModel.findOne({ toppingId }).lean();
    const recipe = Array.isArray(recipeDoc?.ingredients) && recipeDoc.ingredients.length > 0
      ? recipeDoc.ingredients
      : Array.isArray(topping.ingredients)
      ? topping.ingredients
      : [];
    if (recipe.length === 0) {
      return res.status(409).json({ success: false, message: "Topping chưa có công thức." });
    }

    const requirements = normalizeRecipeIngredients(recipe, quantity);
    const ids = requirements.map((r) => r.ingredientId);
    const ingredients = await ingredientModel.find({ _id: { $in: ids } }).lean();
    const byId = new Map(ingredients.map((i) => [String(i._id), i]));

    const missingIngredients = ids.filter((id) => !byId.has(id));
    if (missingIngredients.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Công thức có nguyên liệu không tồn tại.",
        details: { missingIngredients },
      });
    }

    const shortages = [];
    const requirementRows = requirements.map((reqRow) => {
      const ing = byId.get(String(reqRow.ingredientId));
      const stock = Math.max(0, toNumber(ing?.stock, 0));
      const need = Math.max(0, toNumber(reqRow.quantity, 0));
      if (stock < need) {
        shortages.push({
          ingredientId: String(reqRow.ingredientId),
          name: ing?.name,
          unit: ing?.unit,
          stock,
          need,
        });
      }
      return {
        ingredientId: String(reqRow.ingredientId),
        name: ing?.name,
        unit: reqRow.unit || ing?.unit || "",
        stock,
        need,
        note: reqRow.note || "",
      };
    });

    return res.json({
      success: true,
      data: {
        topping: {
          _id: topping._id,
          name: topping.name,
          unit: topping.unit || "",
        },
        quantity,
        requirements: requirementRows,
        shortages,
        ok: shortages.length === 0,
      },
    });
  } catch (error) {
    console.log("PREVIEW TOPPING PRODUCTION ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xem trước sản xuất." });
  }
};

const produceTopping = async (req, res) => {
  try {
    const toppingId = String(req.body?.toppingId || "").trim();
    const quantity = Math.max(1, Math.round(toNumber(req.body?.quantity, 1)));
    const note = String(req.body?.note || "").trim();

    if (!isMongoId(toppingId)) {
      return res.status(400).json({ success: false, message: "Topping id không hợp lệ." });
    }

    const topping = await toppingModel.findById(toppingId).lean();
    if (!topping) {
      return res.status(404).json({ success: false, message: "Không tìm thấy topping." });
    }

    const recipeDoc = await toppingRecipeModel.findOne({ toppingId }).lean();
    const recipe = Array.isArray(recipeDoc?.ingredients) && recipeDoc.ingredients.length > 0
      ? recipeDoc.ingredients
      : Array.isArray(topping.ingredients)
      ? topping.ingredients
      : [];
    if (recipe.length === 0) {
      return res.status(409).json({ success: false, message: "Topping chưa có công thức." });
    }

    const requirements = normalizeRecipeIngredients(recipe, quantity);
    const ingredientIds = requirements.map((r) => r.ingredientId);

    const work = async (session) => {
      const canRollback = !session;
      const ingredients = await ingredientModel
        .find({ _id: { $in: ingredientIds } })
        .session(session || null)
        .lean();
      const byId = new Map(ingredients.map((i) => [String(i._id), i]));

      const missingIngredients = ingredientIds.filter((id) => !byId.has(id));
      if (missingIngredients.length > 0) {
        const error = new Error("Công thức có nguyên liệu không tồn tại.");
        error.status = 409;
        error.details = { missingIngredients };
        throw error;
      }

      const shortages = [];
      requirements.forEach((reqRow) => {
        const ing = byId.get(String(reqRow.ingredientId));
        const stock = Math.max(0, toNumber(ing?.stock, 0));
        const need = Math.max(0, toNumber(reqRow.quantity, 0));
        if (stock < need) {
          shortages.push({
            ingredientId: String(reqRow.ingredientId),
            name: ing?.name,
            unit: ing?.unit,
            stock,
            need,
          });
        }
      });

      if (shortages.length > 0) {
        const error = new Error("Không đủ tồn kho nguyên liệu.");
        error.status = 409;
        error.details = { shortages };
        throw error;
      }

      const snapshots = [];
      const rollback = async () => {
        if (!canRollback || snapshots.length === 0) return;
        await Promise.allSettled(
          snapshots.map((snap) =>
            ingredientModel.updateOne(
              { _id: snap.ingredientId },
              { $inc: { stock: snap.quantity } }
            )
          )
        );
      };

      try {
        for (const reqRow of requirements) {
          const need = Math.max(0, toNumber(reqRow.quantity, 0));
          const updated = await ingredientModel
            .findOneAndUpdate(
              { _id: reqRow.ingredientId, stock: { $gte: need } },
              { $inc: { stock: -need } },
              { new: true }
            )
            .session(session || null);

          if (!updated) {
            await rollback();
            const error = new Error("Tồn kho thay đổi, vui lòng thử lại.");
            error.status = 409;
            throw error;
          }

          const stockAfter = Math.max(0, toNumber(updated.stock, 0));
          snapshots.push({
            ingredientId: updated._id,
            quantity: need,
            stockBefore: stockAfter + need,
            stockAfter,
          });
        }

        const logNote = note || `Sản xuất topping: ${String(topping?.name || "")}`;

        await inventoryLogModel.insertMany(
          snapshots.map((snap) => ({
            ingredientId: snap.ingredientId,
            type: "export",
            quantity: snap.quantity,
            note: logNote,
            stockBefore: snap.stockBefore,
            stockAfter: snap.stockAfter,
          })),
          session ? { session } : {}
        );

        const updatedTopping = await toppingModel
          .findOneAndUpdate(
            { _id: toppingId },
            { $inc: { stock: quantity } },
            { new: true }
          )
          .session(session || null);

        const stockAfter = Math.max(0, toNumber(updatedTopping?.stock, 0));
        const stockBefore = stockAfter - quantity;

        await toppingStockLogModel.create(
          [
            {
              toppingId,
              type: "produce",
              quantity,
              usedIngredients: requirements.map((r) => ({
                ingredientId: r.ingredientId,
                quantity: Math.max(0, toNumber(r.quantity, 0)),
                unit: String(r.unit || ""),
                note: String(r.note || ""),
              })),
              note: logNote,
              stockBefore,
              stockAfter,
            },
          ],
          session ? { session } : {}
        );

        return { topping: updatedTopping };
      } catch (error) {
        await rollback();
        throw error;
      }
    };

    const tx = await runWithMongoTransaction(work);
    if (tx.ok) {
      return res.json({
        success: true,
        message: "Sản xuất topping thành công.",
        data: tx.result,
      });
    }

    if (tx.isTxnUnsupported) {
      const result = await work(null);
      return res.json({
        success: true,
        message: "Sản xuất topping thành công.",
        data: result,
      });
    }

    throw tx.error;
  } catch (error) {
    const status = error?.status || 500;
    const details = error?.details || null;
    const message = error?.message || "Không thể sản xuất topping.";
    console.log("PRODUCE TOPPING ERROR:", error.message);
    return res.status(status).json({ success: false, message, details });
  }
};

const listToppingLogs = async (req, res) => {
  try {
    const toppingId = String(req.query?.toppingId || "").trim();
    const type = String(req.query?.type || "").trim();
    const from = String(req.query?.from || "").trim();
    const to = String(req.query?.to || "").trim();
    const page = Math.max(1, Math.round(toNumber(req.query?.page, 1)));
    const limitRaw = Math.round(toNumber(req.query?.limit, 50));
    const limit = Math.min(200, Math.max(1, limitRaw));

    const filter = {};
    if (toppingId) {
      if (!isMongoId(toppingId)) {
        return res.status(400).json({ success: false, message: "toppingId không hợp lệ." });
      }
      filter.toppingId = toppingId;
    }
    if (type) filter.type = type;

    const dateFilter = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isFinite(d.getTime())) return res.status(400).json({ success: false, message: "from không hợp lệ." });
      dateFilter.$gte = startOfDay(d);
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isFinite(d.getTime())) return res.status(400).json({ success: false, message: "to không hợp lệ." });
      dateFilter.$lte = endOfDay(d);
    }
    if (Object.keys(dateFilter).length > 0) filter.createdAt = dateFilter;

    const [total, logs] = await Promise.all([
      toppingStockLogModel.countDocuments(filter),
      toppingStockLogModel
        .find(filter)
        .populate("toppingId", "name unit")
        .populate("usedIngredients.ingredientId", "name unit")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.json({ success: true, data: logs, pagination: { total, page, limit } });
  } catch (error) {
    console.log("LIST TOPPING LOGS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải lịch sử topping." });
  }
};

const exportToppingReport = async (req, res) => {
  try {
    const rawFrom = String(req.query?.fromDate || req.query?.from || "").trim();
    const rawTo = String(req.query?.toDate || req.query?.to || "").trim();
    const debug = String(req.query?.debug || "").trim() === "1";

    let fromDate = null;
    let toDate = null;
    const dateFilter = {};

    if (rawFrom) {
      const d = new Date(rawFrom);
      if (!Number.isFinite(d.getTime())) {
        return res.status(400).json({ success: false, message: "fromDate không hợp lệ." });
      }
      fromDate = startOfDay(d);
      dateFilter.$gte = fromDate;
    }
    if (rawTo) {
      const d = new Date(rawTo);
      if (!Number.isFinite(d.getTime())) {
        return res.status(400).json({ success: false, message: "toDate không hợp lệ." });
      }
      toDate = endOfDay(d);
      dateFilter.$lte = toDate;
    }

    const match = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [produced, sold, toppings] = await Promise.all([
      toppingStockLogModel.aggregate([
        { $match: { type: "produce", ...match } },
        { $group: { _id: "$toppingId", quantity: { $sum: "$quantity" } } },
      ]),
      toppingStockLogModel.aggregate([
        { $match: { type: "order", ...match } },
        { $group: { _id: "$toppingId", quantity: { $sum: "$quantity" } } },
      ]),
      toppingModel.find({}).sort({ name: 1 }).lean(),
    ]);

    const producedById = new Map(produced.map((p) => [String(p._id), toNumber(p.quantity, 0)]));
    const soldById = new Map(sold.map((p) => [String(p._id), toNumber(p.quantity, 0)]));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Topping Report");

    worksheet.columns = [
      { header: "STT", key: "index", width: 6 },
      { header: "Topping", key: "name", width: 26 },
      { header: "Đơn vị", key: "unit", width: 10 },
      { header: "Sản xuất", key: "produced", width: 12 },
      { header: "Đã bán", key: "sold", width: 12 },
      { header: "Tồn kho", key: "stock", width: 12 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    let logged = false;
    toppings.forEach((t, i) => {
      const row = {
        index: i + 1,
        name: String(t?.name || ""),
        unit: String(t?.unit || ""),
        produced: Math.max(0, producedById.get(String(t._id)) || 0),
        sold: Math.max(0, soldById.get(String(t._id)) || 0),
        stock: Math.max(0, toNumber(t?.stock, 0)),
      };
      if (debug && !logged) {
        const types = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v]));
        console.log("[EXPORT] sample row Topping Report", row, types);
        logged = true;
      }
      worksheet.addRow(row);
    });

    worksheet.eachRow((row, rowNumber) => {
      row.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      if (rowNumber === 1) return;
      row.getCell("D").alignment = { vertical: "middle", horizontal: "right" };
      row.getCell("E").alignment = { vertical: "middle", horizontal: "right" };
      row.getCell("F").alignment = { vertical: "middle", horizontal: "right" };
    });

    ["index", "produced", "sold", "stock"].forEach((key) => {
      worksheet.getColumn(key).numFmt = "0";
    });

    const fromStr = fromDate ? toYmd(fromDate) : "all";
    const toStr = toDate ? toYmd(toDate) : "all";
    const fileName = `topping-report-${fromStr}-${toStr}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.log("EXPORT TOPPING REPORT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xuất excel topping." });
  }
};

const getToppingDashboard = async (_req, res) => {
  try {
    const toppings = await toppingModel.find({}).sort({ name: 1 }).lean();
    const lowStock = toppings.filter((item) => Number(item.stock || 0) <= Number(item.minStock || 0));

    const buildTop = async (range) => {
      const now = new Date();
      let from = startOfDay(now);
      if (range === "7d") {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        from = startOfDay(d);
      } else if (range === "30d") {
        const d = new Date(now);
        d.setDate(d.getDate() - 29);
        from = startOfDay(d);
      }

      return toppingStockLogModel.aggregate([
        { $match: { type: "order", createdAt: { $gte: from, $lte: now } } },
        { $group: { _id: "$toppingId", quantity: { $sum: "$quantity" } } },
        { $sort: { quantity: -1 } },
        { $limit: 5 },
        { $lookup: { from: "toppings", localField: "_id", foreignField: "_id", as: "topping" } },
        { $unwind: { path: "$topping", preserveNullAndEmptyArrays: true } },
        { $project: { toppingId: "$_id", quantity: 1, name: "$topping.name", unit: "$topping.unit" } },
      ]);
    };

    const [topToday, top7d, top30d] = await Promise.all([
      buildTop("today"),
      buildTop("7d"),
      buildTop("30d"),
    ]);

    return res.json({
      success: true,
      data: {
        totalToppings: toppings.length,
        lowStockCount: lowStock.length,
        lowStockToppings: lowStock.slice(0, 10),
        topUsed: {
          today: topToday,
          days7: top7d,
          days30: top30d,
        },
      },
    });
  } catch (error) {
    console.log("TOPPING DASHBOARD ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải dashboard topping." });
  }
};

export {
  listToppingInventory,
  createToppingInventory,
  updateToppingInventory,
  previewToppingProduction,
  produceTopping,
  listToppingLogs,
  exportToppingReport,
  getToppingDashboard,
};
