import { Router } from 'express';
import { requireAdmin } from '../../middlewares/adminAuth.js';
import {
  createSiteSecurityMessage,
  getSiteSecurityMessages,
  verifySiteSecurityMessage,
} from './siteSecurity.controller.js';

const router = Router();

router.post('/create-site-security-messages', requireAdmin, createSiteSecurityMessage);
router.get('/get-site-security-messages', requireAdmin, getSiteSecurityMessages);
router.post('/verify-site-security-messages', verifySiteSecurityMessage);

export default router;
