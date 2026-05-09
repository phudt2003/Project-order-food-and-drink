import express from "express";
import adminAuth from "../middleware/adminAuth.js";
import {
  exportStock,
  exportImportLogsExcel,
  getInventoryDashboard,
  getStockByDay,
  getTopUsed,
  importStock,
  listInventoryLogs,
  listLowStock,
} from "../controllers/inventoryController.js";
import { smartExport } from "../controllers/exportSmartController.js";

const inventoryRouter = express.Router();

inventoryRouter.get("/dashboard", adminAuth, getInventoryDashboard);
inventoryRouter.get("/low-stock", adminAuth, listLowStock);
inventoryRouter.get("/top-used", adminAuth, getTopUsed);
inventoryRouter.get("/stock-by-day", adminAuth, getStockByDay);
inventoryRouter.get("/logs", adminAuth, listInventoryLogs);
inventoryRouter.get("/import/excel", adminAuth, exportImportLogsExcel);
inventoryRouter.post("/import", adminAuth, importStock);
inventoryRouter.post("/export", adminAuth, exportStock);
inventoryRouter.post("/export-smart", adminAuth, smartExport);

export default inventoryRouter;
