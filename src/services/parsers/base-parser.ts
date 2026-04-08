export interface ParsedArticle {
  url: string;
  canonicalUrl?: string;
  title: string;
  excerpt?: string;
  author?: string;
  publishedAt?: Date;
  category?: string;
  tags?: string[];
}

export interface ParserResult {
  articles: ParsedArticle[];
  errors: string[];
  nextPageUrl?: string;
}

export abstract class BaseParser {
  protected baseUrl: string;
  protected config: Record<string, unknown>;

  constructor(baseUrl: string, config: Record<string, unknown> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.config = config;
  }

  abstract parse(): Promise<ParserResult>;

  protected resolveUrl(path: string): string {
    if (path.startsWith('http')) return path;
    if (path.startsWith('//')) return `https:${path}`;
    if (path.startsWith('/')) return `${this.baseUrl}${path}`;
    return `${this.baseUrl}/${path}`;
  }

  protected async fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PROutreachBot/1.0; +https://example.com/bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    return response.text();
  }
}
