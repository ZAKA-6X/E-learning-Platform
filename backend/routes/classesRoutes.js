const router = require('express').Router();
const requireAuth = require('../middleware/authMiddleware');
const { getClassesMine } = require('../controllers/classesController');

router.get('/mine', requireAuth, getClassesMine);

module.exports = router;
