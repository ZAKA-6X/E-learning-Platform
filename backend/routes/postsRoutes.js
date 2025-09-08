// routes/postsRoutes.js
const router = require("express").Router();
const postsController = require("../controllers/postsController");
const auth = require("../middleware/authMiddleware");

// Create a post
router.post("/", auth, postsController.addPost);

module.exports = router;
