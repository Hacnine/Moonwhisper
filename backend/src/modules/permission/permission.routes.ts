import { Router } from 'express';
import { isLogin } from '../../middlewares/auth.middleware.js';
import {
  getMessagePermissions,
  requestPermission,
  getPermissionRequests,
  reviewPermissionRequest,
  updateMessagePermissions,
} from './permission.controller.js';

const router = Router();

router.use(isLogin);

router.get('/conversations/:conversationId', getMessagePermissions);
router.post('/conversations/:conversationId/request', requestPermission);
router.get('/conversations/:conversationId/requests', getPermissionRequests);
router.patch('/requests/:requestId/review', reviewPermissionRequest);
router.patch('/conversations/:conversationId', updateMessagePermissions);

export default router;
