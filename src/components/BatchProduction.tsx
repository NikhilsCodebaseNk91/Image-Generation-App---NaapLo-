import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clock3, Eye, Loader2, Pause, Play, RefreshCw, Send, Square, UploadCloud } from 'lucide-react';
import type { AddBatchCatalogueRequest, BatchCatalogueSummary, BatchQuality, BatchViewResultResponse, CatalogueBatchSummary, CreateCatalogueBatchRequest } from '../../shared/batchTypes.ts';
import { OUTPUT_TYPES, type OutputType } from '../../shared/outputTypes.ts';
import type { ImageFilePayload } from '../../shared/types.ts';
import { ImageUploader } from './ImageUploader.tsx';
import { OutputTypeSelector } from './OutputTypeSelector.tsx';

interface DraftCard {
  key: number;
  productId: string;
  operatorTag: string;
  referenceImages: ImageFilePayload[];
  outputTypes: OutputType[];
  closeUpTarget: string;
  instructions: string;
  quality: BatchQuality;
}

const newCard = (key: number, outputTypes: OutputType[], quality: BatchQuality, closeUpTarget = ''): DraftCard => ({ key, productId: '', operatorTag: '', referenceImages: [], outputTypes: [...outputTypes], closeUpTarget, instructions: '', quality });
const encodedType = (type: OutputType) => encodeURIComponent(type);
const terminalBatch = new Set(['COMPLETED', 'COMPLETED_WITH_FAILURES', 'CANCELLED', 'FAILED']);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'The batch request failed.');
  return data;
}

const formatDuration = (milliseconds: number) => {
  if (milliseconds <= 0) return 'Calculating…';
  const minutes = Math.ceil(milliseconds / 60000);
  return minutes < 60 ? `about ${minutes} min` : `about ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const statusTone = (status: string) => status === 'UPLOADED' || status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
  : status === 'FAILED' || status === 'COMPLETED_WITH_FAILURES' ? 'bg-red-50 text-red-800 border-red-200'
  : status === 'SUCCESS' || status === 'REVIEW_REQUIRED' ? 'bg-amber-50 text-amber-800 border-amber-200'
  : status === 'GENERATING' || status === 'RUNNING' || status === 'UPLOADING' ? 'bg-blue-50 text-blue-800 border-blue-200'
  : 'bg-stone-50 text-stone-700 border-stone-200';

export function BatchProduction() {
  const [count, setCount] = useState(3);
  const [countInput, setCountInput] = useState('3');
  const [defaultViews, setDefaultViews] = useState<OutputType[]>(['FRONT VIEW']);
  const [defaultQuality, setDefaultQuality] = useState<BatchQuality>('draft');
  const [defaultCloseUpTarget, setDefaultCloseUpTarget] = useState('');
  const [cards, setCards] = useState<DraftCard[]>(() => Array.from({ length: 3 }, (_, index) => newCard(index, ['FRONT VIEW'], 'draft')));
  const [expanded, setExpanded] = useState<number | null>(0);
  const [batch, setBatch] = useState<CatalogueBatchSummary | null>(null);
  const [review, setReview] = useState<BatchViewResultResponse | null>(null);
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparingProgress, setPreparingProgress] = useState(0);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<CatalogueBatchSummary[]>('/api/batches?limit=10').then((items) => {
      const resumable = items.find((item) => ['RUNNING', 'PAUSED', 'QUEUED', 'REVIEW_REQUIRED'].includes(item.status));
      if (resumable) setBatch(resumable);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!batch || terminalBatch.has(batch.status) || batch.status === 'PAUSED') return;
    const timer = window.setInterval(() => {
      api<CatalogueBatchSummary>(`/api/batches/${batch.id}`).then(setBatch).catch((reason) => setError(reason.message));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [batch?.id, batch?.status]);

  const activeCards = useMemo(() => cards.slice(0, count), [cards, count]);
  const applyCount = () => {
    const parsed = Number.parseInt(countInput, 10);
    if (!Number.isFinite(parsed)) { setCountInput(String(count)); return; }
    const safe = Math.max(1, Math.min(30, parsed));
    setCount(safe);
    setCountInput(String(safe));
    setCards((current) => current.length >= safe ? current : Array.from({ length: safe }, (_, index) => current[index] || newCard(Date.now() + index, defaultViews, defaultQuality, defaultCloseUpTarget)));
    if (expanded !== null && expanded >= safe) setExpanded(safe - 1);
  };
  const patchCard = (index: number, patch: Partial<DraftCard>) => setCards((current) => current.map((card, itemIndex) => itemIndex === index ? { ...card, ...patch } : card));
  const applyDefaults = () => setCards((current) => current.map((card, index) => index < count ? ({ ...card, outputTypes: [...defaultViews], quality: defaultQuality, closeUpTarget: defaultViews.includes('CLOSE-UP') ? defaultCloseUpTarget : card.closeUpTarget }) : card));
  const invalidCards = useMemo(() => activeCards.map((card) => !card.productId.trim() || card.referenceImages.length === 0 || card.outputTypes.length === 0 || (card.outputTypes.includes('CLOSE-UP') && !card.closeUpTarget.trim())), [activeCards]);
  const duplicateIds = new Set(activeCards.map((card) => card.productId.trim().toLowerCase()).filter((id, index, all) => id && all.indexOf(id) !== index));
  const ready = invalidCards.every((invalid) => !invalid) && duplicateIds.size === 0;

  useEffect(() => {
    const hasDraftWork = !batch && activeCards.some((card) => card.productId.trim() || card.operatorTag.trim() || card.referenceImages.length > 0 || card.instructions.trim());
    if (!hasDraftWork) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [batch, activeCards]);

  const startBatch = async () => {
    if (!ready || busy) return;
    let createdId: string | undefined;
    setBusy(true); setError(null); setNotice(null); setPreparingProgress(0);
    try {
      const created = await api<CatalogueBatchSummary>('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractVersion: 'catalogue-batch.v1', expectedCatalogueCount: activeCards.length, defaultOutputTypes: defaultViews, defaultQuality } satisfies CreateCatalogueBatchRequest) });
      createdId = created.id;
      for (const [index, card] of activeCards.entries()) {
        const result = await api<{ batch: CatalogueBatchSummary }>(`/api/batches/${created.id}/catalogues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractVersion: 'batch-catalogue.v1', productId: card.productId.trim(), operatorTag: card.operatorTag.trim() || undefined, outputTypes: card.outputTypes, closeUpTarget: card.closeUpTarget.trim() || undefined, instructions: card.instructions.trim() || undefined, quality: card.quality, referenceImages: card.referenceImages } satisfies AddBatchCatalogueRequest) });
        if (!result.batch) throw new Error('The catalogue card was not accepted by the server.');
        setPreparingProgress(index + 1);
      }
      setBatch(await api<CatalogueBatchSummary>(`/api/batches/${created.id}/start`, { method: 'POST' }));
    } catch (reason) {
      if (createdId) await api(`/api/batches/${createdId}/cancel`, { method: 'POST' }).catch(() => undefined);
      setError(`${(reason as Error).message} Your catalogue cards are still available; correct the issue and queue them again.`);
    }
    finally { setBusy(false); setPreparingProgress(0); }
  };

  const batchAction = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!batch) return;
    setError(null); setNotice(null); setActionBusy(action);
    try { setBatch(await api<CatalogueBatchSummary>(`/api/batches/${batch.id}/${action}`, { method: 'POST' })); }
    catch (reason) { setError((reason as Error).message); }
    finally { setActionBusy(null); }
  };

  const viewAction = async (catalogue: BatchCatalogueSummary, outputType: OutputType, action: 'retry' | 'approve' | 'amend') => {
    if (!batch) return;
    const actionKey = `${catalogue.id}:${outputType}:${action}`;
    setError(null); setNotice(null); setActionBusy(actionKey);
    try {
      const body = action === 'amend' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correction }) } : {};
      setBatch(await api<CatalogueBatchSummary>(`/api/batches/${batch.id}/catalogues/${catalogue.id}/views/${encodedType(outputType)}/${action}`, { method: 'POST', ...body }));
      if (action === 'amend') { setReview(null); setCorrection(''); setNotice(`Amendment queued for ${catalogue.productId} — ${outputType}.`); }
      if (action === 'approve') setNotice(`${catalogue.productId} — ${outputType} approved; Drive upload queued.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setActionBusy(null); }
  };

  const approveAll = async () => {
    if (!batch) return;
    setError(null); setNotice(null); setActionBusy('approve-all');
    try {
      const successful = batch.catalogues.flatMap((catalogue) => catalogue.views).filter((view) => view.status === 'SUCCESS').length;
      setBatch(await api<CatalogueBatchSummary>(`/api/batches/${batch.id}/approve-all`, { method: 'POST' }));
      setNotice(`${successful} successful view${successful === 1 ? '' : 's'} approved; Drive uploads queued.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setActionBusy(null); }
  };

  const prepareNewBatch = () => {
    setBatch(null); setReview(null); setCorrection(''); setError(null); setNotice(null); setActionBusy(null);
    setCount(3); setCountInput('3'); setCards(Array.from({ length: 3 }, (_, index) => newCard(Date.now() + index, defaultViews, defaultQuality, defaultCloseUpTarget))); setExpanded(0);
  };

  const openReview = async (catalogue: BatchCatalogueSummary, outputType: OutputType) => {
    if (!batch) return;
    setError(null);
    try { setReview(await api<BatchViewResultResponse>(`/api/batches/${batch.id}/catalogues/${catalogue.id}/views/${encodedType(outputType)}`)); }
    catch (reason) { setError((reason as Error).message); }
  };

  if (batch) {
    const percent = batch.totalViews ? Math.round(batch.completedViews / batch.totalViews * 100) : 0;
    const successfulUnapproved = batch.catalogues.flatMap((catalogue) => catalogue.views).filter((view) => view.status === 'SUCCESS').length;
    return (
      <div className="space-y-6">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs uppercase tracking-wide text-stone-500">Batch {batch.id.slice(0, 8)}</p><h2 className="font-serif text-xl font-semibold">{batch.catalogueCount} catalogue queue</h2></div>
            <div className="flex gap-2">
              {successfulUnapproved > 0 && <button disabled={Boolean(actionBusy)} onClick={approveAll} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"><UploadCloud className="h-4 w-4" />{actionBusy === 'approve-all' ? 'Queueing uploads…' : `Approve all (${successfulUnapproved})`}</button>}
              {batch.status === 'RUNNING' && <button disabled={Boolean(actionBusy)} onClick={() => batchAction('pause')} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><Pause className="h-4 w-4" />Pause</button>}
              {batch.status === 'PAUSED' && <button disabled={Boolean(actionBusy)} onClick={() => batchAction('resume')} className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-50"><Play className="h-4 w-4" />Resume</button>}
              {!terminalBatch.has(batch.status) && <button disabled={Boolean(actionBusy)} onClick={() => batchAction('cancel')} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50"><Square className="h-4 w-4" />Cancel</button>}
              {terminalBatch.has(batch.status) && <button onClick={prepareNewBatch} className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-3 py-2 text-sm text-white"><RefreshCw className="h-4 w-4" />Prepare another batch</button>}
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full bg-stone-900 transition-all" style={{ width: `${percent}%` }} /></div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div><span className="block text-stone-500">Status</span><strong>{batch.status.replaceAll('_', ' ')}</strong></div>
            <div><span className="block text-stone-500">Progress</span><strong>{batch.completedViews}/{batch.totalViews} views</strong></div>
            <div><span className="block text-stone-500">Active</span><strong>{batch.activeViews}</strong></div>
            <div><span className="block text-stone-500">Waiting</span><strong>{batch.queuedViews}</strong></div>
            <div><span className="block text-stone-500">ETA</span><strong>{formatDuration(batch.estimatedRemainingMs)}</strong></div>
          </div>
        </section>

        <div className="space-y-4">
          {batch.catalogues.map((catalogue, index) => (
            <section key={catalogue.id} className="rounded-lg border border-stone-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between gap-3"><div><span className="text-xs text-stone-500">Catalogue {index + 1}</span><div className="flex flex-wrap items-center gap-2"><h3 className="font-mono font-semibold">{catalogue.productId}</h3>{catalogue.operatorTag && <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">{catalogue.operatorTag}</span>}</div></div><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(catalogue.status)}`}>{catalogue.status.replaceAll('_', ' ')}</span></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {catalogue.views.map((view) => (
                  <div key={view.outputType} className="rounded-md border border-stone-200 p-3">
                    <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{view.outputType}</p><p className="mt-1 text-xs text-stone-500">Attempt {view.attempts}{view.durationMs ? ` · ${(view.durationMs / 1000).toFixed(1)}s` : ''}</p></div><span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone(view.status)}`}>{view.status.replaceAll('_', ' ')}</span></div>
                    {view.error && <p className="mt-2 text-xs text-red-700">{view.error}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {view.hasResult && <button onClick={() => openReview(catalogue, view.outputType)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><Eye className="h-3.5 w-3.5" />Review</button>}
                      {view.status === 'FAILED' && <button disabled={Boolean(actionBusy)} onClick={() => viewAction(catalogue, view.outputType, 'retry')} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Retry</button>}
                      {view.status === 'SUCCESS' && <button disabled={Boolean(actionBusy)} onClick={() => viewAction(catalogue, view.outputType, 'approve')} className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-50"><UploadCloud className="h-3.5 w-3.5" />{actionBusy === `${catalogue.id}:${view.outputType}:approve` ? 'Queueing…' : 'Approve & upload'}</button>}
                      {view.storageUrl && <a href={view.storageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><Check className="h-3.5 w-3.5" />Open in Drive</a>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {review?.image && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between"><div><p className="text-xs text-stone-500">{review.productId}</p><h3 className="font-semibold">Review {review.outputType}</h3></div><button onClick={() => setReview(null)} className="rounded border px-3 py-1.5 text-sm">Close</button></div>
              <img src={review.image.dataUrl} alt={`${review.productId} ${review.outputType}`} className="mx-auto mt-4 max-h-[60vh] rounded border object-contain" />
              {review.status === 'SUCCESS' && batch.catalogues.find((item) => item.id === review.catalogueId) && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button disabled={Boolean(actionBusy)} onClick={() => viewAction(batch.catalogues.find((item) => item.id === review.catalogueId)!, review.outputType!, 'approve')} className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50">Approve & upload</button>
                  <input value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="Describe the amendment…" className="flex-1 rounded-md border px-3 py-2 text-sm" />
                  <button disabled={!correction.trim() || Boolean(actionBusy)} onClick={() => viewAction(batch.catalogues.find((item) => item.id === review.catalogueId)!, review.outputType!, 'amend')} className="inline-flex items-center justify-center gap-2 rounded-md bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-40"><Send className="h-4 w-4" />{actionBusy?.endsWith(':amend') ? 'Queueing amendment…' : 'Amend'}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-end gap-4">
          <div><label className="block text-sm font-medium">Number of catalogues</label><div className="mt-1 flex gap-2"><input type="number" min={1} max={30} value={countInput} onChange={(event) => setCountInput(event.target.value)} onBlur={applyCount} onKeyDown={(event) => { if (event.key === 'Enter') applyCount(); }} className="w-24 rounded-md border px-3 py-2" /><button type="button" onClick={applyCount} className="rounded-md border px-3 py-2 text-sm">Update cards</button></div><p className="mt-1 max-w-xs text-[11px] text-stone-500">Applied on Enter or when you leave the field. Reducing the count hides cards without deleting their data.</p></div>
          <div><label className="block text-sm font-medium">Default quality</label><select value={defaultQuality} onChange={(event) => setDefaultQuality(event.target.value as BatchQuality)} className="mt-1 rounded-md border px-3 py-2"><option value="draft">Draft · faster</option><option value="final">Final · highest detail</option></select></div>
          <button onClick={applyDefaults} className="rounded-md border px-3 py-2 text-sm">Apply defaults to all cards</button>
        </div>
        <div className="mt-4"><OutputTypeSelector selectedTypes={defaultViews} onChange={setDefaultViews} closeUpTarget={defaultCloseUpTarget} onChangeCloseUpTarget={setDefaultCloseUpTarget} /></div>
        <p className="mt-3 flex items-center gap-2 text-xs text-stone-500"><Clock3 className="h-4 w-4" />All catalogue cards and selected views enter the queue. Two views run concurrently; failures retry once automatically. BACK and SIDE wait for that catalogue’s FRONT identity.</p>
      </section>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="space-y-3">
        {activeCards.map((card, index) => {
          const isOpen = expanded === index;
          const duplicate = duplicateIds.has(card.productId.trim().toLowerCase());
          return (
            <section key={card.key} className={`rounded-lg border bg-white shadow-xs ${invalidCards[index] || duplicate ? 'border-amber-200' : 'border-emerald-200'}`}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : index)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div><span className="text-xs text-stone-500">Catalogue {index + 1}</span><p className="font-medium">{card.productId || 'Product ID not entered'}{card.operatorTag.trim() ? ` · ${card.operatorTag.trim()}` : ''} · {card.referenceImages.length} reference{card.referenceImages.length === 1 ? '' : 's'}</p></div>{isOpen ? <ChevronUp /> : <ChevronDown />}</button>
              {isOpen && <div className="space-y-5 border-t border-stone-100 p-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_220px]"><div><label className="block text-sm font-medium">Product ID</label><input value={card.productId} onChange={(event) => patchCard(index, { productId: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 font-mono" placeholder="NPL-2026-001" />{duplicate && <p className="mt-1 text-xs text-red-700">This Product ID is duplicated.</p>}</div><div><label className="block text-sm font-medium">Operator Tag <span className="font-normal text-stone-400">(optional)</span></label><input value={card.operatorTag} maxLength={80} onChange={(event) => patchCard(index, { operatorTag: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g., Jaipur shoot" /><p className="mt-1 text-[11px] text-stone-500">Identification only</p></div></div>
                <ImageUploader images={card.referenceImages} onAddImages={(images) => patchCard(index, { referenceImages: [...card.referenceImages, ...images].slice(0, 10) })} onRemoveImage={(imageIndex) => patchCard(index, { referenceImages: card.referenceImages.filter((_, itemIndex) => itemIndex !== imageIndex) })} />
                <OutputTypeSelector selectedTypes={card.outputTypes} onChange={(types) => patchCard(index, { outputTypes: types })} closeUpTarget={card.closeUpTarget} onChangeCloseUpTarget={(value) => patchCard(index, { closeUpTarget: value })} />
                <div className="grid gap-4 sm:grid-cols-2"><div><label className="block text-sm font-medium">Quality</label><select value={card.quality} onChange={(event) => patchCard(index, { quality: event.target.value as BatchQuality })} className="mt-1 w-full rounded-md border px-3 py-2"><option value="draft">Draft · faster</option><option value="final">Final · highest detail</option></select></div><div><label className="block text-sm font-medium">Optional direction</label><input value={card.instructions} onChange={(event) => patchCard(index, { instructions: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" placeholder="Background, styling, pose…" /></div></div>
              </div>}
            </section>
          );
        })}
      </div>
      <button disabled={!ready || busy} onClick={startBatch} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{busy ? `Preparing queue… ${preparingProgress}/${activeCards.length} cards accepted` : `Queue all ${activeCards.length} catalogues`}</button>
      {!ready && <p className="text-center text-xs text-stone-500">Complete every card and use a unique Product ID for each catalogue.</p>}
    </div>
  );
}
