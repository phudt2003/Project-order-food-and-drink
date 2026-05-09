import express from "express"
import { addToCart,removeFromCart,getCart,getCartByUserId } from "../controllers/cartController.js"
import authMiddleware from "../middleware/auth.js";

const cartRouter = express.Router();

cartRouter.post("/add",authMiddleware,addToCart)
cartRouter.post("/remove",authMiddleware,removeFromCart)
cartRouter.post("/get",authMiddleware,getCart)
cartRouter.get("/",authMiddleware,getCart)
cartRouter.get("/:userId",authMiddleware,getCartByUserId)

export default cartRouter;
