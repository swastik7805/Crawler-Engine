import {pgTable,pgEnum,serial,text,integer,boolean,timestamp,uniqueIndex,index,customType} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';



interface Vector{
  data: number[];
  config: { dimensions: number };
  driverData: string
}

interface TSVector{
  data: string;
  driverData: string
}

// -------- Custom PostgreSQL type -------------

/**
 *  pgvector `vector(n)` type.
 *  Dimensions: 1536 is the default.
 */
const vector = customType<Vector>({
  dataType(config) {
    const dim = config?.dimensions ?? 1536;
    return `vector(${dim})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(Number);
  },
});

/**
 * PostgreSQL `tsvector` type.
 * Populated by a BEFORE INSERT/UPDATE trigger (see migration SQL).
 * The trigger applies weighted ts_vectors:
 *   title        → weight 'A' (highest)
 *   meta_keywords → weight 'B'
 *   content      → weight 'C'
 */
const tsvector = customType<TSVector>({
  dataType() {
    return 'tsvector';
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: string): string {
    return value;
  },
});

// -------- Enums --------
export const crawlStatusEnum = pgEnum('crawl_status', [
  'pending',     // Queued, not yet started
  'in_progress', // Actively being crawled
  'completed',   // Successfully crawled and indexed
  'failed',      // Terminal failure after retries
  'skipped',     // Intentionally excluded (robots.txt, non-HTML, etc.)
]);

// ----- Tables -----------

/**
 * Seed URLs and their crawl configuration. Acts as the root of the
 * crawl queue. Each source owns a subtree of `documents`.
 */
export const crawlSources = pgTable('crawl_sources',
  {
    id: serial('id').primaryKey(),
    url: text('url').notNull(),
    domain: text('domain').notNull(),
    priority: integer('priority').notNull().default(5), // Official docs and EIPs get priority 1; community blogs get 3+.
    status: crawlStatusEnum('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    crawlDepth: integer('crawl_depth').notNull().default(2), // Link hops to follow from the root_url
    respectRobots: boolean('respect_robots').notNull().default(true), // Whether to respect robots.txt for this source
    lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    urlUniqueIdx: uniqueIndex('crawl_sources_url_unique_idx').on(t.url), // Prevent duplicate URLs
    domainIdx: index('crawl_sources_domain_idx').on(t.domain), // Fast lookup in domain
    // Composite index
    statusPriorityIdx: index('crawl_sources_status_priority_idx').on(t.status, t.priority), // Queue-style polling: WHERE status = 'pending' ORDER BY priority
  })
);

/**
 * One row per successfully crawled HTML page.
 * Stores page-level metadata; the actual search-indexed content lives in `chunks`.
 */
export const documents = pgTable('documents',
  {
    id: serial('id').primaryKey(),
    sourceId: integer('source_id').references(()=>crawlSources.id, {onDelete: 'cascade'}),
    url: text('url').notNull(),
    title: text('title'),
    metaDescription: text('meta_description'),
    metaKeywords: text('meta_keywords').array(),
    canonicalUrl: text('canonical_url'),
    // MD5 hash of the extracted body text.Used to skip re-indexing unchanged pages on subsequent crawls.
    contentHash: text('content_hash'),
    crawledAt: timestamp('crawled_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    urlUniqueIdx: uniqueIndex('documents_url_unique_idx').on(t.url),
    contentHashIdx: index('documents_content_hash_idx').on(t.contentHash), // Used to detect unchanged content and skip re-chunking
    sourceIdIdx: index('documents_source_id_idx').on(t.sourceId),
  })
);

/**
 * THE CORE SEARCH TABLE. One row = one 300–500 word segment of a document.
 * This single table drives all three search strategies:
 *
 *   ① Lexical  (80% — fast links)
 *      Column : content_tsv  (tsvector)
 *      Index  : GIN → O(log n) keyword lookup
 *      Query  : ts_rank_cd(content_tsv, plainto_tsquery('english', $query))
 *
 *   ② Semantic (20% — AI context)
 *      Column : embedding  (vector(1536))
 *      Index  : HNSW with cosine ops → approximate nearest-neighbor
 *      Query  : embedding <=> $query_vector  (cosine distance)
 *
 *   ③ Fuzzy   (fallback — typo tolerance)
 *      Column : content  (text) ← indexed via gin_trgm_ops
 *      Index  : GIN trigram
 *      Query  : content % $query  (similarity threshold)
 *               or content ILIKE '%ethereum%' for partial match
 *
 *   GIN (tsvector), HNSW (vector), GIN (trgm) are defined in: src/db/migrations/0001_extensions_and_indexes.sql
 *
 *   Reason: Drizzle cannot express:
 *    - HNSW WITH (m = 16, ef_construction = 64)
 *    - GIN with gin_trgm_ops operator class
 *    - Partial indexes (WHERE embedding IS NOT NULL)
 */

export const chunks = pgTable('chunks',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    // Search → must be FAST → avoid JOIN
    url: text('url').notNull(),
    title: text('title'),
    metaKeywords: text('meta_keywords').array(),
    chunkIndex: integer('chunk_index').notNull(), // Sequential position of this chunk within its parent document
    content: text('content').notNull(), // The 300–500 word text segment — source for all three search strategies
    wordCount: integer('word_count').notNull(),

    // ── Strategy 1: Lexical ──────────────────────────────────────────────────
    /**
     * Weighted tsvector. Populated and kept current by the DB trigger:
     *   `trg_chunks_tsv_update`  
     *
     * Weight breakdown:
     *   title        → 'A'  (4× boost in ts_rank)
     *   meta_keywords → 'B'  (2× boost)
     *   content      → 'C'  (1× boost)
     */
    contentTsv: tsvector('content_tsv'),

    // ── Strategy 2: Semantic ─────────────────────────────────────────────────
    /**
     * Dense vector embedding of `content`.
     * Dimensions: 1536 — compatible with:
     *   - OpenAI  text-embedding-ada-002
     *   - Nomic   nomic-embed-text-v1.5
     *   - Cohere  embed-english-v3.0
     *
     * Set to NULL until the embedding worker processes the chunk.
     * HNSW index is partial: WHERE embedding IS NOT NULL
     */
    embedding: vector('embedding', { dimensions: 1536 }),

    // Strategy 3 (Fuzzy) uses the `content` column directly.
    // The gin_trgm_ops GIN index is on `content` — no separate column needed.

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    documentIdIdx: index('chunks_document_id_idx').on(t.documentId),
    urlIdx: index('chunks_url_idx').on(t.url),
  })
);

export type CrawlSource    = typeof crawlSources.$inferSelect;
export type Document       = typeof documents.$inferSelect;
export type Chunk          = typeof chunks.$inferSelect;