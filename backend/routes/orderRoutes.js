import express from "express";
import authMiddleware from "../middleware/auth.js";
import adminAuth from "../middleware/adminAuth.js";
import authOrAdmin from "../middleware/authOrAdmin.js";
import {
  quoteDelivery,
  previewOrderEta,
  placeOrder,
  createOrder,
  getOrderStatus,
  userOrders,
  listOrders,
  listOrdersV2,
  listOrdersForUser,
  getOrderById,
  updateStatus,
  updateOrderStatusById,
  updateExternalShippingFee,
  deleteOrderById,
  confirmOrderDelivered,
  createAddOnOrder,
} from "../controllers/orderController.js";
import { previewOrderIngredients } from "../controllers/posOrderController.js";

const orderRouter = express.Router();

// New SePay flow
orderRouter.post("/", authMiddleware, createOrder);
orderRouter.post("/create", authMiddleware, createOrder);
orderRouter.post("/eta", authMiddleware, previewOrderEta);
orderRouter.post("/preview", authMiddleware, previewOrderIngredients);
orderRouter.get("/:orderId/status", authMiddleware, getOrderStatus);
orderRouter.get("/status/:id", authMiddleware, getOrderStatus);

// New v2 endpoints for orders collection
orderRouter.get("/", authOrAdmin, listOrdersV2);
orderRouter.get("/my", authMiddleware, listOrdersForUser);
orderRouter.patch("/:id/status", adminAuth, updateOrderStatusById);
orderRouter.patch("/:id/external-shipping", adminAuth, updateExternalShippingFee);
orderRouter.post("/:id/confirm-delivered", authMiddleware, confirmOrderDelivered);
orderRouter.post("/:id/add-on", authMiddleware, createAddOnOrder);
orderRouter.delete("/:id", adminAuth, deleteOrderById);

// Legacy endpoints kept for compatibility
orderRouter.post("/delivery-quote", authMiddleware, quoteDelivery);
orderRouter.post("/place", authMiddleware, placeOrder);
orderRouter.post("/userorders", authMiddleware, userOrders);
orderRouter.get("/list", adminAuth, listOrders);
orderRouter.post("/status", adminAuth, updateStatus);

// Keep generic :id route at the end to avoid clashing with fixed paths.
orderRouter.get("/:id", authOrAdmin, getOrderById);

export default orderRouter;
