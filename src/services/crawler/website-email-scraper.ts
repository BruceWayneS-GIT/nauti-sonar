import * as cheerio from 'cheerio';
import { extractEmails } from '@/lib/utils';

/**
 * Given a list of company website URLs (from an article's outbound links),
 * visit each site's homepage + common contact pages to find email addresses.
 */
export async function scrapeWebsiteEmails(companyUrls: string[]): Promise<string[]> {
  const allEmails = new Set<string>();

  // Deduplicate by hostname — only scrape each domain once
  const seenHosts = new Set<string>();
  const uniqueUrls: string[] = [];
  for (const url of companyUrls) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (!seenHosts.has(host)) {
        seenHosts.add(host);
        uniqueUrls.push(url);
      }
    } catch {
      // skip bad URLs
    }
  }

  // Limit to 3 domains per article to avoid excessive crawling
  const urlsToScrape = uniqueUrls.slice(0, 3);

  for (const baseUrl of urlsToScrape) {
    try {
      const origin = new URL(baseUrl).origin;

      // Pages to check: the linked page itself + highest-value contact pages
      const pagesToCheck = [
        baseUrl,
        `${origin}/contact`,
        `${origin}/about`,
      ];

      for (const pageUrl of pagesToCheck) {
        try {
          const emails = await scrapePageForEmails(pageUrl);
          for (const email of emails) {
            allEmails.add(email);
          }
          // Polite delay between pages on the same domain
          await new Promise((r) => setTimeout(r, 300));
        } catch {
          // Skip pages that fail
        }
      }

      // Polite delay between domains
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // Skip domains that fail
    }
  }

  // Filter out generic/noreply emails
  return [...allEmails].filter((email) => !isGenericEmail(email));
}

/**
 * Fetch a single page and extract all email addresses from it.
 */
async function scrapePageForEmails(url: string): Promise<string[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PROutreachBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(5000),
    redirect: 'follow',
  });

  if (!response.ok) return [];

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return [];

  const html = await response.text();
  const $ = cheerio.load(html);

  const emails: string[] = [];

  // Extract from mailto: links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (email && email.includes('@')) {
      emails.push(email);
    }
  });

  // Extract from visible page text
  const bodyText = $('body').text();
  const textEmails = extractEmails(bodyText);
  for (const email of textEmails) {
    if (!emails.includes(email)) {
      emails.push(email);
    }
  }

  return [...new Set(emails)];
}

/**
 * Filter out generic/noreply email addresses that aren't useful as leads.
 */
function isGenericEmail(email: string): boolean {
  const genericPrefixes = [
    'noreply', 'no-reply', 'donotreply', 'do-not-reply',
    'mailer-daemon', 'postmaster', 'hostmaster', 'webmaster',
    'abuse', 'spam', 'unsubscribe', 'bounce',
    'newsletter', 'notifications', 'alerts', 'system',
    'auto', 'automated', 'robot',
  ];
  const localPart = email.split('@')[0].toLowerCase();
  return genericPrefixes.some((p) => localPart === p || localPart.startsWith(p + '+'));
}
