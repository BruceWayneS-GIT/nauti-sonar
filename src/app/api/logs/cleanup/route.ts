import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const result = await prisma.crawlJob.updateMany({
    where: {
      status: 'RUNNING',
      OR: [
        { startedAt: { lt: tenMinutesAgo } },
        { startedAt: null },
      ],
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
