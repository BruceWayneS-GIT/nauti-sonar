import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateCsv, type ExportRow } from '@/services/export/csv-export';
import { formatDate } from '@/lib/utils';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { articleIds } = body as { articleIds?: string[] };

  const where = articleIds?.length ? { id: { in: articleIds } } : {};

  const articles = await prisma.article.findMany({
    where,
    include: {
      source: { select: { name: true } },
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const rows: ExportRow[] = articles.map((a) => ({
    title: a.title,
    url: a.url,
    source: a.source.name,
    author: a.author || '',
    publishedAt: formatDate(a.publishedAt),
    status: a.status,
    owner: a.owner?.name || '',
    contactEmail: a.contactEmail || '',
    contactType: a.contactType || '',
    contactConfidence: a.contactConfidence || '',
    contactFoundOnUrl: a.contactFoundOnUrl || '',
    contactUrl: a.contactUrl || '',
    outreachNotes: a.outreachNotes || '',
    category: a.category || '',
  }));

  const csv = generateCsv(rows);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="pr-articles-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
