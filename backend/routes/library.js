/* backend/routes/library.js */
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/libraryController');
const { requireAuth, requireTeacher } = require('../middleware/authMiddleware');

// Multi-file upload (kept in memory, then pushed to Supabase Storage)
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
});

/* ---------------- Student (read-only) ---------------- */
router.get('/student/courses', requireAuth, ctrl.listStudentCourses);
router.get('/student/libraries/:libraryId', requireAuth, ctrl.getStudentLibrary);
router.get('/student/courses/:courseId/exercises', requireAuth, ctrl.listStudentExercises);
router.post(
  '/student/courses/:courseId/exercises/:itemId/submissions',
  requireAuth,
  upload.single('submission'),
  ctrl.submitStudentExercise
);

/* ---------------- Libraries (courses) under an offering/assignment ---------------- */
router.get('/offerings/:assignmentId/libraries', requireAuth, requireTeacher, ctrl.listLibraries);
router.post('/offerings/:assignmentId/libraries', requireAuth, requireTeacher, ctrl.createLibrary);
router.patch('/libraries/:libraryId', requireAuth, requireTeacher, ctrl.updateLibrary);
router.delete('/libraries/:libraryId', requireAuth, requireTeacher, ctrl.deleteLibrary);

/* ---------------- Sections (folders) under a library ---------------- */
router.get('/libraries/:libraryId/sections', requireAuth, requireTeacher, ctrl.listSections);
router.post('/libraries/:libraryId/sections', requireAuth, requireTeacher, ctrl.createSection);
router.delete('/sections/:sectionId', requireAuth, requireTeacher, ctrl.deleteSection); // NEW

/* ---------------- Items (resources) under a section ---------------- */
router.get('/sections/:sectionId/items', requireAuth, requireTeacher, ctrl.listItems);
router.post('/sections/:sectionId/items', requireAuth, requireTeacher, ctrl.createItem);
router.patch('/sections/:sectionId/items/:itemId', requireAuth, requireTeacher, ctrl.updateItem);
router.delete('/sections/:sectionId/items/:itemId', requireAuth, requireTeacher, ctrl.deleteItem);

// Upload files from PC (multi-file) into a section
router.post(
  '/sections/:sectionId/items/upload',
  requireAuth,
  requireTeacher,
  upload.array('files', 20),
  ctrl.createItemsUpload
);

// Move a resource between folders (drag & drop)
router.post(
  '/sections/:sectionId/items/:itemId/move',
  requireAuth,
  requireTeacher,
  ctrl.moveItem
);

router.post(
  '/sections/:sectionId/items/:itemId/ai',
  requireAuth,
  requireTeacher,
  ctrl.aiProcessItem
);

router.post(
  '/sections/:sectionId/items/:itemId/ai/save',
  requireAuth,
  requireTeacher,
  ctrl.aiSaveResult
);

module.exports = router;
