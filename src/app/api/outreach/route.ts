import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') || '';
  const where = status ? { status } : {};

  const items = await prisma.outreachItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      article: { select: { id: true, title: true, url: true, contactEmail: true, source: { select: { name: true } } } },
      contact: { select: { id: true, name: true, email: true } },
      campaign: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Support creating outreach items for multiple articles at once
  const articleIds = body.articleIds as string[] | undefined;

  if (articleIds?.length) {
    const data = articleIds.map((articleId: string) => ({
      articleId,
      contactId: body.contactId || null,
      campaignId: body.campaignId || null,
      assignedTo: body.assignedTo || null,
      subject: body.subject || null,
      body: body.body || null,
      notes: body.notes || null,
    }));
    await prisma.outreachItem.createMany({ data });
    const items = await prisma.outreachItem.findMany({
      where: { articleId: { in: articleIds } },
      orderBy: { createdAt: 'desc' },
      take: articleIds.length,
    });
    return NextResponse.json(items, { status: 201 });
  }

  const item = await prisma.outreachItem.create({
    data: {
      articleId: body.articleId,
      contactId: body.contactId || null,
      campaignId: body.campaignId || null,
      assignedTo: body.assignedTo || null,
      subject: body.subject || null,
      body: body.body || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
