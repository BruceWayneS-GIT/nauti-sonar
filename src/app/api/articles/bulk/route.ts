import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { mirrorArticleToSupabase } from '@/services/outreach/supabase-lead-sync';

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { articleIds, action, data } = body as {
    articleIds: string[];
    action: string;
    data?: Record<string, unknown>;
  };

  if (!articleIds?.length) {
    return NextResponse.json({ error: 'No article IDs provided' }, { status: 400 });
  }

  switch (action) {
    case 'assign_owner': {
      await prisma.article.updateMany({
        where: { id: { in: articleIds } },
        data: { ownerId: data?.ownerId as string },
      });
      break;
    }
    case 'set_status': {
      const status = data?.status as string;
      // Create history entries
      const articles = await prisma.article.findMany({
        where: { id: { in: articleIds } },
        select: { id: true, status: true },
      });
      await prisma.articleStatusHistory.createMany({
        data: articles.map((a) => ({
          articleId: a.id,
          fromStatus: a.status,
          toStatus: status as 'NEW' | 'REVIEWING' | 'READY' | 'SENT' | 'COMPLETED' | 'ARCHIVED',
        })),
      });
      const updateData: Record<string, unknown> = { status };
      if (status === 'SENT') updateData.sentAt = new Date();
      if (status === 'COMPLETED') updateData.completedAt = new Date();
      await prisma.article.updateMany({
        where: { id: { in: articleIds } },
        data: updateData,
      });
      // Mirror newly-SENT articles to Supabase `leads` (fire-and-forget)
      if (status === 'SENT') {
        for (const a of articles) {
          if (a.status !== 'SENT') {
            mirrorArticleToSupabase(a.id).catch((err) =>
              console.error(`[supabase-sync] background sync failed for ${a.id}:`, err),
            );
          }
        }
      }
      break;
    }
    case 'set_campaign': {
      await prisma.article.updateMany({
        where: { id: { in: articleIds } },
        data: { campaignId: (data?.campaignId as string) || null },
      });
      break;
    }
    case 'archive': {
      const articles = await prisma.article.findMany({
        where: { id: { in: articleIds } },
        select: { id: true, status: true },
      });
      await prisma.articleStatusHistory.createMany({
        data: articles.map((a) => ({
          articleId: a.id,
          fromStatus: a.status,
          toStatus: 'ARCHIVED' as const,
        })),
      });
      await prisma.article.updateMany({
        where: { id: { in: articleIds } },
        data: { status: 'ARCHIVED' },
      });
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ success: true, count: articleIds.length });
}
