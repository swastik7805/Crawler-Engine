import fs from 'node:fs';
import path from 'node:path';
import { pool } from './client.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 
 * Note: Keeping the filename with spaces for now to match exactly what's on disk.
 */
const sqlPath = path.join(__dirname, 'migrations', '0001 extensions and indexes .sql');

async function main() {
  if (!fs.existsSync(sqlPath)) {
    console.error(`Error: Migration file not found at ${sqlPath}`);
    process.exit(1);
  }

  console.log('[DB] Reading manual migration file...');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  
  const client = await pool.connect();
  try {
    console.log('[DB] Applying manual migrations (Strategy 1, 2, and 3 indexes/triggers)...');
    
    // We run the whole thing in a single query block
    await client.query(sqlContent);
    
    console.log('✓ [DB] Manual migrations applied successfully!');
  } catch (err: any) {
    console.error('✖ [DB] Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    process.exit(1);
  } finally {
    client.release();
    // Use a small delay to ensure logs are flushed before exiting
    setTimeout(() => process.exit(0), 100);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
