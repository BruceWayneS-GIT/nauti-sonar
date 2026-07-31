import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { titleKey, pickKeeper } from '@/lib/dedupe';

export const maxDuration = 300;

const DEFAULT_LIMIT = 2000;

/**
 * GET /api/articles/dedupe-titles            → dry run
 * GET /api/articles/dedupe-titles?apply=true → backfills titleKey and archives duplicates
 *
 * Finds articles from the SAME source sharing a headline — one story served
 * under several slugs — keeps the best copy and archives the rest.
 *
 * Matching is scoped to a single source on purpose: two different outlets
 * covering the same news under an identical headline are both genuine.
 *
 * Nothing is deleted. Archived rows keep a note naming the article kept.
 * Work is capped per request; call until `done` is true.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';
  const limit = Number(request.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT;

  const articles = await prisma.article.findMany({
    select: {
      id: true,
      title: true,
      titleKey: true,
      sourceId: true,
      status: true,
      contactEmail: true,
      createdAt: true,
      source: { select: { name: true } },
    },
  });

  // Group by source + normalized headline
  const groups = new Map<string, typeof articles>();
  const needsKey: { id: string; key: string }[] = [];

  for (const a of articles) {
    const key = titleKey(a.title);
    if (!key) continue;
    if (a.titleKey !== key) needsKey.push({ id: a.id, key });

    const groupId = `${a.sourceId}::${key}`;
    const existing = groups.get(groupId);
    if (existing) existing.push(a);
    else groups.set(groupId, [a]);
  }

  // Within each group, everything except the keeper gets archived —
  // but only if it isn't already archived.
  const toArchive: { id: string; keeperId: string; title: string; source: string }[] = [];

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const keeper = pickKeeper(rows);
    for (const row of rows) {
      if (row.id === keeper.id || row.status === 'ARCHIVED') continue;
      toArchive.push({
        id: row.id,
        keeperId: keeper.id,
        title: row.title,
        source: row.source?.name ?? '—',
      });
    }
  }

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      totalArticles: articles.length,
      duplicateGroups: [...groups.values()].filter((r) => r.length > 1).length,
      articlesToArchive: toArchive.length,
      titleKeysToBackfill: needsKey.length,
      examples: toArchive.slice(0, 10).map((t) => ({ title: t.title, source: t.source })),
      note: 'Nothing is deleted — duplicates are archived with a note. Re-run with ?apply=true.',
    });
  }

  let budget = limit;
  let backfilled = 0;
  let archived = 0;

  // Backfill titleKey so future crawls can match without a full scan
  for (const { id, key } of needsKey) {
    if (budget <= 0) break;
    try {
      await prisma.article.update({ where: { id }, data: { titleKey: key } });
      backfilled++;
    } catch (err) {
      console.error(`[dedupe-titles] failed to set titleKey on ${id}:`, err);
    }
    budget--;
  }

  for (const item of toArchive) {
    if (budget <= 0) break;
    try {
      await prisma.article.update({
        where: { id: item.id },
        data: {
          status: 'ARCHIVED',
          internalNotes: `Duplicate story: same headline already captured on article ${item.keeperId}`,
        },
      });
      await prisma.articleStatusHistory.create({
        data: {
          articleId: item.id,
          toStatus: 'ARCHIVED',
          note: `Auto-archived: duplicate headline, kept article ${item.keeperId}`,
        },
      });
      archived++;
    } catch (err) {
      console.error(`[dedupe-titles] failed to archive ${item.id}:`, err);
    }
    budget--;
  }

  const remaining = needsKey.length - backfilled + (toArchive.length - archived);

  return NextResponse.json({
    applied: true,
    titleKeysBackfilled: backfilled,
    articlesArchived: archived,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
  });
}
