import prisma from '@/lib/db';

export interface DueSource {
  id: string;
  name: string;
  overdueMs: number;
}

/**
 * Returns ACTIVE sources that are due for a crawl, most overdue first.
 * A source is due when (lastCrawledAt + crawlFrequency) is in the past.
 * Never-crawled sources are treated as maximally overdue.
 */
export async function getDueSources(): Promise<DueSource[]> {
  const sources = await prisma.source.findMany({
    where: { status: 'ACTIVE' },
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

// A job still RUNNING after this long means the process died mid-crawl.
// Well beyond a legitimate capped run, which takes ~5-10 minutes.
const STALE_JOB_MS = 30 * 60 * 1000;

/**
 * Marks RUNNING jobs that have outlived STALE_JOB_MS as FAILED.
 * Without this a crashed job would block the crawl chain forever, since
 * the chain waits for the server to be idle before starting the next run.
 */
export async function cleanupStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  const result = await prisma.crawlJob.updateMany({
    where: {
      status: 'RUNNING',
      OR: [{ startedAt: { lt: cutoff } }, { startedAt: null }],
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
