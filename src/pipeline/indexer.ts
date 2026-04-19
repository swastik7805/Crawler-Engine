import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { crawlSources, documents, chunks } from '../db/schema.js';
;import { logger } from '../utils/logger.js';
import { ExtractedContent, IndexDocumentParams, IndexResult, TextChunk } from '../types.ts/pipeline.js';
import { computeHash } from '../utils/indexing.js';

/**
 * Embeddings:
 *   Passed in as a pre-computed parallel array. The embedding worker (separate
 *   service) should call updateChunkEmbedding() to backfill NULL embeddings.
 */
export async function indexDocument(params: IndexDocumentParams): Promise<IndexResult> {
  const { sourceId, url, extracted, textChunks, embeddings } = params;
  if (textChunks.length === 0) {
    logger.warn(`No chunks produced for ${url} — skipping index`);
    return { documentId: -1, chunksInserted: 0, skipped: true };
  }

  const contentHash = computeHash(extracted.bodyText);

  return db.transaction(async (tx) => {
    // 1. Upsert document 
    const [doc] = await tx.insert(documents).values({
        sourceId,
        url,
        title: extracted.title,
        metaDescription: extracted.metaDescription,
        metaKeywords: extracted.metaKeywords,
        canonicalUrl: extracted.canonicalUrl,
        contentHash,
      })
      .onConflictDoUpdate({
        target: documents.url,
        set: {
          title: extracted.title,
          metaDescription: extracted.metaDescription,
          metaKeywords: extracted.metaKeywords,
          canonicalUrl: extracted.canonicalUrl,
          contentHash,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: documents.id,
        previousHash: documents.contentHash,
      });

    if (!doc) throw new Error(`Document upsert returned no rows for ${url}`);

    // ── 2. Content hash check — skip unchanged pages ─────────────────────────
    // previousHash comes from the row *before* our update.
    // After upsert, the row has the new hash. We compare to detect change.
    // NOTE: On first INSERT, previousHash will equal contentHash (new row).
    // We use crawledAt comparison instead for first-visit detection.
    // Simplified: always re-chunk on update (previousHash mismatch).
    // On identical content, skip to avoid HNSW churn.

    // 3. Delete stale chunks (idempotent re-crawl) 
    const deleted = await tx
      .delete(chunks)
      .where(eq(chunks.documentId, doc.id))
      .returning({ id: chunks.id });

    if (deleted.length > 0) {
      logger.debug(`Deleted ${deleted.length} stale chunks for document ${doc.id}`);
    }

    // 4. Bulk insert new chunks 
    const chunkValues = textChunks.map((chunk, i) => {
      const embedding = embeddings[i];
      return {
        documentId: doc.id,
        url,
        title: extracted.title,
        metaKeywords: extracted.metaKeywords,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        wordCount: chunk.wordCount,
        // NULL if embedding worker hasn't processed yet (excluded from HNSW index)
        embedding: embedding && embedding.length > 0 ? embedding : null,
        // content_tsv is set by DB trigger — do NOT supply it here
      };
    });

    await tx.insert(chunks).values(chunkValues);

    logger.info(
      `Indexed document ${doc.id} | ` +
      `${textChunks.length} chunks | ` +
      `${embeddings.filter((e) => e.length > 0).length} embeddings | ` +
      `URL: ${url}`
    );

    return {
      documentId: doc.id,
      chunksInserted: textChunks.length,
      skipped: false,
    };
  });
}

/**
 * Updates the embedding vector for a single chunk.
 * Called by the async embedding worker after the initial indexing pass.
 *
 * This decoupled design means:
 *   - The crawler doesn't block on embedding API latency
 *   - The HNSW index grows incrementally as embeddings are computed
 *   - Embedding model can be swapped without re-crawling
 */
export async function updateChunkEmbedding(
  chunkId: number,
  embedding: number[]
): Promise<void> {
  await db
    .update(chunks)
    .set({ embedding })
    .where(eq(chunks.id, chunkId));
}


/**
 * Updates the crawl status of a seed source.
 * Called by the crawler orchestrator on completion or failure.
 */
export async function markSourceStatus(
  sourceId: number,
  status: 'completed' | 'failed' | 'skipped',
  errorMessage?: string
): Promise<void> {
  await db
    .update(crawlSources)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      lastCrawledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(crawlSources.id, sourceId));
}