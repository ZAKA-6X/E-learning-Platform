// backend/routes/todosRoutes.js
const router = require("express").Router();
const todosController = require("../controllers/todosController");
const authMiddleware = require("../middleware/authMiddleware");

// Get all todos for the logged in user
router.get("/", authMiddleware, todosController.getTodos);

// Create a new todo
router.post("/", authMiddleware, todosController.addTodo);

// Edit todo text
router.put("/:id", authMiddleware, todosController.updateTodo);

// Toggle/Set status
router.patch("/:id/status", authMiddleware, todosController.updateStatus);

// Delete a todo
router.delete("/:id", authMiddleware, todosController.deleteTodo);

module.exports = router;
