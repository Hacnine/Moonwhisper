import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import helmet from 'helmet';

// Config & utils
import prisma from './config/database.js';
import { connectRedis } from './config/redisClient.js';
import logger from './common/utils/logger.js';
import { messageCleanupJob } from './schedulers/messageCleanupJob.js';
import { startCronJobsForScheduledDeletion } from './schedulers/scheduledDeletionJob.js';
import { startEncryptionKeyRotation } from './schedulers/encryptionKeyRotationJob.js';
import { initializeEncryptionKeys, decryptBuffer, isEncryptedFile } from './services/backendEncryptionService.js';
import { initializeSocketServer } from './socket.js';
import { setSocketIO } from './services/notificationService.js';
import routeIndex from './routes.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import { autoInitializeDatabase } from '../prisma/seed.js';

// Extend global to hold io
declare global {
  // eslint-disable-next-line no-var
  var io: import('socket.io').Server | undefined;
}

const app = express();

(async () => {
  try {
    const port = process.env.PORT || 3001;

    // Connect DB (Prisma) & Redis
    await prisma.$connect();
    logger.info('Prisma connected to MySQL');

    // Auto-seed database if empty
    await autoInitializeDatabase();

    const redis = await connectRedis();

    // Initialize backend encryption keys
    await initializeEncryptionKeys();
    logger.info('Backend encryption service initialized');

    // Core middlewares
    // Trust proxy - MUST be set before other middleware when behind Nginx
    app.set('trust proxy', 1);

    app.use(helmet());
    app.use(compression());

    const originUrl = process.env.ORIGIN_URL || 'http://localhost:3000';
    const allowedOrigins = originUrl.split(',').map((s) => s.trim());
    app.use(cors({ origin: allowedOrigins, credentials: true }));

    app.use('/images', express.static(path.join(process.cwd(), 'public/images')));

    // Serve uploaded files — decrypt BENC-encrypted files on-the-fly
    app.use('/uploads', async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Prevent directory traversal
        const safePath = path.normalize(req.path).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(process.cwd(), 'uploads', safePath);

        // Must stay inside uploads dir
        if (!filePath.startsWith(path.join(process.cwd(), 'uploads'))) {
          return res.status(400).send('Invalid path');
        }

        const fs = await import('fs');
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          return next(); // 404 handled elsewhere
        }

        const fileBuffer = fs.readFileSync(filePath);

        if (isEncryptedFile(fileBuffer)) {
          // Decrypt BENC file and send the plaintext bytes
          const decrypted = await decryptBuffer(fileBuffer);
          const ext = path.extname(filePath).toLowerCase().replace('.', '');
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            mp4: 'video/mp4',
            webm: 'video/webm',
            mp3: 'audio/mpeg',
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          };
          res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'private, max-age=86400');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          return res.send(decrypted);
        }

        // Not encrypted — serve as-is (backward compat for old unencrypted files)
        return express.static(path.join(process.cwd(), 'uploads'))(req, res, next);
      } catch (err: any) {
        console.error('Upload serve error:', err.message);
        return res.status(500).send('File error');
      }
    });

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Sessions (Redis)
    const isProduction = process.env.NODE_ENV === 'production';
    app.use(
      session({
        store: new RedisStore({ client: redis as any, prefix: 'moonwhishper:sess:' }),
        secret: process.env.SESSION_SECRET || 'fallback-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: isProduction,
          httpOnly: true,
          sameSite: isProduction ? 'none' : 'lax',
          maxAge: 24 * 60 * 60 * 1000,
        },
        name: 'sid',
      })
    );

    // Socket.IO - Modular NestJS-like architecture
    const server = http.createServer(app);
    const io = await initializeSocketServer(server, redis);

    // Expose io globally so background jobs can emit events
    try {
      global.io = io;
    } catch {
      // ignore in environments that don't support global assignment
    }

    // Set IO for notification service
    setSocketIO(io);

    // Attach io to requests
    const attachIo = (req: Request, _res: Response, next: NextFunction) => {
      (req as any).io = io;
      next();
    };

    // Routes
    app.use('/', apiLimiter, attachIo, routeIndex);

    // 404
    app.use((_req: Request, res: Response) =>
      res.status(404).json({ success: false, message: 'Route not found' })
    );

    // Error handler
    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      logger.error({ err, url: req.originalUrl }, 'Unhandled error');
      res.status(err.status || 500).json({ success: false, message: err.message || 'Server Error' });
    });

    // Start schedulers
    messageCleanupJob.start();
    startCronJobsForScheduledDeletion();
    startEncryptionKeyRotation();
    logger.info('All cron jobs started including encryption key rotation');

    // Start server
    server.listen(port, () => logger.info(`Server running on port ${port}`));

    // Graceful shutdown
    const shutdown = (signal: string) => async () => {
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Force exiting after 10s');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', shutdown('SIGINT'));
    process.on('SIGTERM', shutdown('SIGTERM'));
  } catch (err) {
    logger.error({ err }, 'Error starting server:');
    console.error('Full error:', err);
    process.exit(1);
  }
})();

export { app };
