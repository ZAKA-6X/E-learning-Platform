'use strict';

const router = require('express').Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getSubjectsForSchool } = require('../controllers/subjectsController');

// GET /subjects
router.get('/', authMiddleware, getSubjectsForSchool);

module.exports = router;
