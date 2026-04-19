import { createLogger, format, transports } from 'winston';
/**
 * Levels:
 *   error:   Crashes, DB failures, permanent fetch failures
 *   warn:    Robots.txt blocks, low-content pages, retries
 *   info:    Crawl progress, indexing success
 *   debug:   Detailed extraction/chunking logs, link expansion
 */
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'chronicle-crawler' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, service, ...rest }) => {
          const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `[${timestamp}] ${level}: ${message}${meta}`;
        })
      ),
    }),
  ],
});
