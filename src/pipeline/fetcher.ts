import axios, { AxiosInstance, AxiosResponse } from 'axios';
import pRetry, { AbortError } from 'p-retry';
import { logger } from '../utils/logger.js';

const USER_AGENT ='TheChronicleBot/1.0 (Web3 search index; +https://auth-backend-fawn.vercel.app/bot)';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const MAX_CONTENT_BYTES = 5*1024*1024; // 5MB-skip large assets
const ABORT_STATUS_CODES = new Set([400, 401, 403, 404, 410, 451]);

export interface FetchResult {
  html: string;
  finalUrl: string;
  statusCode: number;
}

// Servers ko dikhana ki real-browser/bot hai (Varna block kar dega)
const httpClient: AxiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
  },
  maxRedirects: 5,
  maxContentLength: MAX_CONTENT_BYTES,
  maxBodyLength: MAX_CONTENT_BYTES,
  decompress: true,
});

// {origin -> Set<disallowed paths>}
const robotsCache = new Map<string, Set<string>>();

// Fetches and parses robots.txt for a given origin.
// Returns a Set of disallowed path prefixes.
async function getDisallowedPaths(origin: string):Promise<Set<string>> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;

  const disallowed = new Set<string>();
  try {
    const res = await httpClient.get<string>(`${origin}/robots.txt`, {
      timeout: 5_000,
    });
    const lines = res.data.split('\n');
    let applicable = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.toLowerCase().startsWith('user-agent:')) {
        const agent = line.split(':')[1]?.trim().toLowerCase() ?? '';
        applicable = agent === '*' || agent.includes('thechronicle');
      }
      if (applicable && line.toLowerCase().startsWith('disallow:')) {
        const path = line.split(':')[1]?.trim();
        if (path) disallowed.add(path);
      }
    }
  } catch {
      logger.warn(`robots.txt not found or unreachable for ${origin}`)
  }

  robotsCache.set(origin, disallowed);
  return disallowed;
}

// Checks whether a URL is permitted by robots.txt.
async function isAllowedByRobots(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    const path = parsed.pathname;
    const disallowed = await getDisallowedPaths(origin);
    for (const prefix of disallowed) {
      if (prefix && path.startsWith(prefix)) return false;
    }
    return true;
  } catch {
    return true; 
  }
}


// Fetches a single HTML page.
export async function fetchPage(url:string, respectRobots=true):Promise<FetchResult|null> {
  // robots.txt check
  if (respectRobots && !(await isAllowedByRobots(url))) {
    logger.debug(`robots.txt blocked: ${url}`);
    return null;
  }

  try {
    const result=await pRetry(async()=>{
        let response:AxiosResponse<string>;

        try {
          response=await httpClient.get<string>(url, {
            responseType: 'text'
          });
        }
        catch (err)
        {
          if (axios.isAxiosError(err) && err.response) {
            const status=err.response.status;
            if (ABORT_STATUS_CODES.has(status)) {
              throw new AbortError(`Permanent HTTP ${status} for ${url}`);
            }
          }
          throw err;
        }

        // Validate content-type as HTML only
        const contentType=(response.headers['content-type'] as string) ?? '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
          throw new AbortError(`Non-HTML content-type "${contentType}" at ${url}`);
        }

        // Extract final URL
        const finalUrl:string=response.request?.res?.responseUrl ?? url;

        return {
          html: response.data,
          finalUrl,
          statusCode: response.status,
        };
      },
      {
        retries: MAX_RETRIES,
        minTimeout: 1_000,
        maxTimeout: 8_000,
        factor: 2, // Exponential: 1s → 2s → 4s
        onFailedAttempt: (error) => {
          logger.warn(`Fetch attempt ${error.attemptNumber}/${MAX_RETRIES + 1} failed` +` for ${url}: ${error.message}`);
        },
      }
    );

    return result;
  }
  catch(err)
  {
    logger.error(`Fetch permanently failed for ${url}: ${(err as Error).message}`);
    return null;
  }
}