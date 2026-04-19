# Chronicle Crawler

```
crawler/
├── src/
│   ├── config/seeds.ts          → 22 curated Web3 sources (3 priority tiers)
│   ├── db/
│   │   ├── schema.ts            → Drizzle schema (3 tables, custom vector/tsvector types)
│   │   ├── client.ts            → Pool (max 20, 30s idle timeout)
│   │   └── migrations/
│   │       └── 0001_...sql      → Extensions + trigger + all 3 search indexes
│   ├── pipeline/
│   │   ├── fetcher.ts           → Retry (3x, exp backoff) + robots.txt cache
│   │   ├── extractor.ts         → Cheerio noise stripping + link discovery
│   │   ├── chunker.ts           → 300-500w sentence-aligned + 2-sentence overlap
│   │   └── indexer.ts           → Transactional upsert + hash-based skip
│   ├── crawler.ts               → PQueue global(10) + per-domain(2, 1.5s)
│   └── index.ts                 → Entry + graceful SIGTERM drain
```

# Schema

```
   Search Architecture — Three-Strategy Hybrid:
   ┌─────────────────────────────────────────────────────────────────┐
   │  Strategy 1: Lexical   → content_tsv (tsvector) + GIN index    │
   │  Strategy 2: Semantic  → embedding (vector)    + HNSW index    │
   │  Strategy 3: Fuzzy     → content (text)        + GIN trgm idx  │
   └─────────────────────────────────────────────────────────────────┘
  
   NOTE: GIN (tsvector), HNSW (vector), and GIN (trgm) indexes are
   intentionally defined in the raw SQL migration:
  
   Drizzle ORM cannot express HNSW WITH parameters, tsvector GENERATED
   ALWAYS AS columns, or trigram-specific GIN operator classes natively.
   The raw migration is the source of truth for those constructs.
```
