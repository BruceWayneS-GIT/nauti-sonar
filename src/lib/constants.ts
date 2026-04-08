export const ARTICLE_STATUSES = ['NEW', 'REVIEWING', 'READY', 'SENT', 'COMPLETED', 'ARCHIVED'] as const;

export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  NEW: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  REVIEWING: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  READY: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  SENT: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  COMPLETED: { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
  ARCHIVED: { bg: 'bg-gray-50 dark:bg-gray-800/30', text: 'text-gray-500 dark:text-gray-400', dot: 'bg-gray-400' },
};

export const CONFIDENCE_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300' },
  MEDIUM: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300' },
  LOW: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300' },
  MINIMAL: { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-300' },
  NONE: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300' },
};

export const CRAWL_METHODS = [
  { value: 'RSS', label: 'RSS Feed' },
  { value: 'SITEMAP', label: 'XML Sitemap' },
  { value: 'ARCHIVE_PAGES', label: 'Archive Pages' },
  { value: 'SELECTOR_PARSER', label: 'CSS Selector' },
  { value: 'CUSTOM_PARSER', label: 'Custom Parser' },
];

export const SOURCE_STATUSES = ['ACTIVE', 'PAUSED', 'ERROR'] as const;

export const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/our-team',
  '/staff',
  '/editorial',
  '/editorial-team',
  '/advertise',
  '/advertising',
  '/write-for-us',
  '/contribute',
  '/contributors',
  '/leadership',
  '/imprint',
  '/masthead',
];

export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/articles', label: 'Articles', icon: 'FileText' },
  { href: '/sources', label: 'Sources', icon: 'Globe' },
  { href: '/campaigns', label: 'Campaigns', icon: 'Megaphone' },
  { href: '/contacts', label: 'Contacts', icon: 'Users' },
  { href: '/outreach', label: 'Outreach', icon: 'Send' },
  { href: '/logs', label: 'Logs', icon: 'ScrollText' },
];
