const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherController');

// ✅ correct path
const { requireAuth, requireTeacher } = require('../middleware/authMiddleware');


router.use(requireAuth, requireTeacher);

router.get('/filters', ctrl.getFilters);
router.get('/offerings', ctrl.getOfferings);
router.get('/offering/:id', ctrl.getOfferingDetail);

module.exports = router;
