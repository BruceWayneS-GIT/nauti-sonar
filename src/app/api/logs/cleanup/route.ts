import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const result = await prisma.crawlJob.updateMany({
    where: {
      status: 'RUNNING',
      startedAt: { lt: oneHourAgo },
    },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    message: `Marked ${result.count} stuck jobs as FAILED`,
  });
}
