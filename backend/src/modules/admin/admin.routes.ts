import { Router } from 'express';
import { requireAdmin, requireSuperAdmin } from '../../middlewares/adminAuth.js';
import {
  getDashboardStats,
  getAllUsersForAdmin,
  getPendingApprovals,
  approveUser,
  rejectUser,
  getAdminSettings,
  updateAdminSettings,
  suspendUser,
  unsuspendUser,
  getActivityLogs,
  getSystemHealth,
} from './admin.controller.js';

const router = Router();

// Dashboard
router.get('/dashboard/stats', requireAdmin, getDashboardStats);

// System
router.get('/system/health', requireAdmin, getSystemHealth);

// Users
router.get('/users', requireAdmin, getAllUsersForAdmin);
router.post('/users/:userId/suspend', requireAdmin, suspendUser);
router.post('/users/:userId/unsuspend', requireAdmin, unsuspendUser);

// Approvals
router.get('/approvals/pending', requireAdmin, getPendingApprovals);
router.post('/approvals/:approvalId/approve', requireAdmin, approveUser);
router.post('/approvals/:approvalId/reject', requireAdmin, rejectUser);

// Settings
router.get('/settings', requireAdmin, getAdminSettings);
router.put('/settings', requireSuperAdmin, updateAdminSettings);

// Logs
router.get('/logs', requireAdmin, getActivityLogs);

export default router;
