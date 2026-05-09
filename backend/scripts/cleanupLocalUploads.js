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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const argSet = new Set(process.argv.slice(2));
const apply = argSet.has("--apply");

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());
const isDataUrl = (value) => /^data:/i.test(String(value || "").trim());

const isLegacyLocalValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (isHttpUrl(raw) || isDataUrl(raw)) return false;
  if (raw.startsWith("/assets/")) return false;
  if (raw.startsWith("uploads/")) return true;
  if (raw.startsWith("/images/") || raw.startsWith("images/")) return true;
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

const collectReferencedFilenames = async () => {
  const referenced = new Set();

  const foods = await foodModel.find({ image: { $ne: "" } }).select("image").lean();
  for (const doc of foods) {
    if (!isLegacyLocalValue(doc.image)) continue;
    const filename = legacyToFilename(doc.image);
    if (filename) referenced.add(filename);
  }

  const categories = await categoryModel.find({ image: { $ne: "" } }).select("image").lean();
  for (const doc of categories) {
    if (!isLegacyLocalValue(doc.image)) continue;
    const filename = legacyToFilename(doc.image);
    if (filename) referenced.add(filename);
  }

  const orders = await orderModel.find({ "items.image": { $ne: "" } }).select("items.image").lean();
  for (const order of orders) {
    for (const item of order.items || []) {
      if (!isLegacyLocalValue(item?.image)) continue;
      const filename = legacyToFilename(item.image);
      if (filename) referenced.add(filename);
    }
  }

  return referenced;
};

const main = async () => {
  console.log("[CLEANUP] uploadsDir =", uploadsDir);
  console.log("[CLEANUP] mode =", apply ? "APPLY" : "DRY_RUN");

  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB is not connected. Check MONGO_URI in backend/.env");
  }
  const referenced = await collectReferencedFilenames();

  let files = [];
  try {
    files = await fs.readdir(uploadsDir);
  } catch (error) {
    console.error("[CLEANUP] Cannot read uploadsDir:", error?.message || error);
    process.exit(1);
  }

  const candidates = files.filter((name) => name && !referenced.has(name));

  console.log("[CLEANUP] referenced =", referenced.size, "files in DB");
  console.log("[CLEANUP] local files =", files.length, "candidates to delete =", candidates.length);

  if (!apply) {
    console.log("[CLEANUP] First 50 candidates:", candidates.slice(0, 50));
    process.exit(0);
  }

  let deleted = 0;
  let errors = 0;

  for (const name of candidates) {
    const filePath = path.join(uploadsDir, name);
    try {
      await fs.unlink(filePath);
      deleted += 1;
    } catch (error) {
      errors += 1;
      console.log("[CLEANUP] delete error:", name, error?.message || error);
    }
  }

  console.log("[CLEANUP] deleted =", deleted, "errors =", errors);
  process.exit(0);
};

main().catch((err) => {
  console.error("[CLEANUP] fatal:", err?.message || err);
  process.exit(1);
});
