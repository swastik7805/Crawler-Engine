import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';
import { ProcessJobData } from '../types/queue.js';

export const processQueue = new Queue<ProcessJobData>('process_queue', {
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
