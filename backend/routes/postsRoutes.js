const router = require('express').Router();
const postsController = require('../controllers/postsController');
const auth = require('../middleware/authMiddleware');
const { uploadMediaArray } = require('../middleware/uploadMiddleware');

// GET /api/posts → list published posts visible to user
router.get('/', auth, postsController.listPosts);
router.get('/:postId/comments', auth, postsController.listComments);
router.post('/:postId/comments', auth, postsController.addComment);
router.post('/comments/:commentId/votes', auth, postsController.voteComment);
router.post('/:postId/votes', auth, postsController.votePost);

// POST /api/posts  (expects <input name="media" multiple>)
router.post('/', auth, uploadMediaArray, postsController.addPost);

module.exports = router;
