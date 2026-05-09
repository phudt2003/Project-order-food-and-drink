import express from "express";
import {
  getRevenueSeries,
  getSummary,
  getTopProducts,
  getOrderStatusStats,
  getDashboardStats,
  exportRevenueReport,
} from "../controllers/statsController.js";
import adminAuth from "../middleware/adminAuth.js";

const statsRouter = express.Router();

statsRouter.get("/revenue", adminAuth, getRevenueSeries);
statsRouter.get("/summary", adminAuth, getSummary);
statsRouter.get("/top-products", adminAuth, getTopProducts);
statsRouter.get("/order-status", adminAuth, getOrderStatusStats);
statsRouter.get("/dashboard", adminAuth, getDashboardStats);
statsRouter.get("/export-revenue", adminAuth, exportRevenueReport);

export default statsRouter;
