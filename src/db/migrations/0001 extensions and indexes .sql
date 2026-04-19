-- =============================================================================
-- The Chronicle — PostgreSQL Search Infrastructure
--
-- Run AFTER Drizzle's generated DDL migration (which creates the tables).
-- This file owns everything Drizzle ORM cannot express natively:
--   1. PostgreSQL extensions (vector, pg_trgm, unaccent)
--   2. tsvector BEFORE trigger (weighted lexical index maintenance)
--   3. GIN index on content_tsv  (Lexical search — Strategy 1)
--   4. HNSW index on embedding   (Semantic search — Strategy 2)
--   5. GIN trigram on content    (Fuzzy search    — Strategy 3)
--   6. GIN trigram on title      (Fuzzy title matching)
-- =============================================================================


-- =============================================================================
-- PART 1: Extensions
-- =============================================================================

-- pgvector: enables the vector(n) type and HNSW / IVFFlat index methods
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: enables trigram similarity functions and gin_trgm_ops operator class
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent: strips diacritics during tsvector construction
-- ("Vitalik Butérin" matches "Buterin")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =============================================================================
-- PART 2: tsvector Auto-Update Trigger (Strategy 1 — Lexical)
-- =============================================================================
-- Maintains content_tsv automatically on INSERT and relevant UPDATEs.
-- Weights are critical for ts_rank_cd scoring in search queries:
--   'A' = 1.0 weight (title match is most significant)
--   'B' = 0.4 weight (keyword match is a strong signal)
--   'C' = 0.2 weight (body text match is baseline relevance)

CREATE OR REPLACE FUNCTION update_chunks_content_tsv()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_tsv :=
    setweight(
      to_tsvector('english', unaccent(coalesce(NEW.title, ''))),
      'A'
    ) ||
    setweight(
      to_tsvector('english', unaccent(coalesce(array_to_string(NEW.meta_keywords, ' '), ''))),
      'B'
    ) ||
    setweight(
      to_tsvector('english', unaccent(NEW.content)),
      'C'
    );
  RETURN NEW;
END;
$$;

-- Fire BEFORE INSERT (populates on first write)
-- Fire BEFORE UPDATE only when relevant columns change (avoids redundant recompute)
CREATE OR REPLACE TRIGGER trg_chunks_tsv_update
BEFORE INSERT OR UPDATE OF content, title, meta_keywords
ON chunks
FOR EACH ROW
EXECUTE FUNCTION update_chunks_content_tsv();

-- =============================================================================
-- PART 3: GIN Index on content_tsv (Strategy 1 — Lexical)
-- =============================================================================
-- GIN (Generalized Inverted Index) is the correct index type for tsvector.
-- Provides O(log n) lookup for ts_query matches.
-- CONCURRENTLY: index builds without locking the table for reads/writes.

CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv
ON chunks
USING GIN(content_tsv);

-- =============================================================================
-- PART 4: HNSW Index on embedding (Strategy 2 — Semantic)
-- =============================================================================
-- HNSW (Hierarchical Navigable Small World) is the state-of-the-art ANN index.
-- Significantly faster query time vs IVFFlat at the cost of higher build memory.
--
-- Operator class: vector_cosine_ops
--   Correct for normalized embeddings (OpenAI, Nomic, Cohere all output L2-normalized
--   vectors, making cosine distance equivalent to dot-product distance).
--
-- Tuning parameters:
--   m = 16              : Number of bi-directional links per layer.
--                         Range: 4–64. Higher = better recall, more memory.
--                         16 is the pgvector default and a strong general choice.
--   ef_construction = 64: Candidate list size during index build.
--                         Range: 4–1000. Higher = better recall, slower build.
--                         64 is a good production starting point.
--
-- Partial index (WHERE embedding IS NOT NULL):
--   Chunks start with NULL embeddings until the embedding worker processes them.
--   Excluding NULLs keeps the HNSW graph tight and avoids wasted index space.

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
ON chunks
USING hnsw(embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding IS NOT NULL;

-- =============================================================================
-- PART 5: GIN Trigram Index on content (Strategy 3 — Fuzzy)
-- =============================================================================
-- Supports:
--   content % 'etereun'      → similarity match (pg_trgm similarity())
--   content ILIKE '%ethreun%' → fast ILIKE with trigram acceleration
--   content ~* 'etheruem'    → fast regex with trigram acceleration
--
-- Web3 terminology is dense with multi-part compound words and acronyms
-- ("ERC-721", "zkSNARK", "secp256k1") that users frequently mistype.
-- Trigram fuzzy search is the safety net for all lexical misses.

CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
ON chunks
USING GIN(content gin_trgm_ops);

-- Title trigram: enables fuzzy matching on the headline for type-as-you-search UX
CREATE INDEX IF NOT EXISTS idx_chunks_title_trgm
ON chunks
USING GIN(title gin_trgm_ops);

-- =============================================================================
-- PART 6: Similarity Threshold Configuration
-- =============================================================================
-- pg_trgm.similarity_threshold (default: 0.3) determines the % cutoff for the
-- % (similarity) operator. 0.25 is more permissive — catches worse typos.
-- This is a session-level setting; set it per-query in the FastAPI search route.
-- Example: SET pg_trgm.similarity_threshold = 0.25;

-- =============================================================================
-- PART 7: HNSW Search Accuracy Tuning (documented for FastAPI layer)
-- =============================================================================
-- ef_search controls the candidate list size at QUERY time (not build time).
-- Default: 40. Higher = more accurate recall at cost of latency.
-- Recommended: SET hnsw.ef_search = 100 for the semantic search route.
-- This is a session-level setting applied in the FastAPI async search handler.

-- =============================================================================
-- Verification Queries (run manually to confirm)
-- =============================================================================
-- SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm','unaccent');
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'chunks';
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'chunks'::regclass;