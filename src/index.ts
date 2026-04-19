import "dotenv/config";
import { pool } from "./db/client.js";
import { Crawler } from "./crawler.js";
import { SEED_SOURCES } from "./config/seed.js";
import { logger } from "./utils/logger.js";

async function main() {
  logger.info("══════════════════════════════════════════");
  logger.info("  The Chronicle Crawler — Starting Up     ");
  logger.info("══════════════════════════════════════════");

  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();
  logger.info("Database connection verified.");

  const crawler = new Crawler();
  await crawler.run(SEED_SOURCES);
}

main()
  .then(() => {
    logger.info("Crawler finished. Exiting cleanly.");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(`Fatal error: ${(err as Error).message}`, { error: err });
    process.exit(1);
  });

// Graceful shutdown on SIGINT / SIGTERM
function shutdown(signal: string){
  logger.info(`Received ${signal}. Draining queues and shutting down...`);
  pool.end().then(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
