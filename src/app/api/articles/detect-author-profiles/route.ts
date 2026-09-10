import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { normalizeLinkedinUrl, isAuthorLinkedinUrl } from '@/lib/utils';

export const maxDuration = 300;

// A profile appearing on this many articles by the SAME author is that
// author's own. Names alone cannot catch nicknames (Sam -> Samantha),
// initials (slkellogg653) or brand handles (artversion), but recurrence
// across one byline's articles identifies them regardless of slug.
const MIN_ARTICLES = Number(process.env.AUTHOR_PROFILE_THRESHOLD) || 3;

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * GET /api/articles/detect-author-profiles            → dry run
 * GET /api/articles/detect-author-profiles?apply=true → mark them as non-leads
 *
 * Finds LinkedIn profiles that recur across one author's articles and flags
 * them so they never count as a lead. Read-only until ?apply=true.
 */
export async function GET(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get('apply') === 'true';

  const articles = await prisma.article.findMany({
    where: { author: { not: null } },
    select: { id: true, author: true, linkedinUrls: true },
  });

  // author -> profile -> how many of their articles carry it
  const byAuthor = new Map<string, Map<string, number>>();

  for (const a of articles) {
    const author = (a.author ?? '').trim().toLowerCase();
    if (!author) continue;

    const profiles = new Set(
      asStrings(a.linkedinUrls)
        .map(normalizeLinkedinUrl)
        .filter((k): k is string => k !== null && k.startsWith('linkedin.com/in/')),
    );
    if (profiles.size === 0) continue;

    let counts = byAuthor.get(author);
    if (!counts) { counts = new Map(); byAuthor.set(author, counts); }
    for (const p of profiles) counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  const detected: { author: string; profile: string; articles: number; matchedByName: boolean }[] = [];

  for (const [author, counts] of byAuthor) {
    for (const [profile, n] of counts) {
      if (n < MIN_ARTICLES) continue;
      detected.push({
        author,
        profile,
        articles: n,
        // Whether the existing name rule already catches it, so the value
        // this pass adds on its own is visible.
        matchedByName: isAuthorLinkedinUrl(`https://www.${profile}`, author),
      });
    }
  }

  detected.sort((a, b) => b.articles - a.articles);
  const newlyFound = detected.filter((d) => !d.matchedByName);

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      authorsExamined: byAuthor.size,
      profilesDetected: detected.length,
      notAlreadyCaughtByName: newlyFound.length,
      threshold: `a profile on ${MIN_ARTICLES}+ articles by the same author`,
      examples: detected.slice(0, 20),
      note: 'Re-run with ?apply=true to flag these so they never count as a lead.',
    });
  }

  let flagged = 0;
  for (const d of detected) {
    try {
      const existing = await prisma.articleLinkedin.findUnique({
        where: { linkedinUrl: d.profile },
        select: { id: true },
      });

      if (existing) {
        await prisma.articleLinkedin.update({ where: { id: existing.id }, data: { ignored: true } });
      } else {
        // Claim it against any article carrying it, purely to hold the flag.
        const holder = articles.find((a) =>
          asStrings(a.linkedinUrls).some((u) => normalizeLinkedinUrl(u) === d.profile),
        );
        if (!holder) continue;
        await prisma.articleLinkedin.create({
          data: { articleId: holder.id, linkedinUrl: d.profile, seenCount: d.articles, ignored: true },
        });
      }
      flagged++;
    } catch (err) {
      console.error(`[detect-author-profiles] failed on ${d.profile}:`, err);
    }
  }

  return NextResponse.json({ applied: true, profilesFlagged: flagged });
}
