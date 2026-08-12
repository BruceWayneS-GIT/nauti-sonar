import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { isLinkedinProfileUrl } from '@/lib/utils';

export const maxDuration = 300;

const DEFAULT_LIMIT = 2000;

// A human has worked these — never archive one automatically.
const ACTIONED = new Set(['REVIEWING', 'READY', 'SENT', 'COMPLETED']);

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * GET /api/articles/clean-linkedin            → dry run
 * GET /api/articles/clean-linkedin?apply=true → strips junk and archives leadless articles
 *
 * Removes LinkedIn share widgets, feed posts and login links from
 * linkedinUrls, leaving only person (/in/) and company (/company/) pages.
 *
 * Then applies the crawler's rule to what is already stored: a LinkedIn
 * profile is how a client gets contacted, so an article without one is
 * archived — an email or company site alone does not keep it in the queue.
 *
 * Articles you have actioned (REVIEWING/READY/SENT/COMPLETED) are never
 * archived, whatever their leads look like.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';
  const limit = Number(request.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT;

  const articles = await prisma.article.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      contactEmail: true,
      linkedinUrls: true,
      twitterUrls: true,
      companyUrls: true,
      scrapedEmails: true,
      websiteEmails: true,
      // NULL means the page was never successfully fetched, so we know
      // nothing about whether it has a LinkedIn profile.
      outboundLinks: true,
    },
  });

  type Job = { id: string; title: string; kept: string[]; removed: string[]; archive: boolean };
  const jobs: Job[] = [];
  // Articles whose page we never read. Absence of a LinkedIn URL on these
  // proves nothing, so they must be re-scraped before any archiving decision.
  const neverScraped: string[] = [];

  for (const a of articles) {
    const urls = asStrings(a.linkedinUrls);
    const kept = urls.filter(isLinkedinProfileUrl);
    const removed = urls.filter((u) => !isLinkedinProfileUrl(u));
    const needsClean = removed.length > 0;

    // Mirrors the crawler's rule: a LinkedIn profile is the lead. An email or
    // company site on its own is not a way to contact the client, so those
    // articles are archived too.
    const hasAnyLead = kept.length > 0;

    const wasScraped = a.outboundLinks !== null;
    const archivable = !hasAnyLead && a.status !== 'ARCHIVED' && !ACTIONED.has(a.status);

    if (archivable && !wasScraped) {
      // Never read — re-scrape it rather than archiving on missing data.
      neverScraped.push(a.title);
      if (!needsClean) continue;
    }

    const archive = archivable && wasScraped;
    if (!needsClean && !archive) continue;
    jobs.push({ id: a.id, title: a.title, kept, removed, archive });
  }

  const toClean = jobs.filter((j) => j.removed.length > 0);
  const toArchive = jobs.filter((j) => j.archive);

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      totalArticles: articles.length,
      articlesToClean: toClean.length,
      junkUrlsToRemove: toClean.reduce((n, j) => n + j.removed.length, 0),
      articlesToArchive: toArchive.length,
      cleanExamples: toClean.slice(0, 5).map((j) => ({ title: j.title, removed: j.removed.slice(0, 2) })),
      archiveExamples: toArchive.slice(0, 5).map((j) => j.title),
      skippedNeverScraped: neverScraped.length,
      skippedExamples: neverScraped.slice(0, 5),
      note:
        'Articles with no LinkedIn profile are archived. Articles whose page was never successfully ' +
        'fetched are skipped, not archived — run Scrape Links on those first, since a missing ' +
        'LinkedIn there only means we never read the page. Actioned articles are never touched. ' +
        'Re-run with ?apply=true.',
    });
  }

  let cleaned = 0;
  let archived = 0;
  let budget = limit;

  for (const job of jobs) {
    if (budget <= 0) break;
    try {
      const data: { linkedinUrls?: string[]; status?: 'ARCHIVED'; internalNotes?: string } = {};
      if (job.removed.length > 0) data.linkedinUrls = job.kept;
      if (job.archive) {
        data.status = 'ARCHIVED';
        data.internalNotes = 'No LinkedIn profile found';
      }

      await prisma.article.update({ where: { id: job.id }, data });

      if (job.removed.length > 0) cleaned++;
      if (job.archive) {
        archived++;
        await prisma.articleStatusHistory.create({
          data: {
            articleId: job.id,
            toStatus: 'ARCHIVED',
            note: 'Auto-archived: no LinkedIn profile to contact',
          },
        });
      }
    } catch (err) {
      console.error(`[clean-linkedin] failed on ${job.id}:`, err);
    }
    budget--;
  }

  const processed = Math.min(jobs.length, limit);
  const remaining = jobs.length - processed;

  return NextResponse.json({
    applied: true,
    articlesCleaned: cleaned,
    articlesArchived: archived,
    skippedNeverScraped: neverScraped.length,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
  });
}
