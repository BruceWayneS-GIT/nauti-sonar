import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { normalizeLinkedinUrl } from '@/lib/utils';

export const maxDuration = 300;

// Must match the crawl engine's threshold.
const SITEWIDE_THRESHOLD = process.env.SITEWIDE_LINKEDIN_THRESHOLD
  ? parseInt(process.env.SITEWIDE_LINKEDIN_THRESHOLD, 10)
  : 50;

/**
 * GET /api/articles/backfill-linkedin              → dry run
 * GET /api/articles/backfill-linkedin?apply=true   → writes claims
 *
 * Populates the ArticleLinkedin claims table from existing articles.
 *
 * Frequency is computed across ALL articles first, so publisher/sitewide
 * profiles (a footer LinkedIn appearing on thousands of articles) are marked
 * `ignored` up front rather than being learned the hard way after wrongly
 * archiving the first N articles that carry them.
 *
 * Non-destructive: records claims only. Nothing is archived or deleted.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';

  const articles = await prisma.article.findMany({
    orderBy: { createdAt: 'asc' }, // earliest article owns each profile
    select: { id: true, linkedinUrls: true },
  });

  // Pass 1 — count how many articles carry each profile.
  const frequency = new Map<string, number>();
  const keysByArticle = new Map<string, string[]>();

  for (const article of articles) {
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
    keysByArticle.set(article.id, keys);
    for (const k of keys) frequency.set(k, (frequency.get(k) ?? 0) + 1);
  }

  const sitewide = [...frequency.entries()]
    .filter(([, count]) => count >= SITEWIDE_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);
  const sitewideKeys = new Set(sitewide.map(([k]) => k));

  // Pass 2 — first article to mention a profile claims it.
  const claims: { articleId: string; linkedinUrl: string; seenCount: number; ignored: boolean }[] = [];
  const claimed = new Set<string>();

  for (const [articleId, keys] of keysByArticle) {
    for (const key of keys) {
      if (claimed.has(key)) continue;
      claimed.add(key);
      claims.push({
        articleId,
        linkedinUrl: key,
        seenCount: frequency.get(key) ?? 1,
        ignored: sitewideKeys.has(key),
      });
    }
  }

  const realLeadDuplicates = [...frequency.entries()].filter(
    ([k, c]) => c > 1 && !sitewideKeys.has(k),
  );

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      totalArticles: articles.length,
      distinctProfiles: frequency.size,
      profilesToClaim: claims.length,
      sitewideProfilesIgnored: sitewide.length,
      sitewideExamples: sitewide.slice(0, 5).map(([url, count]) => ({ url, articles: count })),
      genuineDuplicateProfiles: realLeadDuplicates.length,
      note: `Profiles on >= ${SITEWIDE_THRESHOLD} articles are treated as publisher links and ignored. Re-run with ?apply=true to write claims.`,
    });
  }

  // Wipe and rewrite — makes the backfill safely repeatable.
  await prisma.articleLinkedin.deleteMany({});

  let written = 0;
  const CHUNK = 1000;
  for (let i = 0; i < claims.length; i += CHUNK) {
    const result = await prisma.articleLinkedin.createMany({
      data: claims.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    written += result.count;
  }

  return NextResponse.json({
    applied: true,
    profilesClaimed: written,
    sitewideProfilesIgnored: sitewide.length,
    genuineDuplicateProfiles: realLeadDuplicates.length,
    note: 'Future crawls will archive articles reusing a non-ignored profile.',
  });
}
