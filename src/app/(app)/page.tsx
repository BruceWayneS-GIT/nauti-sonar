'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  Globe, FileText, Mail, Link2, AlertCircle, CheckCircle2,
  Send, Target, TrendingUp, BarChart3,
} from 'lucide-react';
import { MetricCard } from '@/components/shared/metric-card';
import { MetricsSkeleton } from '@/components/shared/loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

interface Metrics {
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
  articlesBySource: { source: string; count: number }[];
  articlesByStatus: { status: string; count: number }[];
}

const STATUS_PIE_COLORS: Record<string, string> = {
  NEW: '#3b82f6',
  REVIEWING: '#f59e0b',
  READY: '#10b981',
  SENT: '#8b5cf6',
  COMPLETED: '#14b8a6',
  ARCHIVED: '#6b7280',
};

function DashboardPageContent() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/metrics')
      .then((r) => {
        if (!r.ok) throw new Error('API error');
        return r.json();
      })
      .then(setMetrics)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Nauti Sonar overview</p>
        </div>
        <MetricsSkeleton count={8} />
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Nauti Sonar overview</p>
        </div>
        <div className="rounded-xl border bg-card p-8 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
          <h2 className="text-lg font-semibold">Database not connected</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Set up your PostgreSQL database and run the setup command to get started:
          </p>
          <pre className="text-xs bg-muted rounded-lg p-4 max-w-sm mx-auto text-left">
{`# 1. Create the database
createdb pr_outreach

# 2. Update .env with your connection string

# 3. Run setup
npm run setup

# 4. Restart the dev server
npm run dev`}
          </pre>
        </div>
      </div>
    );
  }

  const contactDiscoveryRate = metrics.totalArticles > 0
    ? Math.round(((metrics.withEmail + metrics.withContactUrl) / metrics.totalArticles) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Nauti Sonar overview — {metrics.newThisWeek} new articles this week
        </p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Articles" value={metrics.totalArticles.toLocaleString()} subtitle={`${metrics.newThisWeek} new this week`} icon={FileText} variant="teal" />
        <MetricCard title="With Email" value={metrics.withEmail.toLocaleString()} subtitle={`${metrics.totalArticles > 0 ? Math.round((metrics.withEmail / metrics.totalArticles) * 100) : 0}% of total`} icon={Mail} variant="success" />
        <MetricCard title="Ready for Outreach" value={metrics.readyForOutreach.toLocaleString()} icon={Target} variant="default" />
        <MetricCard title="Completion Rate" value={`${metrics.completionRate}%`} subtitle={`${metrics.completed} completed`} icon={CheckCircle2} variant="default" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Tracked Sources" value={metrics.totalSources} subtitle={`${metrics.healthySources} healthy`} icon={Globe} variant="default" />
        <MetricCard title="Errored Sources" value={metrics.erroredSources} icon={AlertCircle} variant={metrics.erroredSources > 0 ? 'danger' : 'default'} />
        <MetricCard title="Contact URL Only" value={metrics.withContactUrl} icon={Link2} variant="warning" />
        <MetricCard title="Sent" value={metrics.sent} icon={Send} variant="default" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-teal" />
              Articles by Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.articlesBySource.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={metrics.articlesBySource} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="source" type="category" fontSize={11} tickLine={false} axisLine={false} width={120} />
                  <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="hsl(195, 80%, 36%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">No data yet. Run a crawl to see results.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal" />
              Pipeline Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.articlesByStatus.length > 0 ? (
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie data={metrics.articlesByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {metrics.articlesByStatus.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_PIE_COLORS[entry.status] || '#6b7280'} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {metrics.articlesByStatus.map((entry) => (
                    <div key={entry.status} className="flex items-center justify-between">
                      <StatusBadge status={entry.status} />
                      <span className="text-sm font-medium">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contact Discovery Coverage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-teal" />
            Contact Discovery Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-3 rounded-full bg-muted overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${metrics.totalArticles > 0 ? (metrics.withEmail / metrics.totalArticles) * 100 : 0}%` }} />
                <div className="h-full bg-amber-400 transition-all" style={{ width: `${metrics.totalArticles > 0 ? (metrics.withContactUrl / metrics.totalArticles) * 100 : 0}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Email found ({metrics.withEmail})</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Contact URL only ({metrics.withContactUrl})</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" />No contact ({metrics.noContact})</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{contactDiscoveryRate}%</p>
              <p className="text-xs text-muted-foreground">Discovery rate</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Dynamic import with SSR disabled to avoid Recharts script tag warnings
const DashboardPage = dynamic(() => Promise.resolve(DashboardPageContent), { ssr: false });
export default DashboardPage;
