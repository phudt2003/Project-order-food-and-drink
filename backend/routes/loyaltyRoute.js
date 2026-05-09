import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  applyReferralCode,
  getCheckinCalendar,
  getCheckinStatus,
  checkinToday,
  claimMission,
  getLoyaltySummary,
  listCoinTransactions,
  redeemVoucherByCoins,
} from "../controllers/loyaltyController.js";

const loyaltyRouter = express.Router();

loyaltyRouter.get("/summary", authMiddleware, getLoyaltySummary);
loyaltyRouter.get("/checkin-calendar", authMiddleware, getCheckinCalendar);
loyaltyRouter.get("/checkin-status", authMiddleware, getCheckinStatus);
loyaltyRouter.post("/checkin", authMiddleware, checkinToday);
loyaltyRouter.post("/missions/claim", authMiddleware, claimMission);
loyaltyRouter.post("/redeem", authMiddleware, redeemVoucherByCoins);
loyaltyRouter.get("/transactions", authMiddleware, listCoinTransactions);
loyaltyRouter.post("/referral/apply", authMiddleware, applyReferralCode);

export default loyaltyRouter;
