import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import toppingModel from "../models/toppingModel.js";
import toppingRecipeModel from "../models/toppingRecipeModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeRecipeIngredients = (items) => {
  const list = Array.isArray(items) ? items : [];
  const map = new Map();

  list.forEach((entry) => {
    const ingredientId = String(entry?.ingredientId || entry?.ingredient_id || "").trim();
    const quantity = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(ingredientId) || quantity <= 0) return;

    const unit = String(entry?.unit || "").trim();
    const note = String(entry?.note || "").trim();

    const prev = map.get(ingredientId);
    if (!prev) {
      map.set(ingredientId, { ingredientId, quantity, unit, note });
      return;
    }

    map.set(ingredientId, {
      ingredientId,
      quantity: prev.quantity + quantity,
      unit: prev.unit || unit,
      note: prev.note || note,
    });
  });

  return Array.from(map.values());
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  const result = { dryRun: false, limit: null };

  args.forEach((arg) => {
    const val = String(arg || "");
    if (val === "--dry" || val === "--dry-run") result.dryRun = true;
    if (val.startsWith("--limit=")) {
      const num = Number(val.slice("--limit=".length));
      result.limit = Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
    }
  });

  return result;
};

const main = async () => {
  const { dryRun, limit } = parseArgs(process.argv);

  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in backend/.env");
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);

    const toppings = await toppingModel.find({}).select("_id name ingredients").lean();
    let migrated = 0;
    let skippedExisting = 0;
    let skippedEmpty = 0;

    for (const topping of toppings) {
      if (limit && migrated + skippedExisting + skippedEmpty >= limit) break;

      const existing = await toppingRecipeModel.findOne({ toppingId: topping._id }).select("_id").lean();
      if (existing) {
        skippedExisting += 1;
        console.log(`[SKIP] ${topping.name || ""} (${topping._id}) already migrated.`);
        continue;
      }

      const normalized = normalizeRecipeIngredients(topping.ingredients);
      if (normalized.length === 0) {
        skippedEmpty += 1;
        console.log(`[SKIP] ${topping.name || ""} (${topping._id}) has no recipe.`);
        continue;
      }

      if (dryRun) {
        migrated += 1;
        console.log(`[DRY]  ${topping.name || ""} (${topping._id}) -> ${normalized.length} ingredients.`);
        continue;
      }

      await toppingRecipeModel.create({
        toppingId: topping._id,
        ingredients: normalized,
      });
      migrated += 1;
      console.log(`[OK]   ${topping.name || ""} (${topping._id}) -> ${normalized.length} ingredients.`);
    }

    console.log(
      `[DONE] migrated=${migrated} skippedExisting=${skippedExisting} skippedEmpty=${skippedEmpty} dryRun=${dryRun}`
    );
  } catch (error) {
    if (error?.code === 11000 || String(error?.message || "").includes("E11000")) {
      console.error("[WARN] Duplicate key encountered (script is idempotent).");
      process.exitCode = 0;
      return;
    }

    console.error("[ERROR] MIGRATION FAILED:", error?.message || error);
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
