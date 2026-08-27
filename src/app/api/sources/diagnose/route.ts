import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import * as cheerio from 'cheerio';
import { isLikelyArticleUrl } from '@/lib/utils';

export const maxDuration = 300;

const UA = 'Mozilla/5.0 (compatible; PROutreachBot/1.0; +https://example.com/bot)';

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Count usable article URLs in a sitemap, following one level of index. */
async function countSitemapArticles(url: string): Promise<number> {
  const xml = await fetchText(url);
  const $ = cheerio.load(xml, { xml: true });

  const childSitemaps = $('sitemapindex sitemap loc').map((_, el) => $(el).text().trim()).get();
  if (childSitemaps.length > 0) {
    let total = 0;
    for (const child of childSitemaps.slice(0, 3)) {
      try {
        const childXml = await fetchText(child);
        const $$ = cheerio.load(childXml, { xml: true });
        total += $$('urlset url loc')
          .map((_, el) => $$(el).text().trim())
          .get()
          .filter(isLikelyArticleUrl).length;
      } catch {
        // a child that fails does not invalidate the index
      }
    }
    return total;
  }

  return $('urlset url loc')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(isLikelyArticleUrl).length;
}

/** Count items in an RSS/Atom feed. */
async function countFeedItems(url: string): Promise<number> {
  const xml = await fetchText(url);
  const $ = cheerio.load(xml, { xml: true });
  return $('channel item').length || $('feed entry').length;
}

/**
 * GET /api/sources/diagnose?id=<sourceId>            → report only
 * GET /api/sources/diagnose?id=<sourceId>&apply=true → also save the recommendation
 * GET /api/sources/diagnose                          → diagnose every source with errors
 *
 * Works out why a source produces no articles and what would work instead:
 * checks the URL is valid, whether the site allows automated access at all,
 * which sitemap actually exists, and whether an RSS feed is available.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  const apply = request.nextUrl.searchParams.get('apply') === 'true';

  const sources = id
    ? await prisma.source.findMany({ where: { id } })
    : await prisma.source.findMany({ where: { OR: [{ errorCount: { gt: 0 } }, { articleCount: 0 }] } });

  const results = [];

  for (const source of sources) {
    const findings: string[] = [];
    let origin: string | null = null;

    // 1. Is the URL even valid?
    try {
      const parsed = new URL(source.rootUrl.trim());
      if (!parsed.origin.startsWith('http')) {
        findings.push(`Root URL has an invalid scheme "${parsed.protocol}" — likely a typo (e.g. "ttps://" instead of "https://")`);
      } else {
        origin = parsed.origin;
        if (parsed.pathname !== '/' && parsed.pathname !== '') {
          findings.push(`Root URL includes a path (${parsed.pathname}); sitemaps are looked for at ${origin}`);
        }
      }
    } catch {
      findings.push('Root URL cannot be parsed at all');
    }

    if (!origin) {
      results.push({ source: source.name, rootUrl: source.rootUrl, verdict: 'BROKEN_URL', findings, recommendation: 'Fix the Root URL on this source' });
      continue;
    }

    // 2. Does the site allow us in, and does it advertise a sitemap?
    const sitemapCandidates: string[] = [];
    let blocked = false;
    try {
      const robots = await fetchText(`${origin}/robots.txt`);
      for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) sitemapCandidates.push(m[1].trim());
      findings.push(`robots.txt reachable, declares ${sitemapCandidates.length} sitemap(s)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      findings.push(`robots.txt not reachable (${msg})`);
      if (msg.includes('403')) blocked = true;
    }

    for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/post-sitemap.xml']) {
      if (!sitemapCandidates.includes(`${origin}${path}`)) sitemapCandidates.push(`${origin}${path}`);
    }

    // 3. Which sitemap actually yields articles?
    let bestSitemap: { url: string; articles: number } | null = null;
    for (const candidate of sitemapCandidates.slice(0, 6)) {
      try {
        const count = await countSitemapArticles(candidate);
        if (count > 0) { bestSitemap = { url: candidate, articles: count }; break; }
        findings.push(`${candidate} — reachable but 0 usable article URLs`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        findings.push(`${candidate} — ${msg}`);
        if (msg.includes('403')) blocked = true;
      }
    }

    // 4. Is there an RSS feed instead?
    let bestFeed: { url: string; items: number } | null = null;
    if (!bestSitemap) {
      const feedCandidates: string[] = [];
      try {
        const html = await fetchText(origin);
        const $ = cheerio.load(html);
        $('link[rel="alternate"]').each((_, el) => {
          const type = ($(el).attr('type') || '').toLowerCase();
          const href = $(el).attr('href');
          if (!href) return;
          if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
            feedCandidates.push(href.startsWith('http') ? href : `${origin}${href.startsWith('/') ? '' : '/'}${href}`);
          }
        });
      } catch {
        // homepage unreachable — still worth trying the conventional paths
      }
      for (const path of ['/feed', '/rss', '/feed.xml', '/rss.xml']) {
        const url = `${origin}${path}`;
        if (!feedCandidates.includes(url)) feedCandidates.push(url);
      }

      for (const candidate of feedCandidates.slice(0, 6)) {
        try {
          const items = await countFeedItems(candidate);
          if (items > 0) { bestFeed = { url: candidate, items }; break; }
        } catch {
          // try the next candidate
        }
      }
    }

    // 5. Verdict and recommendation
    let verdict: string;
    let recommendation: string;
    let newMethod: 'SITEMAP' | 'RSS' | null = null;
    let newConfig: Record<string, unknown> | null = null;

    if (bestSitemap) {
      verdict = 'SITEMAP_OK';
      recommendation = `Use XML Sitemap with sitemapUrl ${bestSitemap.url} (${bestSitemap.articles}+ articles)`;
      newMethod = 'SITEMAP';
      newConfig = { ...(source.parserConfig as object || {}), sitemapUrl: bestSitemap.url };
    } else if (bestFeed) {
      verdict = 'USE_RSS';
      recommendation = `No usable sitemap, but an RSS feed works: ${bestFeed.url} (${bestFeed.items} items). Switch to RSS Feed.`;
      newMethod = 'RSS';
      newConfig = { ...(source.parserConfig as object || {}), rssUrl: bestFeed.url };
    } else if (blocked) {
      verdict = 'BLOCKED';
      recommendation = 'Site refuses automated access (HTTP 403). It cannot be crawled without circumventing its bot protection — remove or pause this source.';
    } else {
      verdict = 'NO_SOURCE_FOUND';
      recommendation = 'No sitemap or feed found. Check the Root URL, or set sitemapUrl/rssUrl manually in the parser config.';
    }

    if (apply && newMethod && newConfig) {
      await prisma.source.update({
        where: { id: source.id },
        data: {
          crawlMethod: newMethod,
          parserConfig: JSON.parse(JSON.stringify(newConfig)),
          status: 'ACTIVE',
          errorCount: 0,
        },
      });
    }

    results.push({
      source: source.name,
      rootUrl: source.rootUrl,
      currentMethod: source.crawlMethod,
      verdict,
      recommendation,
      applied: apply && Boolean(newMethod),
      findings,
    });
  }

  return NextResponse.json({
    diagnosed: results.length,
    applied: apply,
    note: apply ? undefined : 'Add &apply=true to save the recommended method and config.',
    results,
  });
}
