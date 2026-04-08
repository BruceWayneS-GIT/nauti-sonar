import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  const [
    totalSources,
    healthySources,
    erroredSources,
    totalArticles,
    withEmail,
    withContactUrl,
    noContact,
    readyForOutreach,
    sent,
    completed,
    newThisWeek,
    articlesBySource,
    articlesByStatus,
  ] = await Promise.all([
    prisma.source.count(),
    prisma.source.count({ where: { status: 'ACTIVE' } }),
    prisma.source.count({ where: { status: 'ERROR' } }),
    prisma.article.count(),
    prisma.article.count({
      where: {
        OR: [
          { contactEmail: { not: null } },
          { scrapedEmails: { isEmpty: false } },
        ],
      },
    }),
    prisma.article.count({ where: { contactEmail: null, scrapedEmails: { isEmpty: true }, contactUrl: { not: null } } }),
    prisma.article.count({ where: { contactEmail: null, scrapedEmails: { isEmpty: true }, contactUrl: null } }),
    prisma.article.count({ where: { status: 'READY' } }),
    prisma.article.count({ where: { status: 'SENT' } }),
    prisma.article.count({ where: { status: 'COMPLETED' } }),
    prisma.article.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.article.groupBy({
      by: ['sourceId'],
      _count: true,
      orderBy: { _count: { sourceId: 'desc' } },
      take: 10,
    }),
    prisma.article.groupBy({
      by: ['status'],
      _count: true,
    }),
  ]);

  // Get source names for the chart
  const sourceIds = articlesBySource.map((s) => s.sourceId);
  const sources = await prisma.source.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, name: true },
  });
  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s.name]));

  const completionRate = totalArticles > 0 ? Math.round((completed / totalArticles) * 100) : 0;

  return NextResponse.json({
    totalSources,
    healthySources,
    erroredSources,
    totalArticles,
    withEmail,
    withContactUrl,
    noContact,
    readyForOutreach,
    sent,
    completed,
    completionRate,
    newThisWeek,
    articlesBySource: articlesBySource.map((s) => ({
      source: sourceMap[s.sourceId] || 'Unknown',
      count: s._count,
    })),
    articlesByStatus: articlesByStatus.map((s) => ({
      status: s.status,
      count: s._count,
    })),
  });
}
