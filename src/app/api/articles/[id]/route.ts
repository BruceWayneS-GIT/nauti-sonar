import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { mirrorArticleToSupabase } from '@/services/outreach/supabase-lead-sync';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, name: true, rootUrl: true } },
      owner: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      contactFindings: { orderBy: { createdAt: 'desc' } },
      contactRuns: { orderBy: { createdAt: 'desc' }, take: 5 },
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { name: true } } },
      },
      outreachItems: {
        orderBy: { createdAt: 'desc' },
        include: { contact: { select: { name: true, email: true } } },
      },
    },
  });

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  return NextResponse.json(article);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const current = await prisma.article.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!current) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  // Track status changes
  if (body.status && body.status !== current.status) {
    await prisma.articleStatusHistory.create({
      data: {
        articleId: id,
        fromStatus: current.status,
        toStatus: body.status,
        changedBy: body.changedBy || null,
        note: body.statusNote || null,
      },
    });
  }

  // Set sentAt/completedAt automatically
  if (body.status === 'SENT' && !body.sentAt) body.sentAt = new Date();
  if (body.status === 'COMPLETED' && !body.completedAt) body.completedAt = new Date();

  // Remove non-schema fields
  delete body.changedBy;
  delete body.statusNote;

  const article = await prisma.article.update({
    where: { id },
    data: body,
    include: {
      source: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  // Mirror to Supabase `leads` when an article newly transitions to SENT
  if (body.status === 'SENT' && current.status !== 'SENT') {
    mirrorArticleToSupabase(id).catch((err) =>
      console.error('[supabase-sync] background sync failed:', err),
    );
  }

  return NextResponse.json(article);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.article.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
