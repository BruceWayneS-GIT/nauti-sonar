import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { normalizeLinkedinUrl } from '@/lib/utils';
import { titleKey, pickKeeper } from '@/lib/dedupe';

export const maxDuration = 300;

const DEFAULT_LIMIT = 2000;

// Notes written by our own dedup passes — only these are safe to reverse.
const DUP_LEAD = 'Duplicate lead:';
const DUP_STORY = 'Duplicate story:';

/**
 * GET /api/articles/repair-dedupe            → dry run
 * GET /api/articles/repair-dedupe?apply=true → restores over-archived leads
 *
 * Earlier keeper selection ranked an already-archived article equal to a live
 * one, so an older archived copy could win and every active article in the
 * group got archived around it — leaving that lead with nothing in the
 * pipeline.
 *
 * This finds duplicate groups where nothing is active and at least one row was
 * archived by our own dedup, and restores the best of those to NEW. Articles
 * archived for any other reason (e.g. "No leads found") are left alone.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';
  const limit = Number(request.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT;

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
      internalNotes: true,
      contactEmail: true,
      createdAt: true,
      sourceId: true,
      linkedinUrls: true,
      source: { select: { name: true } },
    },
  });
  type Row = (typeof articles)[number];

  const groups = new Map<string, Row[]>();
  const add = (key: string, row: Row) => {
    const g = groups.get(key);
    if (g) g.push(row);
    else groups.set(key, [row]);
  };

  for (const a of articles) {
    const raw = Array.isArray(a.linkedinUrls) ? a.linkedinUrls : [];
    const keys = new Set(
      raw
        .filter((u): u is string => typeof u === 'string')
        .map(normalizeLinkedinUrl)
        .filter((k): k is string => k !== null && !ignored.has(k)),
    );
    for (const k of keys) add(`li::${k}`, a);

    const tk = titleKey(a.title);
    if (tk) add(`title::${a.sourceId}::${tk}`, a);
  }

  // A group needs repair when it has duplicates, nothing is live, and at least
  // one row was archived by our dedup rather than for some other reason.
  const toRestore = new Map<string, { row: Row; group: string }>();

  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    if (rows.some((r) => r.status !== 'ARCHIVED')) continue;

    const ours = rows.filter(
      (r) => r.internalNotes?.startsWith(DUP_LEAD) || r.internalNotes?.startsWith(DUP_STORY),
    );
    if (ours.length === 0) continue;

    const best = pickKeeper(ours);
    if (!toRestore.has(best.id)) toRestore.set(best.id, { row: best, group: key });
  }

  const items = [...toRestore.values()];

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      totalArticles: articles.length,
      groupsFullyArchived: items.length,
      articlesToRestore: items.length,
      examples: items.slice(0, 10).map((i) => ({
        title: i.row.title,
        source: i.row.source?.name ?? '—',
        group: i.group,
        note: i.row.internalNotes,
      })),
      note: 'Restores these to NEW. Re-run with ?apply=true.',
    });
  }

  let restored = 0;
  let budget = limit;

  for (const item of items) {
    if (budget <= 0) break;
    try {
      await prisma.article.update({
        where: { id: item.row.id },
        data: { status: 'NEW', internalNotes: null },
      });
      await prisma.articleStatusHistory.create({
        data: {
          articleId: item.row.id,
          fromStatus: 'ARCHIVED',
          toStatus: 'NEW',
          note: 'Restored: dedup had archived every copy of this lead',
        },
      });
      restored++;
    } catch (err) {
      console.error(`[repair-dedupe] failed to restore ${item.row.id}:`, err);
    }
    budget--;
  }

  const remaining = items.length - restored;

  return NextResponse.json({
    applied: true,
    articlesRestored: restored,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
  });
}
