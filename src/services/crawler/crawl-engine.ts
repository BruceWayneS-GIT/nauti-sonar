import prisma from '@/lib/db';
import { hashUrl, normalizeUrl } from '@/lib/utils';
import { getParser } from '@/services/parsers';
import { extractArticleMetadata } from './article-metadata';
import { scrapeWebsiteEmails } from './website-email-scraper';
import { getDueSources, isAnyCrawlRunning } from './source-scheduler';
import type { ParsedArticle } from '@/services/parsers';

export interface CrawlResult {
  jobId: string;
  articlesFound: number;
  articlesSaved: number;
  errors: string[];
}

// Max new articles to process per crawl run. Large sources are processed
// incrementally — re-runs skip already-saved articles via urlHash dedup
// and pick up the next batch. Override via MAX_CRAWL_ARTICLES env var.
const MAX_NEW_ARTICLES_PER_RUN = process.env.MAX_CRAWL_ARTICLES
  ? parseInt(process.env.MAX_CRAWL_ARTICLES, 10)
  : 200;

// How often to checkpoint progress to the DB (in articles processed)
const CHECKPOINT_EVERY = 25;

/**
 * Run a crawl for a specific source. Creates a CrawlJob, runs the parser,
 * deduplicates, enriches metadata, and saves articles.
 *
 * Large sources are processed in capped runs — re-run to continue.
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

    // Write articlesFound immediately so the UI shows progress even if we crash
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: { articlesFound },
    });

    await log(job.id, 'info', `Found ${articlesFound} article URLs — processing up to ${MAX_NEW_ARTICLES_PER_RUN} new articles this run`);

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        await log(job.id, 'warn', err);
      }
    }

    // Process articles in small batches, checkpoint progress regularly,
    // and stop once we've saved MAX_NEW_ARTICLES_PER_RUN new articles.
    const batchSize = 10;
    let processedSinceCheckpoint = 0;
    let hitLimit = false;

    for (let i = 0; i < result.articles.length; i += batchSize) {
      if (hitLimit) break;

      const remaining = MAX_NEW_ARTICLES_PER_RUN - articlesSaved;
      const batch = result.articles.slice(i, i + Math.min(batchSize, remaining));

      const { saved, limitReached } = await processArticleBatch(
        batch,
        source.id,
        job.id,
        MAX_NEW_ARTICLES_PER_RUN - articlesSaved,
      );

      articlesSaved += saved;
      processedSinceCheckpoint += saved;

      // Checkpoint progress to DB every CHECKPOINT_EVERY new saves
      if (processedSinceCheckpoint >= CHECKPOINT_EVERY) {
        await prisma.crawlJob.update({
          where: { id: job.id },
          data: { articlesSaved },
        });
        processedSinceCheckpoint = 0;
      }

      if (limitReached) {
        hitLimit = true;
        await log(job.id, 'info', `Reached per-run limit of ${MAX_NEW_ARTICLES_PER_RUN} new articles. Auto-continuing...`);
      }
    }

    await log(job.id, 'info', `Saved ${articlesSaved} new articles (${articlesFound - articlesSaved} duplicates skipped or pending next run)`);

    // Mark job complete
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

    // Chain the next run:
    //  - if this source hit the per-run cap and saved articles, continue this source
    //  - otherwise this source is finished, so move on to the next due source
    // Either way, wait until the server is idle first.
    const continueSameSource = hitLimit && articlesSaved > 0;
    scheduleNextCrawl(continueSameSource ? sourceId : null);
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

    // This source errored out — don't retry it, but keep the chain alive
    // so the remaining due sources still get crawled.
    scheduleNextCrawl(null);
  }

  return { jobId: job.id, articlesFound, articlesSaved, errors };
}

// Only ever one pending chain timer in this process.
let chainPending = false;

/**
 * Schedule the next crawl once the server is idle.
 *
 * Pass a sourceId to continue that same source (it hit the per-run cap),
 * or null to advance to the next most-overdue source.
 *
 * The chain ends naturally when no sources are due — each completed crawl
 * sets lastCrawledAt, so a source drops out of the due list until its
 * crawlFrequency elapses again.
 */
export function scheduleNextCrawl(sourceId: string | null): void {
  if (chainPending) return;
  chainPending = true;

  const tick = async () => {
    try {
      if (await isAnyCrawlRunning()) {
        setTimeout(tick, 30_000); // still busy — check again in 30s
        return;
      }

      let nextId = sourceId;
      if (!nextId) {
        const due = await getDueSources();
        if (due.length === 0) {
          chainPending = false;
          return; // nothing left to crawl
        }
        nextId = due[0].id;
      }

      chainPending = false;
      runCrawl(nextId).catch((err) =>
        console.error(`[crawl-engine] chained run failed for source ${nextId}:`, err),
      );
    } catch (err) {
      chainPending = false;
      console.error('[crawl-engine] scheduleNextCrawl failed:', err);
    }
  };

  setTimeout(tick, 5_000);
}

async function processArticleBatch(
  articles: ParsedArticle[],
  sourceId: string,
  jobId: string,
  maxNew: number,
): Promise<{ saved: number; limitReached: boolean }> {
  let saved = 0;
  let limitReached = false;

  for (const article of articles) {
    if (saved >= maxNew) {
      limitReached = true;
      break;
    }

    try {
      const urlHash = hashUrl(article.url);

      // Check if already exists
      const existing = await prisma.article.findUnique({
        where: { urlHash },
        select: { id: true },
      });

      if (existing) continue;

      // Enrich with metadata from the article page
      let metadata = null;
      try {
        metadata = await extractArticleMetadata(article.url);
        // Polite delay between requests
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        // metadata enrichment is best-effort
      }

      const companyUrls = metadata?.companyUrls || [];

      // Scrape company websites for emails if we found outbound website links
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

  return { saved, limitReached };
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
