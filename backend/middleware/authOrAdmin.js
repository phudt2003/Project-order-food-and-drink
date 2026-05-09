import jwt from "jsonwebtoken";

const authOrAdmin = (req, res, next) => {
  try {
    let token = req.headers.token;

    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded?.admin === true) {
      req.isAdmin = true;
      req.admin = { username: decoded.username || "admin" };
      return next();
    }

    if (decoded?.id) {
      req.isAdmin = false;
      req.userId = decoded.id;
      return next();
    }

    return res.status(401).json({ success: false, message: "Unauthorized" });
  } catch (error) {
    console.log("AUTH/ADMIN ERROR:", error.message);
    return res.status(401).json({ success: false, message: "Invalid Token" });
  }
};

export default authOrAdmin;
