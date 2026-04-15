import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

export const requireTeacher = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token = req.cookies?.accessToken || req.cookies?.access_token;

    if (!token) {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      res.status(401).json({ message: 'Access token required' });
      return;
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }

    if (!['teacher', 'admin', 'superadmin'].includes(user.role)) {
      res.status(403).json({ message: 'Access denied. Teacher role required.' });
      return;
    }

    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }

    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};


