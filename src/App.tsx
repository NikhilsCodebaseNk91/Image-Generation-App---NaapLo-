import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { ImageUploader } from './components/ImageUploader.tsx';
import { OutputTypeSelector } from './components/OutputTypeSelector.tsx';
import { GeneratedImageViewer } from './components/GeneratedImageViewer.tsx';
import { StatusAlert } from './components/StatusAlert.tsx';
import type { ImageFilePayload, GenerateApiResponse, HealthCheckResponse } from '../shared/types.ts';
import type { OutputType } from '../shared/outputTypes.ts';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';

export default function App() {
  // Form State
  const [productId, setProductId] = useState('');
  const [referenceImages, setReferenceImages] = useState<ImageFilePayload[]>([]);
  const [selectedOutputType, setSelectedOutputType] = useState<OutputType>('FRONT VIEW');
  const [closeUpTarget, setCloseUpTarget] = useState('');

  // Generation & Status State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [currentResult, setCurrentResult] = useState<GenerateApiResponse | null>(null);
  const [alertState, setAlertState] = useState<{
    type: 'error' | 'warning' | 'success';
    title?: string;
    message: string;
  } | null>(null);

  // Backend Health
  const [serverHealth, setServerHealth] = useState<HealthCheckResponse | null>(null);

  useEffect(() => {
    // Ping backend health
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: HealthCheckResponse) => {
        setServerHealth(data);
      })
      .catch((err) => {
        console.warn('Could not reach backend health check:', err);
      });
  }, []);

  // Validation rules for Phase 1
  const hasProductId = productId.trim().length > 0;
  const hasReferences = referenceImages.length > 0;
  const isCloseUpSelected = selectedOutputType === 'CLOSE-UP';
  const hasCloseUpTarget = closeUpTarget.trim().length > 0;
  const canGenerate = hasProductId && hasReferences && (!isCloseUpSelected || hasCloseUpTarget) && !isGenerating;

  // Add reference images (deduplicating by name)
  const handleAddImages = (newImages: ImageFilePayload[]) => {
    setReferenceImages((prev) => {
      const combined = [...prev];
      for (const img of newImages) {
        if (!combined.some((item) => item.name === img.name)) {
          combined.push(img);
        }
      }
      return combined.slice(0, 10);
    });
    setAlertState(null);
  };

  // Remove individual image
  const handleRemoveImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Main Generate Action
  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setAlertState(null);
    setGenerationStep('Assembling garment reference data and master prompt...');

    try {
      setGenerationStep('Calling Gemini 3.1 Flash Image model...');

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractVersion: 'generation-job.v1',
          productId: productId.trim() || undefined,
          outputType: selectedOutputType,
          closeUpTarget: isCloseUpSelected ? closeUpTarget.trim() : undefined,
          referenceImages: referenceImages.map((img) => ({
            name: img.name,
            mimeType: img.mimeType,
            data: img.data,
          })),
        }),
      });

      const data: GenerateApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Server returned generation failure.');
      }

      setCurrentResult(data);
      setAlertState({
        type: 'success',
        title: 'Catalogue Image Generated',
        message: `Generated "${selectedOutputType}" in ${(
          (data.durationMs || 0) / 1000
        ).toFixed(1)}s. Ready for review or download.`,
      });

      // Scroll to result view
      setTimeout(() => {
        document.getElementById('generated-catalogue-image')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    } catch (err: unknown) {
      const error = err as Error;
      setAlertState({
        type: 'error',
        title: 'Catalogue Generation Failed',
        message: error.message || 'An unknown error occurred while contacting the image provider.',
      });
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  // Correction Action
  const handleApplyCorrection = async (correctionText: string) => {
    if (!currentResult?.image || isCorrecting) return;

    setIsCorrecting(true);
    setAlertState(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractVersion: 'generation-job.v1',
          productId: productId.trim() || undefined,
          outputType: selectedOutputType,
          closeUpTarget: isCloseUpSelected ? closeUpTarget.trim() : undefined,
          correction: correctionText,
          referenceImages: referenceImages.map((img) => ({
            name: img.name,
            mimeType: img.mimeType,
            data: img.data,
          })),
          currentGeneratedImage: {
            name: 'current-draft.png',
            mimeType: currentResult.image.mimeType,
            data: currentResult.image.dataUrl,
          },
        }),
      });

      const data: GenerateApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Correction generation failed.');
      }

      setCurrentResult(data);
      setAlertState({
        type: 'success',
        title: 'Correction Applied',
        message: 'The catalogue image has been successfully updated with your requested revisions.',
      });
    } catch (err: unknown) {
      const error = err as Error;
      setAlertState({
        type: 'error',
        title: 'Correction Failed',
        message: error.message || 'Could not regenerate image with corrections.',
      });
    } finally {
      setIsCorrecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100/60 text-stone-900 flex flex-col font-sans">
      <Header
        modelName={serverHealth?.model}
        isHealthy={serverHealth?.status === 'ok'}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Status Alerts */}
        {alertState && (
          <StatusAlert
            type={alertState.type}
            title={alertState.title}
            message={alertState.message}
            onDismiss={() => setAlertState(null)}
          />
        )}

        {/* Studio Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Input Form */}
          <div className="lg:col-span-6 space-y-6">
            <div className="rounded-lg border border-stone-200 bg-white p-5 sm:p-6 shadow-xs space-y-6">
              <div className="border-b border-stone-100 pb-3">
                <h2 className="text-base font-serif font-semibold text-stone-900">
                  Catalogue Production Parameters
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Configure job identifiers, reference photographs, and desired catalogue view.
                </p>
              </div>

              {/* Product ID Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="product-id-input"
                  className="block text-sm font-medium text-stone-800"
                >
                  Product ID (Job Metadata)
                </label>
                <input
                  id="product-id-input"
                  type="text"
                  value={productId}
                  disabled={isGenerating || isCorrecting}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="e.g., NP-2026-SUIT-001"
                  className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 placeholder:text-stone-400 shadow-xs focus:border-stone-900 focus:outline-hidden focus:ring-1 focus:ring-stone-900 disabled:opacity-50 font-mono text-xs sm:text-sm"
                />
                <p className="text-[11px] text-stone-400">
                  Used as job metadata and file export naming. Not rendered inside catalogue images unless poster layout specifies it.
                </p>
              </div>

              {/* Reference Images Multi-Uploader */}
              <ImageUploader
                images={referenceImages}
                onAddImages={handleAddImages}
                onRemoveImage={handleRemoveImage}
                maxImages={10}
                disabled={isGenerating || isCorrecting}
              />

              {/* Output Type Dropdown + Conditional Close-Up Target */}
              <OutputTypeSelector
                selectedType={selectedOutputType}
                onSelectType={setSelectedOutputType}
                closeUpTarget={closeUpTarget}
                onChangeCloseUpTarget={setCloseUpTarget}
                disabled={isGenerating || isCorrecting}
              />

              {/* Generate Button */}
              <div className="pt-2 border-t border-stone-100">
                <button
                  type="button"
                  id="generate-catalogue-btn"
                  disabled={!canGenerate}
                  onClick={handleGenerate}
                  className="w-full py-3 px-4 rounded-md bg-stone-900 hover:bg-stone-800 text-white font-medium text-sm transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{generationStep || 'Generating Catalogue Image...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Generate Catalogue Image</span>
                    </>
                  )}
                </button>

                {/* Validation helper message */}
                {!hasProductId && (
                  <p className="text-[11px] text-stone-500 text-center mt-2">
                    Please enter a Product ID to enable generation.
                  </p>
                )}
                {!hasReferences && (
                  <p className="text-[11px] text-stone-500 text-center mt-2">
                    Please upload at least 1 garment reference photograph to enable generation.
                  </p>
                )}
                {hasReferences && isCloseUpSelected && !hasCloseUpTarget && (
                  <p className="text-[11px] text-amber-700 text-center mt-2">
                    Close-Up Target is required when "CLOSE-UP" view is selected.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Output & Correction */}
          <div className="lg:col-span-6 space-y-6">
            {currentResult?.image ? (
              <GeneratedImageViewer
                result={currentResult}
                onApplyCorrection={handleApplyCorrection}
                isCorrecting={isCorrecting}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-12 text-center flex flex-col items-center justify-center min-h-[420px] text-stone-400">
                <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mb-3">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-medium text-stone-700">
                  Awaiting Generation Request
                </h3>
                <p className="text-xs text-stone-500 max-w-xs mt-1">
                  Upload your garment reference photographs on the left, select a view, and click "Generate Catalogue Image".
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Clean Minimalist Footer */}
      <footer className="border-t border-stone-200 bg-white py-4 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2">
          <span>NaapLo Fashion &bull; Phase 1 Vertical Slice</span>
          <span>Self-contained portable Node.js + Express + React architecture</span>
        </div>
      </footer>
    </div>
  );
}
