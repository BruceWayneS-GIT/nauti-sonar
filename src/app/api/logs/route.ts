import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get('type') || 'crawl';
  const page = parseInt(sp.get('page') || '1');
  const pageSize = Math.min(parseInt(sp.get('pageSize') || '50'), 200);
  const level = sp.get('level') || '';

  if (type === 'crawl') {
    const jobs = await prisma.crawlJob.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        source: { select: { name: true, rootUrl: true } },
        _count: { select: { logs: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await prisma.crawlJob.count();
    return NextResponse.json({ items: jobs, total, page, pageSize });
  }

  if (type === 'crawl_logs') {
    const jobId = sp.get('jobId') || '';
    const where: Record<string, unknown> = {};
    if (jobId) where.crawlJobId = jobId;
    if (level) where.level = level;

    const logs = await prisma.crawlLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { crawlJob: { select: { source: { select: { name: true } } } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await prisma.crawlLog.count({ where });
    return NextResponse.json({ items: logs, total, page, pageSize });
  }

  if (type === 'contact_discovery') {
    const runs = await prisma.contactDiscoveryRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        article: { select: { title: true, url: true, source: { select: { name: true } } } },
        _count: { select: { findings: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await prisma.contactDiscoveryRun.count();
    return NextResponse.json({ items: runs, total, page, pageSize });
  }

  if (type === 'status_history') {
    const history = await prisma.articleStatusHistory.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        article: { select: { title: true, url: true } },
        user: { select: { name: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await prisma.articleStatusHistory.count();
    return NextResponse.json({ items: history, total, page, pageSize });
  }

  return NextResponse.json({ items: [], total: 0, page: 1, pageSize });
}
