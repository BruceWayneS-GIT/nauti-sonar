import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@/generated/prisma';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const page = parseInt(sp.get('page') || '1');
  const pageSize = Math.min(parseInt(sp.get('pageSize') || '25'), 100);
  const sortBy = sp.get('sortBy') || 'createdAt';
  const sortOrder = sp.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const search = sp.get('search') || '';
  const source = sp.get('source') || '';
  const status = sp.get('status') || '';
  const owner = sp.get('owner') || '';
  const confidence = sp.get('confidence') || '';
  const hasEmail = sp.get('hasEmail');
  const leadsFilter = sp.get('leads') || '';
  const category = sp.get('category') || '';
  const dateFrom = sp.get('dateFrom') || '';
  const dateTo = sp.get('dateTo') || '';

  const where: Prisma.ArticleWhereInput = {};

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { url: { contains: search, mode: 'insensitive' } },
      { author: { contains: search, mode: 'insensitive' } },
      { contactEmail: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (source) where.sourceId = source;
  if (status) where.status = status as Prisma.EnumArticleStatusFilter;
  if (owner) where.ownerId = owner;
  if (confidence) where.contactConfidence = confidence as Prisma.EnumContactConfidenceNullableFilter;
  if (category) where.category = { contains: category, mode: 'insensitive' };
  if (hasEmail === 'true') where.contactEmail = { not: null };
  if (hasEmail === 'false') where.contactEmail = null;
  if (leadsFilter === 'has_linkedin') where.linkedinUrls = { isEmpty: false };
  if (leadsFilter === 'has_website') where.companyUrls = { isEmpty: false };
  if (leadsFilter === 'has_twitter') where.twitterUrls = { isEmpty: false };
  if (leadsFilter === 'has_email_scraped') where.scrapedEmails = { isEmpty: false };
  if (leadsFilter === 'has_website_email') where.websiteEmails = { isEmpty: false };
  if (leadsFilter === 'has_any') {
    // Use AND to combine with existing OR (search) without conflict
    if (!where.AND) where.AND = [];
    (where.AND as Prisma.ArticleWhereInput[]).push({
      OR: [
        { linkedinUrls: { isEmpty: false } },
        { companyUrls: { isEmpty: false } },
        { twitterUrls: { isEmpty: false } },
        { scrapedEmails: { isEmpty: false } },
      ],
    });
  }
  if (leadsFilter === 'no_leads') {
    where.linkedinUrls = { isEmpty: true };
    where.companyUrls = { isEmpty: true };
    where.twitterUrls = { isEmpty: true };
    where.scrapedEmails = { isEmpty: true };
  }
  if (dateFrom) where.publishedAt = { ...((where.publishedAt as Prisma.DateTimeNullableFilter) || {}), gte: new Date(dateFrom) };
  if (dateTo) where.publishedAt = { ...((where.publishedAt as Prisma.DateTimeNullableFilter) || {}), lte: new Date(dateTo) };

  const allowedSorts = ['createdAt', 'publishedAt', 'title', 'status', 'contactConfidence', 'updatedAt'];
  const orderBy = allowedSorts.includes(sortBy) ? { [sortBy]: sortOrder } : { createdAt: 'desc' as const };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: {
        source: { select: { id: true, name: true, rootUrl: true } },
        owner: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.article.count({ where }),
  ]);

  return NextResponse.json({
    articles,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
