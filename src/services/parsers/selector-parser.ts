import * as cheerio from 'cheerio';
import { BaseParser, type ParserResult, type ParsedArticle } from './base-parser';

export class SelectorParser extends BaseParser {
  async parse(): Promise<ParserResult> {
    const articles: ParsedArticle[] = [];
    const errors: string[] = [];

    const articleSelector = (this.config.articleSelector as string) || 'article';
    const titleSelector = (this.config.titleSelector as string) || 'h2 a, h3 a, .entry-title a';
    const authorSelector = (this.config.authorSelector as string) || '.author, .byline, [rel="author"]';
    const dateSelector = (this.config.dateSelector as string) || 'time, .date, .published';
    const excerptSelector = (this.config.excerptSelector as string) || '.excerpt, .summary, .entry-summary, p';
    const categorySelector = (this.config.categorySelector as string) || '.category, .cat-links a';

    const targetUrls = (this.config.archiveUrls as string[]) || [this.baseUrl];

    for (const targetUrl of targetUrls) {
      try {
        const html = await this.fetchPage(targetUrl);
        const $ = cheerio.load(html);

        $(articleSelector).each((_, el) => {
          try {
            const $article = $(el);
            const $titleLink = $article.find(titleSelector).first();
            const href = $titleLink.attr('href');
            const title = $titleLink.text().trim();

            if (!href || !title) return;

            const fullUrl = this.resolveUrl(href);
            const author = $article.find(authorSelector).first().text().trim();
            const dateEl = $article.find(dateSelector).first();
            const dateStr = dateEl.attr('datetime') || dateEl.text().trim();
            const excerpt = $article.find(excerptSelector).first().text().trim().slice(0, 300);
            const category = $article.find(categorySelector).first().text().trim();

            articles.push({
              url: fullUrl,
              title,
              author: author || undefined,
              publishedAt: dateStr ? new Date(dateStr) : undefined,
              excerpt: excerpt || undefined,
              category: category || undefined,
            });
          } catch (err) {
            errors.push(`Error parsing article element: ${err}`);
          }
        });
      } catch (err) {
        errors.push(`Error fetching page ${targetUrl}: ${err}`);
      }
    }

    return { articles, errors };
  }
}
