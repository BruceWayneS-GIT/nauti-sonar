import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search') || '';
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { publication: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { outreachItems: true, campaigns: true } } },
  });
  return NextResponse.json(contacts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contact = await prisma.contact.create({
    data: {
      name: body.name,
      email: body.email,
      title: body.title || null,
      publication: body.publication || null,
      website: body.website || null,
      linkedinUrl: body.linkedinUrl || null,
      twitterUrl: body.twitterUrl || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(contact, { status: 201 });
}
