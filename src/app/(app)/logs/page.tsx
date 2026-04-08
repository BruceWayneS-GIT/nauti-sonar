'use client';

import { useEffect, useState } from 'react';
import { ScrollText, AlertTriangle, CheckCircle2, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/loading';
import { StatusBadge } from '@/components/shared/status-badge';
import { timeAgo, formatDate } from '@/lib/utils';

interface CrawlJob {
  id: string;
  status: string;
  type: string;
  articlesFound: number;
  articlesSaved: number;
  errorsCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  source: { name: string; rootUrl: string };
  _count: { logs: number };
}

interface CrawlLog {
  id: string;
  level: string;
  message: string;
  createdAt: string;
  crawlJob: { source: { name: string } };
}

interface ContactRun {
  id: string;
  status: string;
  pagesScanned: number;
  emailsFound: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  article: { title: string; url: string; source: { name: string } };
  _count: { findings: number };
}

interface StatusHistory {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
  article: { title: string; url: string };
  user: { name: string } | null;
}

const LEVEL_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="h-3.5 w-3.5 text-blue-500" />,
  warn: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  error: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
};

const JOB_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  RUNNING: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  COMPLETED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  FAILED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export default function LogsPage() {
  const [tab, setTab] = useState('crawl');
  const [crawlJobs, setCrawlJobs] = useState<CrawlJob[]>([]);
  const [crawlLogs, setCrawlLogs] = useState<CrawlLog[]>([]);
  const [contactRuns, setContactRuns] = useState<ContactRun[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch(`/api/logs?type=${tab}&page=${page}&pageSize=30`);
      const data = await res.json();
      setTotal(data.total);

      switch (tab) {
        case 'crawl': setCrawlJobs(data.items); break;
        case 'crawl_logs': setCrawlLogs(data.items); break;
        case 'contact_discovery': setContactRuns(data.items); break;
        case 'status_history': setStatusHistory(data.items); break;
      }
    };
    fetchData();
  }, [tab, page]);

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs & Activity</h1>
        <p className="text-sm text-muted-foreground">System activity, crawl history, and audit trail</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="crawl">Crawl Jobs</TabsTrigger>
          <TabsTrigger value="crawl_logs">Crawl Logs</TabsTrigger>
          <TabsTrigger value="contact_discovery">Contact Discovery</TabsTrigger>
          <TabsTrigger value="status_history">Status Changes</TabsTrigger>
        </TabsList>

        <TabsContent value="crawl" className="mt-4">
          {crawlJobs.length === 0 ? (
            <EmptyState icon={ScrollText} title="No crawl jobs" description="Run a crawl from the Sources page." />
          ) : (
            <div className="border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Source</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Found</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Saved</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Errors</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Started</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Duration</th>
                </tr></thead>
                <tbody>
                  {crawlJobs.map((job) => (
                    <tr key={job.id} className="border-b last:border-0 article-row">
                      <td className="p-3 font-medium">{job.source.name}</td>
                      <td className="p-3"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${JOB_STATUS_COLORS[job.status] || ''}`}>{job.status}</span></td>
                      <td className="p-3">{job.articlesFound}</td>
                      <td className="p-3 text-emerald-600">{job.articlesSaved}</td>
                      <td className="p-3">{job.errorsCount > 0 ? <span className="text-red-500">{job.errorsCount}</span> : '0'}</td>
                      <td className="p-3 text-muted-foreground text-xs">{job.startedAt ? timeAgo(job.startedAt) : '—'}</td>
                      <td className="p-3 text-muted-foreground text-xs">{job.startedAt && job.completedAt ? `${Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="crawl_logs" className="mt-4">
          {crawlLogs.length === 0 ? (
            <EmptyState icon={ScrollText} title="No crawl logs" description="Logs will appear after running a crawl." />
          ) : (
            <div className="space-y-1">
              {crawlLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 text-sm">
                  {LEVEL_ICONS[log.level] || LEVEL_ICONS.info}
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{log.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{log.crawlJob.source.name} — {timeAgo(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contact_discovery" className="mt-4">
          {contactRuns.length === 0 ? (
            <EmptyState icon={ScrollText} title="No discovery runs" description="Run contact discovery from an article." />
          ) : (
            <div className="border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Article</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Pages</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Emails</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">When</th>
                </tr></thead>
                <tbody>
                  {contactRuns.map((run) => (
                    <tr key={run.id} className="border-b last:border-0 article-row">
                      <td className="p-3 max-w-[300px]">
                        <p className="font-medium truncate">{run.article.title}</p>
                        <p className="text-xs text-muted-foreground">{run.article.source.name}</p>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 text-xs ${run.status === 'completed' ? 'text-emerald-600' : run.status === 'failed' ? 'text-red-500' : 'text-blue-500'}`}>
                          {run.status === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : null}
                          {run.status}
                        </span>
                      </td>
                      <td className="p-3">{run.pagesScanned}</td>
                      <td className="p-3">{run.emailsFound > 0 ? <span className="text-emerald-600">{run.emailsFound}</span> : '0'}</td>
                      <td className="p-3 text-muted-foreground text-xs">{timeAgo(run.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="status_history" className="mt-4">
          {statusHistory.length === 0 ? (
            <EmptyState icon={ScrollText} title="No status changes" description="Status changes will appear as articles are updated." />
          ) : (
            <div className="space-y-1">
              {statusHistory.map((h) => (
                <div key={h.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 text-sm">
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="truncate max-w-[200px] font-medium">{h.article.title}</span>
                    {h.fromStatus && <StatusBadge status={h.fromStatus} />}
                    {h.fromStatus && <span className="text-muted-foreground">→</span>}
                    <StatusBadge status={h.toStatus} />
                  </div>
                  <span className="text-xs text-muted-foreground">{h.user?.name || 'System'}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(h.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
