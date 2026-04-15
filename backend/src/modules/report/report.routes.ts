import { Router } from 'express';
import { isLogin } from '../../middlewares/auth.middleware.js';
import { requireAdmin } from '../../middlewares/adminAuth.js';
import {
  reportConversation,
  getReports,
  getReportStats,
  updateReportStatus,
} from './report.controller.js';

const router = Router();

router.use(isLogin);

router.post('/conversation/:conversationId', reportConversation);
router.get('/', requireAdmin, getReports);
router.get('/stats', requireAdmin, getReportStats);
router.patch('/:reportId', requireAdmin, updateReportStatus);

export default router;
