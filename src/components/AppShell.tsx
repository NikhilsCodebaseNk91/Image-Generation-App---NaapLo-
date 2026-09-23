import React from 'react';
import { CircleCheck, Home, Layers3, Plus, Wifi, WifiOff } from 'lucide-react';
import type { ClientBrandConfig } from '../../shared/types.ts';
import { BrandMark } from './BrandMark.tsx';

export type ProductPage = 'home' | 'create' | 'batches' | 'review';

const NAV: Array<{ id: ProductPage; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'create', label: 'Create Catalogue', icon: Plus },
  { id: 'batches', label: 'Batches', icon: Layers3 },
  { id: 'review', label: 'Review', icon: CircleCheck },
];

export function AppShell({ brand, page, onNavigate, isHealthy, children }: {
  brand: ClientBrandConfig;
  page: ProductPage;
  onNavigate: (page: ProductPage) => void;
  isHealthy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--border)] bg-[var(--surface)] px-4 py-5 lg:flex lg:flex-col">
        <BrandMark brand={brand} />
        <nav className="mt-9 space-y-1" aria-label="Primary navigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={page === id ? 'page' : undefined} className={`nav-item ${page === id ? 'nav-item-active' : ''}`}>
              <Icon className="h-[18px] w-[18px]" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--ink-soft)]">
            {isHealthy ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
            {isHealthy ? 'Workspace ready' : 'Connecting to workspace'}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">{brand.providerAttribution}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 backdrop-blur lg:ml-64">
        <div className="flex min-h-16 items-center justify-between px-4 sm:px-7 lg:px-9">
          <div className="lg:hidden"><BrandMark brand={brand} compact /></div>
          <div className="hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{NAV.find((item) => item.id === page)?.label}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs text-[var(--ink-soft)]">
            <span className={`h-2 w-2 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span>{isHealthy ? 'Ready' : 'Connecting'}</span>
          </div>
        </div>
      </header>

      <main className="pb-24 lg:ml-64 lg:pb-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-[var(--border)] bg-white px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(45,36,30,0.08)] lg:hidden" aria-label="Mobile navigation">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => onNavigate(id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium ${page === id ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--muted)]'}`}>
            <Icon className="h-5 w-5" /><span>{label === 'Create Catalogue' ? 'Create' : label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
