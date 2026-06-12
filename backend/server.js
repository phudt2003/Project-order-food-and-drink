import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

import express from "express";
import cors from "cors";
import compression from "compression";
import { connectDB } from "./config/db.js";

import foodRouter from "./routes/foodRoute.js";
import categoryRouter from "./routes/categoryRoute.js";
import userRouter from "./routes/userRoutes.js";
import cartRouter from "./routes/cartRoute.js";
import orderRouter from "./routes/orderRoutes.js";
import paymentRouter from "./routes/paymentRoutes.js";
import voucherRouter from "./routes/voucherRoute.js";
import reviewRouter from "./routes/reviewRoutes.js";
import statsRouter from "./routes/stats.js";
import adminRouter from "./routes/adminRoutes.js";
import ingredientRouter from "./routes/ingredientRoute.js";
import productRecipeRouter from "./routes/productRecipeRoute.js";
import inventoryRouter from "./routes/inventoryRoute.js";
import loyaltyRouter from "./routes/loyaltyRoute.js";
import toppingRouter from "./routes/toppingRoute.js";
import toppingInventoryRouter from "./routes/toppingInventoryRoute.js";
import toppingRecipeRouter from "./routes/toppingRecipeRoute.js";
import mediaRouter from "./routes/mediaRoutes.js";
import exportRouter from "./routes/exportRoute.js";
import { uploadsDir } from "./utils/paths.js";
import { startVoucherScheduler } from "./jobs/voucherScheduler.js";
import { startMediaCleanupScheduler } from "./jobs/mediaCleanupScheduler.js";
import { startOrderPaymentTimeoutScheduler } from "./jobs/orderPaymentTimeoutScheduler.js";

const app = express();
const port = process.env.PORT || 4000;

// middleware
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.path.startsWith("/images")) {
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  } else if (req.path.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

const boot = async () => {
  // connect database
  await connectDB();

  // start background jobs
  startVoucherScheduler();
  startMediaCleanupScheduler();
  startOrderPaymentTimeoutScheduler();

  // start server
  app.listen(port, () => {
    console.log(`Server Started on port ${port}`);
  });
};

// routes
app.use("/api/product", foodRouter);
app.use("/api/category", categoryRouter);
app.use("/images", express.static(uploadsDir));
app.use("/api/user", userRouter);
app.use("/api/cart", cartRouter);
app.use("/api/order", orderRouter);
app.use("/api/orders", orderRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/voucher", voucherRouter);
app.use("/api/vouchers", voucherRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/stats", statsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/ingredients", ingredientRouter);
app.use("/api/product-recipes", productRecipeRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/loyalty", loyaltyRouter);
app.use("/api/toppings", toppingRouter);
app.use("/api/topping-recipes", toppingRecipeRouter);
app.use("/api/topping-inventory", toppingInventoryRouter);
app.use("/api/media", mediaRouter);
app.use("/api/export", exportRouter);

// test route
app.get("/", (req, res) => {
  res.send("API Working ðŸš€");
});

// Handle malformed JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON payload"
    });
  }
  next(err);
});

// global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

boot();

