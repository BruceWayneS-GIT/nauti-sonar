import * as cheerio from 'cheerio';
import { extractEmails } from '@/lib/utils';

export interface OutboundLink {
  url: string;
  text: string;
  type: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'website' | 'other';
}

export interface ArticleMetadata {
  title: string;
  author?: string;
  publishedAt?: Date;
  excerpt?: string;
  category?: string;
  tags?: string[];
  canonicalUrl?: string;
  scrapedEmails: string[];
  outboundLinks: OutboundLink[];
  linkedinUrls: string[];
  twitterUrls: string[];
  companyUrls: string[];
}

/**
 * Fetch an article page and extract structured metadata from it,
 * including all outbound links and emails found on the page.
 */
export async function extractArticleMetadata(url: string): Promise<ArticleMetadata | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PROutreachBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Title
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      'Untitled';

    // Author
    const author =
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('[rel="author"]').first().text().trim() ||
      $('.author, .byline, .post-author').first().text().trim().replace(/^by\s*/i, '') ||
      extractAuthorFromJsonLd($) ||
      undefined;

    // Published date
    const dateStr =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="date"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      $('time').first().text().trim() ||
      undefined;

    const publishedAt = dateStr ? parseDateSafe(dateStr) : undefined;

    // Excerpt
    const excerpt =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      undefined;

    // Category
    const category =
      $('meta[property="article:section"]').attr('content') ||
      $('.category a, .cat-links a').first().text().trim() ||
      undefined;

    // Tags
    const tags = $('meta[property="article:tag"]')
      .map((_, el) => $(el).attr('content'))
      .get()
      .filter(Boolean) as string[];

    // Canonical URL
    const canonicalUrl =
      $('link[rel="canonical"]').attr('href') ||
      $('meta[property="og:url"]').attr('content') ||
      undefined;

    // ─── Extract all emails from the page ────────────────────────────────
    const bodyText = $('body').text();
    const pageEmails = extractEmails(bodyText);

    // Also get mailto: links
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
      if (email && email.includes('@') && !pageEmails.includes(email)) {
        pageEmails.push(email);
      }
    });

    // ─── Extract all outbound links ──────────────────────────────────────
    const sourceHost = new URL(url).hostname;
    const outboundLinks: OutboundLink[] = [];
    const linkedinUrls: string[] = [];
    const twitterUrls: string[] = [];
    const companyUrls: string[] = [];
    const seenUrls = new Set<string>();

    // Collect site-wide social links from header/footer/nav so we can exclude them
    const sitewideSocialUrls = new Set<string>();
    $('header a[href], footer a[href], nav a[href], .footer a[href], .header a[href], .social a[href], .social-links a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || !href.startsWith('http')) return;
      try {
        const h = new URL(href).hostname.toLowerCase();
        if (h.includes('linkedin.com') || h.includes('twitter.com') || h.includes('x.com') ||
            h.includes('facebook.com') || h.includes('instagram.com')) {
          sitewideSocialUrls.add(href.split('?')[0]);
        }
      } catch {}
    });

    // Focus on article body content for outbound links
    // Try progressively broader selectors until we find content links
    const contentSelectorGroups = [
      '.entry-content a[href], .post-entry a[href], .inner-post-entry a[href]',
      'article a[href], .post-content a[href], .article-content a[href], .article-body a[href]',
      'main a[href], .content a[href], .post a[href]',
    ];
    let linkElements = $('__none__'); // empty selection
    for (const sel of contentSelectorGroups) {
      const found = $(sel);
      if (found.length > 0) { linkElements = found; break; }
    }
    // Fallback to all links if no content area found
    if (linkElements.length === 0) linkElements = $('a[href]');

    linkElements.each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;

      let fullUrl: string;
      try {
        fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
        const parsed = new URL(fullUrl);

        // Skip same-domain links (internal navigation)
        if (parsed.hostname === sourceHost) return;
        // Skip common non-useful domains
        if (isBoilerplateLink(parsed.hostname)) return;

        // Normalize - remove tracking params
        parsed.searchParams.delete('utm_source');
        parsed.searchParams.delete('utm_medium');
        parsed.searchParams.delete('utm_campaign');
        parsed.searchParams.delete('utm_content');
        parsed.searchParams.delete('utm_term');
        fullUrl = parsed.href;
      } catch {
        return;
      }

      // Skip share intents and social sharing URLs
      if (isShareIntent(fullUrl)) return;

      // Skip site-wide social accounts (appear in header/footer on every page)
      if (sitewideSocialUrls.has(fullUrl.split('?')[0])) return;

      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      const linkText = $(el).text().trim().slice(0, 200);
      const linkType = classifyLink(fullUrl);

      outboundLinks.push({ url: fullUrl, text: linkText, type: linkType });

      // Categorize into specific arrays
      if (linkType === 'linkedin') {
        linkedinUrls.push(fullUrl);
      } else if (linkType === 'twitter') {
        twitterUrls.push(fullUrl);
      } else if (linkType === 'website') {
        companyUrls.push(fullUrl);
      }
    });

    return {
      title: title.slice(0, 500),
      author: author ? author.slice(0, 200) : undefined,
      publishedAt,
      excerpt: excerpt ? excerpt.slice(0, 500) : undefined,
      category: category ? category.slice(0, 100) : undefined,
      tags,
      canonicalUrl,
      scrapedEmails: [...new Set(pageEmails)],
      outboundLinks,
      linkedinUrls: [...new Set(linkedinUrls)],
      twitterUrls: [...new Set(twitterUrls)],
      companyUrls: [...new Set(companyUrls)],
    };
  } catch {
    return null;
  }
}

/**
 * Classify an outbound link by its URL pattern.
 */
function classifyLink(url: string): OutboundLink['type'] {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('linkedin.com')) return 'linkedin';
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
  if (hostname.includes('facebook.com') || hostname.includes('fb.com')) return 'facebook';
  if (hostname.includes('instagram.com')) return 'instagram';

  // Skip known non-company domains
  if (isAggregatorDomain(hostname)) return 'other';

  return 'website';
}

/**
 * Returns true for boilerplate/infrastructure links we don't care about.
 */
function isBoilerplateLink(hostname: string): boolean {
  const skip = [
    'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com', 'ajax.googleapis.com', 'unpkg.com',
    'gravatar.com', 'wp.com', 'wordpress.org', 'wordpress.com',
    'w3.org', 'schema.org', 'creativecommons.org',
    'google.com', 'googletagmanager.com', 'google-analytics.com',
    'gstatic.com', 'doubleclick.net', 'googlesyndication.com',
    'facebook.net', 'fbcdn.net', 'connect.facebook.net',
    'platform.twitter.com', 'syndication.twitter.com',
    'apis.google.com', 'accounts.google.com',
    'apple.com', 'play.google.com',
    'addtoany.com', 'sharethis.com',
    'gmpg.org',
  ];
  return skip.some((s) => hostname === s || hostname.endsWith('.' + s));
}

/**
 * Returns true for domains that are aggregators/platforms, not individual companies.
 */
function isAggregatorDomain(hostname: string): boolean {
  const aggregators = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'tiktok.com',
    'reddit.com', 'pinterest.com', 'tumblr.com',
    'medium.com', 'substack.com', 'blogspot.com',
    'github.com', 'gitlab.com', 'bitbucket.org',
    'amazon.com', 'amzn.to', 'ebay.com',
    'wikipedia.org', 'wikimedia.org',
    'archive.org', 'bit.ly', 'tinyurl.com', 't.co',
  ];
  return aggregators.some((s) => hostname === s || hostname.endsWith('.' + s));
}

/**
 * Returns true for social share intent URLs (share buttons, not actual profiles).
 */
function isShareIntent(url: string): boolean {
  const patterns = [
    '/intent/tweet', '/share?', '/sharer/', '/sharer.php',
    'api.whatsapp.com', 'wa.me/',
    'telegram.me/share', 't.me/share',
    'reddit.com/submit', 'news.ycombinator.com/submitlink',
    'pinterest.com/pin/create',
    'buffer.com/add',
  ];
  return patterns.some((p) => url.includes(p));
}

function extractAuthorFromJsonLd($: cheerio.CheerioAPI): string | undefined {
  try {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const text = $(scripts[i]).html();
      if (!text) continue;
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.author) {
          if (typeof item.author === 'string') return item.author;
          if (item.author.name) return item.author.name;
          if (Array.isArray(item.author) && item.author[0]?.name) return item.author[0].name;
        }
      }
    }
  } catch {
    // ignore JSON parse errors
  }
  return undefined;
}

function parseDateSafe(dateStr: string): Date | undefined {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return undefined;
    return d;
  } catch {
    return undefined;
  }
}
