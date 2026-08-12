import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const maxDuration = 60;

/**
 * GET /api/sources/repair            → dry run
 * GET /api/sources/repair?apply=true → trims stored source names and rootUrls
 *
 * A stray space or trailing slash in rootUrl makes every crawl for that
 * source request "https://site.com /sitemap.xml" and fail with one error and
 * no articles, giving no hint as to why. Input is trimmed on create and
 * update now; this fixes what is already stored.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';

  const sources = await prisma.source.findMany({
    select: { id: true, name: true, rootUrl: true, status: true },
  });

  const dirty = sources
    .map((s) => ({
      id: s.id,
      status: s.status,
      name: s.name,
      rootUrl: s.rootUrl,
      cleanName: s.name.trim(),
      cleanRootUrl: s.rootUrl.trim().replace(/\/+$/, ''),
    }))
    .filter((s) => s.name !== s.cleanName || s.rootUrl !== s.cleanRootUrl);

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      totalSources: sources.length,
      sourcesToFix: dirty.length,
      changes: dirty.map((s) => ({
        status: s.status,
        name: s.name === s.cleanName ? s.name : `"${s.name}" -> "${s.cleanName}"`,
        rootUrl: s.rootUrl === s.cleanRootUrl ? s.rootUrl : `"${s.rootUrl}" -> "${s.cleanRootUrl}"`,
      })),
      note: 'Re-run with ?apply=true to fix these.',
    });
  }

  let fixed = 0;
  for (const s of dirty) {
    try {
      await prisma.source.update({
        where: { id: s.id },
        data: { name: s.cleanName, rootUrl: s.cleanRootUrl },
      });
      fixed++;
    } catch (err) {
      console.error(`[sources/repair] failed on ${s.id}:`, err);
    }
  }

  return NextResponse.json({ applied: true, sourcesFixed: fixed });
}
