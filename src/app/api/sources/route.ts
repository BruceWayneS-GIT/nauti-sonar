import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  const sources = await prisma.source.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { articles: true, crawlJobs: true } },
    },
  });
  return NextResponse.json(sources);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const source = await prisma.source.create({
    data: {
      name: body.name,
      rootUrl: body.rootUrl,
      crawlMethod: body.crawlMethod || 'SITEMAP',
      crawlFrequency: body.crawlFrequency || 60,
      status: body.status || 'ACTIVE',
      notes: body.notes || null,
      parserConfig: body.parserConfig || null,
      contactConfig: body.contactConfig || null,
    },
  });
  return NextResponse.json(source, { status: 201 });
}
