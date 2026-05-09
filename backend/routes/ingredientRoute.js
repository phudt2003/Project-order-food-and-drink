import express from "express";
import adminAuth from "../middleware/adminAuth.js";
import {
  createIngredient,
  deleteIngredient,
  listIngredients,
  updateIngredient,
} from "../controllers/ingredientController.js";

const ingredientRouter = express.Router();

ingredientRouter.get("/", adminAuth, listIngredients);
ingredientRouter.post("/", adminAuth, createIngredient);
ingredientRouter.put("/:id", adminAuth, updateIngredient);
ingredientRouter.delete("/:id", adminAuth, deleteIngredient);

export default ingredientRouter;

