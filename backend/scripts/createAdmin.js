import bcrypt from "bcrypt";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import adminModel from "../models/Admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const printUsage = () => {
  console.log(
    [
      "Usage:",
      "  npm run create-admin -- --username <user> --password <pass> [--role <role>]",
      "  node scripts/createAdmin.js --username <user> --password <pass> [--role <role>]",
      "  node scripts/createAdmin.js <user> <pass> [role]",
      "",
      "Options:",
      "  -u, --username   Username (required)",
      "  -p, --password   Password (required)",
      "  -r, --role       Role (default: admin)",
      "  -h, --help       Show help",
      "",
      "Examples:",
      "  npm run create-admin -- --username admin --password admin123",
      "  npm run create-admin -- --username admin2 --password admin123",
      "  npm run create-admin -- --username user1 --password 123456 --role user",
    ].join("\n")
  );
};

const normalize = (value) => String(value || "").trim();

const parseArgs = (argv) => {
  const args = argv.slice(2);
  const result = { username: "", password: "", role: "admin", help: false };

  for (let i = 0; i < args.length; i += 1) {
    const value = String(args[i] ?? "");

    if (value === "--help" || value === "-h") {
      result.help = true;
      continue;
    }

    if (value === "--username" || value === "-u") {
      result.username = normalize(args[i + 1]);
      i += 1;
      continue;
    }
    if (value.startsWith("--username=")) {
      result.username = normalize(value.slice("--username=".length));
      continue;
    }

    if (value === "--password" || value === "-p") {
      result.password = normalize(args[i + 1]);
      i += 1;
      continue;
    }
    if (value.startsWith("--password=")) {
      result.password = normalize(value.slice("--password=".length));
      continue;
    }

    if (value === "--role" || value === "-r") {
      result.role = normalize(args[i + 1]) || result.role;
      i += 1;
      continue;
    }
    if (value.startsWith("--role=")) {
      result.role = normalize(value.slice("--role=".length)) || result.role;
      continue;
    }

    if (!result.username) {
      result.username = normalize(value);
      continue;
    }
    if (!result.password) {
      result.password = normalize(value);
      continue;
    }
    if (!result.role || result.role === "admin") {
      result.role = normalize(value) || result.role;
    }
  }

  result.username = result.username.trim().toLowerCase();
  result.role = result.role.trim().toLowerCase() || "admin";
  return result;
};

const main = async () => {
  const { username, password, role, help } = parseArgs(process.argv);

  if (help) {
    printUsage();
    return;
  }

  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in backend/.env");
    process.exitCode = 1;
    return;
  }

  if (!username || !password) {
    console.error("Missing required input: username and password are required.");
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!role) {
    console.error("Invalid role: role cannot be empty.");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const mongoUri = process.env.MONGO_URI;

  try {
    await mongoose.connect(mongoUri);

    const existing = await adminModel.findOne({ username }).select("_id username role");
    if (existing) {
      console.log(
        `[EXISTS] "${existing.username}" already exists (role=${existing.role || "admin"}, id=${existing._id})`
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await adminModel.create({
      username,
      passwordHash,
      role,
      disabled: false,
    });

    console.log(`[CREATED] ${created.role} "${created.username}" (${created._id})`);
  } catch (error) {
    if (error?.code === 11000 || String(error?.message || "").includes("E11000")) {
      console.log(`[EXISTS] "${username}" already exists (duplicate key)`);
      return;
    }

    console.error("[ERROR] CREATE USER FAILED:", error?.message || error);
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
