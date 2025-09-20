const router = require('express').Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getClassesMine } = require('../controllers/classesController');

router.get('/mine', authMiddleware, getClassesMine);

module.exports = router;
