import jwt from "jsonwebtoken";

const adminAuth = async (req, res, next) => {
  try {
    let token = req.headers.token;

    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "Admin login required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || decoded.admin !== true) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    req.admin = { username: decoded.username || "admin" };
    next();
  } catch (error) {
    console.log("ADMIN AUTH ERROR:", error.message);
    return res.status(401).json({ success: false, message: "Invalid Token" });
  }
};

export default adminAuth;

