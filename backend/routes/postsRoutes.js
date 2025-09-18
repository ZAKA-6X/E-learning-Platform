const router = require('express').Router();
const postsController = require('../controllers/postsController');
const auth = require('../middleware/authMiddleware');
const { uploadMediaArray } = require('../middleware/uploadMiddleware');

// GET /api/posts → list published posts visible to user
router.get('/', auth, postsController.listPosts);

// POST /api/posts  (expects <input name="media" multiple>)
router.post('/', auth, uploadMediaArray, postsController.addPost);

module.exports = router;
