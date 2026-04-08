import prisma from '@/lib/db';
import { normalizeEmail } from '@/lib/utils';
import { scanPageForContacts, scanContactPage, getContactPageCandidates, type DiscoveredContact } from './email-scanner';

export interface DiscoveryResult {
  runId: string;
  pagesScanned: number;
  emailsFound: number;
  bestContact: DiscoveredContact | null;
}

/**
 * Run contact discovery for a single article.
 * 1. Scan the article page for emails and contact links
 * 2. If no direct email found, follow author pages
 * 3. If still no email, follow contact-related pages
 * 4. Save all findings and update the article with the best contact
 */
export async function discoverContacts(articleId: string): Promise<DiscoveryResult> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { source: true },
  });

  const run = await prisma.contactDiscoveryRun.create({
    data: {
      articleId,
      status: 'running',
      startedAt: new Date(),
    },
  });

  const allContacts: DiscoveredContact[] = [];
  let pagesScanned = 0;

  try {
    const baseUrl = article.source.rootUrl;

    // Step 1: Scan the article page itself
    const articleHtml = await fetchPageSafe(article.url);
    if (articleHtml) {
      pagesScanned++;
      const result = scanPageForContacts(articleHtml, article.url, baseUrl);
      allContacts.push(...result.contacts);

      // Step 2: Follow author pages if no direct email found
      if (!hasPersonalEmail(allContacts) && result.authorPageUrls.length > 0) {
        for (const authorUrl of result.authorPageUrls.slice(0, 3)) {
          const authorHtml = await fetchPageSafe(authorUrl);
          if (authorHtml) {
            pagesScanned++;
            const authorContacts = scanContactPage(authorHtml, authorUrl, 'author_page');
            // Upgrade confidence for author page emails
            for (const c of authorContacts) {
              c.confidence = c.confidence === 'LOW' ? 'MEDIUM' : c.confidence;
              c.contactType = c.contactType === 'GENERIC_INBOX' ? 'EDITORIAL' : c.contactType;
            }
            allContacts.push(...authorContacts);
          }
          await politeDelay();
        }
      }

      // Step 3: Follow contact-related pages from the article
      if (!hasPersonalEmail(allContacts)) {
        const contactUrls = result.contactPageUrls.slice(0, 5);

        // Also try common contact paths for the domain
        if (contactUrls.length === 0) {
          const candidates = getContactPageCandidates(baseUrl);
          contactUrls.push(...candidates.slice(0, 5));
        }

        for (const contactUrl of contactUrls) {
          const contactHtml = await fetchPageSafe(contactUrl);
          if (contactHtml) {
            pagesScanned++;
            const context = categorizeContactPage(contactUrl);
            const pageContacts = scanContactPage(contactHtml, contactUrl, context);
            allContacts.push(...pageContacts);
          }
          await politeDelay();
        }
      }

      // If still no email found but we have contact page URLs, save the best one
      if (allContacts.length === 0 && result.contactPageUrls.length > 0) {
        allContacts.push({
          contactUrl: result.contactPageUrls[0],
          discoveredOnUrl: article.url,
          contactType: 'CONTACT_PAGE_ONLY',
          confidence: 'MINIMAL',
          sourceContext: 'contact_link',
        });
      }
    }

    // If we found nothing at all from the article page, try common contact paths
    if (allContacts.length === 0) {
      const candidates = getContactPageCandidates(baseUrl).slice(0, 5);
      for (const contactUrl of candidates) {
        const contactHtml = await fetchPageSafe(contactUrl);
        if (contactHtml) {
          pagesScanned++;
          const context = categorizeContactPage(contactUrl);
          const pageContacts = scanContactPage(contactHtml, contactUrl, context);
          allContacts.push(...pageContacts);
          if (pageContacts.length > 0) break; // Found something, stop
        }
        await politeDelay();
      }

      // Still nothing? Save the first valid contact page URL
      if (allContacts.length === 0) {
        for (const contactUrl of candidates) {
          try {
            const resp = await fetch(contactUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            if (resp.ok) {
              allContacts.push({
                contactUrl,
                discoveredOnUrl: baseUrl,
                contactType: 'CONTACT_PAGE_ONLY',
                confidence: 'MINIMAL',
                sourceContext: 'common_contact_path',
              });
              break;
            }
          } catch {
            // Page doesn't exist
          }
        }
      }
    }

    // Save findings to database
    const emailsFound = allContacts.filter((c) => c.email).length;

    for (const contact of allContacts) {
      await prisma.contactFinding.create({
        data: {
          articleId,
          sourceId: article.sourceId,
          runId: run.id,
          email: contact.email || null,
          normalizedEmail: contact.email ? normalizeEmail(contact.email) : null,
          contactUrl: contact.contactUrl || null,
          discoveredOnUrl: contact.discoveredOnUrl,
          contactType: contact.contactType,
          confidence: contact.confidence,
          sourceContext: contact.sourceContext,
          rawSnippet: contact.rawSnippet || null,
          lastVerifiedAt: new Date(),
        },
      });
    }

    // Pick the best contact and update the article
    const bestContact = pickBestContact(allContacts);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        contactEmail: bestContact?.email || null,
        contactUrl: bestContact?.contactUrl || null,
        contactType: bestContact?.contactType || 'NONE',
        contactConfidence: bestContact?.confidence || 'NONE',
        contactFoundOnUrl: bestContact?.discoveredOnUrl || null,
        contactLastCheckedAt: new Date(),
      },
    });

    // Update run
    await prisma.contactDiscoveryRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        pagesScanned,
        emailsFound,
        completedAt: new Date(),
      },
    });

    return { runId: run.id, pagesScanned, emailsFound, bestContact };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await prisma.contactDiscoveryRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        pagesScanned,
        error: errorMsg,
        completedAt: new Date(),
      },
    });

    return { runId: run.id, pagesScanned, emailsFound: 0, bestContact: null };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickBestContact(contacts: DiscoveredContact[]): DiscoveredContact | null {
  if (contacts.length === 0) return null;

  const confidenceOrder = ['HIGH', 'MEDIUM', 'LOW', 'MINIMAL', 'NONE'];
  const typeOrder = ['DIRECT_AUTHOR', 'EDITORIAL', 'GENERIC_INBOX', 'CONTACT_PAGE_ONLY', 'NONE'];

  return contacts.sort((a, b) => {
    // Prefer contacts with emails
    if (a.email && !b.email) return -1;
    if (!a.email && b.email) return 1;

    // Then by confidence
    const confDiff = confidenceOrder.indexOf(a.confidence) - confidenceOrder.indexOf(b.confidence);
    if (confDiff !== 0) return confDiff;

    // Then by type
    return typeOrder.indexOf(a.contactType) - typeOrder.indexOf(b.contactType);
  })[0];
}

function hasPersonalEmail(contacts: DiscoveredContact[]): boolean {
  return contacts.some((c) => c.email && (c.contactType === 'DIRECT_AUTHOR' || c.confidence === 'HIGH'));
}

function categorizeContactPage(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('/team') || lower.includes('/staff')) return 'team_page';
  if (lower.includes('/about')) return 'about_page';
  if (lower.includes('/contact')) return 'contact_page';
  if (lower.includes('/editorial')) return 'editorial_page';
  if (lower.includes('/advertise')) return 'advertise_page';
  if (lower.includes('/author')) return 'author_page';
  return 'contact_page';
}

async function fetchPageSafe(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PROutreachBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;
    return response.text();
  } catch {
    return null;
  }
}

async function politeDelay(): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
}
