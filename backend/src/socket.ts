/**
 * Socket.IO Server Initialization
 * NestJS-inspired modular socket architecture
 */

import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { RedisClientType } from 'redis';
import logger from './common/utils/logger.js';
import { socketAuthMiddleware } from './common/socket/socket.middleware.js';
import { setupRedisAdapter } from './common/socket/socket.adapter.js';
import { GatewayManager } from './common/socket/gateway.manager.js';

// Import gateways from modules
import { MessageGateway } from './modules/message/index.js';
import { ConversationGateway } from './modules/conversation/index.js';
import { UserGateway } from './modules/user/index.js';
import { SMTEGateway } from './modules/smte/index.js';
import { EncryptionGateway } from './modules/encryption/encryption.gateway.js';

/**
 * Initialize Socket.IO server with modular gateway architecture
 */
export const initializeSocketServer = async (server: HttpServer, _redis: RedisClientType): Promise<Server> => {
  const allowedOrigins = (process.env.ORIGIN_URL || 'http://localhost:3000').split(',').map((s) => s.trim());

  // Create Socket.IO server
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
  });

  logger.info('Initializing Socket.IO server...');

  // Set up Redis adapter for clustering
  await setupRedisAdapter(io);
  logger.info('Redis adapter configured');

  // Set up authentication middleware
  io.use(socketAuthMiddleware);
  logger.info('Socket authentication middleware configured');

  // Create gateway manager
  const gatewayManager = new GatewayManager(io);

  // Register all gateways
  gatewayManager.register(UserGateway);           // User presence
  gatewayManager.register(ConversationGateway);    // Conversation management
  gatewayManager.register(MessageGateway);         // Messaging
  gatewayManager.register(EncryptionGateway);      // End-to-end encryption
  gatewayManager.register(SMTEGateway);            // Transport encryption

  // Initialize all gateways
  gatewayManager.initialize();

  logger.info('Socket.IO server initialized with modular architecture');

  return io;
};

// Legacy export for compatibility
export const initialSocketServer = initializeSocketServer;
