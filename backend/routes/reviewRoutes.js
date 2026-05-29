import express from "express";
import authMiddleware from "../middleware/auth.js";
import adminAuth from "../middleware/adminAuth.js";
import {
  createReview,
  getReviewableProducts,
  claimReward,
  listMyReviews,
  listReviews,
  listReviewsByProduct,
  updateReview,
  deleteReview,
  updateReviewStatus,
  updateReviewReply,
} from "../controllers/reviewController.js";

const reviewRouter = express.Router();

reviewRouter.post("/", authMiddleware, createReview);
reviewRouter.get("/order/:orderId/reviewables", authMiddleware, getReviewableProducts);
reviewRouter.post("/:id/claim-reward", authMiddleware, claimReward);
reviewRouter.get("/my", authMiddleware, listMyReviews);
reviewRouter.get("/", adminAuth, listReviews);
reviewRouter.get("/:productId", listReviewsByProduct);
reviewRouter.patch("/:id/status", adminAuth, updateReviewStatus);
reviewRouter.patch("/:id/reply", adminAuth, updateReviewReply);
reviewRouter.patch("/:id", authMiddleware, updateReview);
reviewRouter.delete("/:id", authMiddleware, deleteReview);

export default reviewRouter;
