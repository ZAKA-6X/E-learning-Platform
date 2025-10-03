'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/authMiddleware');
const {
  getProfile,
  listTeachers,
  listClassmates,
} = require('../controllers/usersController');

router.get('/me', requireAuth, getProfile);
router.get('/teachers', requireAuth, listTeachers);
router.get('/classmates', requireAuth, listClassmates);

module.exports = router;
