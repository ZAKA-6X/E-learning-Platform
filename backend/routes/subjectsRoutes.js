'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/authMiddleware');
const {
  getSubjectsForSchool,
  getSubjectsMine,
} = require('../controllers/subjectsController');

// GET /subjects
router.get('/', requireAuth, getSubjectsForSchool);
router.get('/mine', requireAuth, getSubjectsMine);

module.exports = router;
