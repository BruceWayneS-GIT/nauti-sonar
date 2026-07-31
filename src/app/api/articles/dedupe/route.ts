import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { hashUrl } from '@/lib/utils';

export const maxDuration = 300;

// Cap writes per request so the run can't outlive the Passenger process.
const DEFAULT_LIMIT = 2000;

type Row = {
  id: string;
  url: string;
  urlHash: string;
  status: string;
  contactEmail: string | null;
  createdAt: Date;
};

// Statuses that mean a human has actually worked this article — never delete
// one of these in favour of an untouched row.
const ACTIONED = new Set(['REVIEWING', 'READY', 'SENT', 'COMPLETED']);

/** Of a set of duplicates, decide which row to keep. */
function pickKeeper(rows: Row[]): Row {
  return [...rows].sort((a, b) => {
    const aActioned = ACTIONED.has(a.status) ? 1 : 0;
    const bActioned = ACTIONED.has(b.status) ? 1 : 0;
    if (aActioned !== bActioned) return bActioned - aActioned;

    const aEmail = a.contactEmail ? 1 : 0;
    const bEmail = b.contactEmail ? 1 : 0;
    if (aEmail !== bEmail) return bEmail - aEmail;

    return a.createdAt.getTime() - b.createdAt.getTime(); // oldest wins
  })[0];
}

/**
 * GET /api/articles/dedupe            → dry run, reports what would change
 * GET /api/articles/dedupe?apply=true → applies changes (deletes duplicates)
 *
 * Re-hashes every article with the current normalizeUrl and collapses rows
 * that now resolve to the same URL. Must be run after any change to
 * normalizeUrl, otherwise existing articles keep stale hashes and get
 * re-saved as duplicates on the next crawl.
 *
 * Work is capped per request (?limit=N). Call repeatedly until
 * `remaining` is 0 — each pass converges.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';
  const limit = Number(request.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT;

  const articles: Row[] = await prisma.article.findMany({
    select: { id: true, url: true, urlHash: true, status: true, contactEmail: true, createdAt: true },
  });

  // Group every article by the hash it *should* have
  const byNewHash = new Map<string, Row[]>();
  for (const a of articles) {
    const h = hashUrl(a.url);
    const group = byNewHash.get(h);
    if (group) group.push(a);
    else byNewHash.set(h, [a]);
  }

  const toDelete: Row[] = [];
  const toRehash: { row: Row; newHash: string }[] = [];

  for (const [newHash, group] of byNewHash) {
    if (group.length > 1) {
      const keeper = pickKeeper(group);
      for (const row of group) {
        if (row.id !== keeper.id) toDelete.push(row);
      }
      if (keeper.urlHash !== newHash) toRehash.push({ row: keeper, newHash });
    } else if (group[0].urlHash !== newHash) {
      toRehash.push({ row: group[0], newHash });
    }
  }

  const totalWork = toDelete.length + toRehash.length;

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      totalArticles: articles.length,
      duplicatesToDelete: toDelete.length,
      articlesToRehash: toRehash.length,
      examples: toDelete.slice(0, 10).map((r) => r.url),
      note: 'Re-run with ?apply=true to perform these changes.',
    });
  }

  let deleted = 0;
  let rehashed = 0;
  let budget = limit;

  // Delete duplicates first — this frees up the hashes the keepers need.
  for (const row of toDelete) {
    if (budget <= 0) break;
    try {
      await prisma.article.delete({ where: { id: row.id } });
      deleted++;
    } catch (err) {
      console.error(`[dedupe] failed to delete ${row.id}:`, err);
    }
    budget--;
  }

  // Then move survivors onto their new hash. A collision here means the row
  // holding that hash hasn't been processed yet — it resolves on a later pass.
  for (const { row, newHash } of toRehash) {
    if (budget <= 0) break;
    try {
      await prisma.article.update({ where: { id: row.id }, data: { urlHash: newHash } });
      rehashed++;
    } catch {
      // unique collision — will settle on a subsequent call
    }
    budget--;
  }

  const processed = deleted + rehashed;

  return NextResponse.json({
    applied: true,
    deleted,
    rehashed,
    remaining: Math.max(0, totalWork - processed),
    done: totalWork - processed <= 0,
  });
}
