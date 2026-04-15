import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { getRedisClient } from '../../config/redisClient.js';

export const setupRedisAdapter = async (io: Server): Promise<void> => {
  const pubClient = getRedisClient();
  const subClient = pubClient.duplicate();

  if (!subClient.isOpen) {
    await subClient.connect();
  }

  io.adapter(createAdapter(pubClient, subClient));
};
