import * as cheerio from 'cheerio';
import { BaseParser, type ParserResult, type ParsedArticle } from './base-parser';
import { isLikelyArticleUrl } from '@/lib/utils';

export class ArchiveParser extends BaseParser {
  async parse(): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];
    const seenUrls = new Set<string>();

    const archiveUrls = (this.config.archiveUrls as string[]) || [this.baseUrl];
    const linkSelector = (this.config.linkSelector as string) || 'a[href]';
    const titleSelector = (this.config.titleSelector as string) || '';
    const maxPages = (this.config.maxPages as number) || 3;

    for (const archiveUrl of archiveUrls) {
      try {
        let currentUrl: string | null = archiveUrl;
        let pageCount = 0;

        while (currentUrl && pageCount < maxPages) {
          const html = await this.fetchPage(currentUrl);
          const $ = cheerio.load(html);

          $(linkSelector).each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;

            const fullUrl = this.resolveUrl(href);
            if (seenUrls.has(fullUrl)) return;
            if (!isLikelyArticleUrl(fullUrl)) return;

            // Must be same domain
            try {
              const articleHost = new URL(fullUrl).hostname;
              const baseHost = new URL(this.baseUrl).hostname;
              if (articleHost !== baseHost) return;
            } catch {
              return;
            }

            seenUrls.add(fullUrl);

            const title = titleSelector
              ? $(el).closest(titleSelector).text().trim()
              : $(el).text().trim();

            articles.push({
              url: fullUrl,
              title: title || this.extractTitleFromUrl(fullUrl),
            });
          });

          // Try to find next page
          const paginationSelector = (this.config.paginationSelector as string) || '.next a, a.next, .pagination a:last-child';
          const nextLink = $(paginationSelector).attr('href');
          currentUrl = nextLink ? this.resolveUrl(nextLink) : null;
          pageCount++;

          if (currentUrl) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      } catch (err) {
        errors.push(`Error parsing archive ${archiveUrl}: ${err}`);
      }
    }

    return { articles, errors };
  }

  private extractTitleFromUrl(url: string): string {
    try {
      const u = new URL(url);
      const slug = u.pathname.split('/').filter(Boolean).pop() || '';
      return slug.replace(/[-_]/g, ' ').replace(/\.\w+$/, '')
        .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } catch {
      return url;
    }
  }
}
