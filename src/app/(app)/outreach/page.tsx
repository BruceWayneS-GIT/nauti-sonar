'use client';

import { useEffect, useState } from 'react';
import { Send, Mail, ExternalLink, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/loading';
import { formatDate, timeAgo } from '@/lib/utils';

interface OutreachItem {
  id: string;
  status: string;
  subject: string | null;
  sentAt: string | null;
  notes: string | null;
  createdAt: string;
  article: { id: string; title: string; url: string; contactEmail: string | null; source: { name: string } };
  contact: { id: string; name: string; email: string } | null;
  campaign: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
}

const STATUSES = ['queued', 'drafted', 'sent', 'replied', 'bounced'];
const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  drafted: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  sent: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  replied: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  bounced: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export default function OutreachPage() {
  const [items, setItems] = useState<OutreachItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchItems = () => {
    const params = filter ? `?status=${filter}` : '';
    fetch(`/api/outreach${params}`).then((r) => r.json()).then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, [filter]); // eslint-disable-line

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/outreach/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetchItems();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach Queue</h1>
          <p className="text-sm text-muted-foreground">{items.length} outreach items</p>
        </div>
        <Select value={filter || 'all'} onValueChange={(v) => setFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? null : items.length === 0 ? (
        <EmptyState icon={Send} title="No outreach items" description="Add articles to the outreach queue from the Articles page." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded-xl bg-card p-4 flex items-start gap-4 article-row">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] || ''}`}>
                    {item.status}
                  </span>
                  <Badge variant="secondary" className="text-xs">{item.article.source.name}</Badge>
                  {item.campaign && <Badge variant="outline" className="text-xs">{item.campaign.name}</Badge>}
                </div>
                <h3 className="font-medium text-sm">{item.article.title}</h3>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {(item.contact?.email || item.article.contactEmail) && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{item.contact?.email || item.article.contactEmail}</span>
                  )}
                  <a href={item.article.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-teal">
                    <ExternalLink className="h-3 w-3" />Article
                  </a>
                  {item.assignee && <span>Assigned: {item.assignee.name}</span>}
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(item.createdAt)}</span>
                  {item.sentAt && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Sent {formatDate(item.sentAt)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {STATUSES.filter((s) => s !== item.status).slice(0, 2).map((s) => (
                  <Button key={s} size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(item.id, s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
