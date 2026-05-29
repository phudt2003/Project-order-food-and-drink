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
    const reviewCollection = db.collection("reviews");

    const legacyIdCount = await reviewCollection.countDocuments({ foodId: { $exists: true } });
    const legacyNameCount = await reviewCollection.countDocuments({ foodName: { $exists: true } });
    const currentIdCount = await reviewCollection.countDocuments({ productId: { $exists: true } });
    const currentNameCount = await reviewCollection.countDocuments({ productName: { $exists: true } });

    console.log("[BEFORE]", {
      dryRun,
      withProductId: currentIdCount,
      withProductName: currentNameCount,
      withFoodId: legacyIdCount,
      withFoodName: legacyNameCount,
    });

    if (!dryRun && (legacyIdCount > 0 || legacyNameCount > 0)) {
      await reviewCollection.updateMany(
        {
          $or: [{ foodId: { $exists: true } }, { foodName: { $exists: true } }],
        },
        [
          {
            $set: {
              productId: {
                $cond: [
                  {
                    $or: [
                      { $eq: [{ $type: "$productId" }, "missing"] },
                      { $eq: ["$productId", null] },
                    ],
                  },
                  "$foodId",
                  "$productId",
                ],
              },
              productName: {
                $cond: [
                  {
                    $or: [
                      { $eq: [{ $type: "$productName" }, "missing"] },
                      { $eq: ["$productName", null] },
                      { $eq: ["$productName", ""] },
                    ],
                  },
                  "$foodName",
                  "$productName",
                ],
              },
            },
          },
          { $unset: ["foodId", "foodName"] },
        ]
      );
    }

    const indexNames = [
      "foodId_1",
      "userId_1_orderId_1_foodId_1",
    ];
    for (const indexName of indexNames) {
      try {
        await reviewCollection.dropIndex(indexName);
      } catch {
        // ignore missing legacy index
      }
    }

    await reviewCollection.createIndex({ productId: 1, createdAt: -1 }, { name: "productId_1_createdAt_-1" });
    await reviewCollection.createIndex(
      { userId: 1, orderId: 1, productId: 1 },
      {
        name: "userId_1_orderId_1_productId_1",
        unique: true,
        partialFilterExpression: { orderId: { $type: "objectId" } },
      }
    );

    const afterLegacyIdCount = await reviewCollection.countDocuments({ foodId: { $exists: true } });
    const afterLegacyNameCount = await reviewCollection.countDocuments({ foodName: { $exists: true } });
    const afterCurrentIdCount = await reviewCollection.countDocuments({ productId: { $exists: true } });
    const afterCurrentNameCount = await reviewCollection.countDocuments({ productName: { $exists: true } });

    console.log("[AFTER]", {
      dryRun,
      withProductId: afterCurrentIdCount,
      withProductName: afterCurrentNameCount,
      withFoodId: afterLegacyIdCount,
      withFoodName: afterLegacyNameCount,
    });
  } catch (error) {
    console.error("[ERROR] MIGRATE REVIEW PRODUCT FIELDS FAILED:", error?.message || error);
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
