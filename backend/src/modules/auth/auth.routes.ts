import { Router } from 'express';
import { requireAuth } from '../../middlewares/roleMiddleware.js';
import { register, login, logout, refreshToken, forgotPassword, resetPassword, verifyEmail, resendVerification } from './auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);

router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, (req, res) => { res.json({ user: (req as any).user }); });

export default router;
