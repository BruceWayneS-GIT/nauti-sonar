import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { isLinkedinProfileUrl, isAuthorLinkedinUrl, normalizeLinkedinUrl } from '@/lib/utils';

export const maxDuration = 120;

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * GET /api/articles/lead-check?source=Entrepreneur&limit=25
 *
 * Read-only. For each still-active article it shows the author, the LinkedIn
 * URLs found, and which of them the byline rule treats as the author's own —
 * so "why is this still in my queue?" can be answered from the data rather
 * than inferred.
 */
export async function GET(request: NextRequest) {
  const sourceQuery = request.nextUrl.searchParams.get('source') || '';
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 25, 100);

  // The ignored list is half the rule — showing only the name match made
  // flagged bylines look like leads when they are not.
  const ignoredRows = await prisma.articleLinkedin.findMany({
    where: { ignored: true },
    select: { linkedinUrl: true },
  });
  const ignoredProfiles = new Set(ignoredRows.map((r) => r.linkedinUrl));

  const articles = await prisma.article.findMany({
    where: {
      status: { notIn: ['ARCHIVED'] },
      ...(sourceQuery ? { source: { name: { contains: sourceQuery } } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      title: true,
      author: true,
      linkedinUrls: true,
      status: true,
      source: { select: { name: true } },
    },
  });

  let keptByAuthorMiss = 0;

  const rows = articles.map((a) => {
    const profiles = asStrings(a.linkedinUrls).filter(isLinkedinProfileUrl);
    const classified = profiles.map((u) => {
      const profile = normalizeLinkedinUrl(u);
      const byName = isAuthorLinkedinUrl(u, a.author);
      const byFlag = Boolean(profile && ignoredProfiles.has(profile));
      return { profile, isAuthor: byName || byFlag, why: byName ? 'name' : byFlag ? 'flagged' : '' };
    });
    const leads = classified.filter((c) => !c.isAuthor);

    // A single non-author profile whose slug looks like the byline is the
    // most likely reason an editor's article is still showing.
    if (leads.length === 1 && a.author) keptByAuthorMiss++;

    return {
      title: a.title.slice(0, 70),
      source: a.source?.name ?? '—',
      author: a.author,
      status: a.status,
      profiles: classified.map(
        (c) => `${c.profile}${c.isAuthor ? `  [AUTHOR by ${c.why}]` : '  [lead]'}`,
      ),
      verdict: leads.length > 0 ? 'KEPT' : 'would be archived',
    };
  });

  return NextResponse.json({
    inspected: rows.length,
    withSingleNonAuthorProfile: keptByAuthorMiss,
    note: 'Any row showing [lead] against a profile that is plainly the byline means the author matcher is not catching that slug format — send it over.',
    rows,
  });
}
