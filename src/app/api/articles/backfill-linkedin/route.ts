import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { normalizeLinkedinUrl } from '@/lib/utils';

export const maxDuration = 300;

const DEFAULT_LIMIT = 5000;

/**
 * GET /api/articles/backfill-linkedin?offset=0&limit=5000
 *
 * Populates the ArticleLinkedin claims table from existing articles'
 * linkedinUrls, oldest first so the earliest article owns each profile.
 *
 * Non-destructive: it only records claims and reports how many existing
 * articles already collide. Nothing is archived or deleted — run this once
 * after deploying so future crawls have something to compare against.
 *
 * Call repeatedly with the returned nextOffset until done is true.
 */
export async function GET(request: NextRequest) {
  const offset = Number(request.nextUrl.searchParams.get('offset')) || 0;
  const limit = Number(request.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT;

  const total = await prisma.article.count();

  const articles = await prisma.article.findMany({
    orderBy: { createdAt: 'asc' }, // earliest article claims the profile
    skip: offset,
    take: limit,
    select: { id: true, linkedinUrls: true },
  });

  let claimed = 0;
  let collisions = 0;
  let scanned = 0;

  for (const article of articles) {
    scanned++;
    const raw = Array.isArray(article.linkedinUrls) ? article.linkedinUrls : [];
    const keys = [
      ...new Set(
        raw
          .filter((u): u is string => typeof u === 'string')
          .map(normalizeLinkedinUrl)
          .filter((k): k is string => k !== null),
      ),
    ];
    if (keys.length === 0) continue;

    // Anything already claimed by an earlier article is a collision.
    const existing = await prisma.articleLinkedin.findMany({
      where: { linkedinUrl: { in: keys } },
      select: { linkedinUrl: true },
    });
    const taken = new Set(existing.map((e) => e.linkedinUrl));
    const free = keys.filter((k) => !taken.has(k));

    if (taken.size > 0) collisions++;
    if (free.length === 0) continue;

    const result = await prisma.articleLinkedin.createMany({
      data: free.map((linkedinUrl) => ({ articleId: article.id, linkedinUrl })),
      skipDuplicates: true,
    });
    claimed += result.count;
  }

  const nextOffset = offset + scanned;
  const done = scanned < limit || nextOffset >= total;

  return NextResponse.json({
    totalArticles: total,
    scanned,
    profilesClaimed: claimed,
    articlesWithDuplicateProfiles: collisions,
    nextOffset,
    done,
    note: done
      ? 'Backfill complete. Future crawls will archive articles reusing a claimed LinkedIn profile.'
      : `Re-run with ?offset=${nextOffset}`,
  });
}
