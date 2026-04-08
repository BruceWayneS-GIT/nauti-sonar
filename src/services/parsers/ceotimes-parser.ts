import * as cheerio from 'cheerio';
import { BaseParser, type ParserResult, type ParsedArticle } from './base-parser';
import { isLikelyArticleUrl } from '@/lib/utils';

/**
 * Custom parser for ceotimes.com
 * This site uses a WordPress-like structure with articles on the homepage
 * and category pages.
 */
export class CeoTimesParser extends BaseParser {
  constructor() {
    super('https://ceotimes.com');
  }

  async parse(): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];
    const seenUrls = new Set<string>();

    // Try multiple strategies
    const strategies = [
      () => this.parseFromSitemap(),
      () => this.parseFromHomepage(),
      () => this.parseFromArchivePages(),
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        for (const article of result.articles) {
          if (!seenUrls.has(article.url)) {
            seenUrls.add(article.url);
            articles.push(article);
          }
        }
        errors.push(...result.errors);
      } catch (err) {
        errors.push(`Strategy error: ${err}`);
      }
    }

    return { articles, errors };
  }

  private async parseFromSitemap(): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];

    try {
      const xml = await this.fetchPage(`${this.baseUrl}/sitemap.xml`);
      const $ = cheerio.load(xml, { xml: true });

      // Check for sitemap index first
      const sitemapUrls = $('sitemapindex sitemap loc').map((_, el) => $(el).text().trim()).get();

      const targetSitemaps = sitemapUrls.length > 0
        ? sitemapUrls.filter((u) => u.includes('post') || u.includes('page')).slice(0, 3)
        : [`${this.baseUrl}/sitemap.xml`];

      for (const sitemapUrl of targetSitemaps) {
        try {
          const sitemapXml = sitemapUrls.length > 0 ? await this.fetchPage(sitemapUrl) : xml;
          const $s = cheerio.load(sitemapXml, { xml: true });

          $s('urlset url').each((_, el) => {
            const loc = $s('loc', el).text().trim();
            const lastmod = $s('lastmod', el).text().trim();

            if (!loc || !isLikelyArticleUrl(loc)) return;
            try {
              const u = new URL(loc);
              if (u.pathname === '/' || u.pathname.length < 5) return;
            } catch { return; }

            articles.push({
              url: loc,
              title: this.extractTitle(loc),
              publishedAt: lastmod ? new Date(lastmod) : undefined,
            });
          });
        } catch (err) {
          errors.push(`Error parsing sitemap ${sitemapUrl}: ${err}`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      errors.push(`Sitemap not available: ${err}`);
    }

    return { articles, errors };
  }

  private async parseFromHomepage(): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];

    try {
      const html = await this.fetchPage(this.baseUrl);
      const $ = cheerio.load(html);

      // Look for article links with common WordPress patterns
      $('article a[href], .post a[href], .entry-title a, h2 a[href], h3 a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        const fullUrl = this.resolveUrl(href);
        if (!isLikelyArticleUrl(fullUrl)) return;

        try {
          const u = new URL(fullUrl);
          const baseHost = new URL(this.baseUrl).hostname;
          if (u.hostname !== baseHost) return;
          if (u.pathname === '/' || u.pathname.length < 5) return;
        } catch { return; }

        const title = $(el).text().trim() || this.extractTitle(fullUrl);

        if (title && title.length > 5) {
          articles.push({
            url: fullUrl,
            title,
          });
        }
      });

      // Also try to extract metadata from article cards
      $('article, .post, .entry').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a[href]').first().attr('href');
        if (!link) return;

        const fullUrl = this.resolveUrl(link);
        const title = $el.find('h2, h3, .entry-title').first().text().trim();
        const author = $el.find('.author, .byline, [rel="author"]').first().text().trim();
        const dateEl = $el.find('time, .date, .published').first();
        const dateStr = dateEl.attr('datetime') || dateEl.text().trim();
        const excerpt = $el.find('.excerpt, .summary, p').first().text().trim().slice(0, 300);
        const category = $el.find('.category a, .cat-links a').first().text().trim();

        if (title) {
          articles.push({
            url: fullUrl,
            title,
            author: author || undefined,
            publishedAt: dateStr ? new Date(dateStr) : undefined,
            excerpt: excerpt || undefined,
            category: category || undefined,
          });
        }
      });
    } catch (err) {
      errors.push(`Error parsing homepage: ${err}`);
    }

    return { articles, errors };
  }

  private async parseFromArchivePages(): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];

    const archivePaths = ['/news/', '/business/', '/technology/', '/leadership/'];

    for (const path of archivePaths) {
      try {
        const html = await this.fetchPage(`${this.baseUrl}${path}`);
        const $ = cheerio.load(html);

        $('article a[href], .post a[href], h2 a[href], h3 a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;

          const fullUrl = this.resolveUrl(href);
          if (!isLikelyArticleUrl(fullUrl)) return;

          const title = $(el).text().trim();
          if (title && title.length > 5) {
            articles.push({
              url: fullUrl,
              title,
              category: path.replace(/\//g, ''),
            });
          }
        });
      } catch {
        // Category page might not exist, that's fine
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return { articles, errors };
  }

  private extractTitle(url: string): string {
    try {
      const u = new URL(url);
      const slug = u.pathname.split('/').filter(Boolean).pop() || '';
      return slug.replace(/[-_]/g, ' ').split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } catch {
      return url;
    }
  }
}
