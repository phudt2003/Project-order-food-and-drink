import express from "express";
import authOrAdmin from "../middleware/authOrAdmin.js";
import {
  uploadImage,
  uploadMiddleware,
  deleteImageByPublicId,
} from "../controllers/mediaController.js";

const mediaRouter = express.Router();

mediaRouter.post("/upload", authOrAdmin, (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Upload error" });
    }
    next();
  });
}, uploadImage);

mediaRouter.delete("/by-public-id", authOrAdmin, deleteImageByPublicId);

export default mediaRouter;

