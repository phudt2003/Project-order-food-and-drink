import jwt from "jsonwebtoken";

const authMiddleware = async (req, res, next) => {
  try {

    // ✅ lấy token từ 2 kiểu header
    let token = req.headers.token;

    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.json({
        success: false,
        message: "Login First",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decoded.id;

    next();

  } catch (error) {
    console.log("AUTH ERROR:", error.message);
    res.json({
      success: false,
      message: "Invalid Token",
    });
  }
};

export default authMiddleware;