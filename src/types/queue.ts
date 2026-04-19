export interface CrawlJobData {
  sourceId: number;
  url: string;
  depth: number;
  maxDepth: number;
  respectRobots: boolean;
}

export interface ProcessJobData {
  sourceId: number;
  url: string;
  html: string;
  finalUrl: string;
  depth: number;
  maxDepth: number;
  respectRobots: boolean;
}
