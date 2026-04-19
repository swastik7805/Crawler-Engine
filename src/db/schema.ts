import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Custom PostgreSQL Types ──────────────────────────────────────────────────

/**
 * pgvector `vector(n)` type.
 * Dimensions: 1536 is the default (compatible with OpenAI ada-002 and
 * nomic-embed-text-v1.5). Override per-column via the config object.
 *
 * Driver serialization: PostgreSQL expects the string literal "[1.0,2.0,...]"
 */
const vector = customType<{
  data: number[];
  config: { dimensions: number };
  driverData: string;
}>({
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
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const crawlStatusEnum = pgEnum('crawl_status', [
  'pending',     // Queued, not yet started
  'in_progress', // Actively being crawled
  'completed',   // Successfully crawled and indexed
  'failed',      // Terminal failure after retries
  'skipped',     // Intentionally excluded (robots.txt, non-HTML, etc.)
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

/**
 * crawl_sources
 * Seed URLs and their crawl configuration. Acts as the root of the
 * crawl queue. Each source owns a subtree of `documents`.
 */
export const crawlSources = pgTable(
  'crawl_sources',
  {
    id: serial('id').primaryKey(),

    /** Canonical starting URL for this source (e.g., https://eips.ethereum.org) */
    url: text('url').notNull(),

    /** Hostname, used for per-domain rate limiting in the crawler */
    domain: text('domain').notNull(),

    /**
     * Crawl priority: 1 = highest, 10 = lowest.
     * Official docs and EIPs get priority 1; community blogs get 3+.
     */
    priority: integer('priority').notNull().default(5),

    /** Current state of this source in the crawl lifecycle */
    status: crawlStatusEnum('status').notNull().default('pending'),

    /** Populated on terminal failure for debugging */
    errorMessage: text('error_message'),

    /** How many link-hops to follow from the root URL */
    crawlDepth: integer('crawl_depth').notNull().default(2),

    /** Whether to respect robots.txt for this source */
    respectRobots: boolean('respect_robots').notNull().default(true),

    lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    /** Prevents duplicate seeds */
    urlUniqueIdx: uniqueIndex('crawl_sources_url_unique_idx').on(t.url),
    /** Fast lookup by domain for rate-limit enforcement */
    domainIdx: index('crawl_sources_domain_idx').on(t.domain),
    /** Queue-style polling: WHERE status = 'pending' ORDER BY priority */
    statusPriorityIdx: index('crawl_sources_status_priority_idx').on(t.status, t.priority),
  })
);

/**
 * documents
 * One row per successfully crawled HTML page.
 * Stores page-level metadata; the actual search-indexed content lives in `chunks`.
 *
 * Relationship: crawl_sources 1 → N documents 1 → N chunks
 */
export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),

    /** FK to the seed source that initiated this crawl path */
    sourceId: integer('source_id').references(() => crawlSources.id, {
      onDelete: 'cascade',
    }),

    /** Final URL after redirect resolution */
    url: text('url').notNull(),

    title: text('title'),
    metaDescription: text('meta_description'),

    /**
     * TEXT[] — parsed from <meta name="keywords">.
     * Stored as an array for structured filtering in future faceted search.
     */
    metaKeywords: text('meta_keywords').array(),

    /** Resolved canonical URL from <link rel="canonical"> if present */
    canonicalUrl: text('canonical_url'),

    /**
     * MD5 hash of the extracted body text.
     * Used to skip re-indexing unchanged pages on subsequent crawls.
     */
    contentHash: text('content_hash'),

    crawledAt: timestamp('crawled_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    /** Primary deduplication guard — one row per canonical URL */
    urlUniqueIdx: uniqueIndex('documents_url_unique_idx').on(t.url),
    /** Used to detect unchanged content and skip re-chunking */
    contentHashIdx: index('documents_content_hash_idx').on(t.contentHash),
    /** Supports JOIN with crawl_sources */
    sourceIdIdx: index('documents_source_id_idx').on(t.sourceId),
  })
);

/**
 * chunks
 * THE CORE SEARCH TABLE. One row = one 300–500 word segment of a document.
 *
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
 */
export const chunks = pgTable(
  'chunks',
  {
    id: serial('id').primaryKey(),

    /** FK to parent document; CASCADE DELETE keeps DB clean on re-crawl */
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    // ── Denormalized metadata (avoids JOIN on every search hit) ──────────────
    /** Source URL — returned directly to frontend as the search result link */
    url: text('url').notNull(),
    /** Page title — rendered as the blue link headline */
    title: text('title'),
    /** Inherited from document for keyword-based boosting */
    metaKeywords: text('meta_keywords').array(),

    // ── Content ──────────────────────────────────────────────────────────────
    /** Sequential position of this chunk within its parent document */
    chunkIndex: integer('chunk_index').notNull(),
    /** The 300–500 word text segment — source for all three search strategies */
    content: text('content').notNull(),
    wordCount: integer('word_count').notNull(),

    // ── Strategy 1: Lexical ──────────────────────────────────────────────────
    /**
     * Weighted tsvector. Populated and kept current by the DB trigger:
     *   `trg_chunks_tsv_update`  (see migration SQL)
     *
     * Weight breakdown:
     *   title        → 'A'  (4× boost in ts_rank)
     *   meta_keywords → 'B'  (2× boost)
     *   content      → 'C'  (1× boost)
     *
     * Do NOT set this from application code — the trigger owns it.
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
     * HNSW index is partial: WHERE embedding IS NOT NULL (see migration SQL)
     */
    embedding: vector('embedding', { dimensions: 1536 }),

    // Strategy 3 (Fuzzy) uses the `content` column directly.
    // The gin_trgm_ops GIN index is on `content` — no separate column needed.

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    /** Supports cascade delete and "all chunks for document X" queries */
    documentIdIdx: index('chunks_document_id_idx').on(t.documentId),
    /** Supports "all chunks for URL X" — used in dedup on re-crawl */
    urlIdx: index('chunks_url_idx').on(t.url),
    /**
     * GIN (tsvector), HNSW (vector), GIN (trgm) are defined in:
     *   src/db/migrations/0001_extensions_and_indexes.sql
     *
     * Reason: Drizzle cannot express:
     *   - HNSW WITH (m = 16, ef_construction = 64)
     *   - GIN with gin_trgm_ops operator class
     *   - Partial indexes (WHERE embedding IS NOT NULL)
     */
  })
);

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type CrawlSource    = typeof crawlSources.$inferSelect;
export type NewCrawlSource = typeof crawlSources.$inferInsert;
export type Document       = typeof documents.$inferSelect;
export type NewDocument    = typeof documents.$inferInsert;
export type Chunk          = typeof chunks.$inferSelect;
export type NewChunk       = typeof chunks.$inferInsert;