import React from 'react';
import {
  OUTPUT_TYPES,
  OUTPUT_TYPE_CONFIGS,
  COMMON_CLOSE_UP_PRESETS,
  type OutputType,
} from '../../shared/outputTypes.ts';
import { Target, Info } from 'lucide-react';

interface OutputTypeSelectorProps {
  selectedType: OutputType;
  onSelectType: (type: OutputType) => void;
  closeUpTarget: string;
  onChangeCloseUpTarget: (target: string) => void;
  disabled?: boolean;
}

export const OutputTypeSelector: React.FC<OutputTypeSelectorProps> = ({
  selectedType,
  onSelectType,
  closeUpTarget,
  onChangeCloseUpTarget,
  disabled = false,
}) => {
  const currentConfig = OUTPUT_TYPE_CONFIGS[selectedType];
  const isCloseUp = selectedType === 'CLOSE-UP';

  return (
    <div className="space-y-4">
      {/* Output Type Dropdown */}
      <div className="space-y-1.5">
        <label htmlFor="output-type-select" className="block text-sm font-medium text-stone-800">
          Requested Output View <span className="text-red-500">*</span>
        </label>
        <select
          id="output-type-select"
          value={selectedType}
          disabled={disabled}
          onChange={(e) => onSelectType(e.target.value as OutputType)}
          className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 shadow-xs focus:border-stone-900 focus:outline-hidden focus:ring-1 focus:ring-stone-900 disabled:opacity-50 font-medium"
        >
          {OUTPUT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        {currentConfig && (
          <p className="text-xs text-stone-500 flex items-start gap-1.5 pt-1">
            <Info className="w-3.5 h-3.5 text-stone-400 mt-0.5 shrink-0" />
            <span>{currentConfig.description}</span>
          </p>
        )}
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
