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
    const addressCollection = db.collection("addresses");

    const legacyCount = await addressCollection.countDocuments({ user_id: { $exists: true } });
    const currentCount = await addressCollection.countDocuments({ userId: { $exists: true } });

    console.log("[BEFORE]", {
      dryRun,
      withUserId: currentCount,
      withUser_id: legacyCount,
    });

    if (!dryRun && legacyCount > 0) {
      await addressCollection.updateMany(
        { user_id: { $exists: true } },
        [
          {
            $set: {
              userId: {
                $cond: [
                  {
                    $or: [
                      { $eq: [{ $type: "$userId" }, "missing"] },
                      { $eq: ["$userId", null] },
                      { $eq: ["$userId", ""] },
                    ],
                  },
                  "$user_id",
                  "$userId",
                ],
              },
            },
          },
          { $unset: "user_id" },
        ]
      );

      await addressCollection.updateMany(
        { userId: { $exists: true }, user_id: { $exists: false } },
        { $unset: { user_id: "" } }
      );
    }

    try {
      await addressCollection.dropIndex("user_id_1");
    } catch {
      // ignore missing legacy index
    }

    await addressCollection.createIndex({ userId: 1 }, { name: "userId_1" });

    const afterLegacyCount = await addressCollection.countDocuments({ user_id: { $exists: true } });
    const afterCurrentCount = await addressCollection.countDocuments({ userId: { $exists: true } });

    console.log("[AFTER]", {
      dryRun,
      withUserId: afterCurrentCount,
      withUser_id: afterLegacyCount,
    });
  } catch (error) {
    console.error("[ERROR] MIGRATE ADDRESS USER ID FAILED:", error?.message || error);
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
