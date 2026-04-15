import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import logger from '../utils/logger.js';

export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void): void => {
  let token: string | null = null;

  const cookies = socket.handshake.headers.cookie;
  if (cookies) {
    const parsedCookies = cookie.parse(cookies);
    token = parsedCookies.accessToken || parsedCookies.access_token || null;
  }

  if (!token && socket.handshake.query?.token) {
    token = socket.handshake.query.token as string;
  }

  if (!token) {
    logger.warn({ id: socket.id }, 'No accessToken found in cookies or query');
    return next(new Error('Authentication required'));
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!, (err, decoded) => {
    if (err) {
      logger.warn({ id: socket.id, error: err.message }, 'JWT verification failed');
      return next(new Error('Authentication failed'));
    }
    (socket as any).user = decoded;
    next();
  });
};
