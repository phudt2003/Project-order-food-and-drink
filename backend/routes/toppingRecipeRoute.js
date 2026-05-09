import express from "express";
import adminAuth from "../middleware/adminAuth.js";
import {
  deleteToppingRecipe,
  getToppingRecipe,
  upsertToppingRecipe,
} from "../controllers/toppingRecipeController.js";

const toppingRecipeRouter = express.Router();

toppingRecipeRouter.post("/", adminAuth, upsertToppingRecipe);
toppingRecipeRouter.get("/:toppingId", adminAuth, getToppingRecipe);
toppingRecipeRouter.delete("/:toppingId", adminAuth, deleteToppingRecipe);

export default toppingRecipeRouter;
