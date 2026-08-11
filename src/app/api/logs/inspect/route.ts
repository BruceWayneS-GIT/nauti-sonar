import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const maxDuration = 60;

/**
 * GET /api/logs/inspect[?source=USA][&limit=5]
 *
 * Returns recent crawl jobs with every log line they produced, so a stalled
 * crawl can be diagnosed from the last line it managed to write.
 * Read-only.
 */
export async function GET(request: NextRequest) {
  const sourceQuery = request.nextUrl.searchParams.get('source') || '';
  const limit = Number(request.nextUrl.searchParams.get('limit')) || 5;

  const jobs = await prisma.crawlJob.findMany({
    where: sourceQuery ? { source: { name: { contains: sourceQuery } } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 20),
    include: {
      source: { select: { name: true } },
      logs: { orderBy: { createdAt: 'asc' } },
    },
  });

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      source: j.source?.name ?? '—',
      status: j.status,
      articlesFound: j.articlesFound,
      articlesSaved: j.articlesSaved,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      durationSeconds:
        j.startedAt && j.completedAt
          ? Math.round((j.completedAt.getTime() - j.startedAt.getTime()) / 1000)
          : null,
      logCount: j.logs.length,
      logs: j.logs.map((l) => ({
        at: l.createdAt,
        level: l.level,
        message: l.message,
        secondsAfterStart: j.startedAt
          ? Math.round((l.createdAt.getTime() - j.startedAt.getTime()) / 1000)
          : null,
      })),
    })),
  });
}
