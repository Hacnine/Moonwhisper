import { Router } from 'express';
import { body } from 'express-validator';
import {
  register, login, logout, getAllUsers, refreshToken,
  getUserInfo, updateUserInfo, updateUserThemeIndex, getUserThemeIndex,
  searchUser, deleteUser, updateName, updateEmail, updatePassword,
  blockUser, unblockUser,
} from './user.controller.js';
import { isLogin, isLogout } from '../../middlewares/auth.middleware.js';
import { uploadImage } from '../../middlewares/multerConfig.js';
import rateLimit from 'express-rate-limit';

const userRouter = Router();

const generalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts, please try again later.',
});

userRouter.get('/refresh-token', refreshToken);
userRouter.post('/register', uploadImage.single('image'), register);
userRouter.post('/login', isLogout, login);
userRouter.post('/logout', isLogin, logout);
userRouter.get('/me', isLogin, (req, res) => { res.json({ user: (req as any).user }); });

userRouter.get('/allusers', isLogin, getAllUsers);
userRouter.patch('/update/:userId', isLogin, [
  body('name').optional().isString().trim().escape(),
  body('email').optional().isEmail().normalizeEmail(),
  body('password').optional().isLength({ min: 1 }).trim().escape(),
  body('gender').optional().isIn(['male', 'female', 'other']).trim().escape(),
  body('image').optional().trim(),
], updateUserInfo);

userRouter.get('/userinfo/:userId', isLogin, getUserInfo);
userRouter.get('/theme-index', isLogin, getUserThemeIndex);
userRouter.patch('/theme-index', isLogin, updateUserThemeIndex);
userRouter.get('/search-user', isLogin, searchUser);
userRouter.get('/delete-user/:id', deleteUser);

userRouter.patch('/name', isLogin, [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 50 }),
], updateName);
userRouter.patch('/email', isLogin, [
  body('email').trim().notEmpty().isEmail().normalizeEmail(),
], updateEmail);
userRouter.patch('/password', isLogin, [
  body('password').trim().notEmpty().isLength({ min: 6 }),
], updatePassword);

userRouter.post('/block', isLogin, blockUser);
userRouter.delete('/block/:userId', isLogin, unblockUser);

export default userRouter;
