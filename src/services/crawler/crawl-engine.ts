import prisma from '@/lib/db';
import { hashUrl, normalizeLinkedinUrl } from '@/lib/utils';
import { titleKey } from '@/lib/dedupe';
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
// Kept low: articlesSaved is invisible until a checkpoint lands, so a run
// whose process dies before the first one reports 0 despite doing real work.
const CHECKPOINT_EVERY = 5;

// How many articles to enrich at once. Enrichment is mostly network wait, but
// HTML parsing is synchronous and blocks the event loop, so this is kept
// modest — too high and the app stops answering HTTP while it parses.
// Tune with CRAWL_CONCURRENCY.
const CONCURRENCY = process.env.CRAWL_CONCURRENCY
  ? parseInt(process.env.CRAWL_CONCURRENCY, 10)
  : 3;

// Wall-clock budget for a single run. A crawl that overruns stops cleanly,
// marks itself COMPLETED and lets the chain continue, rather than running for
// hours until its process is recycled and it is swept as a stuck job.
// Remaining articles are picked up by the next run.
const MAX_RUN_MS = process.env.MAX_CRAWL_RUN_SECONDS
  ? parseInt(process.env.MAX_CRAWL_RUN_SECONDS, 10) * 1000
  : 10 * 60 * 1000;

// A LinkedIn profile seen on more articles than this is a publisher/sitewide
// link (a footer or nav LinkedIn), not a lead. Real leads in the data top out
// around 15 articles; publisher pages reach into the thousands.
const SITEWIDE_LINKEDIN_THRESHOLD = process.env.SITEWIDE_LINKEDIN_THRESHOLD
  ? parseInt(process.env.SITEWIDE_LINKEDIN_THRESHOLD, 10)
  : 50;

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

    // Discard already-saved articles up front with a handful of bulk queries.
    // Doing this per-article meant a source whose articles were all already
    // saved still made one round-trip per URL — 11k sequential queries that
    // saved nothing and kept the process alive long enough to be recycled.
    const deadline = Date.now() + MAX_RUN_MS;

    const hashed = result.articles.map((a) => ({ article: a, urlHash: hashUrl(a.url) }));
    const knownHashes = new Set<string>();
    const LOOKUP_CHUNK = 500;

    await log(job.id, 'info', `Checking ${hashed.length} URLs against existing articles`);

    for (let i = 0; i < hashed.length; i += LOOKUP_CHUNK) {
      // The budget must be enforced here too — a stall in this phase would
      // otherwise never reach the article loop where it used to be checked.
      if (Date.now() > deadline) {
        await log(job.id, 'warn', `Run budget reached during dedup lookup at ${i}/${hashed.length}`);
        break;
      }

      const chunk = hashed.slice(i, i + LOOKUP_CHUNK);
      const found = await prisma.article.findMany({
        where: { urlHash: { in: chunk.map((h) => h.urlHash) } },
        select: { urlHash: true },
      });
      for (const f of found) knownHashes.add(f.urlHash);
    }

    const newArticles = hashed.filter((h) => !knownHashes.has(h.urlHash));

    await log(
      job.id,
      'info',
      `${knownHashes.size} already saved, ${newArticles.length} new to process`,
    );

    // Nothing new — finish immediately rather than churning through the list.
    // Process the new ones in small batches, checkpointing as we go.
    const batchSize = CONCURRENCY;
    let processedSinceCheckpoint = 0;
    let hitLimit = false;
    let outOfTime = false;

    for (let i = 0; i < newArticles.length; i += batchSize) {
      if (hitLimit) break;

      if (Date.now() > deadline) {
        outOfTime = true;
        await log(
          job.id,
          'warn',
          `Run budget of ${Math.round(MAX_RUN_MS / 1000)}s reached after ${articlesSaved} articles — stopping cleanly, the rest continue next run`,
        );
        break;
      }

      const remaining = MAX_NEW_ARTICLES_PER_RUN - articlesSaved;
      const batch = newArticles
        .slice(i, i + Math.min(batchSize, remaining))
        .map((h) => h.article);

      const saved = await processArticleBatch(batch, source.id, job.id);

      // Hand the event loop back between batches so queued HTTP requests get
      // served. Without this a long crawl can starve the web server enough
      // that nginx times the app out and Passenger recycles it mid-crawl.
      await new Promise((r) => setImmediate(r));

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

      if (articlesSaved >= MAX_NEW_ARTICLES_PER_RUN) {
        hitLimit = true;
        await log(job.id, 'info', `Reached per-run limit of ${MAX_NEW_ARTICLES_PER_RUN} new articles. Auto-continuing...`);
      }
    }

    await log(
      job.id,
      'info',
      `Saved ${articlesSaved} new articles (${knownHashes.size} already saved, ${Math.max(0, newArticles.length - articlesSaved)} pending next run)`,
    );

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
    // Carry on with this source if it still has work and made progress.
    // Having saved nothing within the budget means something is slow here, so
    // move on rather than let one source monopolise the chain.
    const continueSameSource = (hitLimit || outOfTime) && articlesSaved > 0;
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

/**
 * Enrich and save a batch of articles concurrently. The caller sizes the batch
 * to CONCURRENCY and never exceeds the per-run cap, so this just processes
 * everything it is given and reports how many were saved.
 */
async function processArticleBatch(
  articles: ParsedArticle[],
  sourceId: string,
  jobId: string,
): Promise<number> {
  let saved = 0;

  await Promise.all(articles.map(async (article) => {
    try {
      const urlHash = hashUrl(article.url);

      // Check if already exists
      const existing = await prisma.article.findUnique({
        where: { urlHash },
        select: { id: true },
      });

      if (existing) return;

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

      // Has any of these LinkedIn profiles already been captured elsewhere?
      // Indexed point lookup against the claims table.
      const linkedinKeys = [
        ...new Set(linkedinUrls.map(normalizeLinkedinUrl).filter((k): k is string => k !== null)),
      ];

      // Profiles flagged `ignored` are publisher/sitewide links (e.g. the
      // LinkedIn in a site footer, which appears on every article) — they
      // identify no lead, so they never count as a duplicate.
      let duplicateOf: { articleId: string; linkedinUrl: string } | null = null;
      if (linkedinKeys.length > 0) {
        duplicateOf = await prisma.articleLinkedin.findFirst({
          where: { linkedinUrl: { in: linkedinKeys }, ignored: false },
          select: { articleId: true, linkedinUrl: true },
        });

        // Count every sighting, and retire a profile once it turns out to be
        // sitewide rather than a real lead.
        await prisma.articleLinkedin.updateMany({
          where: { linkedinUrl: { in: linkedinKeys } },
          data: { seenCount: { increment: 1 } },
        });
        await prisma.articleLinkedin.updateMany({
          where: { linkedinUrl: { in: linkedinKeys }, seenCount: { gte: SITEWIDE_LINKEDIN_THRESHOLD } },
          data: { ignored: true },
        });
      }

      // Same headline from the same publication = the same story served under
      // another slug. Only matched within a source, so two outlets covering the
      // same news under an identical headline are both kept.
      const resolvedTitle = metadata?.title || article.title;
      const key = titleKey(resolvedTitle);
      const sameTitleArticle = key
        ? await prisma.article.findFirst({
            where: { sourceId, titleKey: key },
            select: { id: true },
          })
        : null;

      const archiveNote = duplicateOf
        ? `Duplicate lead: ${duplicateOf.linkedinUrl} already captured on article ${duplicateOf.articleId}`
        : sameTitleArticle
          ? `Duplicate story: same headline already captured on article ${sameTitleArticle.id}`
          : !hasAnyLead
            ? 'No leads found'
            : null;

      const isDuplicate = Boolean(duplicateOf || sameTitleArticle);

      const newArticle = await prisma.article.create({
        data: {
          sourceId,
          url: article.url,
          canonicalUrl: metadata?.canonicalUrl || article.canonicalUrl || null,
          urlHash,
          title: resolvedTitle,
          titleKey: key || null,
          excerpt: metadata?.excerpt || article.excerpt || null,
          author: metadata?.author || article.author || null,
          publishedAt: metadata?.publishedAt || article.publishedAt || null,
          category: metadata?.category || article.category || null,
          tags: metadata?.tags || article.tags || [],
          status: hasAnyLead && !isDuplicate ? 'NEW' : 'ARCHIVED',
          internalNotes: archiveNote,
          scrapedEmails: mergedEmails,
          outboundLinks: metadata?.outboundLinks ? JSON.parse(JSON.stringify(metadata.outboundLinks)) : undefined,
          linkedinUrls,
          twitterUrls,
          companyUrls,
          websiteEmails,
          websiteEmailsScrapedAt: companyUrls.length > 0 ? new Date() : undefined,
        },
      });

      // Claim these LinkedIn profiles so later articles see them as duplicates.
      // A duplicate never claims anything — the original keeps ownership.
      if (!isDuplicate && linkedinKeys.length > 0) {
        await prisma.articleLinkedin.createMany({
          data: linkedinKeys.map((linkedinUrl) => ({ articleId: newArticle.id, linkedinUrl })),
          skipDuplicates: true,
        });
      }

      // Log status history for auto-archived articles
      if (!hasAnyLead || isDuplicate) {
        await prisma.articleStatusHistory.create({
          data: {
            articleId: newArticle.id,
            fromStatus: 'NEW',
            toStatus: 'ARCHIVED',
            note: `Auto-archived: ${archiveNote}`,
          },
        });
      }

      saved++;
    } catch (err) {
      // Likely a unique constraint violation (race condition), skip
      await log(jobId, 'warn', `Could not save article ${article.url}: ${err}`);
    }
  }));

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
