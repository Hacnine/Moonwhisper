import { Router } from 'express';
import { requireAuth } from '../../middlewares/roleMiddleware.js';
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
} from './notification.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', getUserNotifications);
router.get('/unread/count', getUnreadNotificationCount);
router.put('/:id/read', markNotificationAsRead);
router.put('/read-all', markAllNotificationsAsRead);
router.delete('/clear-all', clearAllNotifications);
router.delete('/:id', deleteNotification);

export default router;
