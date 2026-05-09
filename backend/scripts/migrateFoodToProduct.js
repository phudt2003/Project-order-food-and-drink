import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const parseArgs = (argv) => {
  const args = argv.slice(2);
  return {
    dryRun: args.includes("--dry") || args.includes("--dry-run"),
  };
};

const main = async () => {
  const { dryRun } = parseArgs(process.argv);

  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in backend/.env");
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    const hasFoods = collections.includes("foods");
    const hasProducts = collections.includes("products");

    const foodsCount = hasFoods ? await db.collection("foods").countDocuments() : 0;
    const productsCount = hasProducts ? await db.collection("products").countDocuments() : 0;

    const mediaFoodLinks = await db.collection("media").countDocuments({ "linkedTo.model": "food" });

    console.log("[BEFORE]", {
      hasFoods,
      hasProducts,
      foodsCount,
      productsCount,
      mediaLinkedToFood: mediaFoodLinks,
      dryRun,
    });

    let renamed = false;
    let copied = false;

    if (hasFoods && !hasProducts) {
      if (!dryRun) {
        await db.collection("foods").rename("products");
      }
      renamed = true;
    } else if (hasFoods && hasProducts) {
      // Merge missing docs from foods into products by _id to avoid data loss.
      const foodDocs = await db.collection("foods").find({}).toArray();
      const productIds = new Set(
        (await db.collection("products").find({}, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id))
      );

      const missing = foodDocs.filter((d) => !productIds.has(String(d._id)));
      if (!dryRun && missing.length > 0) {
        await db.collection("products").insertMany(missing, { ordered: false });
      }
      copied = missing.length > 0;

      if (!dryRun) {
        await db.collection("foods").drop();
      }
      renamed = true;
    }

    let mediaUpdated = 0;
    if (!dryRun) {
      const mediaResult = await db.collection("media").updateMany(
        { "linkedTo.model": "food" },
        { $set: { "linkedTo.model": "product" } }
      );
      mediaUpdated = Number(mediaResult.modifiedCount || 0);
    } else {
      mediaUpdated = mediaFoodLinks;
    }

    const afterCollections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    const afterHasFoods = afterCollections.includes("foods");
    const afterHasProducts = afterCollections.includes("products");
    const afterFoodsCount = afterHasFoods ? await db.collection("foods").countDocuments() : 0;
    const afterProductsCount = afterHasProducts ? await db.collection("products").countDocuments() : 0;
    const mediaProductLinks = await db.collection("media").countDocuments({ "linkedTo.model": "product" });

    console.log("[AFTER]", {
      renamed,
      copied,
      afterHasFoods,
      afterHasProducts,
      afterFoodsCount,
      afterProductsCount,
      mediaUpdated,
      mediaLinkedToProduct: mediaProductLinks,
      dryRun,
    });
  } catch (error) {
    console.error("[ERROR] MIGRATE FOODS->PRODUCTS FAILED:", error?.message || error);
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
