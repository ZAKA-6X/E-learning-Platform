'use strict';

const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const {
  getProfile,
  listTeachers,
  listClassmates,
} = require('../controllers/usersController');

router.get('/me', auth, getProfile);
router.get('/teachers', auth, listTeachers);
router.get('/classmates', auth, listClassmates);

module.exports = router;
