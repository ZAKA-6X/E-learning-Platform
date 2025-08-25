const express = require('express');
const router = express.Router();
const { getAllMatieres } = require('../controllers/adminController');
const auth = require('../middleware/authMiddleware');

router.get('/matieres', auth, getAllMatieres);

module.exports = router;
