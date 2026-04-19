import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';
import { CrawlJobData } from '../types/queue.js';

export const crawlQueue = new Queue<CrawlJobData>('crawl_queue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
