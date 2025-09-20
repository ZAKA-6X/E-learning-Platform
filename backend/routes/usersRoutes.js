'use strict';

const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getProfile } = require('../controllers/usersController');

router.get('/me', auth, getProfile);

module.exports = router;
