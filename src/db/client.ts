import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

/**
 * Connection pool configuration.
 *
 * max: 20 — enough for the crawler's concurrency budget (10 global slots)
 *           plus headroom for the FastAPI service sharing the same DB.
 * idleTimeoutMillis: 30s — reclaim idle connections held by stalled crawl jobs.
 * connectionTimeoutMillis: 3s — fail fast if Postgres is unreachable.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export const db = drizzle(pool, { schema });

export type DB = typeof db;