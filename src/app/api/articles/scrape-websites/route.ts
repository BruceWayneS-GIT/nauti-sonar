import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { scrapeWebsiteEmails } from '@/services/crawler/website-email-scraper';

/**
 * POST /api/articles/scrape-websites
 * Second-pass scrape: visit the company websites found in articles
 * and look for email addresses on their pages.
 * Query params:
 *   - limit: max articles to process (default 50, max 100)
 *   - sourceId: optional, only process articles from this source
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const sourceId = searchParams.get('sourceId');

  try {
    // Find articles that have company URLs but haven't been website-scraped yet
    const where: Record<string, unknown> = {
      companyUrls: { not: [] },
      websiteEmailsScrapedAt: null,
    };
    if (sourceId) where.sourceId = sourceId;

    const articles = await prisma.article.findMany({
      where,
      select: { id: true, companyUrls: true, scrapedEmails: true, linkedinUrls: true, twitterUrls: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (articles.length === 0) {
      return NextResponse.json({
        message: 'No articles pending website scrape',
        processed: 0,
        totalPending: 0,
      });
    }

    // Count total pending for progress reporting
    const totalPending = await prisma.article.count({ where });

    let processed = 0;
    let totalEmailsFound = 0;
    let totalArchived = 0;

    for (const article of articles) {
      try {
        const companyUrls = (article.companyUrls || []) as string[];
        const existingScrapedEmails = (article.scrapedEmails || []) as string[];
        const linkedinUrls = (article.linkedinUrls || []) as string[];
        const twitterUrls = (article.twitterUrls || []) as string[];

        const websiteEmails = await scrapeWebsiteEmails(companyUrls);

        // Merge with existing scraped emails (dedup)
        const existingEmails = new Set(existingScrapedEmails);
        const newEmails = websiteEmails.filter((e: string) => !existingEmails.has(e));
        const mergedScrapedEmails = [...existingScrapedEmails, ...newEmails];

        // Check if article has any leads after website scraping
        const hasAnyLead = mergedScrapedEmails.length > 0 ||
          linkedinUrls.length > 0 ||
          twitterUrls.length > 0 ||
          companyUrls.length > 0;

        // Auto-archive if no leads found and not already archived
        const shouldArchive = !hasAnyLead && article.status !== 'ARCHIVED';

        await prisma.article.update({
          where: { id: article.id },
          data: {
            websiteEmails,
            websiteEmailsScrapedAt: new Date(),
            scrapedEmails: mergedScrapedEmails,
            ...(shouldArchive ? { status: 'ARCHIVED', internalNotes: 'No leads found' } : {}),
          },
        });

        if (shouldArchive) {
          await prisma.articleStatusHistory.create({
            data: {
              articleId: article.id,
              fromStatus: article.status as 'NEW' | 'REVIEWING' | 'READY' | 'SENT' | 'COMPLETED' | 'ARCHIVED',
              toStatus: 'ARCHIVED',
              note: 'Auto-archived: No leads found',
            },
          });
          totalArchived++;
        }

        totalEmailsFound += websiteEmails.length;
        processed++;
      } catch {
        // Mark as scraped even on failure so we don't retry endlessly
        await prisma.article.update({
          where: { id: article.id },
          data: { websiteEmailsScrapedAt: new Date() },
        });
      }
    }

    return NextResponse.json({
      message: 'Website email scrape completed',
      processed,
      totalArticles: articles.length,
      totalPending: totalPending - articles.length,
      totalEmailsFound,
      totalArchived,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
