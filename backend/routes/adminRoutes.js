const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  getAllMatieres,
  getStudentsCountKPI,
  getUpcomingExamsCountKPI,
} = require("../controllers/adminController");

// --- KPI routes (namespaced) ---
router.get("/kpis/exams-upcoming-count", auth, getUpcomingExamsCountKPI);
router.get("/kpis/students-count", auth, getStudentsCountKPI);


// --- Non-KPI routes ---
router.get("/matieres", auth, getAllMatieres);

module.exports = router;