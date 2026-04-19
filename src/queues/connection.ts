import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import 'dotenv/config';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (err) => {
  logger.error(`[Redis] Connection error: ${err.message}`);
});

redisConnection.on('ready', () => {
  logger.info('[Redis] Connection ready.');
});
