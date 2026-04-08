import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@/generated/prisma';
import { extractArticleMetadata } from '@/services/crawler/article-metadata';
import { scrapeWebsiteEmails } from '@/services/crawler/website-email-scraper';

/**
 * POST /api/articles/rescrape
 * Re-scrape article pages to extract outbound links and emails.
 * Useful for articles crawled before link extraction was added.
 * Query params:
 *   - limit: max articles to process (default 50, max 200)
 *   - sourceId: optional, only process articles from this source
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const sourceId = searchParams.get('sourceId');

  try {
    // Find articles that haven't been scraped for outbound links yet
    const where: Prisma.ArticleWhereInput = {
      outboundLinks: { equals: Prisma.DbNull },
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
        message: 'No articles pending re-scrape',
        processed: 0,
      });
    }

    let processed = 0;
    let totalEmails = 0;
    let totalLinks = 0;
    let totalLinkedin = 0;
    let totalWebsiteEmails = 0;

    for (const article of articles) {
      try {
        const metadata = await extractArticleMetadata(article.url);
        if (metadata) {
          // Scrape company websites for emails if any were found
          let websiteEmails: string[] = [];
          if (metadata.companyUrls.length > 0) {
            try {
              websiteEmails = await scrapeWebsiteEmails(metadata.companyUrls);
            } catch {
              // best-effort
            }
          }

          // Merge article-page emails with website-scraped emails
          const mergedEmails = [...new Set([...metadata.scrapedEmails, ...websiteEmails])];

          await prisma.article.update({
            where: { id: article.id },
            data: {
              scrapedEmails: mergedEmails,
              outboundLinks: metadata.outboundLinks.length > 0
                ? JSON.parse(JSON.stringify(metadata.outboundLinks))
                : JSON.parse('[]'),
              linkedinUrls: metadata.linkedinUrls,
              twitterUrls: metadata.twitterUrls,
              companyUrls: metadata.companyUrls,
              websiteEmails,
              websiteEmailsScrapedAt: metadata.companyUrls.length > 0 ? new Date() : undefined,
            },
          });
          totalEmails += mergedEmails.length;
          totalLinks += metadata.outboundLinks.length;
          totalLinkedin += metadata.linkedinUrls.length;
          totalWebsiteEmails += websiteEmails.length;
          processed++;
        }
        // Polite delay
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        // Skip articles that fail
      }
    }

    return NextResponse.json({
      message: 'Re-scrape completed',
      processed,
      totalArticles: articles.length,
      totalEmails,
      totalLinks,
      totalLinkedin,
      totalWebsiteEmails,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
