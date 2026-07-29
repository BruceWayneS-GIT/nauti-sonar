import { NextRequest, NextResponse } from 'next/server';
import { runCrawl } from '@/services/crawler/crawl-engine';
import { getDueSources, isAnyCrawlRunning } from '@/services/crawler/source-scheduler';

export const maxDuration = 300;

/**
 * GET /api/cron/auto-crawl[?secret=CRON_SECRET]
 *
 * Called by Plesk Scheduled Tasks. Kicks off the crawl chain: starts the most
 * overdue source, and when that source finishes the engine automatically
 * advances to the next due source, one at a time, until none are left.
 *
 * This route is exempt from session auth in proxy.ts — set CRON_SECRET to
 * require a secret query param.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.nextUrl.searchParams.get('secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (await isAnyCrawlRunning()) {
    return NextResponse.json({ started: false, reason: 'A crawl is already running' });
  }

  const due = await getDueSources();
  if (due.length === 0) {
    return NextResponse.json({ started: false, reason: 'No sources are due for a crawl' });
  }

  const source = due[0];

  // Fire in the background — the engine chains through the remaining sources.
  runCrawl(source.id).catch((err) => {
    console.error(`[auto-crawl] crawl failed for ${source.name}:`, err);
  });

  return NextResponse.json({
    started: true,
    source: source.name,
    overdueMinutes: Math.round(source.overdueMs / 60000),
    queued: due.length - 1,
  });
}
