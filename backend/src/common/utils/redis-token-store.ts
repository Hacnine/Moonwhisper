import jwt from 'jsonwebtoken';
import { Response, Request } from 'express';
import { getRedisClient } from '../../config/redisClient.js';

export const storeToken = async (
  res: Response,
  token: { access: string; refresh: string },
  userId: string,
  req: Request
): Promise<void> => {
  const redisClient = getRedisClient();
  const { access, refresh } = token;

  const isProduction = process.env.NODE_ENV === 'production';
  const forwardedProto = req.headers['x-forwarded-proto'] || '';
  const proto = (req as any).protocol || (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0]?.trim() : 'http');
  const isHttps = String(proto).toLowerCase() === 'https';

  const cookieOptions = {
    httpOnly: true,
    secure: Boolean(isProduction && isHttps),
    sameSite: (isProduction && isHttps ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
    domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
  };

  await redisClient.set(`access_token_${userId}`, access, { EX: 60 * 60 * 24 * 7 });
  await redisClient.set(`refresh_token_${userId}`, refresh, { EX: 60 * 60 * 24 * 7 });

  if (!res.headersSent) {
    res.cookie('access_token', access, cookieOptions);
    res.cookie('refresh_token', refresh, cookieOptions);
  }
};

export const getToken = async (req: Request): Promise<{ access_token: string | null; refresh_token: string | null }> => {
  const redisClient = getRedisClient();
  const cookies = req.cookies || {};
  const access_token = cookies.access_token || null;
  const refresh_token = cookies.refresh_token || null;

  if (!access_token) {
    return { access_token: null, refresh_token };
  }

  try {
    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET!) as { id: string };
    const userId = decoded.id;

    const storedAccess = await redisClient.get(`access_token_${userId}`);
    const storedRefresh = await redisClient.get(`refresh_token_${userId}`);

    return {
      access_token: storedAccess || access_token,
      refresh_token: storedRefresh || refresh_token,
    };
  } catch {
    return { access_token: null, refresh_token };
  }
};

export const removeToken = async (res: Response, req: Request): Promise<void> => {
  const redisClient = getRedisClient();
  try {
    const { access_token, refresh_token } = req.cookies || {};
    if (!access_token && !refresh_token) return;

    let userId: string | null = null;
    if (access_token) {
      const decoded = jwt.decode(access_token) as { id: string } | null;
      userId = decoded?.id || null;
    }

    if (userId) {
      await redisClient.del(`access_token_${userId}`);
      await redisClient.del(`refresh_token_${userId}`);
    }

    if (!res.headersSent) {
      res.clearCookie('access_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
      });
      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
      });
    }
  } catch (error) {
    console.error('Error during logout:', error);
    throw error;
  }
};
