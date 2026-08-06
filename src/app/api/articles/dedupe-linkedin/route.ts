import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { normalizeLinkedinUrl } from '@/lib/utils';
import { pickKeeper } from '@/lib/dedupe';

export const maxDuration = 300;

const DEFAULT_LIMIT = 2000;

/**
 * GET /api/articles/dedupe-linkedin            → dry run
 * GET /api/articles/dedupe-linkedin?apply=true → archives existing duplicates
 *
 * Sweeps articles that already share a LinkedIn profile with an earlier one.
 * The backfill only recorded ownership; this applies the same rule
 * retroactively to rows already in the database.
 *
 * Profiles flagged `ignored` (publisher/sitewide footer links) are skipped
 * entirely — those identify no lead.
 *
 * An article is only archived if it owns no profile of its own, so a lead
 * is never removed from the pipeline because it happens to also mention
 * someone already captured elsewhere.
 *
 * Nothing is deleted. Call until `done` is true.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';
  const limit = Number(request.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT;

  // Profiles we must not act on — publisher/sitewide links.
  const ignoredClaims = await prisma.articleLinkedin.findMany({
    where: { ignored: true },
    select: { linkedinUrl: true },
  });
  const ignored = new Set(ignoredClaims.map((c) => c.linkedinUrl));

  const articles = await prisma.article.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      contactEmail: true,
      createdAt: true,
      linkedinUrls: true,
      source: { select: { name: true } },
    },
  });

  type Row = (typeof articles)[number];

  // Group articles by each non-ignored profile they mention.
  const byProfile = new Map<string, Row[]>();
  for (const a of articles) {
    const raw = Array.isArray(a.linkedinUrls) ? a.linkedinUrls : [];
    const keys = new Set(
      raw
        .filter((u): u is string => typeof u === 'string')
        .map(normalizeLinkedinUrl)
        .filter((k): k is string => k !== null && !ignored.has(k)),
    );
    for (const k of keys) {
      const g = byProfile.get(k);
      if (g) g.push(a);
      else byProfile.set(k, [a]);
    }
  }

  // Pass 1 — decide the owner of every shared profile.
  const keeperByProfile = new Map<string, Row>();
  const ownerIds = new Set<string>();
  for (const [profile, rows] of byProfile) {
    if (rows.length < 2) continue;
    const keeper = pickKeeper(rows);
    keeperByProfile.set(profile, keeper);
    ownerIds.add(keeper.id);
  }

  // Pass 2 — archive non-owners. An article owning any profile is spared.
  const toArchive = new Map<string, { row: Row; profile: string; keeperId: string }>();
  for (const [profile, rows] of byProfile) {
    const keeper = keeperByProfile.get(profile);
    if (!keeper) continue;
    for (const row of rows) {
      if (row.id === keeper.id) continue;
      if (row.status === 'ARCHIVED') continue;
      if (ownerIds.has(row.id)) continue; // owns a lead of its own
      if (toArchive.has(row.id)) continue;
      toArchive.set(row.id, { row, profile, keeperId: keeper.id });
    }
  }

  const items = [...toArchive.values()];

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      totalArticles: articles.length,
      sharedProfiles: keeperByProfile.size,
      ignoredPublisherProfiles: ignored.size,
      articlesToArchive: items.length,
      examples: items.slice(0, 10).map((i) => ({
        title: i.row.title,
        source: i.row.source?.name ?? '—',
        profile: i.profile,
      })),
      note: 'Nothing is deleted — duplicates are archived with a note. Re-run with ?apply=true.',
    });
  }

  let archived = 0;
  let budget = limit;

  for (const item of items) {
    if (budget <= 0) break;
    try {
      await prisma.article.update({
        where: { id: item.row.id },
        data: {
          status: 'ARCHIVED',
          internalNotes: `Duplicate lead: ${item.profile} already captured on article ${item.keeperId}`,
        },
      });
      await prisma.articleStatusHistory.create({
        data: {
          articleId: item.row.id,
          toStatus: 'ARCHIVED',
          note: `Auto-archived: duplicate LinkedIn profile ${item.profile}, kept article ${item.keeperId}`,
        },
      });
      archived++;
    } catch (err) {
      console.error(`[dedupe-linkedin] failed to archive ${item.row.id}:`, err);
    }
    budget--;
  }

  // Keep the claims table agreeing with the decisions made here.
  for (const [profile, keeper] of keeperByProfile) {
    try {
      await prisma.articleLinkedin.updateMany({
        where: { linkedinUrl: profile, ignored: false },
        data: { articleId: keeper.id },
      });
    } catch {
      // non-critical — claim ownership is only used for notes
    }
  }

  const remaining = items.length - archived;

  return NextResponse.json({
    applied: true,
    articlesArchived: archived,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
  });
}
