import "dotenv/config";
import { pool } from "./db/client.js";
import { Orchestrator } from "./orchestrator.js";
import { SEED_SOURCES } from "./config/seed.js";
import { logger } from "./utils/logger.js";

async function main() {
  const service = process.argv[2] || 'all';

  logger.info("══════════════════════════════════════════");
  logger.info(`  Crawler — Starting: ${service.toUpperCase()} `);
  logger.info("══════════════════════════════════════════");

  // Verify DB
  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();
  logger.info("[DB] Connection verified.");

  switch (service) {
    case 'orchestrator': {
      const orchestrator = new Orchestrator();
      await orchestrator.run(SEED_SOURCES);
      break;
    }
    case 'fetcher': {
      await import('./workers/fetcher.worker.js');
      logger.info("[Service] Fetcher Worker path listening...");
      break;
    }
    case 'processor': {
      await import('./workers/processor.worker.js');
      logger.info("[Service] Processor Worker listening...");
      break;
    }
    case 'all': {
      logger.info("[All] Starting complete local cluster...");
      const orchestrator = new Orchestrator();
      await import('./workers/fetcher.worker.js');
      await import('./workers/processor.worker.js');
      await orchestrator.run(SEED_SOURCES);
      break;
    }
    default:
      logger.error(`Unknown service: ${service}. Use 'orchestrator', 'fetcher', or 'processor'.`);
      process.exit(1);
  }
}

main().catch((err) => {
  logger.error(`Fatal error: ${(err as Error).message}`, { error: err });
  process.exit(1);
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down...`);
  pool.end().then(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
