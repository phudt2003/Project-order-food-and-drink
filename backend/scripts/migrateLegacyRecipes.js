import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import productRecipeModel from "../models/productRecipeModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  return {
    dryRun: args.includes("--dry") || args.includes("--dry-run"),
    dropLegacy: args.includes("--drop-legacy"),
  };
};

const normalizeLegacyIngredients = (items) => {
  const list = Array.isArray(items) ? items : [];
  const map = new Map();

  list.forEach((entry) => {
    const ingredientId = String(entry?.ingredientId || entry?.ingredient_id || "").trim();
    const quantity = Math.max(0, toNumber(entry?.quantity, 0));
    if (!isMongoId(ingredientId) || quantity <= 0) return;

    const prev = map.get(ingredientId);
    if (!prev) {
      map.set(ingredientId, {
        ingredientId: new mongoose.Types.ObjectId(ingredientId),
        quantity,
        isSweetener: Boolean(entry?.isSweetener),
      });
      return;
    }

    map.set(ingredientId, {
      ingredientId: prev.ingredientId,
      quantity: prev.quantity + quantity,
      isSweetener: prev.isSweetener || Boolean(entry?.isSweetener),
    });
  });

  return Array.from(map.values());
};

const splitProductRecipeRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const ingredientRows = [];
  const toppingRows = [];

  list.forEach((row) => {
    if (row?.ingredientId) {
      ingredientRows.push({
        ingredientId: row.ingredientId,
        quantity: Math.max(0, toNumber(row?.quantity, 0)),
        isSweetener: Boolean(row?.isSweetener),
      });
      return;
    }

    if (row?.toppingId) {
      toppingRows.push({
        toppingId: row.toppingId,
        quantity: Math.max(0, toNumber(row?.quantity, 0)),
      });
    }
  });

  return { ingredientRows, toppingRows };
};

const mergeIngredientsPreferPrimary = (primaryRows, legacyRows) => {
  const map = new Map();

  (Array.isArray(primaryRows) ? primaryRows : []).forEach((row) => {
    const id = String(row?.ingredientId || "").trim();
    const quantity = Math.max(0, toNumber(row?.quantity, 0));
    if (!isMongoId(id) || quantity <= 0) return;
    map.set(id, {
      ingredientId: row.ingredientId,
      quantity,
      isSweetener: Boolean(row?.isSweetener),
      fromPrimary: true,
    });
  });

  (Array.isArray(legacyRows) ? legacyRows : []).forEach((row) => {
    const id = String(row?.ingredientId || "").trim();
    const quantity = Math.max(0, toNumber(row?.quantity, 0));
    if (!isMongoId(id) || quantity <= 0) return;

    const existing = map.get(id);
    if (existing) {
      map.set(id, {
        ...existing,
        isSweetener: existing.isSweetener || Boolean(row?.isSweetener),
      });
      return;
    }

    map.set(id, {
      ingredientId: row.ingredientId,
      quantity,
      isSweetener: Boolean(row?.isSweetener),
      fromPrimary: false,
    });
  });

  return {
    merged: Array.from(map.values()).map((row) => ({
      ingredientId: row.ingredientId,
      quantity: row.quantity,
      isSweetener: row.isSweetener,
    })),
    addedFromLegacy: Array.from(map.values()).filter((row) => !row.fromPrimary).length,
  };
};

const main = async () => {
  const { dryRun, dropLegacy } = parseArgs(process.argv);

  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in backend/.env");
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    const hasLegacy = collections.includes("recipes");

    if (!hasLegacy) {
      console.log("[INFO] Collection 'recipes' does not exist. Nothing to migrate.");
      if (dropLegacy) {
        console.log("[INFO] --drop-legacy requested but legacy collection is already absent.");
      }
      return;
    }

    const legacyDocs = await db.collection("recipes").find({}).toArray();
    const beforeLegacyCount = legacyDocs.length;
    const beforePrimaryCount = await productRecipeModel.countDocuments();

    let created = 0;
    let merged = 0;
    let unchanged = 0;
    let skippedInvalid = 0;
    let skippedEmpty = 0;

    for (const legacy of legacyDocs) {
      const productId = String(legacy?.productId || "").trim();
      if (!isMongoId(productId)) {
        skippedInvalid += 1;
        continue;
      }

      const normalizedLegacyRows = normalizeLegacyIngredients(legacy?.ingredients);
      if (normalizedLegacyRows.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      const existing = await productRecipeModel.findOne({ productId }).lean();
      if (!existing) {
        if (dryRun) {
          created += 1;
          continue;
        }

        await productRecipeModel.create({
          productId: new mongoose.Types.ObjectId(productId),
          ingredients: normalizedLegacyRows,
        });
        created += 1;
        continue;
      }

      const { ingredientRows: primaryIngredientRows, toppingRows } = splitProductRecipeRows(existing?.ingredients);
      const { merged: mergedIngredientRows, addedFromLegacy } = mergeIngredientsPreferPrimary(
        primaryIngredientRows,
        normalizedLegacyRows
      );

      if (addedFromLegacy <= 0) {
        unchanged += 1;
        continue;
      }

      if (dryRun) {
        merged += 1;
        continue;
      }

      await productRecipeModel.updateOne(
        { _id: existing._id },
        {
          $set: {
            ingredients: [...mergedIngredientRows, ...toppingRows],
          },
        }
      );
      merged += 1;
    }

    let dropped = false;
    if (dropLegacy) {
      if (dryRun) {
        dropped = true;
      } else {
        await db.collection("recipes").drop();
        dropped = true;
      }
    }

    const afterPrimaryCount = await productRecipeModel.countDocuments();
    const afterLegacyCount = dropLegacy && !dryRun
      ? "<dropped>"
      : await db.collection("recipes").countDocuments();

    console.log("[DONE]", {
      dryRun,
      dropLegacy,
      before: {
        recipes: beforeLegacyCount,
        productRecipes: beforePrimaryCount,
      },
      changes: {
        created,
        merged,
        unchanged,
        skippedInvalid,
        skippedEmpty,
      },
      after: {
        recipes: afterLegacyCount,
        productRecipes: afterPrimaryCount,
      },
      droppedLegacyCollection: dropped,
    });
  } catch (error) {
    console.error("[ERROR] MIGRATE LEGACY RECIPES FAILED:", error?.message || error);
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
