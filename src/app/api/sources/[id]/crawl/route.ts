import { NextRequest, NextResponse } from 'next/server';
import { runCrawl } from '@/services/crawler/crawl-engine';

export const maxDuration = 300;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Start the crawl in the background — respond immediately so the request doesn't timeout
    runCrawl(id).catch((err) => {
      console.error(`Background crawl failed for source ${id}:`, err);
    });

    return NextResponse.json({
      message: 'Crawl started — check the Logs page for progress',
      sourceId: id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
