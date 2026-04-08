'use client';

import { useEffect, useState } from 'react';
import { Plus, Megaphone, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/shared/loading';
import { formatDate } from '@/lib/utils';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  _count: { articles: number; outreachItems: number; contacts: number };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  active: { label: 'Active', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  paused: { label: 'Paused', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  completed: { label: 'Completed', color: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300' },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', status: 'draft' });

  const fetchCampaigns = () => { fetch('/api/campaigns').then((r) => r.json()).then(setCampaigns).finally(() => setLoading(false)); };
  useEffect(() => { fetchCampaigns(); }, []);

  const addCampaign = async () => {
    await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setShowDialog(false);
    setForm({ name: '', description: '', status: 'draft' });
    fetchCampaigns();
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm('Delete this campaign?')) return;
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    fetchCampaigns();
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetchCampaigns();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">{campaigns.length} campaigns</p>
        </div>
        <Button onClick={() => setShowDialog(true)}><Plus className="h-4 w-4 mr-1.5" /> New Campaign</Button>
      </div>

      {loading ? null : campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign to organize your outreach efforts." action={<Button onClick={() => setShowDialog(true)}><Plus className="h-4 w-4 mr-1.5" /> New Campaign</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <Card key={c.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    {c.description && <CardDescription className="mt-1 line-clamp-2">{c.description}</CardDescription>}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {Object.entries(STATUS_LABELS).map(([key, val]) => (
                        <DropdownMenuItem key={key} onClick={() => updateStatus(c.id, key)}>Set {val.label}</DropdownMenuItem>
                      ))}
                      <DropdownMenuItem onClick={() => deleteCampaign(c.id)} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABELS[c.status]?.color || ''}`}>{STATUS_LABELS[c.status]?.label || c.status}</span>
                  {c.startDate && <span className="text-xs text-muted-foreground">{formatDate(c.startDate)} — {c.endDate ? formatDate(c.endDate) : 'ongoing'}</span>}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t">
                  <span>{c._count.articles} articles</span>
                  <span>{c._count.outreachItems} outreach items</span>
                  <span>{c._count.contacts} contacts</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q2 2026 Tech PR" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Campaign goals..." /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={addCampaign} disabled={!form.name}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
