import express from "express";
import { webhookSepay } from "../controllers/paymentController.js";

const paymentRouter = express.Router();

// Preferred webhook endpoint
paymentRouter.post("/sepay-webhook", webhookSepay);
// Backward compatible endpoint
paymentRouter.post("/webhook-sepay", webhookSepay);

export default paymentRouter;
