import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = await prisma.source.findUnique({
    where: { id },
    include: {
      _count: { select: { articles: true, crawlJobs: true } },
      crawlJobs: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(source);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const source = await prisma.source.update({ where: { id }, data: body });
  return NextResponse.json(source);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.source.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
