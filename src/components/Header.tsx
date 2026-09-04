import React from 'react';
import { Camera, Sparkles } from 'lucide-react';

interface HeaderProps {
  modelName?: string;
  isHealthy?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ modelName, isHealthy = true }) => {
  return (
    <header className="border-b border-stone-200 bg-white sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-stone-900 text-amber-100 flex items-center justify-center font-serif font-bold text-xl tracking-wider shadow-sm">
            N
          </div>
          <div>
            <h1 className="text-xl font-serif font-semibold tracking-tight text-stone-900 flex items-center gap-2">
              NaapLo Catalogue Generator
            </h1>
            <p className="text-xs text-stone-500 font-sans">
              Indian Ethnic Garment Catalogue Studio &bull; Phase 1
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
            <Sparkles className="w-3.5 h-3.5 text-stone-500" />
            <span>Model: {modelName || 'gemini-3.1-flash-image'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-stone-50 text-stone-600 border border-stone-200">
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="hidden md:inline">
              {isHealthy ? 'System Ready' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
