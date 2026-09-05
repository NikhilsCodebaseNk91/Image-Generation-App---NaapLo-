import React, { useState } from 'react';
import { Download, Edit3, Maximize2, RefreshCw, CheckCircle2, Clock, LockKeyhole, UserCheck, BadgeCheck } from 'lucide-react';
import type { GenerateApiResponse } from '../../shared/types.ts';

interface GeneratedImageViewerProps {
  result: GenerateApiResponse;
  onApplyCorrection: (correctionText: string) => void;
  onRegenerate: () => void;
  isCorrecting?: boolean;
  identityUsed?: boolean;
  identityLocked?: boolean;
  identityActionLabel?: string;
  onUseAsIdentity?: () => void;
  isApproved?: boolean;
  storageUrl?: string;
  onApprove?: () => void;
  error?: string;
}

export const GeneratedImageViewer: React.FC<GeneratedImageViewerProps> = ({
  result,
  onApplyCorrection,
  onRegenerate,
  isCorrecting = false,
  identityUsed = false,
  identityLocked = false,
  identityActionLabel,
  onUseAsIdentity,
  isApproved = false,
  storageUrl,
  onApprove,
  error,
}) => {
  const [correctionText, setCorrectionText] = useState('');
  const [isZoomed, setIsZoomed] = useState(false);

  if (!result.image) return null;

  const { dataUrl, mimeType } = result.image;
  const filename = result.image.fileName || `NaapLo-${result.productId || 'catalogue'}-view.png`;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmitCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionText.trim() || isCorrecting) return;
    onApplyCorrection(correctionText.trim());
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden shadow-xs space-y-6 p-5 sm:p-6">
      {/* Top Bar: View Info & Download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              Generated Successfully
            </span>
            {result.outputType && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                {result.outputType}
              </span>
            )}
            {identityUsed && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                FRONT identity linked
              </span>
            )}
            {identityLocked && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                <LockKeyhole className="w-3 h-3" />
                Identity locked
              </span>
            )}
            {result.image.brandingApplied && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                Exact NaapLo logo applied
              </span>
            )}
            {isApproved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                <BadgeCheck className="w-3 h-3" />
                Approved for Drive
              </span>
            )}
            {storageUrl && (
              <a href={storageUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-700 underline underline-offset-2">
                Open stored file
              </a>
            )}
          </div>
          {result.productId && (
            <p className="text-xs text-stone-500 mt-1">
              Product ID: <span className="font-mono font-medium text-stone-700">{result.productId}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onApprove && !isApproved && (
            <button
              type="button"
              onClick={onApprove}
              disabled={isCorrecting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-sm font-medium disabled:opacity-40"
            >
              <BadgeCheck className="w-4 h-4" />
              Approve Output
            </button>
          )}
          {identityActionLabel && onUseAsIdentity && (
            <button
              type="button"
              onClick={onUseAsIdentity}
              disabled={isCorrecting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-sm font-medium disabled:opacity-40"
            >
              <UserCheck className="w-4 h-4" />
              {identityActionLabel}
            </button>
          )}
          {result.durationMs && (
            <span className="text-xs text-stone-500 flex items-center gap-1 mr-1">
              <Clock className="w-3.5 h-3.5" />
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
          )}

          <button
            type="button"
            onClick={onRegenerate}
            disabled={isCorrecting}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 text-sm font-medium disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${isCorrecting ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-stone-900 text-white hover:bg-stone-800 text-sm font-medium transition-colors shadow-xs"
          >
            <Download className="w-4 h-4" />
            Download {filename}
          </button>
        </div>
      </div>

      {/* Main Image Display */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          The latest update failed: {error}. The previous successful image has been preserved.
        </div>
      )}

      <div className="relative group rounded-md border border-stone-200 bg-stone-50/50 flex items-center justify-center overflow-hidden">
        <img
          src={dataUrl}
          alt={`NaapLo Catalogue - ${result.outputType || 'Generated image'}`}
          className="w-full max-h-[640px] object-contain cursor-zoom-in transition-transform duration-200"
          onClick={() => setIsZoomed(true)}
        />

        <button
          type="button"
          onClick={() => setIsZoomed(true)}
          className="absolute top-3 right-3 p-2 rounded-md bg-white/90 text-stone-700 hover:bg-white hover:text-stone-900 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          title="View Full Size"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Correction Section */}
      <div id="correction-section" className="border-t border-stone-200 pt-5 space-y-3">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-stone-700" />
          <h3 className="text-sm font-semibold text-stone-900">
            Apply Correction / Regenerate
          </h3>
        </div>

        <p className="text-xs text-stone-500">
          Enter specific feedback to refine this image. The system will resubmit your original garment references, the current generated image, and your correction instruction to produce an updated version.
        </p>

        <form onSubmit={handleSubmitCorrection} className="space-y-3">
          <textarea
            rows={3}
            value={correctionText}
            disabled={isCorrecting}
            onChange={(e) => setCorrectionText(e.target.value)}
            placeholder="e.g., Drape the dupatta evenly over both shoulders, make the neckline embroidery tone slightly warmer gold, or adjust posture to show full hemline clearance."
            className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 shadow-xs focus:border-stone-900 focus:outline-hidden focus:ring-1 focus:ring-stone-900 disabled:opacity-50"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-stone-400">
              The original garment reference photos remain the absolute truth.
            </span>

            <button
              type="submit"
              disabled={!correctionText.trim() || isCorrecting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-stone-800 text-white hover:bg-stone-700 text-sm font-medium transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isCorrecting ? 'animate-spin' : ''}`} />
              {isCorrecting ? 'Applying Correction...' : 'Apply Correction'}
            </button>
          </div>
        </form>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex items-center justify-center">
            <img
              src={dataUrl}
              alt="Zoomed view"
              className="max-h-[90vh] max-w-full object-contain rounded-md"
            />
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute -top-10 right-0 text-white hover:text-stone-300 text-sm font-medium"
            >
              Close (&times;)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
