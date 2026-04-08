'use client';

import { useEffect, useState } from 'react';
import { X, ExternalLink, Mail, Link2, RefreshCw, Clock, User, Globe, Users, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge, ConfidenceBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/shared/loading';
import { ARTICLE_STATUSES } from '@/lib/constants';
import { formatDate, timeAgo } from '@/lib/utils';

interface Props {
  articleId: string;
  onClose: () => void;
  onUpdate: () => void;
  users: { id: string; name: string }[];
}

interface ArticleDetail {
  id: string;
  url: string;
  canonicalUrl: string | null;
  title: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: string | null;
  category: string | null;
  tags: string[];
  status: string;
  priority: number;
  outreachNotes: string | null;
  internalNotes: string | null;
  scrapedEmails: string[];
  outboundLinks: { url: string; text: string; type: string }[] | null;
  linkedinUrls: string[];
  twitterUrls: string[];
  companyUrls: string[];
  websiteEmails: string[];
  contactEmail: string | null;
  contactUrl: string | null;
  contactType: string | null;
  contactConfidence: string | null;
  contactFoundOnUrl: string | null;
  contactLastCheckedAt: string | null;
  sentAt: string | null;
  source: { id: string; name: string; rootUrl: string };
  owner: { id: string; name: string } | null;
  campaign: { id: string; name: string } | null;
  contactFindings: {
    id: string;
    email: string | null;
    contactUrl: string | null;
    discoveredOnUrl: string;
    contactType: string;
    confidence: string;
    sourceContext: string;
    rawSnippet: string | null;
    createdAt: string;
  }[];
  statusHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
    user: { name: string } | null;
  }[];
}

export function ArticleDetailDrawer({ articleId, onClose, onUpdate, users }: Props) {
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/articles/${articleId}`)
      .then((r) => r.json())
      .then(setArticle)
      .finally(() => setLoading(false));
  }, [articleId]);

  const updateField = async (data: Record<string, unknown>) => {
    await fetch(`/api/articles/${articleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const res = await fetch(`/api/articles/${articleId}`);
    setArticle(await res.json());
    onUpdate();
  };

  const runDiscovery = async () => {
    setDiscovering(true);
    await fetch(`/api/articles/${articleId}/contact-discovery`, { method: 'POST' });
    const res = await fetch(`/api/articles/${articleId}`);
    setArticle(await res.json());
    setDiscovering(false);
    onUpdate();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[520px] border-l bg-card shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-sm font-semibold">Article Details</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : article ? (
          <>
            {/* Title & URL */}
            <div>
              <h3 className="font-semibold text-lg leading-tight">{article.title}</h3>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal hover:underline flex items-center gap-1 mt-1"
              >
                <ExternalLink className="h-3 w-3" />
                {article.url}
              </a>
              {article.excerpt && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{article.excerpt}</p>
              )}
            </div>

            {/* Meta Row */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" />{article.source.name}</Badge>
              {article.author && <Badge variant="secondary" className="gap-1"><User className="h-3 w-3" />{article.author}</Badge>}
              {article.category && <Badge variant="outline">{article.category}</Badge>}
              {article.tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
            </div>

            <Separator />

            {/* Status & Assignment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
                <Select value={article.status} onValueChange={(v) => updateField({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARTICLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Assigned To</label>
                <Select value={article.owner?.id || 'unassigned'} onValueChange={(v) => updateField({ ownerId: v === 'unassigned' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Contact Discovery */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">Contact Discovery</h4>
                <Button size="sm" variant="outline" onClick={runDiscovery} disabled={discovering}>
                  <RefreshCw className={`h-3 w-3 mr-1.5 ${discovering ? 'animate-spin' : ''}`} />
                  {discovering ? 'Scanning...' : 'Run Discovery'}
                </Button>
              </div>

              {article.contactEmail ? (
                <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">{article.contactEmail}</span>
                    <ConfidenceBadge confidence={article.contactConfidence} />
                  </div>
                  {article.contactFoundOnUrl && (
                    <p className="text-xs text-muted-foreground">
                      Found on: <a href={article.contactFoundOnUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">{article.contactFoundOnUrl}</a>
                    </p>
                  )}
                  {article.contactType && (
                    <Badge variant="outline" className="text-xs">{article.contactType.replace(/_/g, ' ')}</Badge>
                  )}
                </div>
              ) : article.contactUrl ? (
                <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-muted-foreground">No email found. Contact page:</span>
                  </div>
                  <a href={article.contactUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal hover:underline break-all">
                    {article.contactUrl}
                  </a>
                </div>
              ) : (
                <div className="rounded-lg border p-3 text-center text-sm text-muted-foreground">
                  No contact information discovered yet.
                </div>
              )}

              {article.contactLastCheckedAt && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Last checked {timeAgo(article.contactLastCheckedAt)}
                </p>
              )}
            </div>

            <Separator />

            {/* Tabs for Findings & History */}
            <Tabs defaultValue="leads">
              <TabsList className="w-full">
                <TabsTrigger value="leads" className="flex-1">Leads & Links</TabsTrigger>
                <TabsTrigger value="findings" className="flex-1">Findings ({article.contactFindings.length})</TabsTrigger>
                <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
                <TabsTrigger value="notes" className="flex-1">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="leads" className="space-y-4 mt-3">
                {/* Scraped Emails */}
                {article.scrapedEmails?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                      <Mail className="h-3 w-3" /> Emails Found ({article.scrapedEmails.length})
                    </h5>
                    <div className="space-y-1">
                      {article.scrapedEmails.map((email) => (
                        <a
                          key={email}
                          href={`mailto:${email}`}
                          className="flex items-center gap-2 text-sm p-2 rounded-md border hover:bg-muted/50 transition-colors"
                        >
                          <Mail className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          <span className="truncate">{email}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Website-Scraped Emails */}
                {article.websiteEmails?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                      <Globe className="h-3 w-3" /> Emails from Websites ({article.websiteEmails.length})
                    </h5>
                    <div className="space-y-1">
                      {article.websiteEmails.map((email) => (
                        <a
                          key={email}
                          href={`mailto:${email}`}
                          className="flex items-center gap-2 text-sm p-2 rounded-md border hover:bg-muted/50 transition-colors"
                        >
                          <Mail className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                          <span className="truncate">{email}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* LinkedIn URLs */}
                {article.linkedinUrls?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> LinkedIn ({article.linkedinUrls.length})
                    </h5>
                    <div className="space-y-1">
                      {article.linkedinUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm p-2 rounded-md border hover:bg-muted/50 transition-colors"
                        >
                          <Users className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                          <span className="truncate text-xs">{url.replace('https://www.linkedin.com/', '').replace('https://linkedin.com/', '')}</span>
                          <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Twitter URLs */}
                {article.twitterUrls?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                      <AtSign className="h-3 w-3" /> Twitter / X ({article.twitterUrls.length})
                    </h5>
                    <div className="space-y-1">
                      {article.twitterUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm p-2 rounded-md border hover:bg-muted/50 transition-colors"
                        >
                          <AtSign className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
                          <span className="truncate text-xs">{url.replace('https://twitter.com/', '@').replace('https://x.com/', '@')}</span>
                          <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Company / Website URLs */}
                {article.companyUrls?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                      <Globe className="h-3 w-3" /> Websites ({article.companyUrls.length})
                    </h5>
                    <div className="space-y-1">
                      {article.companyUrls.map((url) => {
                        let display = url;
                        try { display = new URL(url).hostname; } catch {}
                        return (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm p-2 rounded-md border hover:bg-muted/50 transition-colors"
                          >
                            <Globe className="h-3.5 w-3.5 text-teal flex-shrink-0" />
                            <span className="truncate text-xs">{display}</span>
                            <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {(!article.scrapedEmails?.length && !article.websiteEmails?.length && !article.linkedinUrls?.length && !article.twitterUrls?.length && !article.companyUrls?.length) && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No outbound links or emails scraped yet. Re-crawl this article to extract links.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="findings" className="space-y-2 mt-3">
                {article.contactFindings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No findings yet. Run contact discovery.</p>
                ) : (
                  article.contactFindings.map((f) => (
                    <div key={f.id} className="rounded-lg border p-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        {f.email ? (
                          <span className="font-medium flex items-center gap-1"><Mail className="h-3 w-3" />{f.email}</span>
                        ) : f.contactUrl ? (
                          <span className="text-muted-foreground flex items-center gap-1"><Link2 className="h-3 w-3" />{f.contactUrl}</span>
                        ) : null}
                        <ConfidenceBadge confidence={f.confidence} />
                      </div>
                      <p className="text-muted-foreground">Source: {f.sourceContext.replace(/_/g, ' ')}</p>
                      <p className="text-muted-foreground truncate">Found on: {f.discoveredOnUrl}</p>
                      {f.rawSnippet && <p className="text-muted-foreground italic line-clamp-2">&ldquo;{f.rawSnippet}&rdquo;</p>}
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="history" className="space-y-2 mt-3">
                {article.statusHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No status changes yet.</p>
                ) : (
                  article.statusHistory.map((h) => (
                    <div key={h.id} className="flex items-center gap-3 text-xs py-2 border-b last:border-0">
                      <div className="flex-1">
                        {h.fromStatus && <StatusBadge status={h.fromStatus} />}
                        {h.fromStatus && <span className="mx-1.5 text-muted-foreground">→</span>}
                        <StatusBadge status={h.toStatus} />
                      </div>
                      <span className="text-muted-foreground">{h.user?.name || 'System'}</span>
                      <span className="text-muted-foreground">{timeAgo(h.createdAt)}</span>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="notes" className="space-y-3 mt-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Internal Notes</label>
                  <Textarea
                    defaultValue={article.internalNotes || ''}
                    placeholder="Internal team notes..."
                    className="text-sm"
                    onBlur={(e) => updateField({ internalNotes: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Outreach Notes</label>
                  <Textarea
                    defaultValue={article.outreachNotes || ''}
                    placeholder="Notes for outreach..."
                    className="text-sm"
                    onBlur={(e) => updateField({ outreachNotes: e.target.value })}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Article not found.</p>
        )}
      </div>
    </div>
  );
}
