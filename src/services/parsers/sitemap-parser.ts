import * as cheerio from 'cheerio';
import { BaseParser, type ParserResult, type ParsedArticle } from './base-parser';
import { isLikelyArticleUrl } from '@/lib/utils';

export class SitemapParser extends BaseParser {
  async parse(): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];

    try {
      const sitemapUrl = (this.config.sitemapUrl as string) || `${this.baseUrl}/sitemap.xml`;
      const xml = await this.fetchPage(sitemapUrl);
      const $ = cheerio.load(xml, { xml: true });

      // Check if this is a sitemap index
      const sitemapIndexUrls = $('sitemapindex sitemap loc').map((_, el) => $(el).text().trim()).get();

      if (sitemapIndexUrls.length > 0) {
        // Process each child sitemap (limit to first 5 to be polite)
        for (const childUrl of sitemapIndexUrls.slice(0, 5)) {
          try {
            const childResult = await this.parseSingleSitemap(childUrl);
            articles.push(...childResult.articles);
            errors.push(...childResult.errors);
          } catch (err) {
            errors.push(`Error parsing child sitemap ${childUrl}: ${err}`);
          }
          // Polite delay between requests
          await new Promise((r) => setTimeout(r, 500));
        }
      } else {
        const result = await this.parseSingleSitemap(sitemapUrl, xml);
        articles.push(...result.articles);
        errors.push(...result.errors);
      }
    } catch (err) {
      errors.push(`Error fetching sitemap: ${err}`);
    }

    return { articles, errors };
  }

  private async parseSingleSitemap(url: string, preloadedXml?: string): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];

    try {
      const xml = preloadedXml || (await this.fetchPage(url));
      const $ = cheerio.load(xml, { xml: true });

      $('urlset url').each((_, el) => {
        const loc = $('loc', el).text().trim();
        const lastmod = $('lastmod', el).text().trim();

        if (!loc || !isLikelyArticleUrl(loc)) return;

        // Skip root URL and common non-article pages
        try {
          const u = new URL(loc);
          if (u.pathname === '/' || u.pathname === '') return;
          const skipPaths = ['/privacy', '/terms', '/cookie', '/sitemap', '/wp-login', '/login', '/register'];
          if (skipPaths.some((p) => u.pathname.toLowerCase().startsWith(p))) return;
        } catch {
          return;
        }

        articles.push({
          url: loc,
          title: this.extractTitleFromUrl(loc),
          publishedAt: lastmod ? new Date(lastmod) : undefined,
        });
      });
    } catch (err) {
      errors.push(`Error parsing sitemap ${url}: ${err}`);
    }

    return { articles, errors };
  }

  private extractTitleFromUrl(url: string): string {
    try {
      const u = new URL(url);
      const slug = u.pathname.split('/').filter(Boolean).pop() || '';
      return slug
        .replace(/[-_]/g, ' ')
        .replace(/\.\w+$/, '')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    } catch {
      return url;
    }
  }
}
