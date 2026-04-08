import * as cheerio from 'cheerio';
import { extractEmails, classifyEmail, isSameDomain, isContactRelatedUrl } from '@/lib/utils';
import { CONTACT_PATHS } from '@/lib/constants';

export interface DiscoveredContact {
  email?: string;
  contactUrl?: string;
  discoveredOnUrl: string;
  contactType: 'DIRECT_AUTHOR' | 'EDITORIAL' | 'GENERIC_INBOX' | 'CONTACT_PAGE_ONLY' | 'NONE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL' | 'NONE';
  sourceContext: string;
  rawSnippet?: string;
}

interface ScanResult {
  contacts: DiscoveredContact[];
  contactPageUrls: string[];
  authorPageUrls: string[];
}

/**
 * Scan an HTML page for emails and contact-related links.
 */
export function scanPageForContacts(html: string, pageUrl: string, baseUrl: string): ScanResult {
  const $ = cheerio.load(html);
  const contacts: DiscoveredContact[] = [];
  const contactPageUrls: string[] = [];
  const authorPageUrls: string[] = [];
  const seenEmails = new Set<string>();

  // 1. Extract mailto: links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (email && !seenEmails.has(email) && email.includes('@')) {
      seenEmails.add(email);
      const surroundingText = $(el).parent().text().trim().slice(0, 200);
      const classification = classifyEmail(email);
      const context = detectContext($, el);

      contacts.push({
        email,
        discoveredOnUrl: pageUrl,
        contactType: classification === 'personal' ? 'DIRECT_AUTHOR' : classification === 'editorial' ? 'EDITORIAL' : 'GENERIC_INBOX',
        confidence: context === 'author_bio' ? 'HIGH' : classification === 'personal' ? 'MEDIUM' : 'LOW',
        sourceContext: context,
        rawSnippet: surroundingText,
      });
    }
  });

  // 2. Extract visible emails from page text
  const bodyText = $('body').text();
  const visibleEmails = extractEmails(bodyText);
  for (const email of visibleEmails) {
    if (!seenEmails.has(email)) {
      seenEmails.add(email);
      const classification = classifyEmail(email);

      contacts.push({
        email,
        discoveredOnUrl: pageUrl,
        contactType: classification === 'personal' ? 'DIRECT_AUTHOR' : classification === 'editorial' ? 'EDITORIAL' : 'GENERIC_INBOX',
        confidence: classification === 'personal' ? 'MEDIUM' : 'LOW',
        sourceContext: 'article_body',
        rawSnippet: findEmailContext(bodyText, email),
      });
    }
  }

  // 3. Find author page links
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().toLowerCase();
    const rel = $(el).attr('rel') || '';

    if (!href || href === '#') return;

    const fullUrl = resolveUrl(href, baseUrl);
    if (!fullUrl || !isSameDomain(fullUrl, baseUrl)) return;

    // Author links
    if (
      rel.includes('author') ||
      href.includes('/author/') ||
      href.includes('/contributor/') ||
      href.includes('/writer/')
    ) {
      authorPageUrls.push(fullUrl);
    }

    // Contact-related links
    if (isContactRelatedUrl(href) || isContactText(text)) {
      contactPageUrls.push(fullUrl);
    }
  });

  // 4. Check header/footer for contact links
  $('header a[href], footer a[href], .footer a[href], .header a[href], nav a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().toLowerCase();

    if (!href || href === '#') return;

    const fullUrl = resolveUrl(href, baseUrl);
    if (!fullUrl || !isSameDomain(fullUrl, baseUrl)) return;

    if (isContactRelatedUrl(href) || isContactText(text)) {
      if (!contactPageUrls.includes(fullUrl)) {
        contactPageUrls.push(fullUrl);
      }
    }
  });

  return {
    contacts,
    contactPageUrls: [...new Set(contactPageUrls)],
    authorPageUrls: [...new Set(authorPageUrls)],
  };
}

/**
 * Scan a contact/about page specifically for emails.
 */
export function scanContactPage(html: string, pageUrl: string, context: string): DiscoveredContact[] {
  const $ = cheerio.load(html);
  const contacts: DiscoveredContact[] = [];
  const seenEmails = new Set<string>();

  // mailto: links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (email && !seenEmails.has(email) && email.includes('@')) {
      seenEmails.add(email);
      const classification = classifyEmail(email);
      contacts.push({
        email,
        discoveredOnUrl: pageUrl,
        contactType: classification === 'personal' ? 'EDITORIAL' : classification === 'editorial' ? 'EDITORIAL' : 'GENERIC_INBOX',
        confidence: classification === 'personal' ? 'MEDIUM' : 'LOW',
        sourceContext: context,
        rawSnippet: $(el).parent().text().trim().slice(0, 200),
      });
    }
  });

  // Visible emails
  const bodyText = $('body').text();
  const emails = extractEmails(bodyText);
  for (const email of emails) {
    if (!seenEmails.has(email)) {
      seenEmails.add(email);
      const classification = classifyEmail(email);
      contacts.push({
        email,
        discoveredOnUrl: pageUrl,
        contactType: classification === 'personal' ? 'EDITORIAL' : classification === 'editorial' ? 'EDITORIAL' : 'GENERIC_INBOX',
        confidence: classification === 'personal' ? 'MEDIUM' : 'LOW',
        sourceContext: context,
        rawSnippet: findEmailContext(bodyText, email),
      });
    }
  }

  return contacts;
}

/**
 * Build a list of common contact page URLs to check for a given base URL.
 */
export function getContactPageCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/$/, '');
  return CONTACT_PATHS.map((path) => `${base}${path}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectContext($: cheerio.CheerioAPI, el: any): string {
  const parent = $(el).closest('article, .author, .bio, .author-bio, .about-author, .post-author, .byline');
  if (parent.length > 0) {
    const classes = parent.attr('class') || '';
    if (classes.match(/author|bio|byline/i)) return 'author_bio';
  }

  const footer = $(el).closest('footer, .footer');
  if (footer.length > 0) return 'footer';

  const header = $(el).closest('header, .header, nav');
  if (header.length > 0) return 'header';

  return 'article_body';
}

function isContactText(text: string): boolean {
  const contactTerms = ['contact', 'about', 'team', 'staff', 'editorial', 'advertise', 'write for us', 'contribute', 'leadership', 'imprint', 'masthead'];
  return contactTerms.some((term) => text.includes(term));
}

function findEmailContext(text: string, email: string): string {
  const idx = text.indexOf(email);
  if (idx === -1) return '';
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + email.length + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    const base = new URL(baseUrl);
    if (href.startsWith('/')) return `${base.origin}${href}`;
    return `${base.origin}/${href}`;
  } catch {
    return null;
  }
}
