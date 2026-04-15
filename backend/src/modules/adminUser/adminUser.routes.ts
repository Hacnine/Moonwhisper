import { Router } from 'express';
import { isLogin } from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireSuperAdmin } from '../../middlewares/adminAuth.js';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
  resetUserPassword,
  getScheduledDeletions,
  preventDeletion,
  cancelPreventionAndReschedule,
  getInactiveUsers,
} from './adminUser.controller.js';

const router = Router();

router.use(isLogin);

router.get('/users', requireAdmin, getAllUsers);
router.post('/create', requireAdmin, createUser);
router.put('/:userId', requireAdmin, updateUser);
router.delete('/:userId', requireSuperAdmin, deleteUser);
router.post('/:userId/block', requireAdmin, blockUser);
router.post('/:userId/unblock', requireAdmin, unblockUser);
router.post('/:userId/reset-password', requireAdmin, resetUserPassword);
router.get('/scheduled-deletions', requireAdmin, getScheduledDeletions);
router.post('/scheduled-deletions/:scheduleId/prevent', requireAdmin, preventDeletion);
router.post('/scheduled-deletions/:scheduleId/reschedule', requireAdmin, cancelPreventionAndReschedule);
router.get('/inactive', requireAdmin, getInactiveUsers);

export default router;
