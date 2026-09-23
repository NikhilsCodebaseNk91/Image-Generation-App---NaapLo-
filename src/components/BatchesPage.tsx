import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Clock3, Layers3, Pause, Play, RefreshCw, Square } from 'lucide-react';
import type { CatalogueBatchSummary } from '../../shared/batchTypes.ts';
import { api } from '../lib/api.ts';
import { formatDuration, humanStatus, shortDate, statusTone } from '../lib/format.ts';

const terminal = new Set(['COMPLETED', 'COMPLETED_WITH_FAILURES', 'CANCELLED', 'FAILED']);

const groupLabel = (status: string) => {
  if (['RUNNING', 'QUEUED'].includes(status)) return 'Active';
  if (['DRAFT', 'PAUSED'].includes(status)) return 'Saved for Later';
  if (status === 'COMPLETED') return 'Completed';
  if (['FAILED', 'COMPLETED_WITH_FAILURES', 'CANCELLED'].includes(status)) return 'Failed';
  return 'Ready for Review';
};

export function BatchesPage({ focusBatchId, onReview, onCreate }: { focusBatchId?: string; onReview: (batchId?: string) => void; onCreate: () => void }) {
  const [batches, setBatches] = useState<CatalogueBatchSummary[]>([]);
  const [selectedId, setSelectedId] = useState(focusBatchId || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try {
      const items = await api<CatalogueBatchSummary[]>('/api/batches?limit=100');
      setBatches(items);
      setSelectedId((current) => current || items[0]?.id || '');
      setError('');
    } catch (reason) { setError((reason as Error).message); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (focusBatchId) setSelectedId(focusBatchId); }, [focusBatchId]);
  useEffect(() => {
    if (!batches.some((batch) => !terminal.has(batch.status))) return;
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [batches, load]);

  const selected = batches.find((batch) => batch.id === selectedId) || null;
  const groups = useMemo(() => ['Active', 'Ready for Review', 'Saved for Later', 'Completed', 'Failed'].map((label) => ({ label, items: batches.filter((batch) => groupLabel(batch.status) === label) })).filter((group) => group.items.length > 0), [batches]);

  const action = async (name: 'pause' | 'resume' | 'cancel') => {
    if (!selected) return;
    setBusy(name); setError('');
    try {
      const updated = await api<CatalogueBatchSummary>(`/api/batches/${selected.id}/${name}`, { method: 'POST' });
      setBatches((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(''); }
  };

  return (
    <div className="page-wrap space-y-6">
      <div className="page-heading"><div><p className="eyebrow text-[var(--muted)]">Production queue</p><h1 className="page-title">Batches</h1><p className="page-subtitle">Track every catalogue batch in one place. Progress reflects completed views, not provider-native percentage.</p></div><button type="button" onClick={onCreate} className="btn-primary">Create catalogue</button></div>
      {error && <div className="alert-danger">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="panel p-0">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-4"><h2 className="font-display text-lg font-semibold">All batches</h2><button type="button" onClick={load} className="icon-button" aria-label="Refresh batches"><RefreshCw className="h-4 w-4" /></button></div>
          <div className="max-h-[72vh] overflow-y-auto p-2">
            {batches.length === 0 && <div className="empty-state py-16"><Layers3 className="h-7 w-7" /><p>No batches have been created.</p></div>}
            {groups.map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                <p className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{group.label} · {group.items.length}</p>
                <div className="space-y-1">
                  {group.items.map((batch) => (
                    <button key={batch.id} type="button" onClick={() => setSelectedId(batch.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === batch.id ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm' : 'border-transparent hover:bg-[var(--surface-subtle)]'}`}>
                      <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-sm font-semibold">{batch.id.slice(0, 8)}</p><p className="mt-1 text-xs text-[var(--muted)]">{batch.catalogueCount} catalogue{batch.catalogueCount === 1 ? '' : 's'}</p></div><span className={`status-dot ${statusTone(batch.status)}`} /></div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${batch.totalViews ? Math.round(batch.completedViews / batch.totalViews * 100) : 0}%` }} /></div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)]"><span>{batch.completedViews}/{batch.totalViews} views</span><span>{shortDate(batch.createdAt)}</span></div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {selected ? (
          <section className="space-y-4">
            <div className="panel">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl font-semibold">Batch {selected.id.slice(0, 8)}</h2><span className={`status-badge ${statusTone(selected.status)}`}>{humanStatus(selected.status)}</span></div><p className="mt-2 text-sm text-[var(--muted)]">Created {shortDate(selected.createdAt)} · {selected.catalogueCount} catalogue{selected.catalogueCount === 1 ? '' : 's'}</p></div>
                <div className="flex flex-wrap gap-2">
                  {selected.status === 'RUNNING' && <button type="button" disabled={Boolean(busy)} onClick={() => action('pause')} className="btn-secondary"><Pause className="h-4 w-4" />Pause</button>}
                  {selected.status === 'PAUSED' && <button type="button" disabled={Boolean(busy)} onClick={() => action('resume')} className="btn-primary"><Play className="h-4 w-4" />Resume</button>}
                  {!terminal.has(selected.status) && selected.status !== 'REVIEW_REQUIRED' && <button type="button" disabled={Boolean(busy)} onClick={() => action('cancel')} className="btn-danger-outline"><Square className="h-4 w-4" />Cancel</button>}
                  {selected.catalogues.some((catalogue) => catalogue.views.some((view) => view.hasResult)) && <button type="button" onClick={() => onReview(selected.id)} className="btn-primary">Review outputs <ArrowRight className="h-4 w-4" /></button>}
                </div>
              </div>

              <div className="mt-7">
                <div className="mb-2 flex items-end justify-between text-sm"><span className="font-medium">{selected.completedViews} of {selected.totalViews} views processed</span><span className="text-[var(--muted)]">{terminal.has(selected.status) || selected.status === 'REVIEW_REQUIRED' ? 'Processing finished' : formatDuration(selected.estimatedRemainingMs)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${selected.totalViews ? Math.round(selected.completedViews / selected.totalViews * 100) : 0}%` }} /></div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="compact-stat"><Clock3 /><strong>{selected.activeViews}</strong><span>Active</span></div>
                  <div className="compact-stat"><Layers3 /><strong>{selected.queuedViews}</strong><span>Waiting</span></div>
                  <div className="compact-stat"><CheckCircle2 /><strong>{selected.approvedOutputCount}</strong><span>Approved</span></div>
                  <div className="compact-stat"><CircleAlert /><strong>{selected.failedViews}</strong><span>Needs attention</span></div>
                </div>
              </div>
            </div>

            {['COMPLETED', 'REVIEW_REQUIRED', 'COMPLETED_WITH_FAILURES'].includes(selected.status) && (
              <div className={`${selected.status === 'COMPLETED_WITH_FAILURES' ? 'completion-panel-warning' : 'completion-panel'}`}>
                <div><p className="font-display text-lg font-semibold">{selected.status === 'COMPLETED_WITH_FAILURES' ? 'Generation completed with exceptions.' : `${selected.catalogueCount} catalogue${selected.catalogueCount === 1 ? ' is' : 's are'} ready for review.`}</p><p className="mt-1 text-sm opacity-75">Successful images are retained. Failed views can be retried independently in Review.</p></div>
                <button type="button" onClick={() => onReview(selected.id)} className="btn-primary">Review now</button>
              </div>
            )}

            <div className="space-y-3">
              {selected.catalogues.map((catalogue) => {
                const complete = catalogue.views.filter((view) => ['SUCCESS', 'FAILED', 'APPROVED', 'UPLOADED', 'CANCELLED'].includes(view.status)).length;
                return <div key={catalogue.id} className="panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-mono font-semibold">{catalogue.productId}</h3>{catalogue.operatorTag && <span className="tag-badge">{catalogue.operatorTag}</span>}</div><p className="mt-1 text-xs text-[var(--muted)]">{complete}/{catalogue.views.length} views processed · {catalogue.referenceCount} source image{catalogue.referenceCount === 1 ? '' : 's'}</p></div>
                  <div className="flex items-center gap-3"><span className={`status-badge ${statusTone(catalogue.status)}`}>{humanStatus(catalogue.status)}</span>{catalogue.views.some((view) => view.hasResult) && <button type="button" onClick={() => onReview(selected.id)} className="text-button">Open review <ArrowRight className="h-4 w-4" /></button>}</div>
                </div>;
              })}
            </div>
          </section>
        ) : <section className="panel empty-state min-h-[420px]"><Layers3 className="h-8 w-8" /><p>Select a batch to see its progress.</p></section>}
      </div>
    </div>
  );
}
