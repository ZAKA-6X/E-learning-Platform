'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/authMiddleware');
const { requireTeacher } = require('../middleware/authMiddleware');
const {
  getMessagesWithTeacher,
  sendMessageToTeacher,
  getMessagesWithStudent,
  sendMessageToStudent,
  listStudentsForTeacher,
} = require('../controllers/inboxController');

router.get('/students', requireAuth, requireTeacher, listStudentsForTeacher);
router.get('/teachers/:teacherId/messages', requireAuth, getMessagesWithTeacher);
router.post('/teachers/:teacherId/messages', requireAuth, sendMessageToTeacher);

router.get('/students/:studentId/messages', requireAuth, requireTeacher, getMessagesWithStudent);
router.post('/students/:studentId/messages', requireAuth, requireTeacher, sendMessageToStudent);

module.exports = router;
