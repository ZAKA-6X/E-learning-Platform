// backend/routes/classesRoutes.js
const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const controller = require('../controllers/classesController');

router.get('/mine', auth, controller.listMine);

module.exports = router;
