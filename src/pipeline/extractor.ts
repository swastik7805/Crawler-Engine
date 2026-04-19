import * as cheerio from 'cheerio';
import { ExtractedContent } from '../types.ts/pipeline.js';
import { logger } from '../utils/logger.js';
import { cleanText } from '../utils/cleanText.js';

// Content jisko extract nhi karna
const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'canvas', 'svg',
  'nav', 'header', 'footer', 'aside',
  '.sidebar', '.navigation', '.nav', '.menu', '.breadcrumb',
  '.advertisement', '.ad', '.banner', '[class*="cookie"]',
  '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]',
  '[aria-hidden="true"]',
  '.social-share', '.share-buttons',
].join(', ');

// Jinko lena hai
const CONTENT_SELECTORS = [
  '.markdown-body',
  '.docs-content',
  '.content-body',
  '.post-content',
  '.entry-content',
  'article',
  'main',
  '[role="main"]',
  '.content',
  '#content',
  '#main',
];


// Extracts clean, structured content from raw HTML using Cheerio.
export function extractContent(html: string, baseUrl: string): ExtractedContent {
  const $ = cheerio.load(html);
  // Strip Noise
  $(NOISE_SELECTORS).remove();

  // Extract metadata
  const title = $('meta[property="og:title"]').attr('content')?.trim() ||
                $('title').first().text().trim() ||
                $('h1').first().text().trim() || 
                'Untitled';

  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ||
                          $('meta[property="og:description"]').attr('content')?.trim() || 
                          '';

  const rawKeywords=$('meta[name="keywords"]').attr('content')?.trim() ?? '';
  const metaKeywords = rawKeywords
                      .split(',')
                      .map((k)=>k.trim().toLowerCase())
                      .filter((k)=>k.length>0 && k.length<60); 

  const canonicalUrl=$('link[rel="canonical"]').attr('href')?.trim() ?? null;

  //  Extract body text 
  let $contentEl = $(); 
  for (const selector of CONTENT_SELECTORS) {
    $contentEl = $(selector).first();
    if ($contentEl.length>0) break;
  }

  //Fallback to body if nothing matches
  const $source=$contentEl.length>0?$contentEl:$('body');
  const bodyText=cleanText($source.text());

  // Collect internal links 
  let baseHostname: string;
  try {
    baseHostname = new URL(baseUrl).hostname;
  } catch {
    baseHostname = '';
  }

  const internalLinks = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl);
      if(resolved.hostname===baseHostname &&(resolved.protocol==='http:' || resolved.protocol==='https:')) {
        const clean = `${resolved.origin}${resolved.pathname}${resolved.search}`;
        internalLinks.add(clean);
      }
    }
    catch(err)
    {
      logger.error(`Error parsing URL: ${href}`, err);
    }
  });

  return {
    title,
    metaDescription,
    metaKeywords,
    canonicalUrl,
    bodyText,
    internalLinks: Array.from(internalLinks),
  };
}
