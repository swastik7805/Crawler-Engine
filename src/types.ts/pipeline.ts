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

export interface TextChunk {
  content: string;
  wordCount: number;
  chunkIndex: number;
}

export interface IndexResult {
  documentId: number;
  chunksInserted: number;
  skipped: boolean;
}

export interface IndexDocumentParams {
  sourceId: number;
  url: string;
  extracted: ExtractedContent;
  textChunks: TextChunk[];
  embeddings: number[][];
}