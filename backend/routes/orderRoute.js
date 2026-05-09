import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  quoteDelivery,
  placeOrder,
  createOrder,
  getOrderStatus,
  userOrders,
  listOrders,
  updateStatus,
} from "../controllers/orderController.js";

const orderRouter = express.Router();

// New SePay flow
orderRouter.post("/", authMiddleware, createOrder);
orderRouter.post("/create", authMiddleware, createOrder);
orderRouter.get("/:orderId/status", authMiddleware, getOrderStatus);
orderRouter.get("/status/:id", authMiddleware, getOrderStatus);

// Legacy endpoints kept for compatibility
orderRouter.post("/delivery-quote", authMiddleware, quoteDelivery);
orderRouter.post("/place", authMiddleware, placeOrder);
orderRouter.post("/userorders", authMiddleware, userOrders);
orderRouter.get("/list", listOrders);
orderRouter.get("/:id", authMiddleware, getOrderStatus);
orderRouter.post("/status", updateStatus);

export default orderRouter;
