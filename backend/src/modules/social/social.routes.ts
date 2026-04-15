import { Router } from 'express';
import { isLogin } from '../../middlewares/auth.middleware.js';
import {
  createPost,
  editPost,
  deletePost,
  addReaction,
  addComment,
  addReply,
  getPosts,
} from './social.controller.js';

const router = Router();

router.post('/posts', isLogin, createPost);
router.put('/posts/:postId', isLogin, editPost);
router.delete('/posts/:postId', isLogin, deletePost);
router.post('/posts/:postId/reaction', isLogin, addReaction);
router.post('/posts/:postId/comments', isLogin, addComment);
router.post('/posts/:postId/comments/:commentId/replies', isLogin, addReply);
router.get('/posts', isLogin, getPosts);

export default router;
