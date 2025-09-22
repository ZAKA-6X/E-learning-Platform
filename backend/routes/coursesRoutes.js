const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { uploadSingleMedia } = require("../middleware/uploadMiddleware");
const controller = require("../controllers/coursesController");

router.get("/", auth, controller.list);
router.get("/student", auth, controller.listForStudent);
router.get("/:id", auth, controller.getOne);
router.post("/", auth, controller.create);
router.post("/:id/sections", auth, uploadSingleMedia, controller.createSection);

module.exports = router;
