/**
 * Distributed Orchestrator:
 *   - Responsible for seeding the database with root sources.
 *   - Dispatches initial crawl jobs to BullMQ (Redis-backed).
 *   - Scaling is achieved by running multiple Fetcher and Processor workers.
 */

import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { crawlSources } from './db/schema.js';
import { SeedSource } from './config/seed.js';
import { logger } from './utils/logger.js';
import { crawlQueue } from './queues/crawl.queue.js';
import { markVisited } from './utils/redis.js';

export class Orchestrator {
  
  // Inserts seed sources into crawl_sources if they don't already exist. 
  async seedDatabase(sources: SeedSource[]){
    logger.info(`[Orchestrator] Seeding ${sources.length} sources...`);

    for (const source of sources) {
      await db
        .insert(crawlSources)
        .values({
          url: source.url,
          domain: source.domain,
          priority: source.priority,
          crawlDepth: source.crawlDepth,
          status: 'pending',
        })
        .onConflictDoNothing();
    }
  }

  // Dispatches all pending sources to the distributed crawl queue. 
  async run(seeds: SeedSource[]){
    await this.seedDatabase(seeds);

    const pendingSources = await db
      .select()
      .from(crawlSources)
      .where(eq(crawlSources.status, 'pending'))
      .orderBy(crawlSources.priority);

    if (pendingSources.length === 0) {
      logger.info('[Orchestrator] No pending sources found.');
      return;
    }

    logger.info(`[Orchestrator] Dispatching ${pendingSources.length} sources to BullMQ...`);

    for (const source of pendingSources) {
      try {
        // Mark in-progress in DB
        await db
          .update(crawlSources)
          .set({ status: 'in_progress', updatedAt: new Date() })
          .where(eq(crawlSources.id, source.id));

        // Mark root URL as visited to prevent immediate circular re-enqueue
        await markVisited(source.url);

        // Add to distributed queue
        await crawlQueue.add(`seed:${source.id}`, {
          sourceId: source.id,
          url: source.url,
          depth: 0,
          maxDepth: source.crawlDepth,
          respectRobots: source.respectRobots,
        });

        logger.info(`[Orchestrator] Enqueued seed: ${source.url}`);
      } catch (error) {
        logger.error(`[Orchestrator] Failed to enqueue ${source.url}: ${(error as Error).message}`);
      }
    }

    logger.info('═══ [Orchestrator] Dispatch Complete ═══');
  }
}