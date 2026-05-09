import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import { uploadsDir } from "../utils/paths.js";
import foodModel from "../models/foodModel.js";
import categoryModel from "../models/categoryModel.js";
import orderModel from "../models/orderModel.js";
import { getCloudinaryFolder } from "../config/cloudinary.js";
import {
  uploadImageBuffer,
  uploadImageRemoteUrl,
} from "../services/cloudinaryService.js";
import { claimMediaAsUsed, createTemporaryMedia } from "../services/mediaService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const argSet = new Set(process.argv.slice(2));
const apply = argSet.has("--apply");
const deleteLocal = argSet.has("--delete-local");
const includeFoods = !argSet.has("--no-foods");
const includeCategories = !argSet.has("--no-categories");
const includeOrders = !argSet.has("--no-orders");

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());
const isDataUrl = (value) => /^data:/i.test(String(value || "").trim());

const isLegacyLocalValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (isHttpUrl(raw) || isDataUrl(raw)) return false;
  if (raw.startsWith("/assets/")) return false;
  // Legacy patterns used by frontend/backends
  if (raw.startsWith("uploads/")) return true;
  if (raw.startsWith("/images/") || raw.startsWith("images/")) return true;
  // Plain filename (no slashes)
  if (!raw.includes("/")) return true;
  return false;
};

const legacyToFilename = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const noQuery = raw.split("?")[0];
  if (noQuery.startsWith("uploads/")) return path.basename(noQuery.replace(/^uploads\//, ""));
  if (noQuery.startsWith("/images/")) return path.basename(noQuery.replace(/^\/images\//, ""));
  if (noQuery.startsWith("images/")) return path.basename(noQuery.replace(/^images\//, ""));
  if (!noQuery.includes("/")) return path.basename(noQuery);
  return path.basename(noQuery);
};

const safeUnlink = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
};

const actor = { adminUsername: "migration" };
const baseFolder = getCloudinaryFolder();

const uploadFromLocalFile = async ({ filePath, filename, folder, tags }) => {
  const buffer = await fs.readFile(filePath);
  const result = await uploadImageBuffer({
    buffer,
    filename,
    folder,
    tags,
  });
  await createTemporaryMedia({ cloudinaryResult: result, actor }).catch(() => {});
  return result;
};

const uploadFromRemoteUrl = async ({ remoteUrl, filename, folder, tags }) => {
  const result = await uploadImageRemoteUrl({
    remoteUrl,
    filename,
    folder,
    tags,
  });
  await createTemporaryMedia({ cloudinaryResult: result, actor }).catch(() => {});
  return result;
};

const migrateFoods = async () => {
  const stats = { scanned: 0, migrated: 0, skipped: 0, missing: 0, deletedLocal: 0, errors: 0 };

  const foods = await foodModel
    .find({ image: { $ne: "" } })
    .select("_id name image imagePublicId")
    .lean();

  for (const food of foods) {
    stats.scanned += 1;

    const image = String(food?.image || "").trim();
    const publicId = String(food?.imagePublicId || "").trim();

    if (isHttpUrl(image) && publicId) {
      stats.skipped += 1;
      continue;
    }

    if (!isLegacyLocalValue(image)) {
      // Non-local string, keep as-is.
      stats.skipped += 1;
      continue;
    }

    const filename = legacyToFilename(image);
    const localPath = path.join(uploadsDir, filename);

    try {
      await fs.access(localPath);
    } catch {
      stats.missing += 1;
      continue;
    }

    const folder = `${baseFolder}/foods`;
    const tags = ["food", "migration"];

    try {
      if (!apply) {
        stats.migrated += 1;
        continue;
      }

      const uploaded = await uploadFromLocalFile({
        filePath: localPath,
        filename: `food_${food._id}_${filename}`,
        folder,
        tags,
      });

      await foodModel.updateOne(
        { _id: food._id },
        {
          $set: {
            image: uploaded.secure_url,
            imagePublicId: uploaded.public_id,
          },
        }
      );

      await claimMediaAsUsed({
        publicId: uploaded.public_id,
        url: uploaded.secure_url,
        actor,
        linkedTo: { model: "product", id: food._id, field: "image" },
      }).catch(() => {});

      if (deleteLocal) {
        const ok = await safeUnlink(localPath);
        if (ok) stats.deletedLocal += 1;
      }

      stats.migrated += 1;
    } catch (error) {
      stats.errors += 1;
      console.log("[MIGRATE FOODS] error:", food?._id, error?.message || error);
    }
  }

  return stats;
};

const migrateCategories = async () => {
  const stats = { scanned: 0, migrated: 0, skipped: 0, missing: 0, deletedLocal: 0, errors: 0 };

  const categories = await categoryModel
    .find({ image: { $ne: "" } })
    .select("_id name slug image imagePublicId")
    .lean();

  for (const category of categories) {
    stats.scanned += 1;
    const image = String(category?.image || "").trim();
    const publicId = String(category?.imagePublicId || "").trim();

    if (isHttpUrl(image) && publicId) {
      stats.skipped += 1;
      continue;
    }

    if (!isLegacyLocalValue(image)) {
      stats.skipped += 1;
      continue;
    }

    const filename = legacyToFilename(image);
    const localPath = path.join(uploadsDir, filename);

    try {
      await fs.access(localPath);
    } catch {
      stats.missing += 1;
      continue;
    }

    const folder = `${baseFolder}/categories`;
    const tags = ["category", "migration"];

    try {
      if (!apply) {
        stats.migrated += 1;
        continue;
      }

      const uploaded = await uploadFromLocalFile({
        filePath: localPath,
        filename: `category_${category._id}_${filename}`,
        folder,
        tags,
      });

      await categoryModel.updateOne(
        { _id: category._id },
        {
          $set: {
            image: uploaded.secure_url,
            imagePublicId: uploaded.public_id,
          },
        }
      );

      await claimMediaAsUsed({
        publicId: uploaded.public_id,
        url: uploaded.secure_url,
        actor,
        linkedTo: { model: "category", id: category._id, field: "image" },
      }).catch(() => {});

      if (deleteLocal) {
        const ok = await safeUnlink(localPath);
        if (ok) stats.deletedLocal += 1;
      }

      stats.migrated += 1;
    } catch (error) {
      stats.errors += 1;
      console.log("[MIGRATE CATEGORIES] error:", category?._id, error?.message || error);
    }
  }

  return stats;
};

const migrateOrders = async () => {
  const stats = { scanned: 0, migrated: 0, skipped: 0, missing: 0, errors: 0 };

  const orders = await orderModel
    .find({ "items.image": { $ne: "" } })
    .select("_id items.productId items.image items.imagePublicId")
    .lean();

  for (const order of orders) {
    let changed = false;

    for (const item of order.items || []) {
      stats.scanned += 1;

      const image = String(item?.image || "").trim();
      const publicId = String(item?.imagePublicId || "").trim();

      if (!image) {
        stats.skipped += 1;
        continue;
      }

      if (isHttpUrl(image) && publicId) {
        stats.skipped += 1;
        continue;
      }

      if (isHttpUrl(image) && !publicId) {
        // Already Cloudinary/remote URL; keep as-is.
        stats.skipped += 1;
        continue;
      }

      if (!isLegacyLocalValue(image)) {
        stats.skipped += 1;
        continue;
      }

      const filename = legacyToFilename(image);
      const localPath = path.join(uploadsDir, filename);
      const folder = `${baseFolder}/orders`;
      const tags = ["order_item", "migration"];

      try {
        let uploaded = null;

        try {
          await fs.access(localPath);
          if (!apply) {
            stats.migrated += 1;
            continue;
          }
          uploaded = await uploadFromLocalFile({
            filePath: localPath,
            filename: `order_${order._id}_${item.productId || "item"}_${filename}`,
            folder,
            tags,
          });
        } catch {
          // Local file is missing. Try to duplicate from current product image URL if possible.
          stats.missing += 1;

          const productId = String(item?.productId || "").trim();
          if (!apply || !productId) continue;

          const food = await foodModel.findById(productId).select("image").lean();
          const sourceUrl = String(food?.image || "").trim();
          if (!isHttpUrl(sourceUrl)) continue;

          uploaded = await uploadFromRemoteUrl({
            remoteUrl: sourceUrl,
            filename: `order_${order._id}_${productId}`,
            folder,
            tags,
          });
        }

        if (!uploaded) continue;

        item.image = uploaded.secure_url;
        item.imagePublicId = uploaded.public_id;
        changed = true;

        await claimMediaAsUsed({
          publicId: uploaded.public_id,
          url: uploaded.secure_url,
          actor,
          linkedTo: { model: "order", id: order._id, field: "items.image" },
        }).catch(() => {});

        stats.migrated += 1;
      } catch (error) {
        stats.errors += 1;
        console.log("[MIGRATE ORDERS] error:", order?._id, error?.message || error);
      }
    }

    if (apply && changed) {
      await orderModel.updateOne({ _id: order._id }, { $set: { items: order.items } });
    }
  }

  return stats;
};

const main = async () => {
  console.log("[MIGRATE] uploadsDir =", uploadsDir);
  console.log("[MIGRATE] mode =", apply ? "APPLY" : "DRY_RUN", "deleteLocal =", deleteLocal);
  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB is not connected. Check MONGO_URI in backend/.env");
  }

  const results = {};
  if (includeFoods) results.foods = await migrateFoods();
  if (includeCategories) results.categories = await migrateCategories();
  if (includeOrders) results.orders = await migrateOrders();

  console.log("[MIGRATE] results:", results);
  process.exit(0);
};

main().catch((err) => {
  console.error("[MIGRATE] fatal:", err?.message || err);
  process.exit(1);
});
