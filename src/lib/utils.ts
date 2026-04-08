import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import crypto from 'crypto';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize a URL for deduplication: lowercase host, remove trailing slash, strip fragments and tracking params */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    // Remove common tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
    trackingParams.forEach((p) => u.searchParams.delete(p));
    // Lowercase host
    u.hostname = u.hostname.toLowerCase();
    // Remove trailing slash
    let normalized = u.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

/** Create a hash of a normalized URL for fast dedup lookups */
export function hashUrl(url: string): string {
  const normalized = normalizeUrl(url);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/** Extract all email addresses from a string */
export function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

/** Normalize an email address */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** Check if a URL is likely a contact-related page */
export function isContactRelatedUrl(url: string): boolean {
  const contactPatterns = [
    /\/contact/i,
    /\/about/i,
    /\/team/i,
    /\/staff/i,
    /\/editorial/i,
    /\/advertise/i,
    /\/write-for-us/i,
    /\/contribute/i,
    /\/leadership/i,
    /\/imprint/i,
    /\/author/i,
    /\/people/i,
    /\/masthead/i,
  ];
  return contactPatterns.some((p) => p.test(url));
}

/** Check if a URL looks like an article (not a category/tag/archive page) */
export function isLikelyArticleUrl(url: string): boolean {
  const excludePatterns = [
    /\/category\//i,
    /\/tag\//i,
    /\/page\/\d+/i,
    /\/author\//i,
    /\/archive\//i,
    /\/wp-content\//i,
    /\/wp-admin\//i,
    /\/feed\//i,
    /\.(jpg|jpeg|png|gif|svg|css|js|pdf|xml)$/i,
    /^[^?]*\?.*p=$/i,
  ];
  return !excludePatterns.some((p) => p.test(url));
}

/** Check if two URLs are on the same domain */
export function isSameDomain(url1: string, url2: string): boolean {
  try {
    const a = new URL(url1);
    const b = new URL(url2);
    return a.hostname === b.hostname;
  } catch {
    return false;
  }
}

/** Filter out common non-personal email patterns */
export function classifyEmail(email: string): 'personal' | 'editorial' | 'generic' {
  const genericPrefixes = ['info@', 'contact@', 'hello@', 'support@', 'admin@', 'help@', 'sales@', 'noreply@', 'no-reply@', 'webmaster@'];
  const editorialPrefixes = ['editor@', 'editorial@', 'news@', 'press@', 'media@', 'pr@', 'tips@', 'submissions@', 'contribute@'];

  const lower = email.toLowerCase();
  if (genericPrefixes.some((p) => lower.startsWith(p))) return 'generic';
  if (editorialPrefixes.some((p) => lower.startsWith(p))) return 'editorial';
  return 'personal';
}

/** Format a date for display */
export function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format relative time */
export function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(d);
}
