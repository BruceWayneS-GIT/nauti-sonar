import * as cheerio from 'cheerio';
import { BaseParser, type ParserResult, type ParsedArticle } from './base-parser';
import { isLikelyArticleUrl } from '@/lib/utils';

export class SitemapParser extends BaseParser {
  /**
   * Where a site's sitemap might live. Only /sitemap.xml used to be tried,
   * so any site using the Yoast/WordPress default or advertising its sitemap
   * in robots.txt failed with "0 articles, 1 error" and no clue why.
   */
  private async discoverSitemapUrls(): Promise<string[]> {
    const configured = this.config.sitemapUrl as string | undefined;
    if (configured) return [configured];

    const candidates: string[] = [];

    // robots.txt is authoritative when present, so try what it declares first
    try {
      const robots = await this.fetchPage(`${this.baseUrl}/robots.txt`);
      for (const line of robots.split(/\r?\n/)) {
        const match = line.match(/^\s*sitemap:\s*(\S+)/i);
        if (match) candidates.push(match[1].trim());
      }
    } catch {
      // no robots.txt, or unreachable — fall through to the common paths
    }

    for (const path of [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap-index.xml',
      '/wp-sitemap.xml',
      '/post-sitemap.xml',
      '/news-sitemap.xml',
    ]) {
      const url = `${this.baseUrl}${path}`;
      if (!candidates.includes(url)) candidates.push(url);
    }

    return candidates;
  }

  async parse(): Promise<ParserResult> {
    const candidates = await this.discoverSitemapUrls();
    const attempts: string[] = [];

    for (const candidate of candidates) {
      const result = await this.parseFrom(candidate);
      if (result.articles.length > 0) {
        // Say which one worked, so a source can be configured explicitly later
        if (attempts.length > 0) {
          result.errors.unshift(`Sitemap found at ${candidate} after trying: ${attempts.join(', ')}`);
        }
        return result;
      }
      attempts.push(candidate);
    }

    return {
      articles: [],
      errors: [
        `No sitemap with articles found. Tried: ${attempts.join(', ')}. ` +
        `Set a sitemapUrl in the source's parser config if it lives elsewhere.`,
      ],
    };
  }

  private async parseFrom(sitemapUrl: string): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];

    try {
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
