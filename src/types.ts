export interface RoutePattern {
  pattern: string;
  frequency: number;
  examples: string[];
  params: {
    name: string;
    type: "id" | "string" | "number" | "unknown";
    examples: string[];
  }[];
}

export interface DiscoveredRoute {
  path: string;
  frequency: number;
  params: Record<string, string>;
  parentPaths: string[];
  childPaths: string[];
  commonQueryParams: Record<string, string[]>;
}

export interface CrawlerConfig {
  maxDepth?: number;
  maxConcurrency?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  shouldCrawl?: (url: URL) => boolean;
}
