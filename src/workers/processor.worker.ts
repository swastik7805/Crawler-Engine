import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queues/connection.js';
import { crawlQueue } from '../queues/crawl.queue.js';
import { ProcessJobData } from '../types/queue.js';
import { extractContent } from '../pipeline/extractor.js';
import { chunkText } from '../pipeline/chunker.js';
import { indexDocument } from '../pipeline/indexer.js';
import { logger } from '../utils/logger.js';
import { markVisited } from '../utils/redis.js';

const MAX_LINKS_PER_PAGE = 50;

export const processorWorker = new Worker<ProcessJobData>('process_queue', async(job:Job<ProcessJobData>)=>{
    const { sourceId, url, html, finalUrl, depth, maxDepth, respectRobots } = job.data;
    logger.info(`[Processor] Processing content from: ${finalUrl}`);

    // 1. Extract
    const extracted = extractContent(html, finalUrl);

    // 2. Link Expansion (Frontier Management)
    if (depth < maxDepth && extracted.internalLinks.length > 0) {
      const uniqueLinks = extracted.internalLinks.slice(0, MAX_LINKS_PER_PAGE);
      
      for (const link of uniqueLinks) {
        const isNew = await markVisited(link);
        if (isNew) {
          await crawlQueue.add(`crawl:${link}`, {
            sourceId,
            url: link,
            depth: depth + 1,
            maxDepth,
            respectRobots,
          });
          logger.debug(`[Processor] Enqueued new link: ${link} (depth ${depth + 1})`);
        }
      }
    }

    // 3. Chunk
    const textChunks = chunkText(extracted.bodyText);
    if (textChunks.length === 0) {
      logger.warn(`[Processor] No chunks produced for ${finalUrl}`);
      return { status: 'no_chunks' };
    }

    // 4. Index
    // In production, embeddings would be a separate microservice.
    // We pass empty arrays for now, as backfilling is handled separately.
    const embeddings: number[][] = textChunks.map(() => []);

    const result = await indexDocument({
      sourceId,
      url: finalUrl,
      extracted,
      textChunks,
      embeddings,
    });

    logger.info(`[Processor] Indexed ${result.chunksInserted} chunks for ${finalUrl}`);
    return { status: 'success', documentId: result.documentId };
  },
  {
    connection: redisConnection,
    concurrency: 5, // High CPU, keep concurrency moderate
  }
);

processorWorker.on('failed', (job, err) => {
  logger.error(`[Processor] Job ${job?.id} failed: ${(err as Error).message}`);
});
