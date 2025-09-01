const jwt = require("jsonwebtoken");

module.exports = function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // e.g. { id, email, school_id, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
};
