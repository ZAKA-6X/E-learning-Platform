// backend/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer (.+)$/i);
    const token = match?.[1];

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const user = jwt.verify(token, process.env.JWT_SECRET);
    // user must include id, school_id, role
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
