import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { articles: true, outreachItems: true, contacts: true } },
    },
  });
  return NextResponse.json(campaigns);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const campaign = await prisma.campaign.create({
    data: {
      name: body.name,
      description: body.description || null,
      status: body.status || 'draft',
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
    },
  });
  return NextResponse.json(campaign, { status: 201 });
}
