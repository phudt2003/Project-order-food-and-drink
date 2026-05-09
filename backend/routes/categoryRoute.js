import express from "express";
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategory,
  updateCategory,
} from "../controllers/categoryController.js";
import adminAuth from "../middleware/adminAuth.js";

const categoryRouter = express.Router();

categoryRouter.get("/list", listCategory);
categoryRouter.post("/add", adminAuth, createCategory);
categoryRouter.get("/:id", getCategoryById);
categoryRouter.put("/update/:id", adminAuth, updateCategory);
categoryRouter.delete("/:id", adminAuth, deleteCategory);

export default categoryRouter;
