import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { removeToken } from '../common/utils/redis-token-store.js';

export const isLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token = req.cookies?.accessToken || req.cookies?.access_token;

    if (!token) {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      res.status(401).json({ message: 'Unauthorized: No token provided.' });
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as { id: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        omit: { password: true, twoFactorSecret: true },
      });

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      (req as any).user = user;
      next();
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        res.status(401).json({ message: 'Unauthorized: Token expired' });
        return;
      }
      res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
  } catch (error) {
    console.error('Middleware Error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const isLogout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await removeToken(res, req);
    if (req.session) {
      req.session.destroy((err) => {
        if (err) console.error('Session destroy error:', err);
      });
    }
    next();
  } catch (error) {
    console.error('isLogout error:', error);
    next();
  }
};
