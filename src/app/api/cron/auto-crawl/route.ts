import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { runCrawl } from '@/services/crawler/crawl-engine';

export const maxDuration = 300;

/**
 * GET /api/cron/auto-crawl?secret=YOUR_CRON_SECRET
 *
 * Called by Plesk Scheduled Tasks every 10 minutes.
 * Picks the most overdue ACTIVE source and crawls it — but only if
 * no other crawl is currently running, so sources never pile up.
 */
export async function GET(request: NextRequest) {
  // Simple secret check to prevent public triggering
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.nextUrl.searchParams.get('secret');
    if (provided !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Don't start a new crawl if one is already running
  const runningJob = await prisma.crawlJob.findFirst({
    where: { status: 'RUNNING' },
    select: { id: true, source: { select: { name: true } } },
  });

  if (runningJob) {
    return NextResponse.json({
      skipped: true,
      reason: `${runningJob.source.name} is already crawling`,
    });
  }

  // Find the most overdue ACTIVE source
  const sources = await prisma.source.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      crawlFrequency: true,
      lastCrawledAt: true,
    },
  });

  const now = Date.now();

  const overdue = sources
    .map((s) => {
      const frequencyMs = (s.crawlFrequency ?? 60) * 60 * 1000;
      const lastCrawled = s.lastCrawledAt ? s.lastCrawledAt.getTime() : 0;
      const nextDue = lastCrawled + frequencyMs;
      const overdueMs = now - nextDue;
      return { ...s, overdueMs };
    })
    .filter((s) => s.overdueMs > 0)
    .sort((a, b) => b.overdueMs - a.overdueMs); // most overdue first

  if (overdue.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'No sources are due for a crawl' });
  }

  const source = overdue[0];

  // Fire crawl in background
  runCrawl(source.id).catch((err) => {
    console.error(`[auto-crawl] crawl failed for ${source.name}:`, err);
  });

  return NextResponse.json({
    started: true,
    source: source.name,
    overdueMinutes: Math.round(source.overdueMs / 60000),
    remaining: overdue.length - 1,
  });
}
