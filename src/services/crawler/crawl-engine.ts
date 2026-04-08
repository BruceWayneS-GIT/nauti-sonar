import prisma from '@/lib/db';
import { hashUrl, normalizeUrl } from '@/lib/utils';
import { getParser } from '@/services/parsers';
import { extractArticleMetadata } from './article-metadata';
import { scrapeWebsiteEmails } from './website-email-scraper';
import type { ParsedArticle } from '@/services/parsers';

export interface CrawlResult {
  jobId: string;
  articlesFound: number;
  articlesSaved: number;
  errors: string[];
}

/**
 * Run a crawl for a specific source. Creates a CrawlJob, runs the parser,
 * deduplicates, enriches metadata, and saves articles.
 */
export async function runCrawl(sourceId: string): Promise<CrawlResult> {
  const source = await prisma.source.findUniqueOrThrow({
    where: { id: sourceId },
  });

  const job = await prisma.crawlJob.create({
    data: {
      sourceId,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  const errors: string[] = [];
  let articlesFound = 0;
  let articlesSaved = 0;

  try {
    await log(job.id, 'info', `Starting crawl for ${source.name} (${source.crawlMethod})`);

    const parser = getParser(source.crawlMethod, source.rootUrl, (source.parserConfig as Record<string, unknown>) || {});
    const result = await parser.parse();

    articlesFound = result.articles.length;
    errors.push(...result.errors);

    await log(job.id, 'info', `Found ${articlesFound} article URLs`);

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        await log(job.id, 'warn', err);
      }
    }

    // Process articles in batches
    const batchSize = 10;
    for (let i = 0; i < result.articles.length; i += batchSize) {
      const batch = result.articles.slice(i, i + batchSize);
      const savedCount = await processArticleBatch(batch, source.id, job.id);
      articlesSaved += savedCount;
    }

    await log(job.id, 'info', `Saved ${articlesSaved} new articles (${articlesFound - articlesSaved} duplicates skipped)`);

    // Update job
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        articlesFound,
        articlesSaved,
        errorsCount: errors.length,
        completedAt: new Date(),
      },
    });

    // Update source
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        lastCrawledAt: new Date(),
        status: errors.length > articlesFound / 2 ? 'ERROR' : 'ACTIVE',
        articleCount: { increment: articlesSaved },
        errorCount: errors.length > 0 ? { increment: errors.length } : undefined,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(errorMsg);
    await log(job.id, 'error', `Crawl failed: ${errorMsg}`);

    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        articlesFound,
        articlesSaved,
        errorsCount: errors.length,
        completedAt: new Date(),
      },
    });

    await prisma.source.update({
      where: { id: sourceId },
      data: { status: 'ERROR' },
    });
  }

  return { jobId: job.id, articlesFound, articlesSaved, errors };
}

async function processArticleBatch(
  articles: ParsedArticle[],
  sourceId: string,
  jobId: string
): Promise<number> {
  let saved = 0;

  for (const article of articles) {
    try {
      const urlHash = hashUrl(article.url);

      // Check if already exists
      const existing = await prisma.article.findUnique({
        where: { urlHash },
        select: { id: true },
      });

      if (existing) continue;

      // Try to enrich with metadata from the article page (limit to avoid overwhelming)
      let metadata = null;
      try {
        metadata = await extractArticleMetadata(article.url);
        // Polite delay
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        // metadata enrichment is best-effort
      }

      const companyUrls = metadata?.companyUrls || [];

      // Scrape company websites for emails if we found any outbound website links
      let websiteEmails: string[] = [];
      if (companyUrls.length > 0) {
        try {
          websiteEmails = await scrapeWebsiteEmails(companyUrls);
        } catch {
          // website email scraping is best-effort
        }
      }

      // Merge article-page emails with website-scraped emails
      const articleEmails = metadata?.scrapedEmails || [];
      const mergedEmails = [...new Set([...articleEmails, ...websiteEmails])];

      const linkedinUrls = metadata?.linkedinUrls || [];
      const twitterUrls = metadata?.twitterUrls || [];
      const hasAnyLead = mergedEmails.length > 0 || linkedinUrls.length > 0 || twitterUrls.length > 0 || companyUrls.length > 0;

      const newArticle = await prisma.article.create({
        data: {
          sourceId,
          url: article.url,
          canonicalUrl: metadata?.canonicalUrl || article.canonicalUrl || null,
          urlHash,
          title: metadata?.title || article.title,
          excerpt: metadata?.excerpt || article.excerpt || null,
          author: metadata?.author || article.author || null,
          publishedAt: metadata?.publishedAt || article.publishedAt || null,
          category: metadata?.category || article.category || null,
          tags: metadata?.tags || article.tags || [],
          status: hasAnyLead ? 'NEW' : 'ARCHIVED',
          internalNotes: hasAnyLead ? null : 'No leads found',
          scrapedEmails: mergedEmails,
          outboundLinks: metadata?.outboundLinks ? JSON.parse(JSON.stringify(metadata.outboundLinks)) : undefined,
          linkedinUrls,
          twitterUrls,
          companyUrls,
          websiteEmails,
          websiteEmailsScrapedAt: companyUrls.length > 0 ? new Date() : undefined,
        },
      });

      // Log status history for auto-archived articles
      if (!hasAnyLead) {
        await prisma.articleStatusHistory.create({
          data: {
            articleId: newArticle.id,
            fromStatus: 'NEW',
            toStatus: 'ARCHIVED',
            note: 'Auto-archived: No leads found',
          },
        });
      }

      saved++;
    } catch (err) {
      // Likely a unique constraint violation (race condition), skip
      await log(jobId, 'warn', `Could not save article ${article.url}: ${err}`);
    }
  }

  return saved;
}

async function log(jobId: string, level: string, message: string, metadata?: Record<string, string | number | boolean>) {
  try {
    await prisma.crawlLog.create({
      data: { crawlJobId: jobId, level, message, metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined },
    });
  } catch {
    console.error(`[CrawlLog] ${level}: ${message}`);
  }
}
