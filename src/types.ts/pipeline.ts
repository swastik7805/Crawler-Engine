export interface FetchResult {
  html: string;
  finalUrl: string;
  statusCode: number;
}

export interface ExtractedContent {
  title: string;
  metaDescription: string;
  metaKeywords: string[];
  canonicalUrl: string | null;
  bodyText: string;
  internalLinks: string[];
}