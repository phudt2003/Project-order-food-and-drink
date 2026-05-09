import express from "express";
import adminAuth from "../middleware/adminAuth.js";
import {
  listToppingInventory,
  createToppingInventory,
  updateToppingInventory,
  previewToppingProduction,
  produceTopping,
  listToppingLogs,
  exportToppingReport,
  getToppingDashboard,
} from "../controllers/toppingInventoryController.js";

const toppingInventoryRouter = express.Router();

toppingInventoryRouter.get("/", adminAuth, listToppingInventory);
toppingInventoryRouter.post("/", adminAuth, createToppingInventory);
toppingInventoryRouter.get("/dashboard", adminAuth, getToppingDashboard);
toppingInventoryRouter.get("/logs", adminAuth, listToppingLogs);
toppingInventoryRouter.get("/export", adminAuth, exportToppingReport);
toppingInventoryRouter.post("/preview", adminAuth, previewToppingProduction);
toppingInventoryRouter.post("/produce", adminAuth, produceTopping);
toppingInventoryRouter.patch("/:id", adminAuth, updateToppingInventory);

export default toppingInventoryRouter;
