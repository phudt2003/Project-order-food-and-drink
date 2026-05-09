import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import adminModel from "../models/Admin.js";

const createAdminToken = ({ adminId, username }) =>
  jwt.sign({ admin: true, adminId, username }, process.env.JWT_SECRET, { expiresIn: "12h" });

const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    const normalizedUsername = String(username || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");

    if (!normalizedUsername || !normalizedPassword) {
      return res.status(400).json({ success: false, message: "Thiếu tài khoản hoặc mật khẩu." });
    }

    const admin = await adminModel.findOne({ username: normalizedUsername }).lean();
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Tài khoản admin không tồn tại. Hãy tạo admin trước (script create-admin).",
      });
    }

    if (admin.disabled) {
      return res.status(403).json({ success: false, message: "Tài khoản admin đã bị vô hiệu hóa." });
    }

    const ok = await bcrypt.compare(normalizedPassword, String(admin.passwordHash || ""));
    if (!ok) {
      return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu." });
    }

    await adminModel.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });

    const token = createAdminToken({ adminId: String(admin._id), username: admin.username });
    return res.json({ success: true, token, username: admin.username });
  } catch (error) {
    console.log("ADMIN LOGIN ERROR:", error?.message);
    return res.status(500).json({ success: false, message: "Không thể đăng nhập admin." });
  }
};

export { loginAdmin };
