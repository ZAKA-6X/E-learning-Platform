// backend/routes/todosRoutes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/todosController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.updateData);
router.patch('/:id/status', ctrl.updateStatus);
router.delete('/:id', ctrl.remove);

module.exports = router;
