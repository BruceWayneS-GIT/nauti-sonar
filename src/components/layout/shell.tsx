'use client';

import { Sidebar } from './sidebar';
import { Header } from './header';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-60">
        <Header />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
