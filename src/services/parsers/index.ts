import { BaseParser } from './base-parser';
import { SitemapParser } from './sitemap-parser';
import { RssParser } from './rss-parser';
import { ArchiveParser } from './archive-parser';
import { SelectorParser } from './selector-parser';
import { CeoTimesParser } from './ceotimes-parser';

export type { ParsedArticle, ParserResult } from './base-parser';

const CUSTOM_PARSERS: Record<string, () => BaseParser> = {
  'ceotimes.com': () => new CeoTimesParser(),
};

export function getParser(
  crawlMethod: string,
  baseUrl: string,
  config: Record<string, unknown> = {}
): BaseParser {
  // Check for custom parser first
  try {
    const hostname = new URL(baseUrl).hostname.replace(/^www\./, '');
    if (CUSTOM_PARSERS[hostname]) {
      return CUSTOM_PARSERS[hostname]();
    }
  } catch {
    // ignore
  }

  switch (crawlMethod) {
    case 'RSS':
      return new RssParser(baseUrl, config);
    case 'SITEMAP':
      return new SitemapParser(baseUrl, config);
    case 'ARCHIVE_PAGES':
      return new ArchiveParser(baseUrl, config);
    case 'SELECTOR_PARSER':
      return new SelectorParser(baseUrl, config);
    case 'CUSTOM_PARSER':
      return new SitemapParser(baseUrl, config); // fallback
    default:
      return new SitemapParser(baseUrl, config);
  }
}
