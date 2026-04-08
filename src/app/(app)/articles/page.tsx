'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import {
  Search, Filter, Download, MoreHorizontal, ExternalLink,
  Mail, Link2, ChevronLeft, ChevronRight, FileText, Globe,
  CheckCircle2, RefreshCw, Archive, UserPlus, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, ConfidenceBadge } from '@/components/shared/status-badge';
import { EmptyState, TableSkeleton } from '@/components/shared/loading';
import { ARTICLE_STATUSES } from '@/lib/constants';
import { formatDate, timeAgo } from '@/lib/utils';
import { ArticleDetailDrawer } from '@/components/dashboard/article-detail-drawer';

interface Article {
  id: string;
  url: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  category: string | null;
  status: string;
  ownerId: string | null;
  outreachChannel: string | null;
  contactEmail: string | null;
  contactUrl: string | null;
  contactType: string | null;
  contactConfidence: string | null;
  contactFoundOnUrl: string | null;
  updatedAt: string;
  source: { id: string; name: string; rootUrl: string };
  owner: { id: string; name: string } | null;
  campaign: { id: string; name: string } | null;
}

interface Source { id: string; name: string }
interface User { id: string; name: string }

function ArticlesPageContent() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Source[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<string | null>(null);
  const [scrapeRunning, setScrapeRunning] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [websiteScrapeRunning, setWebsiteScrapeRunning] = useState(false);
  const [websiteScrapeStatus, setWebsiteScrapeStatus] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterHasEmail, setFilterHasEmail] = useState('');
  const [filterConfidence, setFilterConfidence] = useState('');
  const [filterLeads, setFilterLeads] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchArticles = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '25',
      sortBy,
      sortOrder,
    });
    if (search) params.set('search', search);
    if (filterSource) params.set('source', filterSource);
    if (filterStatus) params.set('status', filterStatus);
    if (filterHasEmail) params.set('hasEmail', filterHasEmail);
    if (filterConfidence) params.set('confidence', filterConfidence);
    if (filterLeads) params.set('leads', filterLeads);

    const res = await fetch(`/api/articles?${params}`);
    const data = await res.json();
    setArticles(data.articles);
    setPagination(data.pagination);
    setLoading(false);
  }, [search, filterSource, filterStatus, filterHasEmail, filterConfidence, filterLeads, sortBy, sortOrder]);

  useEffect(() => {
    fetchArticles();
    fetch('/api/sources').then((r) => r.json()).then((data) => setSources(data.map((s: Source & { _count?: unknown }) => ({ id: s.id, name: s.name }))));
    fetch('/api/users').then((r) => r.json()).then(setUsers);
  }, [fetchArticles]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === articles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articles.map((a) => a.id)));
    }
  };

  const bulkAction = async (action: string, data?: Record<string, unknown>) => {
    await fetch('/api/articles/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleIds: Array.from(selectedIds), action, data }),
    });
    setSelectedIds(new Set());
    fetchArticles(pagination.page);
  };

  const updateArticleStatus = async (id: string, status: string) => {
    await fetch(`/api/articles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchArticles(pagination.page);
  };

  const exportCsv = async () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    const res = await fetch('/api/articles/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleIds: ids }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pr-articles-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runContactDiscovery = async (articleId: string) => {
    await fetch(`/api/articles/${articleId}/contact-discovery`, { method: 'POST' });
    fetchArticles(pagination.page);
  };

  const runBulkContactDiscovery = async () => {
    setDiscoveryRunning(true);
    setDiscoveryStatus('Running contact discovery...');
    try {
      const res = await fetch('/api/contact-discovery/bulk?limit=50', { method: 'POST' });
      const data = await res.json();
      setDiscoveryStatus(`Done: ${data.processed} articles processed, ${data.emailsFound} emails found`);
      fetchArticles(pagination.page);
    } catch {
      setDiscoveryStatus('Contact discovery failed');
    } finally {
      setDiscoveryRunning(false);
      setTimeout(() => setDiscoveryStatus(null), 8000);
    }
  };

  const runWebsiteScrape = async () => {
    setWebsiteScrapeRunning(true);
    setWebsiteScrapeStatus('Scraping company websites for emails...');
    try {
      const res = await fetch('/api/articles/scrape-websites?limit=50', { method: 'POST' });
      const data = await res.json();
      setWebsiteScrapeStatus(`Done: ${data.processed} sites scraped — ${data.totalEmailsFound} emails found, ${data.totalPending} remaining`);
      fetchArticles(pagination.page);
    } catch {
      setWebsiteScrapeStatus('Website scrape failed');
    } finally {
      setWebsiteScrapeRunning(false);
      setTimeout(() => setWebsiteScrapeStatus(null), 8000);
    }
  };

  const runRescrape = async () => {
    setScrapeRunning(true);
    setScrapeStatus('Scraping links & emails...');
    try {
      const res = await fetch('/api/articles/rescrape?limit=50', { method: 'POST' });
      const data = await res.json();
      setScrapeStatus(`Done: ${data.processed} scraped — ${data.totalEmails} emails, ${data.totalLinkedin} LinkedIn, ${data.totalLinks} links`);
      fetchArticles(pagination.page);
    } catch {
      setScrapeStatus('Scrape failed');
    } finally {
      setScrapeRunning(false);
      setTimeout(() => setScrapeStatus(null), 8000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Articles</h1>
          <p className="text-sm text-muted-foreground">{pagination.total} articles in pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {(discoveryStatus || scrapeStatus || websiteScrapeStatus) && (
            <span className="text-xs text-muted-foreground mr-2">{discoveryStatus || scrapeStatus || websiteScrapeStatus}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={runRescrape}
            disabled={scrapeRunning}
          >
            <Link2 className="h-4 w-4 mr-1.5" />
            {scrapeRunning ? 'Scraping...' : 'Scrape Links'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runWebsiteScrape}
            disabled={websiteScrapeRunning}
          >
            <Globe className="h-4 w-4 mr-1.5" />
            {websiteScrapeRunning ? 'Scraping Sites...' : 'Scrape Websites'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runBulkContactDiscovery}
            disabled={discoveryRunning}
          >
            <Mail className="h-4 w-4 mr-1.5" />
            {discoveryRunning ? 'Discovering...' : 'Find Contacts'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, URL, author, email..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchArticles(1)}
          />
        </div>

        <Select value={filterSource} onValueChange={(v) => { setFilterSource(v === 'all' ? '' : v); fetchArticles(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === 'all' ? '' : v); fetchArticles(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ARTICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterHasEmail} onValueChange={(v) => { setFilterHasEmail(v === 'all' ? '' : v); fetchArticles(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Email Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Has Email</SelectItem>
            <SelectItem value="false">No Email</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterConfidence} onValueChange={(v) => { setFilterConfidence(v === 'all' ? '' : v); fetchArticles(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Confidence" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Confidence</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MINIMAL">Minimal</SelectItem>
            <SelectItem value="NONE">None</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterLeads} onValueChange={(v) => { setFilterLeads(v === 'all' ? '' : v); fetchArticles(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Leads & Links" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Articles</SelectItem>
            <SelectItem value="has_any">Has Any Lead</SelectItem>
            <SelectItem value="has_linkedin">Has LinkedIn</SelectItem>
            <SelectItem value="has_website">Has Website</SelectItem>
            <SelectItem value="has_twitter">Has Twitter/X</SelectItem>
            <SelectItem value="has_email_scraped">Has Email (Scraped)</SelectItem>
            <SelectItem value="has_website_email">Has Website Email</SelectItem>
            <SelectItem value="no_leads">No Leads</SelectItem>
          </SelectContent>
        </Select>

        {(search || filterSource || filterStatus || filterHasEmail || filterConfidence || filterLeads) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterSource(''); setFilterStatus(''); setFilterHasEmail(''); setFilterConfidence(''); setFilterLeads(''); fetchArticles(1); }}>
            <Filter className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-teal/5 border border-teal/20 rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-1 ml-4">
            <Button size="sm" variant="outline" onClick={() => bulkAction('set_status', { status: 'READY' })}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Ready
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAction('set_status', { status: 'SENT' })}>
              <Send className="h-3 w-3 mr-1" /> Mark Sent
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAction('archive')}>
              <Archive className="h-3 w-3 mr-1" /> Archive
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <UserPlus className="h-3 w-3 mr-1" /> Assign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {users.map((u) => (
                  <DropdownMenuItem key={u.id} onClick={() => bulkAction('assign_owner', { ownerId: u.id })}>
                    {u.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={10} cols={8} />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No articles found"
          description="Run a crawl from the Sources page to start discovering articles."
        />
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 p-3">
                    <Checkbox
                      checked={selectedIds.size === articles.length && articles.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer" onClick={() => { setSortBy('title'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>Title</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Source</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Author</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Contact</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Confidence</th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer" onClick={() => { setSortBy('publishedAt'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>Date</th>
                  <th className="w-10 p-3"></th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr
                    key={article.id}
                    className="article-row border-b last:border-0 cursor-pointer"
                    onClick={() => setSelectedArticle(article.id)}
                  >
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(article.id)}
                        onCheckedChange={() => toggleSelect(article.id)}
                      />
                    </td>
                    <td className="p-3 max-w-[300px]">
                      <div className="font-medium truncate">{article.title}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        {article.url}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-xs">{article.source.name}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{article.author || '—'}</td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <StatusBadge status={article.status} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {ARTICLE_STATUSES.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => updateArticleStatus(article.id, s)}>
                              <StatusBadge status={s} />
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="p-3">
                      {article.contactEmail ? (
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          <span className="text-xs truncate max-w-[160px]">{article.contactEmail}</span>
                        </div>
                      ) : article.contactUrl ? (
                        <div className="flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                          <span className="text-xs text-muted-foreground">Contact page</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <ConfidenceBadge confidence={article.contactConfidence} />
                    </td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                      {article.publishedAt ? formatDate(article.publishedAt) : timeAgo(article.updatedAt)}
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedArticle(article.id)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(article.url, '_blank')}>Open Article</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => runContactDiscovery(article.id)}>
                            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Run Contact Discovery
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {ARTICLE_STATUSES.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => updateArticleStatus(article.id, s)}>
                              Set {s.charAt(0) + s.slice(1).toLowerCase()}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between p-3 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Showing {(pagination.page - 1) * pagination.pageSize + 1}-{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={pagination.page <= 1}
                onClick={() => fetchArticles(pagination.page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs px-2">Page {pagination.page} of {pagination.totalPages}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchArticles(pagination.page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedArticle && (
        <ArticleDetailDrawer
          articleId={selectedArticle}
          onClose={() => setSelectedArticle(null)}
          onUpdate={() => fetchArticles(pagination.page)}
          users={users}
        />
      )}
    </div>
  );
}

// Dynamic import with SSR disabled to avoid Radix Select hydration mismatch
const ArticlesPage = dynamic(() => Promise.resolve(ArticlesPageContent), { ssr: false });
export default ArticlesPage;
