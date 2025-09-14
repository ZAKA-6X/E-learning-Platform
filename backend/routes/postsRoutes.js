const router = require('express').Router();
const postsController = require('../controllers/postsController');
const auth = require('../middleware/authMiddleware');

// Restore simple create (no file upload)
router.post('/', auth, postsController.addPost);

module.exports = router;