import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queues/connection.js';
import { CrawlJobData } from '../types/queue.js';
import { processQueue } from '../queues/process.queue.js';
import { fetchPage } from '../pipeline/fetcher.js';
import { logger } from '../utils/logger.js';

export const fetcherWorker = new Worker<CrawlJobData>('crawl_queue', async(job:Job<CrawlJobData>)=>{
    const { url, sourceId, depth, maxDepth, respectRobots } = job.data;
    logger.info(`[Fetcher] Processing: ${url} (Depth: ${depth})`);

    const fetchResult = await fetchPage(url, respectRobots);
    if (!fetchResult) {
      logger.warn(`[Fetcher] Skipping ${url} (Blocked or Failed)`);
      return { status: 'skipped', url };
    }

    await processQueue.add(`process:${fetchResult.finalUrl}`, {
      sourceId,
      url, // Original URL
      finalUrl: fetchResult.finalUrl,
      html: fetchResult.html,
      depth,
      maxDepth,
      respectRobots,
    });

    return { status: 'success', finalUrl: fetchResult.finalUrl };
  },
  {
    connection: redisConnection,
    concurrency: 10, // I/O bound, we can run multiple concurrently
  }
);

fetcherWorker.on('failed', (job, err) => {
  logger.error(`[Fetcher] Job ${job?.id} failed for URL ${job?.data.url}: ${(err as Error).message}`);
});
