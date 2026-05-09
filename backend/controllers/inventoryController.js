import mongoose from "mongoose";
import ExcelJS from "exceljs";
import ingredientModel from "../models/ingredientModel.js";
import inventoryLogModel from "../models/inventoryLogModel.js";

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

// Excel should receive a formatted string (avoid Excel timezone auto-conversion).
const formatVietnamDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  // "sv-SE" yields "YYYY-MM-DD HH:mm:ss" with 24h time.
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

const parseItemsPayload = (body) => {
  if (Array.isArray(body?.items)) return body.items;
  if (body?.ingredientId) return [{ ingredientId: body.ingredientId, quantity: body.quantity, note: body.note }];
  return [];
};

const applyDeltaWithLog = async ({ ingredientId, delta, type, note = "", orderId = null }) => {
  if (!isMongoId(ingredientId)) {
    return { ok: false, status: 400, message: "Ingredient id khong hop le." };
  }

  const quantity = Math.abs(toNumber(delta, 0));
  if (quantity <= 0) {
    return { ok: false, status: 400, message: "So luong khong hop le." };
  }

  const filter = { _id: ingredientId };
  if (delta < 0) {
    filter.stock = { $gte: quantity };
  }

  const updated = await ingredientModel.findOneAndUpdate(
    filter,
    { $inc: { stock: delta } },
    { new: true }
  );

  if (!updated) {
    const existed = await ingredientModel.findById(ingredientId).lean();
    if (!existed) return { ok: false, status: 404, message: "Khong tim thay nguyen lieu." };
    const available = Math.max(0, Number(existed?.stock || 0));
    return {
      ok: false,
      status: 409,
      message: `Khong du ton kho: ${existed.name} (ton: ${available}, yeu cau: ${quantity}).`,
    };
  }

  const stockAfter = Number(updated.stock || 0);
  const stockBefore = stockAfter - delta;

  const log = await inventoryLogModel.create({
    ingredientId,
    type,
    quantity,
    note: String(note || ""),
    orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
    stockBefore,
    stockAfter,
  });

  return { ok: true, ingredient: updated, log };
};

const importStock = async (req, res) => {
  try {
    const items = parseItemsPayload(req.body);
    if (items.length === 0) return res.status(400).json({ success: false, message: "Thiếu danh sách nhập kho." });

    const noteBase = String(req.body?.note || "").trim();
    const results = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const ingredientId = String(item?.ingredientId || "").trim();
      const quantity = toNumber(item?.quantity, Number.NaN);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: `So luong dong ${index + 1} phai lon hon 0.`,
        });
      }
      const note = String(item?.note || noteBase || "Nhap kho").trim();
      const applied = await applyDeltaWithLog({ ingredientId, delta: quantity, type: "import", note });
      if (!applied.ok) return res.status(applied.status).json({ success: false, message: applied.message });
      results.push(applied);
    }

    return res.json({
      success: true,
      message: "Nhập kho thành công.",
      data: results.map((item) => ({ ingredient: item.ingredient, log: item.log })),
    });
  } catch (error) {
    console.log("IMPORT STOCK ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể nhập kho." });
  }
};

const exportStock = async (req, res) => {
  try {
    const items = parseItemsPayload(req.body);
    if (items.length === 0) return res.status(400).json({ success: false, message: "Thiếu danh sách xuất kho." });

    const noteBase = String(req.body?.note || req.body?.reason || "").trim();
    const results = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const ingredientId = String(item?.ingredientId || "").trim();
      const quantity = toNumber(item?.quantity, Number.NaN);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: `So luong dong ${index + 1} phai lon hon 0.`,
        });
      }
      const note = String(item?.note || noteBase || "Xuat kho").trim();
      const applied = await applyDeltaWithLog({ ingredientId, delta: -quantity, type: "export", note });
      if (!applied.ok) return res.status(applied.status).json({ success: false, message: applied.message });
      results.push(applied);
    }

    return res.json({
      success: true,
      message: "Xuất kho thành công.",
      data: results.map((item) => ({ ingredient: item.ingredient, log: item.log })),
    });
  } catch (error) {
    console.log("EXPORT STOCK ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xuất kho." });
  }
};

const listInventoryLogs = async (req, res) => {
  try {
    const ingredientId = String(req.query?.ingredientId || "").trim();
    const type = String(req.query?.type || "").trim();
    const from = String(req.query?.from || "").trim();
    const to = String(req.query?.to || "").trim();
    const page = Math.max(1, Math.round(toNumber(req.query?.page, 1)));
    const limitRaw = Math.round(toNumber(req.query?.limit, 50));
    const limit = Math.min(200, Math.max(1, limitRaw));

    const filter = {};
    if (ingredientId) {
      if (!isMongoId(ingredientId)) return res.status(400).json({ success: false, message: "ingredientId không hợp lệ." });
      filter.ingredientId = ingredientId;
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
      inventoryLogModel.countDocuments(filter),
      inventoryLogModel
        .find(filter)
        .populate("ingredientId", "name unit")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.json({ success: true, data: logs, pagination: { total, page, limit } });
  } catch (error) {
    console.log("LIST INVENTORY LOGS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải lịch sử kho." });
  }
};

// Export Excel for "import" logs (thêm nguyên liệu) in Vietnam timezone.
const exportImportLogsExcel = async (req, res) => {
  try {
    const ingredientId = String(req.query?.ingredientId || "").trim();
    const from = String(req.query?.from || "").trim();
    const to = String(req.query?.to || "").trim();
    const debug = String(req.query?.debug || "").trim() === "1";

    const filter = { type: "import" };
    if (ingredientId) {
      if (!isMongoId(ingredientId)) {
        return res.status(400).json({ success: false, message: "ingredientId không hợp lệ." });
      }
      filter.ingredientId = ingredientId;
    }

    const dateFilter = {};
    let fromDate = null;
    let toDate = null;

    if (from) {
      const d = new Date(from);
      if (!Number.isFinite(d.getTime())) {
        return res.status(400).json({ success: false, message: "from không hợp lệ." });
      }
      fromDate = startOfDay(d);
      dateFilter.$gte = fromDate;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isFinite(d.getTime())) {
        return res.status(400).json({ success: false, message: "to không hợp lệ." });
      }
      toDate = endOfDay(d);
      dateFilter.$lte = toDate;
    }

    if (Object.keys(dateFilter).length > 0) filter.createdAt = dateFilter;

    const logs = await inventoryLogModel
      .find(filter)
      .populate("ingredientId", "name unit")
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Nhập kho");

    worksheet.columns = [
      { header: "STT", key: "index", width: 6 },
      { header: "Thời gian (VN)", key: "createdAt", width: 20 },
      { header: "Nguyên liệu", key: "ingredientName", width: 26 },
      { header: "Đơn vị", key: "unit", width: 10 },
      { header: "Số lượng", key: "quantity", width: 12 },
      { header: "Tồn trước", key: "stockBefore", width: 12 },
      { header: "Tồn sau", key: "stockAfter", width: 12 },
      { header: "Ghi chú", key: "note", width: 30 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    let logged = false;
    logs.forEach((log, i) => {
      const ingredient = log?.ingredientId || {};
      const row = {
        index: i + 1,
        createdAt: formatVietnamDateTime(log?.createdAt),
        ingredientName: String(ingredient?.name || ""),
        unit: String(ingredient?.unit || ""),
        quantity: Math.max(0, toNumber(log?.quantity, 0)),
        stockBefore: log?.stockBefore != null ? toNumber(log.stockBefore, 0) : "",
        stockAfter: log?.stockAfter != null ? toNumber(log.stockAfter, 0) : "",
        note: String(log?.note || ""),
      };
      if (debug && !logged) {
        const types = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v]));
        console.log("[EXPORT] sample row Nhap kho", row, types);
        logged = true;
      }
      worksheet.addRow(row);
    });

    ["index", "quantity", "stockBefore", "stockAfter"].forEach((key) => {
      worksheet.getColumn(key).numFmt = "0";
    });

    worksheet.eachRow((row, rowNumber) => {
      row.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      if (rowNumber === 1) return;
      row.getCell("E").alignment = { vertical: "middle", horizontal: "right" };
      row.getCell("F").alignment = { vertical: "middle", horizontal: "right" };
      row.getCell("G").alignment = { vertical: "middle", horizontal: "right" };
    });

    const fromStr = fromDate ? toYmd(fromDate) : "all";
    const toStr = toDate ? toYmd(toDate) : "all";
    const fileName = `nhap-kho-${fromStr}-${toStr}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.log("EXPORT IMPORT LOGS EXCEL ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xuất excel nhập kho." });
  }
};

const listLowStock = async (_req, res) => {
  try {
    const ingredients = await ingredientModel.find({}).sort({ name: 1 }).lean();
    const low = ingredients.filter((item) => Number(item.stock || 0) <= Number(item.minStock || 0));
    return res.json({ success: true, data: low });
  } catch (error) {
    console.log("LOW STOCK ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải cảnh báo tồn kho." });
  }
};

const aggregateTopUsed = async ({ from, to, limit = 20 }) => {
  const data = await inventoryLogModel.aggregate([
    {
      $match: {
        type: "order",
        ingredientId: { $ne: null },
        createdAt: { $gte: from, $lte: to },
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: { path: "$order", preserveNullAndEmptyArrays: false } },
    { $match: { "order.status": "completed", "order.inventory.status": "deducted" } },
    { $group: { _id: "$ingredientId", quantity: { $sum: "$quantity" } } },
    { $sort: { quantity: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "ingredients",
        localField: "_id",
        foreignField: "_id",
        as: "ingredient",
      },
    },
    { $unwind: { path: "$ingredient", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        ingredientId: "$_id",
        quantity: 1,
        value: "$quantity",
        name: "$ingredient.name",
        unit: "$ingredient.unit",
      },
    },
  ]);

  return data;
};

const getTopUsed = async (req, res) => {
  try {
    const range = String(req.query?.range || "").trim().toLowerCase();
    const now = new Date();
    let from = startOfDay(now);
    let to = endOfDay(now);

    if (range === "today") {
      from = startOfDay(now);
      to = endOfDay(now);
    } else if (range === "3d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 2);
      from = startOfDay(d);
    } else if (range === "7d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      from = startOfDay(d);
    } else if (range === "30d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      from = startOfDay(d);
    } else {
      const rawFrom = String(req.query?.from || "").trim();
      const rawTo = String(req.query?.to || "").trim();
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      from = startOfDay(d);
      to = endOfDay(now);
      if (rawFrom) {
        const d = new Date(rawFrom);
        if (!Number.isFinite(d.getTime())) return res.status(400).json({ success: false, message: "from không hợp lệ." });
        from = startOfDay(d);
      }
      if (rawTo) {
        const d = new Date(rawTo);
        if (!Number.isFinite(d.getTime())) return res.status(400).json({ success: false, message: "to không hợp lệ." });
        to = endOfDay(d);
      }
    }

    const data = await aggregateTopUsed({ from, to, limit: 20 });

    console.log("TOP USED DEBUG:", {
      range,
      from,
      to,
      count: data.length,
      first: data[0] ? { ingredientId: data[0].ingredientId, quantity: data[0].quantity } : null,
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.log("TOP USED ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải thống kê nguyên liệu." });
  }
};

const getStockByDay = async (req, res) => {
  try {
    const now = new Date();
    const rawFrom = String(req.query?.from || "").trim();
    const rawTo = String(req.query?.to || "").trim();

    const fromDate = rawFrom ? new Date(rawFrom) : new Date(now);
    const toDate = rawTo ? new Date(rawTo) : new Date(now);

    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
      return res.status(400).json({ success: false, message: "from/to không hợp lệ." });
    }

    const start = startOfDay(fromDate);
    const end = endOfDay(toDate);

    const idsParam = String(req.query?.ingredientIds || "").trim();
    const ingredientIds = idsParam
      ? idsParam
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];

    if (ingredientIds.some((id) => !isMongoId(id))) {
      return res.status(400).json({ success: false, message: "ingredientIds không hợp lệ." });
    }

    const ingredientFilter = ingredientIds.length ? { _id: { $in: ingredientIds } } : {};
    const ingredients = await ingredientModel.find(ingredientFilter).sort({ name: 1 }).lean();
    const ids = ingredients.map((i) => i._id);

    const logsInRange = await inventoryLogModel
      .find({ ingredientId: { $in: ids }, createdAt: { $gte: start, $lte: end } })
      .sort({ createdAt: 1 })
      .lean();

    const baselineLogs = await inventoryLogModel.aggregate([
      { $match: { ingredientId: { $in: ids }, createdAt: { $lt: start } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$ingredientId", last: { $first: "$$ROOT" } } },
    ]);

    const baselineById = new Map(
      baselineLogs.map((item) => [String(item._id), item?.last || null])
    );

    const logsByIngredient = new Map();
    logsInRange.forEach((log) => {
      const key = String(log.ingredientId);
      if (!logsByIngredient.has(key)) logsByIngredient.set(key, []);
      logsByIngredient.get(key).push(log);
    });

    const days = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(toYmd(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const rows = days.map((day) => ({ date: day, stocks: {} }));

    const applyDelta = (log) => {
      const qty = Math.max(0, toNumber(log?.quantity, 0));
      if (log?.type === "import") return qty;
      if (log?.type === "export") return -qty;
      if (log?.type === "order") return -qty;
      return 0;
    };

    for (const ingredient of ingredients) {
      const id = String(ingredient._id);
      const logs = logsByIngredient.get(id) || [];
      const baselineLog = baselineById.get(id);

      const firstLog = logs[0] || null;
      let currentStock = null;

      if (firstLog && firstLog.stockBefore != null) {
        currentStock = toNumber(firstLog.stockBefore, 0);
      } else if (baselineLog && baselineLog.stockAfter != null) {
        currentStock = toNumber(baselineLog.stockAfter, 0);
      } else {
        currentStock = toNumber(ingredient.stock, 0);
      }

      let logIndex = 0;
      for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
        const day = days[dayIndex];
        while (logIndex < logs.length) {
          const log = logs[logIndex];
          const logDay = toYmd(log.createdAt);
          if (logDay !== day) break;

          if (log.stockAfter != null) {
            currentStock = toNumber(log.stockAfter, currentStock);
          } else {
            currentStock += applyDelta(log);
          }
          logIndex += 1;
        }

        rows[dayIndex].stocks[id] = currentStock;
      }
    }

    return res.json({
      success: true,
      data: {
        ingredients: ingredients.map((i) => ({ _id: i._id, name: i.name, unit: i.unit })),
        rows,
      },
    });
  } catch (error) {
    console.log("STOCK BY DAY ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải tồn kho theo ngày." });
  }
};

const getInventoryDashboard = async (_req, res) => {
  try {
    const ingredients = await ingredientModel.find({}).sort({ name: 1 }).lean();
    const lowStock = ingredients.filter((item) => Number(item.stock || 0) <= Number(item.minStock || 0));

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

      const to = endOfDay(now);

      const data = await aggregateTopUsed({ from, to, limit: 10 });
      console.log(`DASHBOARD TOP ${range}:`, {
        from,
        to,
        count: data.length,
        first: data[0] ? { ingredientId: data[0].ingredientId, quantity: data[0].quantity } : null,
      });
      return data;
    };

    const [topToday, top7d, top30d] = await Promise.all([buildTop("today"), buildTop("7d"), buildTop("30d")]);

    return res.json({
      success: true,
      data: {
        totalIngredients: ingredients.length,
        lowStockCount: lowStock.length,
        lowStockIngredients: lowStock.slice(0, 10),
        topUsed: {
          today: topToday,
          days7: top7d,
          days30: top30d,
        },
      },
    });
  } catch (error) {
    console.log("INVENTORY DASHBOARD ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải dashboard kho." });
  }
};

export { importStock, exportStock, listInventoryLogs, exportImportLogsExcel, listLowStock, getTopUsed, getStockByDay, getInventoryDashboard, applyDeltaWithLog };
