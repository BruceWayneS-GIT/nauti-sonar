import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  if (body.status === 'sent' && !body.sentAt) body.sentAt = new Date();
  if (body.status === 'replied' && !body.repliedAt) body.repliedAt = new Date();
  const item = await prisma.outreachItem.update({ where: { id }, data: body });
  return NextResponse.json(item);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.outreachItem.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
