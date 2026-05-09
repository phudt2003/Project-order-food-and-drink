import express from "express";
import adminAuth from "../middleware/adminAuth.js";
import {
  deleteProductRecipe,
  getProductRecipe,
  listProductRecipes,
  upsertProductRecipe,
} from "../controllers/productRecipeController.js";

const productRecipeRouter = express.Router();

productRecipeRouter.post("/", adminAuth, upsertProductRecipe);
productRecipeRouter.get("/", adminAuth, listProductRecipes);
productRecipeRouter.get("/:productId", adminAuth, getProductRecipe);
productRecipeRouter.delete("/:productId", adminAuth, deleteProductRecipe);

export default productRecipeRouter;
