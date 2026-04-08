import * as cheerio from 'cheerio';
import { BaseParser, type ParserResult, type ParsedArticle } from './base-parser';

export class RssParser extends BaseParser {
  async parse(): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];

    try {
      const rssUrl = (this.config.rssUrl as string) || `${this.baseUrl}/feed`;
      const xml = await this.fetchPage(rssUrl);
      const $ = cheerio.load(xml, { xml: true });

      // Try RSS 2.0 format
      $('channel item').each((_, el) => {
        try {
          const title = $('title', el).text().trim();
          const link = $('link', el).text().trim();
          const pubDate = $('pubDate', el).text().trim();
          const description = $('description', el).text().trim();
          const author = $('dc\\:creator, creator, author', el).text().trim();
          const categories = $('category', el).map((_, cat) => $(cat).text().trim()).get();

          if (!link) return;

          articles.push({
            url: link,
            title: title || 'Untitled',
            excerpt: description ? description.replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
            author: author || undefined,
            publishedAt: pubDate ? new Date(pubDate) : undefined,
            category: categories[0] || undefined,
            tags: categories,
          });
        } catch (err) {
          errors.push(`Error parsing RSS item: ${err}`);
        }
      });

      // Try Atom format if no RSS items found
      if (articles.length === 0) {
        $('feed entry').each((_, el) => {
          try {
            const title = $('title', el).text().trim();
            const link = $('link', el).attr('href') || '';
            const published = $('published, updated', el).first().text().trim();
            const summary = $('summary, content', el).first().text().trim();
            const author = $('author name', el).text().trim();

            if (!link) return;

            articles.push({
              url: this.resolveUrl(link),
              title: title || 'Untitled',
              excerpt: summary ? summary.replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
              author: author || undefined,
              publishedAt: published ? new Date(published) : undefined,
            });
          } catch (err) {
            errors.push(`Error parsing Atom entry: ${err}`);
          }
        });
      }
    } catch (err) {
      errors.push(`Error fetching RSS feed: ${err}`);
    }

    return { articles, errors };
  }
}
