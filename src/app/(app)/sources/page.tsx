'use client';

import { useEffect, useState } from 'react';
import { Plus, Globe, Play, Pause, AlertTriangle, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SourceStatusDot } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/loading';
import { CRAWL_METHODS } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';

interface Source {
  id: string;
  name: string;
  rootUrl: string;
  crawlMethod: string;
  crawlFrequency: number;
  status: string;
  notes: string | null;
  lastCrawledAt: string | null;
  articleCount: number;
  errorCount: number;
  createdAt: string;
  _count: { articles: number; crawlJobs: number };
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [crawlingId, setCrawlingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '', rootUrl: '', crawlMethod: 'SITEMAP', crawlFrequency: 60, notes: '',
  });

  const fetchSources = () => {
    fetch('/api/sources').then((r) => r.json()).then(setSources).finally(() => setLoading(false));
  };

  useEffect(() => { fetchSources(); }, []);

  const addSource = async () => {
    await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    setShowAddDialog(false);
    setFormData({ name: '', rootUrl: '', crawlMethod: 'SITEMAP', crawlFrequency: 60, notes: '' });
    fetchSources();
  };

  const deleteSource = async (id: string) => {
    if (!confirm('Delete this source and all its articles?')) return;
    await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    fetchSources();
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    await fetch(`/api/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchSources();
  };

  const runCrawl = async (id: string) => {
    setCrawlingId(id);
    try {
      const res = await fetch(`/api/sources/${id}/crawl`, { method: 'POST' });
      const result = await res.json();
      alert(`Crawl complete: ${result.articlesSaved} new articles saved (${result.articlesFound} found)`);
    } catch {
      alert('Crawl failed. Check logs for details.');
    }
    setCrawlingId(null);
    fetchSources();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sources</h1>
          <p className="text-sm text-muted-foreground">{sources.length} tracked publications</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Source
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-20" /></CardContent></Card>
          ))}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState icon={Globe} title="No sources yet" description="Add a publication to start scraping articles." action={<Button onClick={() => setShowAddDialog(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Source</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map((source) => (
            <Card key={source.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <SourceStatusDot status={source.status} />
                    <CardTitle className="text-base">{source.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => runCrawl(source.id)} disabled={crawlingId === source.id}>
                        <RefreshCw className="h-3.5 w-3.5 mr-2" /> Run Crawl Now
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleStatus(source.id, source.status)}>
                        {source.status === 'ACTIVE' ? (
                          <><Pause className="h-3.5 w-3.5 mr-2" /> Pause</>
                        ) : (
                          <><Play className="h-3.5 w-3.5 mr-2" /> Resume</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => deleteSource(source.id)} className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <a href={source.rootUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal hover:underline break-all">{source.rootUrl}</a>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {CRAWL_METHODS.find((m) => m.value === source.crawlMethod)?.label || source.crawlMethod}
                  </Badge>
                  <span>Every {source.crawlFrequency}m</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{source._count.articles} articles</span>
                  {source.errorCount > 0 && (
                    <span className="text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {source.errorCount} errors
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {source.lastCrawledAt ? `Last crawled ${timeAgo(source.lastCrawledAt)}` : 'Never crawled'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => runCrawl(source.id)}
                    disabled={crawlingId === source.id}
                  >
                    {crawlingId === source.id ? (
                      <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Crawling...</>
                    ) : (
                      <><Play className="h-3 w-3 mr-1" /> Crawl</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Source Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Site Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="CEO Times" />
            </div>
            <div>
              <Label htmlFor="rootUrl">Root URL</Label>
              <Input id="rootUrl" value={formData.rootUrl} onChange={(e) => setFormData({ ...formData, rootUrl: e.target.value })} placeholder="https://ceotimes.com" />
            </div>
            <div>
              <Label>Crawl Method</Label>
              <Select value={formData.crawlMethod} onValueChange={(v) => setFormData({ ...formData, crawlMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRAWL_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="freq">Crawl Frequency (minutes)</Label>
              <Input id="freq" type="number" value={formData.crawlFrequency} onChange={(e) => setFormData({ ...formData, crawlFrequency: parseInt(e.target.value) || 60 })} />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={addSource} disabled={!formData.name || !formData.rootUrl}>Add Source</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
