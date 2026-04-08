import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { discoverContacts } from '@/services/contact-discovery/discovery-engine';

/**
 * POST /api/contact-discovery/bulk
 * Run contact discovery on articles that haven't been checked yet.
 * Query params:
 *   - limit: max articles to process (default 50)
 *   - sourceId: optional, only process articles from this source
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
  const sourceId = searchParams.get('sourceId');

  try {
    // Find articles that haven't had contact discovery run yet
    const where: Record<string, unknown> = {
      contactLastCheckedAt: null,
    };
    if (sourceId) where.sourceId = sourceId;

    const articles = await prisma.article.findMany({
      where,
      select: { id: true, url: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (articles.length === 0) {
      return NextResponse.json({
        message: 'No articles pending contact discovery',
        processed: 0,
        emailsFound: 0,
      });
    }

    let processed = 0;
    let totalEmailsFound = 0;
    const errors: string[] = [];

    for (const article of articles) {
      try {
        const result = await discoverContacts(article.id);
        processed++;
        totalEmailsFound += result.emailsFound;
      } catch (err) {
        errors.push(`${article.url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      message: `Contact discovery completed`,
      processed,
      totalArticles: articles.length,
      emailsFound: totalEmailsFound,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
