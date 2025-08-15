const express = require('express');
const router = express.Router();
const { getLoginPage, login, getDashboard } = require('../controllers/authController');

router.get('/login', getLoginPage);
router.post('/login', login);
router.get('/admin-dashboard', getDashboard);

module.exports = router;
