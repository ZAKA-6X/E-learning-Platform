'use strict';

const router = require('express').Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getSubjectsForSchool,
  getSubjectsMine,
} = require('../controllers/subjectsController');

// GET /subjects
router.get('/', authMiddleware, getSubjectsForSchool);
router.get('/mine', authMiddleware, getSubjectsMine);

module.exports = router;
