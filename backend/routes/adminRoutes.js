import express from "express";
import { loginAdmin } from "../controllers/adminController.js";
import { searchUsers } from "../controllers/adminUserController.js";
import adminAuth from "../middleware/adminAuth.js";

const adminRouter = express.Router();

adminRouter.post("/login", loginAdmin);
adminRouter.get("/users/search", adminAuth, searchUsers);

export default adminRouter;
