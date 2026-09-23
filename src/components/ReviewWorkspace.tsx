import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Eye, Images, Loader2, Maximize2, RefreshCw, Send, UploadCloud, X } from 'lucide-react';
import type { BatchCatalogueSummary, BatchViewResultResponse, CatalogueBatchSummary } from '../../shared/batchTypes.ts';
import type { ImageFilePayload } from '../../shared/types.ts';
import type { OutputType } from '../../shared/outputTypes.ts';
import { api, encodedOutputType } from '../lib/api.ts';
import { humanStatus, statusTone } from '../lib/format.ts';

const hasReviewableResult = (catalogue: BatchCatalogueSummary) => catalogue.views.some((view) => view.hasResult);

export function ReviewWorkspace({ focusBatchId, onBackToBatches }: { focusBatchId?: string; onBackToBatches: (batchId?: string) => void }) {
  const [batches, setBatches] = useState<CatalogueBatchSummary[]>([]);
  const [batchId, setBatchId] = useState(focusBatchId || '');
  const [catalogueId, setCatalogueId] = useState('');
  const [outputType, setOutputType] = useState<OutputType | null>(null);
  const [result, setResult] = useState<BatchViewResultResponse | null>(null);
  const [references, setReferences] = useState<ImageFilePayload[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const items = await api<CatalogueBatchSummary[]>('/api/batches?limit=100');
      const reviewable = items.filter((batch) => batch.catalogues.some(hasReviewableResult));
      setBatches(reviewable);
      setBatchId((current) => current && reviewable.some((item) => item.id === current) ? current : focusBatchId && reviewable.some((item) => item.id === focusBatchId) ? focusBatchId : reviewable[0]?.id || '');
      setError('');
    } catch (reason) { setError((reason as Error).message); }
  }, [focusBatchId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(load, 3000); return () => window.clearInterval(timer); }, [load]);

  const batch = batches.find((item) => item.id === batchId) || null;
  const catalogues = batch?.catalogues.filter(hasReviewableResult) || [];
  const catalogue = catalogues.find((item) => item.id === catalogueId) || catalogues[0] || null;
  const view = catalogue?.views.find((item) => item.outputType === outputType) || catalogue?.views.find((item) => item.hasResult) || null;

  useEffect(() => {
    if (catalogue && catalogue.id !== catalogueId) setCatalogueId(catalogue.id);
  }, [catalogue, catalogueId]);
  useEffect(() => {
    if (view && view.outputType !== outputType) setOutputType(view.outputType);
  }, [view, outputType]);

  useEffect(() => {
    setResult(null); setError(''); setCorrection('');
    if (!batch || !catalogue || !view?.hasResult) return;
    api<BatchViewResultResponse>(`/api/batches/${batch.id}/catalogues/${catalogue.id}/views/${encodedOutputType(view.outputType)}`)
      .then(setResult).catch((reason) => setError((reason as Error).message));
  }, [batch?.id, catalogue?.id, view?.outputType, view?.fileName, view?.status]);

  useEffect(() => { setReferences([]); setShowSources(false); }, [catalogue?.id]);

  const reviewed = useMemo(() => catalogue?.views.filter((item) => Boolean(item.approvedAt) || item.status === 'UPLOADED').length || 0, [catalogue]);

  const loadSources = async () => {
    if (!batch || !catalogue) return;
    setShowSources(true);
    if (references.length) return;
    setBusy('sources');
    try {
      const items = await Promise.all(Array.from({ length: catalogue.referenceCount }, (_, index) => api<ImageFilePayload>(`/api/batches/${batch.id}/catalogues/${catalogue.id}/references/${index}`)));
      setReferences(items);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(''); }
  };

  const mutate = async (action: 'approve' | 'retry' | 'amend') => {
    if (!batch || !catalogue || !view) return;
    const key = `${action}:${view.outputType}`;
    setBusy(key); setError(''); setNotice('');
    try {
      const init: RequestInit = { method: 'POST' };
      if (action === 'amend') {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify({ correction: correction.trim() });
      }
      const updated = await api<CatalogueBatchSummary>(`/api/batches/${batch.id}/catalogues/${catalogue.id}/views/${encodedOutputType(view.outputType)}/${action}`, init);
      setBatches((items) => items.map((item) => item.id === updated.id ? updated : item));
      setNotice(action === 'approve' ? 'Approved. Google Drive upload has been queued.' : action === 'retry' ? 'Retry queued.' : 'Amendment queued. The current result remains available until the replacement completes.');
      if (action === 'amend') setCorrection('');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(''); }
  };

  const approveAll = async () => {
    if (!batch) return;
    setBusy('approve-all'); setError(''); setNotice('');
    try {
      const updated = await api<CatalogueBatchSummary>(`/api/batches/${batch.id}/approve-all`, { method: 'POST' });
      setBatches((items) => items.map((item) => item.id === updated.id ? updated : item));
      setNotice('All successful unapproved outputs were approved. Google Drive uploads are queued.');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(''); }
  };

  const successfulUnapproved = batch?.catalogues.flatMap((item) => item.views).filter((item) => item.status === 'SUCCESS').length || 0;

  return (
    <div className="page-wrap space-y-5">
      <div className="page-heading"><div><button type="button" onClick={() => onBackToBatches(batch?.id)} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"><ArrowLeft className="h-4 w-4" />Back to batches</button><p className="eyebrow text-[var(--muted)]">Approval workspace</p><h1 className="page-title">Review</h1><p className="page-subtitle">Inspect generated views, compare source references when needed, and approve only the outputs ready for Drive.</p></div>{successfulUnapproved > 0 && <button type="button" disabled={Boolean(busy)} onClick={approveAll} className="btn-primary"><UploadCloud className="h-4 w-4" />Approve all ready ({successfulUnapproved})</button>}</div>
      {error && <div className="alert-danger">{error}</div>}
      {notice && <div className="alert-success">{notice}</div>}

      {batches.length === 0 ? <section className="panel empty-state min-h-[420px]"><Images className="h-8 w-8" /><h2 className="font-display text-xl font-semibold text-[var(--ink)]">Nothing is ready for review yet</h2><p>Generated batch outputs will appear here.</p><button type="button" onClick={() => onBackToBatches()} className="btn-secondary">Open batches</button></section> : (
        <div className="grid min-h-[640px] gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="panel p-0">
            <div className="border-b border-[var(--border)] p-4"><label htmlFor="review-batch" className="form-label">Batch</label><select id="review-batch" value={batchId} onChange={(event) => { setBatchId(event.target.value); setCatalogueId(''); setOutputType(null); }} className="form-input mt-2"><option value="" disabled>Select a batch</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.id.slice(0, 8)} · {item.catalogueCount} catalogues</option>)}</select></div>
            <div className="max-h-64 overflow-y-auto p-2 xl:max-h-[66vh]">
              <p className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Products · {catalogues.length}</p>
              {catalogues.map((item) => {
                const itemReviewed = item.views.filter((candidate) => Boolean(candidate.approvedAt) || candidate.status === 'UPLOADED').length;
                const attention = item.views.some((candidate) => candidate.status === 'FAILED');
                return <button key={item.id} type="button" onClick={() => { setCatalogueId(item.id); setOutputType(null); }} className={`mb-1 w-full rounded-xl border p-3 text-left ${catalogue?.id === item.id ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-transparent hover:bg-[var(--surface-subtle)]'}`}>
                  <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-sm font-semibold">{item.productId}</p>{item.operatorTag && <span className="mt-1 inline-block text-[11px] text-[var(--muted)]">{item.operatorTag}</span>}</div>{attention ? <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> : itemReviewed === item.views.length ? <Check className="h-4 w-4 text-emerald-600" /> : null}</div>
                  <p className="mt-2 text-[11px] text-[var(--muted)]">{itemReviewed} of {item.views.length} approved</p>
                </button>;
              })}
            </div>
          </aside>

          {batch && catalogue && view ? <section className="panel flex min-w-0 flex-col">
            <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-mono text-lg font-semibold">{catalogue.productId}</h2>{catalogue.operatorTag && <span className="tag-badge">{catalogue.operatorTag}</span>}</div><p className="mt-1 text-xs text-[var(--muted)]">{reviewed} of {catalogue.views.length} images approved</p></div>
              <button type="button" onClick={loadSources} className="btn-secondary"><Eye className="h-4 w-4" />Source photos ({catalogue.referenceCount})</button>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {catalogue.views.map((item) => <button key={item.outputType} type="button" onClick={() => setOutputType(item.outputType)} className={`min-w-max rounded-xl border px-3 py-2 text-left ${view.outputType === item.outputType ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-white'}`}><span className="block text-xs font-semibold">{item.outputType}</span><span className={`mt-1 inline-flex status-badge ${statusTone(item.status)}`}>{humanStatus(item.status)}</span></button>)}
            </div>

            <div className="mt-4 grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="image-stage group relative min-h-[360px]">
                {!result?.image && view.hasResult && <Loader2 className="h-7 w-7 animate-spin text-[var(--muted)]" />}
                {result?.image && <><img src={result.image.dataUrl} alt={`${catalogue.productId} ${view.outputType}`} className="max-h-[68vh] w-full object-contain" /><button type="button" onClick={() => setEnlarged(true)} className="absolute right-3 top-3 rounded-lg bg-black/70 p-2 text-white opacity-100 shadow lg:opacity-0 lg:group-hover:opacity-100" aria-label="Enlarge image"><Maximize2 className="h-4 w-4" /></button></>}
                {!view.hasResult && <div className="empty-state"><Images className="h-7 w-7" /><p>No generated image is available for this view.</p></div>}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4"><p className="eyebrow text-[var(--muted)]">View status</p><span className={`mt-2 status-badge ${statusTone(view.status)}`}>{humanStatus(view.status)}</span>{view.error && <p className="mt-3 text-xs leading-5 text-rose-700">{view.error}</p>}{view.storageUrl && <a href={view.storageUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">Open in Google Drive <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
                {view.status === 'SUCCESS' && <button type="button" disabled={Boolean(busy)} onClick={() => mutate('approve')} className="btn-primary w-full"><Check className="h-4 w-4" />{busy.startsWith('approve') ? 'Approving…' : 'Approve & upload'}</button>}
                {view.status === 'FAILED' && <button type="button" disabled={Boolean(busy)} onClick={() => mutate('retry')} className="btn-primary w-full"><RefreshCw className="h-4 w-4" />{busy.startsWith('retry') ? 'Queueing…' : 'Retry this view'}</button>}
                {view.hasResult && ['SUCCESS', 'APPROVED', 'UPLOADED'].includes(view.status) && <div className="space-y-2"><label htmlFor="review-correction" className="form-label">Optional amendment</label><textarea id="review-correction" value={correction} onChange={(event) => setCorrection(event.target.value)} rows={4} placeholder="Describe only the change needed…" className="form-input resize-none" /><button type="button" disabled={!correction.trim() || Boolean(busy)} onClick={() => mutate('amend')} className="btn-secondary w-full"><Send className="h-4 w-4" />{busy.startsWith('amend') ? 'Queueing…' : 'Amend / regenerate'}</button></div>}
                <p className="text-[11px] leading-5 text-[var(--muted)]">Approval is durable. Opening an image alone does not create a persistent review decision.</p>
              </div>
            </div>
          </section> : <section className="panel empty-state"><Images className="h-8 w-8" /><p>Select a product to begin review.</p></section>}
        </div>
      )}

      {showSources && <div className="fixed inset-0 z-[70] flex justify-end bg-black/35" role="dialog" aria-modal="true" aria-label="Source reference photos"><button type="button" aria-label="Close source photos" className="absolute inset-0" onClick={() => setShowSources(false)} /><aside className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="eyebrow text-[var(--muted)]">Garment authority</p><h2 className="font-display text-xl font-semibold">Source photos</h2></div><button type="button" onClick={() => setShowSources(false)} className="icon-button"><X className="h-5 w-5" /></button></div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">These original references remain the garment truth for every generated view.</p>{busy === 'sources' && <div className="empty-state py-20"><Loader2 className="h-6 w-6 animate-spin" /><p>Loading source photos…</p></div>}<div className="mt-5 grid grid-cols-2 gap-3">{references.map((item, index) => <figure key={`${item.name}-${index}`} className="overflow-hidden rounded-xl border border-[var(--border)]"><img src={item.data.startsWith('data:') ? item.data : `data:${item.mimeType};base64,${item.data}`} alt={item.name} className="aspect-[3/4] w-full object-cover" /><figcaption className="truncate p-2 text-[10px] text-[var(--muted)]">{item.name}</figcaption></figure>)}</div></aside></div>}

      {enlarged && result?.image && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 sm:p-8" role="dialog" aria-modal="true"><button type="button" onClick={() => setEnlarged(false)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"><X className="h-6 w-6" /></button><img src={result.image.dataUrl} alt={`${catalogue?.productId} enlarged`} className="max-h-full max-w-full object-contain" /></div>}
    </div>
  );
}
