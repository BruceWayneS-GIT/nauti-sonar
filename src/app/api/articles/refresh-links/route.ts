import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { extractArticleMetadata } from '@/services/crawler/article-metadata';
import { isAuthorLinkedinUrl, normalizeLinkedinUrl } from '@/lib/utils';

export const maxDuration = 300;

// Re-fetching is a network round trip per article, so a run is bounded by
// both a count and a wall clock — the same reasoning as the crawler's budget.
const DEFAULT_LIMIT = 100;
const MAX_RUN_MS = 4 * 60 * 1000;
const CONCURRENCY = 3;

// Never re-archive something a human has worked.
const ACTIONED = new Set(['REVIEWING', 'READY', 'SENT', 'COMPLETED']);

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * GET /api/articles/refresh-links?source=Entrepreneur              → how much is pending
 * GET /api/articles/refresh-links?source=Entrepreneur&apply=true   → refresh a batch
 *
 * Re-reads articles already in the database and re-extracts their outbound
 * links, so rules added after they were crawled apply to them — in
 * particular the author's declared profiles in JSON-LD, which is the only
 * way to spot a byline whose handle bears no relation to their name.
 *
 * Only link data is rewritten; emails and contact fields are left alone. An
 * article left with no lead is archived, unless it has been actioned.
 * Progress is recorded per article, so repeated calls carry on where the
 * last one stopped.
 */
export async function GET(request: NextRequest) {
  const sourceQuery = request.nextUrl.searchParams.get('source') || '';
  const apply = request.nextUrl.searchParams.get('apply') === 'true';
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT, 500);

  const where = {
    linksRefreshedAt: null,
    ...(sourceQuery ? { source: { name: { contains: sourceQuery } } } : {}),
  };

  const pending = await prisma.article.count({ where });

  if (!apply) {
    return NextResponse.json({
      pendingRefresh: pending,
      note: `Add &apply=true to refresh up to ${limit} at a time. Repeat until pendingRefresh is 0.`,
    });
  }

  const ignoredRows = await prisma.articleLinkedin.findMany({
    where: { ignored: true },
    select: { linkedinUrl: true },
  });
  const ignoredProfiles = new Set(ignoredRows.map((r) => r.linkedinUrl));

  const articles = await prisma.article.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, url: true, author: true, status: true, linkedinUrls: true },
  });

  const deadline = Date.now() + MAX_RUN_MS;
  let refreshed = 0;
  let archived = 0;
  let unreachable = 0;
  let linkedinRemoved = 0;

  for (let i = 0; i < articles.length; i += CONCURRENCY) {
    if (Date.now() > deadline) break;
    const batch = articles.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (a) => {
        try {
          const metadata = await extractArticleMetadata(a.url);

          if (!metadata) {
            // Mark it done regardless, or an unreachable article blocks the
            // queue forever. It can be re-run by clearing linksRefreshedAt.
            unreachable++;
            await prisma.article.update({
              where: { id: a.id },
              data: { linksRefreshedAt: new Date() },
            });
            return;
          }

          const before = asStrings(a.linkedinUrls).length;
          const after = metadata.linkedinUrls;
          if (after.length < before) linkedinRemoved += before - after.length;

          // Same rule the crawler applies.
          const leads = after.filter((u) => {
            if (isAuthorLinkedinUrl(u, metadata.author || a.author)) return false;
            const key = normalizeLinkedinUrl(u);
            return !(key && ignoredProfiles.has(key));
          });

          const shouldArchive =
            leads.length === 0 && a.status !== 'ARCHIVED' && !ACTIONED.has(a.status);

          await prisma.article.update({
            where: { id: a.id },
            data: {
              linkedinUrls: after,
              twitterUrls: metadata.twitterUrls,
              companyUrls: metadata.companyUrls,
              outboundLinks: JSON.parse(JSON.stringify(metadata.outboundLinks)),
              linksRefreshedAt: new Date(),
              ...(shouldArchive
                ? { status: 'ARCHIVED' as const, internalNotes: "Only the author's own LinkedIn found" }
                : {}),
            },
          });

          if (shouldArchive) {
            archived++;
            await prisma.articleStatusHistory.create({
              data: {
                articleId: a.id,
                toStatus: 'ARCHIVED',
                note: 'Auto-archived after re-scrape: no LinkedIn to contact besides the author',
              },
            });
          }
          refreshed++;
        } catch (err) {
          console.error(`[refresh-links] failed on ${a.id}:`, err);
        }
      }),
    );

    // Let queued HTTP requests through between batches.
    await new Promise((r) => setImmediate(r));
  }

  const remaining = await prisma.article.count({ where });

  return NextResponse.json({
    refreshed,
    archived,
    unreachable,
    linkedinUrlsRemoved: linkedinRemoved,
    remaining,
    done: remaining === 0,
  });
}
