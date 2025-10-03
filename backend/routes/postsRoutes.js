const router = require('express').Router();
const postsController = require('../controllers/postsController');
const requireAuth = require('../middleware/authMiddleware');
const { uploadMediaArray } = require('../middleware/uploadMiddleware');

// GET /api/posts → list published posts visible to user
router.get('/', requireAuth, postsController.listPosts);
router.get('/:postId/comments', requireAuth, postsController.listComments);
router.post('/:postId/comments', requireAuth, postsController.addComment);
router.post('/comments/:commentId/votes', requireAuth, postsController.voteComment);
router.post('/:postId/votes', requireAuth, postsController.votePost);
router.delete('/:postId/comments/:commentId', requireAuth, postsController.deleteComment);
router.delete('/:postId', requireAuth, postsController.deletePost);

// POST /api/posts  (expects <input name="media" multiple>)
router.post('/', requireAuth, uploadMediaArray, postsController.addPost);

module.exports = router;
