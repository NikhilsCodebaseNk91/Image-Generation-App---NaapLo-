import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, Clock3, Layers3, Plus, RefreshCw } from 'lucide-react';
import type { CatalogueBatchSummary } from '../../shared/batchTypes.ts';
import type { ClientBrandConfig } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { humanStatus, shortDate, statusTone } from '../lib/format.ts';

export function HomePage({ brand, onCreate, onOpenBatches, onReview }: { brand: ClientBrandConfig; onCreate: () => void; onOpenBatches: () => void; onReview: () => void }) {
  const [batches, setBatches] = useState<CatalogueBatchSummary[]>([]);
  const [error, setError] = useState('');
  const load = () => api<CatalogueBatchSummary[]>('/api/batches?limit=8').then(setBatches).catch((reason) => setError((reason as Error).message));
  useEffect(() => { load(); }, []);

  const awareness = useMemo(() => ({
    active: batches.filter((batch) => ['RUNNING', 'QUEUED'].includes(batch.status)).length,
    review: batches.reduce((sum, batch) => sum + batch.catalogues.filter((item) => item.status === 'REVIEW_REQUIRED').length, 0),
    attention: batches.filter((batch) => ['FAILED', 'COMPLETED_WITH_FAILURES'].includes(batch.status)).length,
  }), [batches]);

  return (
    <div className="page-wrap space-y-7">
      <section className="hero-panel overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow">{brand.clientDisplayName} catalogue workspace</p>
          <h1 className="mt-3 max-w-xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">Create polished fashion catalogues from your product references.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/75 sm:text-base">Prepare a single catalogue or queue a production batch, then review and approve each output before it reaches Google Drive.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onCreate} className="btn-primary bg-white text-[var(--ink)] hover:bg-stone-100"><Plus className="h-4 w-4" />Create catalogue</button>
            <button type="button" onClick={onOpenBatches} className="btn-secondary border-white/25 bg-white/10 text-white hover:bg-white/15"><Layers3 className="h-4 w-4" />View batches</button>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true" />
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4"><div><p className="eyebrow text-[var(--muted)]">Work status</p><h2 className="section-title mt-1">What needs your attention</h2></div><button type="button" onClick={load} className="icon-button" aria-label="Refresh status"><RefreshCw className="h-4 w-4" /></button></div>
        {error ? <div className="alert-danger">{error}</div> : (
          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={onOpenBatches} className="metric-card text-left"><Clock3 className="metric-icon text-blue-700" /><span className="metric-value">{awareness.active}</span><span className="metric-label">Active batches</span></button>
            <button type="button" onClick={onReview} className="metric-card text-left"><CircleCheck className="metric-icon text-amber-700" /><span className="metric-value">{awareness.review}</span><span className="metric-label">Catalogues ready to review</span></button>
            <button type="button" onClick={onOpenBatches} className="metric-card text-left"><CircleAlert className="metric-icon text-rose-700" /><span className="metric-value">{awareness.attention}</span><span className="metric-label">Batches requiring attention</span></button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="flex items-center justify-between gap-4"><div><p className="eyebrow text-[var(--muted)]">Recent work</p><h2 className="section-title mt-1">Latest batches</h2></div><button type="button" onClick={onOpenBatches} className="text-button">See all <ArrowRight className="h-4 w-4" /></button></div>
        <div className="mt-5 divide-y divide-[var(--border)]">
          {batches.length === 0 && <div className="empty-state py-10"><Layers3 className="h-6 w-6" /><p>No batches yet. Start with your first catalogue.</p></div>}
          {batches.slice(0, 4).map((batch) => (
            <button key={batch.id} type="button" onClick={onOpenBatches} className="grid w-full gap-2 py-4 text-left transition-colors hover:bg-[var(--surface-subtle)] sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-3">
              <div><p className="font-medium">Batch {batch.id.slice(0, 8)}</p><p className="mt-1 text-xs text-[var(--muted)]">{batch.catalogueCount} catalogue{batch.catalogueCount === 1 ? '' : 's'} · {shortDate(batch.createdAt)}</p></div>
              <p className="text-xs text-[var(--muted)]">{batch.completedViews}/{batch.totalViews} views</p>
              <span className={`status-badge ${statusTone(batch.status)}`}>{humanStatus(batch.status)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
