const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/libraryController');

// ✅ correct path
const { requireAuth, requireTeacher } = require('../middleware/authMiddleware');

router.get('/offerings/:assignmentId/libraries', requireAuth, requireTeacher, ctrl.listLibraries);
router.post('/offerings/:assignmentId/libraries', requireAuth, requireTeacher, ctrl.createLibrary);

router.get('/libraries/:libraryId/sections', requireAuth, requireTeacher, ctrl.listSections);
router.post('/libraries/:libraryId/sections', requireAuth, requireTeacher, ctrl.createSection);

router.get('/sections/:sectionId/items', requireAuth, requireTeacher, ctrl.listItems);
router.post('/sections/:sectionId/items', requireAuth, requireTeacher, ctrl.createItem);

module.exports = router;
