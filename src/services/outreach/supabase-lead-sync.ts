import prisma from '@/lib/db';
import { getSupabase } from '@/lib/supabase';

/**
 * Mirror a Sonar article into the Supabase `leads` table.
 * Called fire-and-forget from article status update handlers when an article
 * transitions to SENT. Failures are logged, never thrown.
 */
export async function mirrorArticleToSupabase(articleId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[supabase-sync] skipped — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return;
  }

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true, owner: true },
  });
  if (!article) {
    console.warn(`[supabase-sync] article ${articleId} not found`);
    return;
  }

  const websiteEmails = Array.isArray(article.websiteEmails) ? article.websiteEmails : [];
  const scrapedEmails = Array.isArray(article.scrapedEmails) ? article.scrapedEmails : [];
  const firstWebsiteEmail = typeof websiteEmails[0] === 'string' ? websiteEmails[0] : null;
  const firstScrapedEmail = typeof scrapedEmails[0] === 'string' ? scrapedEmails[0] : null;
  const email = article.contactEmail ?? firstWebsiteEmail ?? firstScrapedEmail;

  const notes =
    [article.outreachNotes, article.internalNotes].filter(Boolean).join('\n\n') || null;

  const row = {
    id: article.id,
    date: article.sentAt ? article.sentAt.toISOString().slice(0, 10) : null,
    email,
    rep: article.owner?.name ?? null,
    source: article.source?.name ?? null,
    service: article.outreachChannel ?? null,
    status: 'new',
    notes,
    // quality, originalQuality, budget, budgetRaw, industry, contactNumber → NULL
  };

  const { error } = await supabase.from('leads').insert(row);
  if (!error) return;

  // Unique-violation → update existing row by id (so re-sending doesn't dupe)
  if (error.code === '23505') {
    const { error: updateError } = await supabase.from('leads').update(row).eq('id', article.id);
    if (updateError) {
      console.error('[supabase-sync] update after 23505 failed:', updateError);
    }
    return;
  }

  console.error('[supabase-sync] insert failed:', error);
}
