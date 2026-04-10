import { NextRequest, NextResponse } from 'next/server';
import { runCrawl } from '@/services/crawler/crawl-engine';

export const maxDuration = 300; // 5 minutes

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await runCrawl(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
