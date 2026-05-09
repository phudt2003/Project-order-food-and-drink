import ExcelJS from "exceljs";
import ingredientModel from "../models/ingredientModel.js";
import inventoryLogModel from "../models/inventoryLogModel.js";
import toppingModel from "../models/toppingModel.js";
import toppingStockLogModel from "../models/toppingStockLogModel.js";

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

const buildDateFilter = ({ fromDate, toDate }) => {
  const filter = {};
  let from = null;
  let to = null;

  if (fromDate) {
    const d = new Date(fromDate);
    if (Number.isFinite(d.getTime())) {
      from = startOfDay(d);
      filter.$gte = from;
    }
  }
  if (toDate) {
    const d = new Date(toDate);
    if (Number.isFinite(d.getTime())) {
      to = endOfDay(d);
      filter.$lte = to;
    }
  }

  return { filter, from, to };
};

const summarizeUsedIngredients = (list = []) =>
  list
    .map((row) => {
      const name = row?.ingredientId?.name || "";
      const unit = row?.unit || row?.ingredientId?.unit || "";
      const qty = row?.quantity ?? "";
      if (!name) return "";
      return `${name} (${qty}${unit ? ` ${unit}` : ""})`;
    })
    .filter(Boolean)
    .join(", ");

// Remove commas and return number only if valid, otherwise null
const cleanNumber = (val) => {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const str = String(val).replace(/,/g, "").trim();
  if (!str) return null;
  if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
};

const toNumber = (val, fallback = 0) => {
  const n = cleanNumber(val);
  return n == null ? fallback : n;
};

const normalizeNumericFields = (obj, numericKeys = []) => {
  const copy = { ...obj };
  Object.keys(copy).forEach((k) => {
    if (!numericKeys.includes(k)) return;
    const v = copy[k];
    if (v != null && typeof v === "object" && typeof v.toString === "function") {
      const asStr = v.toString();
      const cleaned = cleanNumber(asStr);
      if (cleaned != null) copy[k] = cleaned;
      return;
    }
    const cleaned = cleanNumber(v);
    if (cleaned != null) copy[k] = cleaned;
  });
  return copy;
};

const exportInventoryBundle = async (req, res) => {
  try {
    const fromDate = String(req.query?.fromDate || req.query?.from || "").trim();
    const toDate = String(req.query?.toDate || req.query?.to || "").trim();
    const debug = String(req.query?.debug || "").trim() === "1";

    const { filter: dateFilter, from, to } = buildDateFilter({ fromDate, toDate });
    const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
    const num = (val) => toNumber(val, 0);

    const [ingredients, toppings] = await Promise.all([
      ingredientModel.find({}).sort({ name: 1 }).lean(),
      toppingModel.find({}).sort({ name: 1 }).lean(),
    ]);

    const [inventoryLogs, inventoryLogsBefore, toppingLogs] = await Promise.all([
      inventoryLogModel
        .find(createdAtFilter)
        .populate("ingredientId", "name unit")
        .sort({ createdAt: -1 })
        .lean(),
      from
        ? inventoryLogModel
            .find({ createdAt: { $lt: from } })
            .sort({ createdAt: -1 })
            .lean()
        : [],
      toppingStockLogModel
        .find({ ...createdAtFilter })
        .populate("toppingId", "name unit stock")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const ingredientById = new Map(ingredients.map((i) => [String(i._id), i]));
    const toppingById = new Map(toppings.map((t) => [String(t._id), t]));

    // Opening stock (last stockAfter before 'from')
    const openingByIngredient = new Map();
    if (from) {
      const lastBefore = inventoryLogsBefore.reduce((map, log) => {
        const id = String(log.ingredientId);
        if (!id) return map;
        if (!map.has(id) || log.createdAt > map.get(id).createdAt) {
          map.set(id, log);
        }
        return map;
      }, new Map());
      lastBefore.forEach((log, id) => {
        if (log?.stockAfter != null) openingByIngredient.set(id, num(log.stockAfter));
      });
    }

    const importsByIng = new Map();
    const exportsByIng = new Map();
    const usedByIng = new Map();

    inventoryLogs.forEach((log) => {
      const id = String(log?.ingredientId?._id || log?.ingredientId || "");
      if (!id || !ingredientById.has(id)) return;
      if (log.type === "import") {
        importsByIng.set(id, (importsByIng.get(id) || 0) + num(log.quantity));
      } else if (log.type === "export") {
        exportsByIng.set(id, (exportsByIng.get(id) || 0) + num(log.quantity));
      } else if (log.type === "order") {
        usedByIng.set(id, (usedByIng.get(id) || 0) + num(log.quantity));
        exportsByIng.set(id, (exportsByIng.get(id) || 0) + num(log.quantity));
      }
    });

    const topUsedArray = Array.from(usedByIng.entries())
      .map(([id, quantity]) => ({
        ingredientId: id,
        quantity,
        name: ingredientById.get(id)?.name || "",
        unit: ingredientById.get(id)?.unit || "",
      }))
      .sort((a, b) => b.quantity - a.quantity);

    const ingredientRows = ingredients.map((ing, idx) => {
      const id = String(ing._id);
      const opening = openingByIngredient.get(id) || 0;
      const totalImport = importsByIng.get(id) || 0;
      const totalExport = exportsByIng.get(id) || 0; // bán + hỏng (order + export)
      const rawClosing = opening + totalImport - totalExport;
      const closing = Math.max(0, rawClosing); // không cho âm
      const warning = rawClosing < 0 ? "Âm tồn, cần kiểm tra" : "";
      return {
        index: idx + 1,
        name: String(ing.name || ""),
        unit: String(ing.unit || ""),
        opening,
        import: totalImport,
        export: totalExport,
        closing,
        warning,
      };
    });

    const toppingAgg = new Map();
    toppingLogs.forEach((log) => {
      const id = String(log?.toppingId?._id || log?.toppingId || "");
      if (!id || !toppingById.has(id)) return;
      if (!toppingAgg.has(id)) toppingAgg.set(id, { produce: 0, order: 0, export: 0 });
      const agg = toppingAgg.get(id);
      if (log.type === "produce") agg.produce += num(log.quantity);
      else if (log.type === "order") agg.order += num(log.quantity);
      else if (log.type === "export") agg.export += num(log.quantity);
    });

    const wasteRows = [];
    inventoryLogs
      .filter((l) => l.type === "export")
      .forEach((log) => {
        wasteRows.push({
          index: wasteRows.length + 1,
          date: formatVietnamDateTime(log.createdAt),
          kind: "Nguyen lieu",
          name: String(log?.ingredientId?.name || ""),
          quantity: num(log?.quantity || 0),
          unit: String(log?.ingredientId?.unit || ""),
          note: String(log?.note || ""),
        });
      });
    toppingLogs
      .filter((l) => l.type === "export")
      .forEach((log) => {
        wasteRows.push({
          index: wasteRows.length + 1,
          date: formatVietnamDateTime(log.createdAt),
          kind: "Topping",
          name: String(log?.toppingId?.name || ""),
          quantity: num(log?.quantity || 0),
          unit: String(log?.toppingId?.unit || ""),
          note: String(log?.note || ""),
        });
      });

    const totalIngredientUsed = Array.from(usedByIng.values()).reduce((s, v) => s + v, 0);
    const totalImportAll = Array.from(importsByIng.values()).reduce((s, v) => s + v, 0);
    const totalExportAll = Array.from(exportsByIng.values()).reduce((s, v) => s + v, 0);

    const workbook = new ExcelJS.Workbook();
    const numberFmt = "0";

    const debugLogged = new Set();
    const logRowTypes = (label, row) => {
      if (!debug || !row || debugLogged.has(label)) return;
      const types = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, typeof v])
      );
      console.log(`[EXPORT] sample row ${label}`, row, types);
      debugLogged.add(label);
    };

    // Sheet 1: Tong quan
    const sheetOverview = workbook.addWorksheet("Tong quan");
    sheetOverview.columns = [
      { header: "Chi so", key: "label", width: 30 },
      { header: "Gia tri", key: "value", width: 18 },
    ];
    [
      { label: "Tu ngay", value: from ? fromDate : "" },
      { label: "Den ngay", value: to ? toDate : "" },
      { label: "Tong nguyen lieu da dung", value: totalIngredientUsed },
      { label: "Tong nhap kho", value: totalImportAll },
      { label: "Tong xuat kho (ban + hong)", value: totalExportAll },
    ].forEach((row) => {
      const prepared = normalizeNumericFields(row, ["value"]);
      logRowTypes("Tong quan", prepared);
      sheetOverview.addRow(prepared);
    });
    sheetOverview.getRow(1).font = { bold: true };
    sheetOverview.getColumn("value").numFmt = numberFmt;

    // Sheet 2: Nguyen lieu
    const sheetIng = workbook.addWorksheet("Nguyen lieu");
    sheetIng.columns = [
      { header: "STT", key: "index", width: 6 },
      { header: "Nguyen lieu", key: "name", width: 26 },
      { header: "Don vi", key: "unit", width: 10 },
      { header: "Ton dau ky", key: "opening", width: 14 },
      { header: "Tong nhap", key: "import", width: 14 },
      { header: "Tong xuat (ban + hong)", key: "export", width: 18 },
      { header: "Ton cuoi ky", key: "closing", width: 14 },
      { header: "Canh bao", key: "warning", width: 18 },
    ];
    ingredientRows.forEach((r) => {
      const prepared = normalizeNumericFields(r, ["opening", "import", "export", "closing"]);
      logRowTypes("Nguyen lieu", prepared);
      sheetIng.addRow(prepared);
    });
    sheetIng.getRow(1).font = { bold: true };
    ["opening", "import", "export", "closing"].forEach((k) => {
      sheetIng.getColumn(k).numFmt = numberFmt;
    });
    sheetIng.views = [{ state: "frozen", ySplit: 1 }];

    // Sheet 3: Top nguyen lieu dung nhieu
    const sheetTop = workbook.addWorksheet("Top nguyen lieu");
    sheetTop.columns = [
      { header: "STT", key: "index", width: 6 },
      { header: "Nguyen lieu", key: "name", width: 26 },
      { header: "So luong da dung", key: "quantity", width: 16 },
      { header: "Don vi", key: "unit", width: 10 },
    ];
    topUsedArray.forEach((row, i) =>
      (() => {
        const prepared = normalizeNumericFields(
          {
            index: i + 1,
            name: row.name,
            quantity: row.quantity,
            unit: row.unit,
          },
          ["quantity"]
        );
        logRowTypes("Top nguyen lieu", prepared);
        sheetTop.addRow(prepared);
      })()
    );
    sheetTop.getRow(1).font = { bold: true };
    sheetTop.getColumn("quantity").numFmt = numberFmt;
    sheetTop.views = [{ state: "frozen", ySplit: 1 }];

    // Sheet 4: Topping / thanh pham
    const sheetTopPing = workbook.addWorksheet("Topping");
    sheetTopPing.columns = [
      { header: "STT", key: "index", width: 6 },
      { header: "Topping", key: "name", width: 26 },
      { header: "San xuat", key: "produce", width: 12 },
      { header: "Da dung", key: "order", width: 12 },
      { header: "Hu hong", key: "export", width: 12 },
      { header: "Ton kho", key: "stock", width: 12 },
      { header: "Don vi", key: "unit", width: 10 },
    ];
    toppings.forEach((t, idx) => {
      const agg = toppingAgg.get(String(t._id)) || { produce: 0, order: 0, export: 0 };
      const prepared = normalizeNumericFields(
        {
          index: idx + 1,
          name: t.name || "",
          produce: agg.produce,
          order: agg.order,
          export: agg.export,
          stock: num(t.stock || 0),
          unit: t.unit || "",
        },
        ["produce", "order", "export", "stock"]
      );
      logRowTypes("Topping", prepared);
      sheetTopPing.addRow(prepared);
    });
    sheetTopPing.getRow(1).font = { bold: true };
    ["produce", "order", "export", "stock"].forEach((k) => {
      sheetTopPing.getColumn(k).numFmt = numberFmt;
    });
    sheetTopPing.views = [{ state: "frozen", ySplit: 1 }];

    // Sheet 6: Xuat kho hu hong / do vo
    const sheetWaste = workbook.addWorksheet("Xuat kho hong");
    sheetWaste.columns = [
      { header: "STT", key: "index", width: 6 },
      { header: "Ngay (VN)", key: "date", width: 20 },
      { header: "Loai", key: "kind", width: 12 },
      { header: "Ten", key: "name", width: 26 },
      { header: "So luong", key: "quantity", width: 12 },
      { header: "Don vi", key: "unit", width: 10 },
      { header: "Ly do", key: "note", width: 28 },
    ];
    wasteRows.forEach((r) => {
      const prepared = normalizeNumericFields(r, ["quantity"]);
      logRowTypes("Xuat kho hong", prepared);
      sheetWaste.addRow(prepared);
    });
    sheetWaste.getRow(1).font = { bold: true };
    sheetWaste.getColumn("quantity").numFmt = numberFmt;
    sheetWaste.views = [{ state: "frozen", ySplit: 1 }];

    if (debug) {
      console.log("[EXPORT] overview", {
        from,
        to,
        ingredients: ingredients.length,
        toppings: toppings.length,
        logs: inventoryLogs.length,
        toppingLogs: toppingLogs.length,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `inventory-export.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.log("EXPORT INVENTORY BUNDLE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Khong the xuat bao cao kho." });
  }
};

export { exportInventoryBundle };
