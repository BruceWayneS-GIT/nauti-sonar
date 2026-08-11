import prisma from '@/lib/db';

export interface DueSource {
  id: string;
  name: string;
  overdueMs: number;
}

/**
 * Returns sources that are due for a crawl, most overdue first.
 * A source is due when (lastCrawledAt + crawlFrequency) is in the past.
 * Never-crawled sources are treated as maximally overdue.
 *
 * ERROR sources are included: a single bad crawl (a blocked request, a
 * temporarily bad sitemap) marks a source ERROR, and excluding those meant
 * one failure dropped a source from the schedule permanently. A genuinely
 * broken source just fails fast again and costs nothing. Only PAUSED is
 * excluded, since that is a deliberate choice by the user.
 */
export async function getDueSources(): Promise<DueSource[]> {
  const sources = await prisma.source.findMany({
    where: { status: { in: ['ACTIVE', 'ERROR'] } },
    select: { id: true, name: true, crawlFrequency: true, lastCrawledAt: true },
  });

  const now = Date.now();

  return sources
    .map((s) => {
      const frequencyMs = (s.crawlFrequency ?? 60) * 60 * 1000;
      const lastCrawled = s.lastCrawledAt ? s.lastCrawledAt.getTime() : 0;
      return { id: s.id, name: s.name, overdueMs: now - (lastCrawled + frequencyMs) };
    })
    .filter((s) => s.overdueMs > 0)
    .sort((a, b) => b.overdueMs - a.overdueMs);
}

// How long without a heartbeat before a RUNNING job is presumed dead.
// A live crawl bumps its heartbeat every batch, so this only ever catches a
// job whose process is genuinely gone.
//
// This used to be measured from startedAt, which meant a long but perfectly
// healthy crawl was marked FAILED the moment it passed the threshold — and
// because that freed the "is anything running?" check, the next cron tick
// started the same source again while the original was still going. Judging
// on liveness rather than age removes that entirely.
const NO_HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * Marks RUNNING jobs whose process has stopped reporting as FAILED, so a dead
 * job cannot block the chain forever. Jobs predating heartbeats fall back to
 * startedAt with a generous allowance.
 */
export async function cleanupStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - NO_HEARTBEAT_MS);
  const legacyCutoff = new Date(Date.now() - 60 * 60 * 1000);

  const result = await prisma.crawlJob.updateMany({
    where: {
      status: 'RUNNING',
      OR: [
        { heartbeatAt: { lt: cutoff } },
        // No heartbeat ever recorded — either a pre-heartbeat job or one that
        // died before its first batch. Give those a full hour before sweeping.
        { AND: [{ heartbeatAt: null }, { startedAt: { lt: legacyCutoff } }] },
        { AND: [{ heartbeatAt: null }, { startedAt: null }] },
      ],
    },
    data: { status: 'FAILED', completedAt: new Date() },
  });
  return result.count;
}

/**
 * True if a crawl is genuinely running right now.
 * Clears stale jobs first so a crashed run can't block the chain.
 */
export async function isAnyCrawlRunning(): Promise<boolean> {
  await cleanupStuckJobs();
  const count = await prisma.crawlJob.count({ where: { status: 'RUNNING' } });
  return count > 0;
}
