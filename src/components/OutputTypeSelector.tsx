import React from 'react';
import {
  OUTPUT_TYPES,
  OUTPUT_TYPE_CONFIGS,
  COMMON_CLOSE_UP_PRESETS,
  type OutputType,
} from '../../shared/outputTypes.ts';
import { Target, Info } from 'lucide-react';

interface OutputTypeSelectorProps {
  selectedTypes: OutputType[];
  onChange: (types: OutputType[]) => void;
  closeUpTarget: string;
  onChangeCloseUpTarget: (target: string) => void;
  disabled?: boolean;
}

export const OutputTypeSelector: React.FC<OutputTypeSelectorProps> = ({
  selectedTypes,
  onChange,
  closeUpTarget,
  onChangeCloseUpTarget,
  disabled = false,
}) => {
  const isCloseUp = selectedTypes.includes('CLOSE-UP');

  const toggleType = (type: OutputType) => {
    if (selectedTypes.includes(type)) {
      if (type === 'FRONT VIEW' && selectedTypes.some((item) => item === 'BACK VIEW' || item === 'SIDE VIEW')) return;
      if (selectedTypes.length > 1) onChange(selectedTypes.filter((item) => item !== type));
      return;
    }

    const additions: OutputType[] = [];
    if ((type === 'BACK VIEW' || type === 'SIDE VIEW') && !selectedTypes.includes('FRONT VIEW')) {
      additions.push('FRONT VIEW');
    }
    additions.push(type);
    if (selectedTypes.length + additions.length <= 4) onChange([...selectedTypes, ...additions]);
  };

  return (
    <div className="space-y-4">
      {/* Multi-output view selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-stone-800">
            Requested Output Views <span className="text-red-500">*</span>
          </label>
          <span className="text-xs text-stone-500">{selectedTypes.length}/4 selected</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Requested output views">
          {OUTPUT_TYPES.map((type) => {
            const selected = selectedTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                disabled={disabled || (!selected && selectedTypes.length >= 4)}
                aria-pressed={selected}
                onClick={() => toggleType(type)}
                className={`rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-40 ${selected ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'}`}
              >
                <span className="block text-xs font-semibold">{type}</span>
                <span className={`block text-[10px] mt-0.5 ${selected ? 'text-stone-300' : 'text-stone-500'}`}>
                  {OUTPUT_TYPE_CONFIGS[type].description}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-stone-500 flex items-start gap-1.5 pt-1">
          <Info className="w-3.5 h-3.5 text-stone-400 mt-0.5 shrink-0" />
          <span>Each selected view runs as an independent job. BACK or SIDE automatically includes FRONT for identity continuity.</span>
        </p>
      </div>

      {/* Conditional CLOSE-UP TARGET input */}
      {isCloseUp && (
        <div
          id="closeup-target-section"
          className="p-4 rounded-md border border-amber-200 bg-amber-50/50 space-y-2.5 transition-all"
        >
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-800" />
            <label
              htmlFor="closeup-target-input"
              className="text-sm font-semibold text-amber-900"
            >
              Close-Up Target Focus <span className="text-red-600">*</span>
            </label>
          </div>

          <p className="text-xs text-amber-800/90">
            Specify the exact garment detail for macro magnification. CLOSE-UP generation requires a dedicated target.
          </p>

          <input
            id="closeup-target-input"
            type="text"
            value={closeUpTarget}
            disabled={disabled}
            onChange={(e) => onChangeCloseUpTarget(e.target.value)}
            placeholder="e.g., Neckline & yoke zari embroidery, daman scallop lace, sleeve cuff"
            className="w-full rounded-md border border-amber-300 bg-white px-3.5 py-2 text-sm text-stone-900 placeholder:text-stone-400 shadow-xs focus:border-amber-600 focus:outline-hidden focus:ring-1 focus:ring-amber-600 disabled:opacity-50"
          />

          {/* Quick Preset Chips */}
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-amber-900/80">Suggested targets:</span>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_CLOSE_UP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChangeCloseUpTarget(preset)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    closeUpTarget === preset
                      ? 'bg-amber-800 text-white border-amber-800'
                      : 'bg-white text-stone-700 border-amber-200 hover:bg-amber-100/50'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
