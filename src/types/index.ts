export type ArticleStatus = 'NEW' | 'REVIEWING' | 'READY' | 'SENT' | 'COMPLETED' | 'ARCHIVED';
export type ContactType = 'DIRECT_AUTHOR' | 'EDITORIAL' | 'GENERIC_INBOX' | 'CONTACT_PAGE_ONLY' | 'NONE';
export type ContactConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL' | 'NONE';
export type CrawlMethod = 'RSS' | 'SITEMAP' | 'ARCHIVE_PAGES' | 'SELECTOR_PARSER' | 'CUSTOM_PARSER';
export type SourceStatus = 'ACTIVE' | 'PAUSED' | 'ERROR';

export interface DashboardMetrics {
  totalSources: number;
  healthySources: number;
  erroredSources: number;
  totalArticles: number;
  withEmail: number;
  withContactUrl: number;
  noContact: number;
  readyForOutreach: number;
  sent: number;
  completed: number;
  completionRate: number;
  newThisWeek: number;
}

export interface ArticleFilters {
  source?: string;
  status?: ArticleStatus;
  owner?: string;
  hasEmail?: boolean;
  confidence?: ContactConfidence;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ParserConfig {
  articleSelector?: string;
  titleSelector?: string;
  authorSelector?: string;
  dateSelector?: string;
  excerptSelector?: string;
  categorySelector?: string;
  linkSelector?: string;
  paginationSelector?: string;
  archiveUrls?: string[];
  rssUrl?: string;
  sitemapUrl?: string;
}

export interface ContactConfig {
  preferredContactPaths?: string[];
  contactSelectors?: string[];
  authorLinkSelector?: string;
  skipContactDiscovery?: boolean;
}
