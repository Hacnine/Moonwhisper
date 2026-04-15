import { Router } from 'express';
import { requireAuth } from '../../middlewares/roleMiddleware.js';
import {
  createNotice,
  getNotices,
  getCreatedNotices,
  updateNotice,
  deleteNotice,
  markNoticeAsRead,
  resetUnreadCount,
  toggleLikeNotice,
} from './notice.controller.js';

const router = Router();

router.post('/', requireAuth, createNotice);
router.get('/', requireAuth, getNotices);
router.get('/admin-notices/', requireAuth, getCreatedNotices);
router.patch('/:noticeId', requireAuth, updateNotice);
router.delete('/:noticeId', requireAuth, deleteNotice);
router.post('/:noticeId/read', requireAuth, markNoticeAsRead);
router.post('/reset-unread', requireAuth, resetUnreadCount);
router.post('/:noticeId/like', requireAuth, toggleLikeNotice);

export default router;
