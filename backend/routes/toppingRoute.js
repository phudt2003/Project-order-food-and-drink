import express from "express";
import adminAuth from "../middleware/adminAuth.js";
import {
  deleteTopping,
  deleteToppingRecipe,
  getToppingById,
  listToppings,
  updateToppingRecipe,
  upsertTopping,
} from "../controllers/toppingController.js";

const toppingRouter = express.Router();

toppingRouter.get("/", listToppings);
toppingRouter.get("/:id", adminAuth, getToppingById);
toppingRouter.put("/:id/recipe", adminAuth, updateToppingRecipe);
toppingRouter.delete("/:id/recipe", adminAuth, deleteToppingRecipe);
toppingRouter.post("/", adminAuth, upsertTopping);
toppingRouter.delete("/:id", adminAuth, deleteTopping);

export default toppingRouter;
