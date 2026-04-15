import { createClient, RedisClientType } from 'redis';
import logger from '../common/utils/logger.js';

let redisClient: RedisClientType;

export const connectRedis = async (): Promise<RedisClientType> => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis Client Error');
    });

    if (!redisClient.isOpen) {
      await redisClient.connect();
      logger.info('Redis connected successfully');
    }

    return redisClient;
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis');
    throw err;
  }
};

export const getRedisClient = (): RedisClientType => {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client is not connected');
  }
  return redisClient;
};
