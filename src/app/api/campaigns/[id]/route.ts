import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      articles: {
        include: { source: { select: { name: true } }, owner: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      outreachItems: { include: { contact: true }, orderBy: { createdAt: 'desc' } },
      contacts: { include: { contact: true } },
      _count: { select: { articles: true, outreachItems: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(campaign);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  if (body.startDate) body.startDate = new Date(body.startDate);
  if (body.endDate) body.endDate = new Date(body.endDate);
  const campaign = await prisma.campaign.update({ where: { id }, data: body });
  return NextResponse.json(campaign);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
