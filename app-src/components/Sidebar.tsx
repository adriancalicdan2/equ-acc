'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText, Wallet, Shield, LogOut, Menu, X, Clock,
  Briefcase, ClipboardList, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const VIEWS = [
  {
    id: 'equipment-accountability',
    label: 'Equipment Accountability',
    icon: FileText,
    href: '/dashboard/equipment-accountability',
  },
  {
    id: 'inventory',
    label: 'Inventory Control',
    icon: Briefcase,
    href: '/dashboard/inventory',
  },
  {
    id: 'petty-cash',
    label: 'Petty Cash Report',
    icon: Wallet,
    href: '/dashboard/petty-cash',
  },
  {
    id: 'time-card',
    label: 'Time Card',
    icon: Clock,
    href: '/dashboard/time-card',
  },
  {
    id: 'installation-report',
    label: 'Installation Report',
    icon: ClipboardList,
    href: '/dashboard/installation-report',
  },
  {
    id: 'admin',
    label: 'Admin Console',
    icon: Shield,
    href: '/dashboard/admin',
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, allowedViews, displayName, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const initial = displayName?.[0] || user?.email?.[0] || 'U';

  const NavContent = ({ mini, onToggle }: { mini?: boolean; onToggle?: () => void }) => (
    <>
      {/* Logo + Collapse Toggle */}
      <div className={cn(
        'flex items-center border-b border-border/40',
        mini ? 'px-3 py-5 justify-center' : 'px-4 py-4 gap-3'
      )}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          {!mini && (
            <div className="min-w-0 overflow-hidden">
              <p className="font-bold text-sm leading-tight truncate">AIMF Tech. Corp.</p>
              <p className="text-[11px] text-muted-foreground truncate">Report</p>
            </div>
          )}
        </div>
        {/* Only show ◀ button when expanded */}
        {!mini && onToggle && (
          <button
            onClick={onToggle}
            title="Collapse sidebar"
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted border border-border/80 text-foreground hover:bg-primary/20 hover:border-primary/50 hover:text-primary transition-all duration-200 shrink-0 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {!mini && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-2 mb-2">
            Views
          </p>
        )}
        {VIEWS.map((view) => {
          if (view.id === 'admin' && !isAdmin) return null;
          if (view.id !== 'admin' && !isAdmin && allowedViews && !allowedViews.includes(view.id)) return null;
          const Icon = view.icon;
          const active = pathname.startsWith(view.href);

          return (
            <Link
              key={view.id}
              href={view.href}
              onClick={() => setMobileOpen(false)}
              title={mini ? view.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 group',
                mini ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5',
                active
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0 transition-colors', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
              {!mini && (
                <>
                  <span className="truncate">{view.label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User + Sign Out */}
      <div className={cn('pb-4 border-t border-border/40 pt-3', mini ? 'px-2' : 'px-3')}>
        {!mini && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/30 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary uppercase shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{displayName || 'User'}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => signOut()}
          title={mini ? 'Sign Out' : undefined}
          className={cn(
            'flex items-center gap-2 w-full rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200',
            mini ? 'px-2 py-2 justify-center' : 'px-3 py-2'
          )}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!mini && 'Sign Out'}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col shrink-0 border-r border-border/60 bg-background/50 h-screen sticky top-0 transition-all duration-300 overflow-hidden',
          collapsed ? 'w-[56px] cursor-pointer hover:bg-muted/20' : 'w-60'
        )}
        onClick={collapsed ? () => setCollapsed(false) : undefined}
      >
        <NavContent mini={collapsed} onToggle={collapsed ? undefined : () => setCollapsed(true)} />
      </aside>

      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary-foreground" />
          </div>
          <p className="font-bold text-sm">AIMF Tech. Corp.</p>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 flex flex-col border-r border-border/60 bg-background">
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}
