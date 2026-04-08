'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Application configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crawl Settings</CardTitle>
          <CardDescription>Configure default crawler behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-crawl enabled</Label>
              <p className="text-xs text-muted-foreground">Automatically run crawls on schedule</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div>
            <Label>Default crawl interval (minutes)</Label>
            <Input type="number" defaultValue={60} className="max-w-[200px] mt-1" />
          </div>
          <div>
            <Label>Max pages per crawl</Label>
            <Input type="number" defaultValue={100} className="max-w-[200px] mt-1" />
          </div>
          <div>
            <Label>Request delay (ms)</Label>
            <Input type="number" defaultValue={500} className="max-w-[200px] mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Discovery</CardTitle>
          <CardDescription>Configure contact scanning behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-discover contacts</Label>
              <p className="text-xs text-muted-foreground">Run contact discovery after each crawl</p>
            </div>
            <Switch />
          </div>
          <div>
            <Label>Max pages to scan per article</Label>
            <Input type="number" defaultValue={5} className="max-w-[200px] mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Agent</CardTitle>
          <CardDescription>Custom user agent for crawl requests</CardDescription>
        </CardHeader>
        <CardContent>
          <Input defaultValue="Mozilla/5.0 (compatible; PROutreachBot/1.0)" className="font-mono text-xs" />
        </CardContent>
      </Card>
    </div>
  );
}
