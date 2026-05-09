import express from "express";
import {
  createVoucher,
  deleteVoucher,
  getAvailableVouchers,
  listAutoVouchers,
  updateAutoVouchers,
  deleteAutoVouchers,
  checkVoucherCode,
  getVoucherById,
  listVouchers,
  updateVoucher,
  updateVoucherStatus,
  validateVoucher,
  claimVoucher,
  applyVoucher,
} from "../controllers/voucherController.js";
import authMiddleware from "../middleware/auth.js";
import adminAuth from "../middleware/adminAuth.js";

const voucherRouter = express.Router();

voucherRouter.get("/", adminAuth, listVouchers);
voucherRouter.get("/auto", adminAuth, listAutoVouchers);
voucherRouter.patch("/auto", adminAuth, updateAutoVouchers);
voucherRouter.delete("/auto", adminAuth, deleteAutoVouchers);
voucherRouter.get("/check", adminAuth, checkVoucherCode);
voucherRouter.get("/available", authMiddleware, getAvailableVouchers);
voucherRouter.post("/available", authMiddleware, getAvailableVouchers);
voucherRouter.post("/validate", authMiddleware, validateVoucher);
voucherRouter.post("/claim", authMiddleware, claimVoucher);
voucherRouter.post("/apply", authMiddleware, applyVoucher);
voucherRouter.post("/", adminAuth, createVoucher);
voucherRouter.get("/:id", adminAuth, getVoucherById);
voucherRouter.put("/:id", adminAuth, updateVoucher);
voucherRouter.patch("/:id/status", adminAuth, updateVoucherStatus);
voucherRouter.delete("/:id", adminAuth, deleteVoucher);

export default voucherRouter;
