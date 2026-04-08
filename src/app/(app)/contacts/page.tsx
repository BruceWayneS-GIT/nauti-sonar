'use client';

import { useEffect, useState } from 'react';
import { Plus, Users, Search, MoreHorizontal, Trash2, Mail, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/shared/loading';

interface Contact {
  id: string;
  name: string;
  email: string;
  title: string | null;
  publication: string | null;
  website: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  notes: string | null;
  _count: { outreachItems: number; campaigns: number };
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', title: '', publication: '', website: '', notes: '' });

  const fetchContacts = (q = '') => {
    const params = q ? `?search=${encodeURIComponent(q)}` : '';
    fetch(`/api/contacts${params}`).then((r) => r.json()).then(setContacts).finally(() => setLoading(false));
  };

  useEffect(() => { fetchContacts(); }, []);

  const addContact = async () => {
    await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setShowDialog(false);
    setForm({ name: '', email: '', title: '', publication: '', website: '', notes: '' });
    fetchContacts();
  };

  const deleteContact = async (id: string) => {
    if (!confirm('Delete this contact?')) return;
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    fetchContacts();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contacts</p>
        </div>
        <Button onClick={() => setShowDialog(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Contact</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search contacts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchContacts(search)} />
      </div>

      {loading ? null : contacts.length === 0 ? (
        <EmptyState icon={Users} title="No contacts yet" description="Add journalists, editors, and press contacts." action={<Button onClick={() => setShowDialog(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Contact</Button>} />
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Publication</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Outreach</th>
                <th className="w-10 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="article-row border-b last:border-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">
                    <span className="flex items-center gap-1 text-teal"><Mail className="h-3 w-3" />{c.email}</span>
                  </td>
                  <td className="p-3 text-muted-foreground">{c.title || '—'}</td>
                  <td className="p-3 text-muted-foreground">{c.publication || '—'}</td>
                  <td className="p-3 text-muted-foreground">{c._count.outreachItems} items</td>
                  <td className="p-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {c.website && <DropdownMenuItem onClick={() => window.open(c.website!, '_blank')}><ExternalLink className="h-3.5 w-3.5 mr-2" />Website</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => deleteContact(c.id)} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@publication.com" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Senior Editor" /></div>
              <div><Label>Publication</Label><Input value={form.publication} onChange={(e) => setForm({ ...form, publication: e.target.value })} placeholder="CEO Times" /></div>
            </div>
            <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={addContact} disabled={!form.name || !form.email}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
