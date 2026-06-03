import express from "express";
import { webhookSepay } from "../controllers/paymentController.js";

const paymentRouter = express.Router();

const webhookHealth = (req, res) => {
  res.json({
    success: true,
    message: "SePay webhook endpoint is ready. Use POST for payment callbacks.",
  });
};

paymentRouter.get("/sepay-webhook", webhookHealth);
paymentRouter.get("/webhook-sepay", webhookHealth);

// Preferred webhook endpoint
paymentRouter.post("/sepay-webhook", webhookSepay);
// Backward compatible endpoint
paymentRouter.post("/webhook-sepay", webhookSepay);

export default paymentRouter;
