import prisma from '@/lib/db';
import { getSupabase, getColdSupabase } from '@/lib/supabase';

/** ISO week string, e.g. "2026-W17" */
function getISOWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Shared helper to load article + resolve email/notes */
async function loadArticle(articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true, owner: true },
  });
  if (!article) return null;

  const websiteEmails = Array.isArray(article.websiteEmails) ? article.websiteEmails : [];
  const scrapedEmails = Array.isArray(article.scrapedEmails) ? article.scrapedEmails : [];
  const email =
    article.contactEmail ??
    (typeof websiteEmails[0] === 'string' ? websiteEmails[0] : null) ??
    (typeof scrapedEmails[0] === 'string' ? scrapedEmails[0] : null);

  const notes =
    [article.outreachNotes, article.internalNotes].filter(Boolean).join('\n\n') || null;

  return { article, email, notes };
}

/**
 * Mirror a Sonar article into the Supabase `leads` table (ckuxsozjfehuzomiojzy).
 * Fire-and-forget — failures are logged, never thrown.
 */
export async function mirrorArticleToSupabase(articleId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[supabase-sync] skipped — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return;
  }

  const loaded = await loadArticle(articleId);
  if (!loaded) { console.warn(`[supabase-sync] article ${articleId} not found`); return; }
  const { article, email, notes } = loaded;

  const row = {
    id: article.title,
    date: article.sentAt ? article.sentAt.toISOString().slice(0, 10) : null,
    email,
    rep: article.owner?.name ?? null,
    source: 'Nautilus Sonar',
    industry: 'PR',
    service: 'PR',
    status: 'Contacted',
    notes,
  };

  const { error } = await supabase.from('leads').insert(row);
  if (!error) return;

  if (error.code === '23505') {
    const { error: updateError } = await supabase.from('leads').update(row).eq('id', article.title);
    if (updateError) console.error('[supabase-sync] update after 23505 failed:', updateError);
    return;
  }

  console.error('[supabase-sync] insert failed:', error);
}

/**
 * Mirror a Sonar article into the cold outreach `sales_logs` table (juqhewatlcpmzwcbiifc).
 * Fire-and-forget — failures are logged, never thrown.
 */
export async function mirrorArticleToSalesLog(articleId: string): Promise<void> {
  const supabase = getColdSupabase();
  if (!supabase) {
    console.warn('[cold-sync] skipped — SUPABASE_COLD_URL / SUPABASE_COLD_SERVICE_ROLE_KEY not set');
    return;
  }

  const loaded = await loadArticle(articleId);
  if (!loaded) { console.warn(`[cold-sync] article ${articleId} not found`); return; }
  const { article, email, notes } = loaded;

  const sentAt = article.sentAt ?? new Date();

  const row = {
    id: article.title,
    date: sentAt.toISOString(),
    week_id: getISOWeekId(sentAt),
    member: article.owner?.name ?? 'Sonar',
    outcome: 'PR Pitch',
    calls: 1,
    proposals: 0,
    deals: 0,
    service: 'PR',
    revenue: 0,
    company_name: article.source?.name ?? null,
    notes,
    method: 'Email',
    email,
    phone: null,
    is_digital_prospector: false,
    is_upwork: false,
    is_nauti_sonar: true,
  };

  const { error } = await supabase.from('sales_logs').insert(row);
  if (!error) return;

  if (error.code === '23505') {
    const { error: updateError } = await supabase.from('sales_logs').update(row).eq('id', article.title);
    if (updateError) console.error('[cold-sync] update after 23505 failed:', updateError);
    return;
  }

  console.error('[cold-sync] insert failed:', error);
}
