import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Header } from './components/Header.tsx';
import { ImageUploader } from './components/ImageUploader.tsx';
import { OutputTypeSelector } from './components/OutputTypeSelector.tsx';
import { GeneratedImageViewer } from './components/GeneratedImageViewer.tsx';
import { StatusAlert } from './components/StatusAlert.tsx';
import type { GenerateApiRequest, GenerateApiResponse, HealthCheckResponse, ImageFilePayload } from '../shared/types.ts';
import { OUTPUT_TYPES, type OutputType } from '../shared/outputTypes.ts';

type JobStatus = 'queued' | 'generating' | 'success' | 'failed';
interface OutputJob { outputType: OutputType; status: JobStatus; result?: GenerateApiResponse; error?: string; identityUsed?: boolean; }
const needsIdentity = (type: OutputType) => type === 'BACK VIEW' || type === 'SIDE VIEW';

export default function App() {
  const [productId, setProductId] = useState('');
  const [referenceImages, setReferenceImages] = useState<ImageFilePayload[]>([]);
  const [selectedOutputTypes, setSelectedOutputTypes] = useState<OutputType[]>(['FRONT VIEW']);
  const [closeUpTarget, setCloseUpTarget] = useState('');
  const [jobs, setJobs] = useState<OutputJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [alertState, setAlertState] = useState<{ type: 'error' | 'warning' | 'success'; title?: string; message: string } | null>(null);
  const [serverHealth, setServerHealth] = useState<HealthCheckResponse | null>(null);

  useEffect(() => {
    fetch('/api/health').then((res) => res.json()).then((data: HealthCheckResponse) => setServerHealth(data)).catch((err) => console.warn('Could not reach backend health check:', err));
  }, []);

  const hasProductId = productId.trim().length > 0;
  const hasReferences = referenceImages.length > 0;
  const needsCloseUpTarget = selectedOutputTypes.includes('CLOSE-UP');
  const hasCloseUpTarget = closeUpTarget.trim().length > 0;
  const canGenerate = hasProductId && hasReferences && selectedOutputTypes.length > 0 && (!needsCloseUpTarget || hasCloseUpTarget) && !isGenerating;

  const updateJob = (outputType: OutputType, patch: Partial<OutputJob>) => {
    setJobs((current) => current.map((job) => job.outputType === outputType ? { ...job, ...patch } : job));
  };

  const asImagePayload = (result?: GenerateApiResponse, name = 'identity-reference.png'): ImageFilePayload | undefined =>
    result?.image ? { name, mimeType: result.image.mimeType, data: result.image.dataUrl } : undefined;

  const requestGeneration = async (outputType: OutputType, options: { currentResult?: GenerateApiResponse; correction?: string; identityResult?: GenerateApiResponse } = {}) => {
    const payload: GenerateApiRequest = {
      contractVersion: 'generation-job.v1',
      productId: productId.trim(),
      outputType,
      closeUpTarget: outputType === 'CLOSE-UP' ? closeUpTarget.trim() : undefined,
      correction: options.correction,
      referenceImages: referenceImages.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
      currentGeneratedImage: asImagePayload(options.currentResult, 'current-draft.png'),
      identityReference: needsIdentity(outputType) ? asImagePayload(options.identityResult) : undefined,
    };
    const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json() as GenerateApiResponse;
    if (!response.ok || !data.success) throw new Error(data.error || 'Server returned generation failure.');
    return data;
  };

  const handleAddImages = (newImages: ImageFilePayload[]) => {
    setReferenceImages((previous) => {
      const combined = [...previous];
      for (const image of newImages) if (!combined.some((item) => item.name === image.name)) combined.push(image);
      return combined.slice(0, 10);
    });
    setAlertState(null);
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setAlertState(null);
    const order = [...selectedOutputTypes].sort((a, b) => a === 'FRONT VIEW' ? -1 : b === 'FRONT VIEW' ? 1 : OUTPUT_TYPES.indexOf(a) - OUTPUT_TYPES.indexOf(b));
    setJobs(order.map((outputType) => ({ outputType, status: 'queued' })));
    let frontResult: GenerateApiResponse | undefined;
    let successCount = 0;
    for (const outputType of order) {
      updateJob(outputType, { status: 'generating', error: undefined });
      try {
        const result = await requestGeneration(outputType, { identityResult: frontResult });
        if (outputType === 'FRONT VIEW') frontResult = result;
        successCount += 1;
        updateJob(outputType, { status: 'success', result, identityUsed: needsIdentity(outputType) && Boolean(frontResult) });
      } catch (error) {
        updateJob(outputType, { status: 'failed', error: (error as Error).message });
      }
    }
    setIsGenerating(false);
    const failedCount = order.length - successCount;
    setAlertState({
      type: failedCount === 0 ? 'success' : successCount > 0 ? 'warning' : 'error',
      title: failedCount === 0 ? 'Catalogue Views Generated' : 'Generation Run Completed With Failures',
      message: `${successCount} of ${order.length} selected views succeeded.${failedCount ? ` ${failedCount} failed view${failedCount === 1 ? '' : 's'} can be retried independently.` : ''}`,
    });
  };

  const handleRegenerate = async (outputType: OutputType, correction?: string) => {
    const current = jobs.find((job) => job.outputType === outputType);
    if (!current || current.status === 'generating') return;
    const frontResult = jobs.find((job) => job.outputType === 'FRONT VIEW' && job.status === 'success')?.result;
    updateJob(outputType, { status: 'generating', error: undefined });
    try {
      const result = await requestGeneration(outputType, { currentResult: correction ? current.result : undefined, correction, identityResult: frontResult });
      updateJob(outputType, { status: 'success', result, identityUsed: needsIdentity(outputType) && Boolean(frontResult) });
      setAlertState({ type: 'success', title: correction ? 'Correction Applied' : 'View Regenerated', message: `${outputType} was updated independently.` });
    } catch (error) {
      updateJob(outputType, { status: current.result?.image ? 'success' : 'failed', error: (error as Error).message, result: current.result });
      setAlertState({ type: 'error', title: `${outputType} Failed`, message: (error as Error).message });
    }
  };

  return (
    <div className="min-h-screen bg-stone-100/60 text-stone-900 flex flex-col font-sans">
      <Header modelName={serverHealth?.model} isHealthy={serverHealth?.status === 'ok'} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {alertState && <StatusAlert {...alertState} onDismiss={() => setAlertState(null)} />}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-lg border border-stone-200 bg-white p-5 sm:p-6 shadow-xs space-y-6">
              <div className="border-b border-stone-100 pb-3">
                <h2 className="text-base font-serif font-semibold text-stone-900">Catalogue Production Parameters</h2>
                <p className="text-xs text-stone-500 mt-0.5">Generate up to four independent, identity-linked catalogue views.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="product-id-input" className="block text-sm font-medium text-stone-800">Product ID (Job Metadata)</label>
                <input id="product-id-input" type="text" value={productId} disabled={isGenerating} onChange={(event) => setProductId(event.target.value)} placeholder="e.g., NP-2026-SUIT-001" className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2 text-sm shadow-xs focus:border-stone-900 focus:outline-hidden focus:ring-1 focus:ring-stone-900 disabled:opacity-50 font-mono" />
              </div>
              <ImageUploader images={referenceImages} onAddImages={handleAddImages} onRemoveImage={(index) => setReferenceImages((items) => items.filter((_, itemIndex) => itemIndex !== index))} maxImages={10} disabled={isGenerating} />
              <OutputTypeSelector selectedTypes={selectedOutputTypes} onChange={setSelectedOutputTypes} closeUpTarget={closeUpTarget} onChangeCloseUpTarget={setCloseUpTarget} disabled={isGenerating} />
              <div className="pt-2 border-t border-stone-100">
                <button type="button" id="generate-catalogue-btn" disabled={!canGenerate} onClick={handleGenerate} className="w-full py-3 px-4 rounded-md bg-stone-900 hover:bg-stone-800 text-white font-medium text-sm transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Generating selected views...</span></> : <><Sparkles className="w-4 h-4 text-amber-300" /><span>Generate {selectedOutputTypes.length} Catalogue View{selectedOutputTypes.length === 1 ? '' : 's'}</span></>}
                </button>
                {!hasProductId && <p className="text-[11px] text-stone-500 text-center mt-2">Please enter a Product ID to enable generation.</p>}
                {!hasReferences && <p className="text-[11px] text-stone-500 text-center mt-2">Please upload at least 1 garment reference photograph.</p>}
                {hasReferences && needsCloseUpTarget && !hasCloseUpTarget && <p className="text-[11px] text-amber-700 text-center mt-2">Close-Up Target is required when CLOSE-UP is selected.</p>}
              </div>
            </div>
          </div>
          <div className="lg:col-span-7 space-y-6" id="generation-results">
            {jobs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-12 text-center flex flex-col items-center justify-center min-h-[420px] text-stone-400">
                <Sparkles className="w-8 h-8 mb-3" /><h3 className="text-sm font-medium text-stone-700">Awaiting Generation Request</h3><p className="text-xs text-stone-500 max-w-xs mt-1">Upload garment references, select one to four views, and start generation.</p>
              </div>
            ) : jobs.map((job) => (
              <div key={job.outputType} data-output-job={job.outputType}>
                {job.status === 'success' && job.result?.image ? (
                  <GeneratedImageViewer result={job.result} onRegenerate={() => handleRegenerate(job.outputType)} onApplyCorrection={(text) => handleRegenerate(job.outputType, text)} isCorrecting={false} identityUsed={job.identityUsed} error={job.error} />
                ) : (
                  <div className={`rounded-lg border bg-white p-6 min-h-36 flex items-center justify-between gap-4 ${job.status === 'failed' ? 'border-red-200' : 'border-stone-200'}`}>
                    <div><p className="text-sm font-semibold text-stone-900">{job.outputType}</p><p className={`text-xs mt-1 ${job.status === 'failed' ? 'text-red-700' : 'text-stone-500'}`}>{job.status === 'queued' ? 'Queued — waiting for the previous selected view.' : job.status === 'generating' ? `Generating with ${serverHealth?.model || 'the configured image model'}...` : job.error}</p></div>
                    {job.status === 'generating' && <Loader2 className="w-5 h-5 animate-spin text-stone-500" />}
                    {job.status === 'failed' && <button type="button" onClick={() => handleRegenerate(job.outputType)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-red-700 text-white text-sm font-medium"><RefreshCw className="w-4 h-4" />Retry</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
      <footer className="border-t border-stone-200 bg-white py-4 mt-auto"><div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2"><span>NaapLo Fashion &bull; CP-004 Multi-Output Studio</span><span>Independent jobs &bull; FRONT-led identity continuity</span></div></footer>
    </div>
  );
}
