import express from "express"
import { addFood,listFood,removeFood,getFoodById,updateFood,updateFoodStatus } from "../controllers/foodController.js"
import multer from "multer"
import adminAuth from "../middleware/adminAuth.js";

const foodRouter = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MEDIA_MAX_FILE_BYTES ?? 5 * 1024 * 1024) || 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ok = String(file?.mimetype || "").toLowerCase().startsWith("image/");
    cb(ok ? null : new Error("Only image uploads are allowed"), ok);
  },
});

foodRouter.post("/add", adminAuth, upload.single("image"), addFood)
foodRouter.get("/list",listFood)
foodRouter.get("/:id",getFoodById)
foodRouter.put("/update/:id", adminAuth, upload.single("image"), updateFood)
foodRouter.patch("/status/:id", adminAuth, updateFoodStatus);
foodRouter.post("/remove", adminAuth, removeFood);

export default foodRouter;
