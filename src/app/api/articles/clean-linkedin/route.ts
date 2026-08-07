import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { isLinkedinProfileUrl } from '@/lib/utils';

export const maxDuration = 300;

const DEFAULT_LIMIT = 2000;

/**
 * GET /api/articles/clean-linkedin            → dry run
 * GET /api/articles/clean-linkedin?apply=true → strips non-profile LinkedIn URLs
 *
 * Removes LinkedIn share widgets, feed posts and login links from articles'
 * linkedinUrls, leaving only person (/in/) and company (/company/) pages.
 *
 * These were never leads, and because hasAnyLead counts linkedinUrls they
 * caused articles with no real contact to be marked NEW.
 *
 * Only the linkedinUrls field is touched — article status is left alone, so
 * nothing disappears from your pipeline as a side effect.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';
  const limit = Number(request.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT;

  const articles = await prisma.article.findMany({
    select: { id: true, title: true, linkedinUrls: true },
  });

  const dirty: { id: string; title: string; kept: string[]; removed: string[] }[] = [];

  for (const a of articles) {
    const raw = Array.isArray(a.linkedinUrls) ? a.linkedinUrls : [];
    const urls = raw.filter((u): u is string => typeof u === 'string');
    if (urls.length === 0) continue;

    const kept = urls.filter(isLinkedinProfileUrl);
    if (kept.length === urls.length) continue; // already clean

    dirty.push({
      id: a.id,
      title: a.title,
      kept,
      removed: urls.filter((u) => !isLinkedinProfileUrl(u)),
    });
  }

  const totalRemoved = dirty.reduce((n, d) => n + d.removed.length, 0);
  const losingAllLinkedin = dirty.filter((d) => d.kept.length === 0).length;

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      totalArticles: articles.length,
      articlesToClean: dirty.length,
      junkUrlsToRemove: totalRemoved,
      articlesLeftWithNoLinkedin: losingAllLinkedin,
      examples: dirty.slice(0, 10).map((d) => ({
        title: d.title,
        removed: d.removed.slice(0, 2),
        keeping: d.kept.length,
      })),
      note: 'Only the linkedinUrls field is modified; article status is untouched. Re-run with ?apply=true.',
    });
  }

  let cleaned = 0;
  let budget = limit;

  for (const d of dirty) {
    if (budget <= 0) break;
    try {
      await prisma.article.update({
        where: { id: d.id },
        data: { linkedinUrls: d.kept },
      });
      cleaned++;
    } catch (err) {
      console.error(`[clean-linkedin] failed on ${d.id}:`, err);
    }
    budget--;
  }

  const remaining = dirty.length - cleaned;

  return NextResponse.json({
    applied: true,
    articlesCleaned: cleaned,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
  });
}
