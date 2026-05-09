import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import ingredientModel from "../models/ingredientModel.js";
import inventoryLogModel from "../models/inventoryLogModel.js";
import orderModel from "../models/orderModel.js";
import productRecipeModel from "../models/productRecipeModel.js";
import toppingModel from "../models/toppingModel.js";
import toppingRecipeModel from "../models/toppingRecipeModel.js";
import toppingStockLogModel from "../models/toppingStockLogModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const printSample = (label, list, mapper) => {
  const sample = (list || []).slice(0, 3).map(mapper);
  console.log(`[SAMPLE] ${label}:`, sample);
};

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in backend/.env");
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    const legacyRecipeCount = collections.includes("recipes")
      ? await db.collection("recipes").countDocuments()
      : 0;

    const [
      ingredientCount,
      toppingCount,
      toppingRecipeCount,
      productRecipeCount,
      productionCount,
      orderCount,
      inventoryLogCount,
    ] = await Promise.all([
      ingredientModel.countDocuments(),
      toppingModel.countDocuments(),
      toppingRecipeModel.countDocuments(),
      productRecipeModel.countDocuments(),
      toppingStockLogModel.countDocuments({ type: "produce" }),
      orderModel.countDocuments(),
      inventoryLogModel.countDocuments(),
    ]);

    console.log("[COUNTS]", {
      ingredients: ingredientCount,
      toppings: toppingCount,
      recipes: legacyRecipeCount,
      toppingRecipes: toppingRecipeCount,
      productRecipes: productRecipeCount,
      productionLogs: productionCount,
      orders: orderCount,
      inventoryLogs: inventoryLogCount,
    });

    const [ingredients, toppings, toppingRecipes, productRecipes, productionLogs] = await Promise.all([
      ingredientModel.find({}).sort({ createdAt: -1 }).limit(3).lean(),
      toppingModel.find({}).sort({ createdAt: -1 }).limit(3).lean(),
      toppingRecipeModel.find({}).sort({ createdAt: -1 }).limit(3).lean(),
      productRecipeModel.find({}).sort({ createdAt: -1 }).limit(3).lean(),
      toppingStockLogModel.find({ type: "produce" }).sort({ createdAt: -1 }).limit(3).lean(),
    ]);

    printSample("ingredients", ingredients, (i) => ({
      id: String(i?._id),
      name: i?.name,
      stock: i?.stock,
      unit: i?.unit,
    }));
    printSample("toppings", toppings, (t) => ({
      id: String(t?._id),
      name: t?.name,
      stock: t?.stock,
      unit: t?.unit,
    }));
    printSample("topping_recipes", toppingRecipes, (r) => ({
      id: String(r?._id),
      toppingId: String(r?.toppingId || ""),
      ingredients: Array.isArray(r?.ingredients) ? r.ingredients.length : 0,
    }));
    printSample("product_recipes", productRecipes, (r) => ({
      id: String(r?._id),
      productId: String(r?.productId || ""),
      ingredients: Array.isArray(r?.ingredients) ? r.ingredients.length : 0,
    }));
    printSample("production_logs", productionLogs, (l) => ({
      id: String(l?._id),
      toppingId: String(l?.toppingId || ""),
      quantity: l?.quantity,
      createdAt: l?.createdAt,
    }));
  } catch (error) {
    console.error("[ERROR] CHECK FAILED:", error?.message || error);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
};

main().catch((error) => {
  console.error("[ERROR] UNHANDLED:", error?.message || error);
  process.exitCode = 1;
});
