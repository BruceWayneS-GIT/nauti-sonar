import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { normalizeUrl, normalizeLinkedinUrl } from '@/lib/utils';
import { titleKey } from '@/lib/dedupe';

export const maxDuration = 300;

type Group = { key: string; count: number; examples: { title: string; url: string; source: string }[] };

function summarize(map: Map<string, { title: string; url: string; source: string }[]>, topN = 5): {
  groupsWithDuplicates: number;
  extraRows: number;
  worst: Group[];
} {
  let groupsWithDuplicates = 0;
  let extraRows = 0;
  const groups: Group[] = [];

  for (const [key, rows] of map) {
    if (rows.length < 2) continue;
    groupsWithDuplicates++;
    extraRows += rows.length - 1;
    groups.push({ key, count: rows.length, examples: rows.slice(0, 3) });
  }

  groups.sort((a, b) => b.count - a.count);
  return { groupsWithDuplicates, extraRows, worst: groups.slice(0, topN) };
}

/**
 * GET /api/articles/duplicate-report
 *
 * Read-only diagnostic. Reports how many articles collide on each notion of
 * "duplicate" so we can tell which one is actually happening, rather than
 * guessing. Deletes and changes nothing.
 */
export async function GET(_request: NextRequest) {
  const articles = await prisma.article.findMany({
    select: {
      url: true,
      canonicalUrl: true,
      title: true,
      linkedinUrls: true,
      source: { select: { name: true } },
    },
  });

  const byUrl = new Map<string, { title: string; url: string; source: string }[]>();
  const byCanonical = new Map<string, { title: string; url: string; source: string }[]>();
  const byTitle = new Map<string, { title: string; url: string; source: string }[]>();
  const byLinkedin = new Map<string, { title: string; url: string; source: string }[]>();

  const push = (
    map: Map<string, { title: string; url: string; source: string }[]>,
    key: string,
    row: { title: string; url: string; source: string },
  ) => {
    const existing = map.get(key);
    if (existing) existing.push(row);
    else map.set(key, [row]);
  };

  for (const a of articles) {
    const row = { title: a.title, url: a.url, source: a.source?.name ?? '—' };

    push(byUrl, normalizeUrl(a.url), row);
    if (a.canonicalUrl) push(byCanonical, normalizeUrl(a.canonicalUrl), row);
    if (a.title) push(byTitle, titleKey(a.title), row);

    const raw = Array.isArray(a.linkedinUrls) ? a.linkedinUrls : [];
    const keys = new Set(
      raw
        .filter((u): u is string => typeof u === 'string')
        .map(normalizeLinkedinUrl)
        .filter((k): k is string => k !== null),
    );
    for (const k of keys) push(byLinkedin, k, row);
  }

  return NextResponse.json({
    totalArticles: articles.length,
    sameNormalizedUrl: summarize(byUrl),
    sameCanonicalUrl: summarize(byCanonical),
    sameTitle: summarize(byTitle),
    sameLinkedinProfile: summarize(byLinkedin),
  });
}
