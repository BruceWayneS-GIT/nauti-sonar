'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard,
  FileText,
  Globe,
  Megaphone,
  Users,
  Send,
  ScrollText,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/articles', label: 'Articles', icon: FileText },
  { href: '/sources', label: 'Sources', icon: Globe },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/logs', label: 'Logs', icon: ScrollText },
];

const bottomItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col bg-navy text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center px-5 border-b border-white/10">
        <Image
          src="/nauti-sonar-logo.svg"
          alt="Nauti Sonar"
          width={150}
          height={40}
          className="brightness-0 invert"
          priority
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'sidebar-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                active
                  ? 'bg-teal/15 text-white border-r-2 border-teal'
                  : 'text-white/60 hover:text-white/90'
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-teal' : 'text-white/40')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-1 border-t border-white/10 pt-3">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'sidebar-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                active ? 'bg-teal/15 text-white' : 'text-white/60 hover:text-white/90'
              )}
            >
              <Icon className="h-4 w-4 text-white/40" />
              {item.label}
            </Link>
          );
        })}

        {/* User & Logout */}
        <div className="flex items-center gap-3 px-3 py-3 mt-2">
          <div className="h-8 w-8 rounded-full bg-teal/20 flex items-center justify-center text-xs font-bold text-teal">
            NS
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white/80 truncate">Nauti Sonar</p>
            <p className="text-[10px] text-white/40 truncate">team@nautilus.co.uk</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
