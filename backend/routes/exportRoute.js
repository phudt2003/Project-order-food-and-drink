import express from "express";
import adminAuth from "../middleware/adminAuth.js";
import { exportInventoryBundle } from "../controllers/exportController.js";

const exportRouter = express.Router();

exportRouter.get("/", adminAuth, exportInventoryBundle);

export default exportRouter;
