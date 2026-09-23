import React, { useState } from 'react';
import type { ClientBrandConfig } from '../../shared/types.ts';

export function BrandMark({ brand, compact = false }: { brand: ClientBrandConfig; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`${compact ? 'h-9 w-9' : 'h-11 w-11'} flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm`}>
        {!failed
          ? <img src={brand.clientLogoUrl} alt={`${brand.clientDisplayName} logo`} onError={() => setFailed(true)} className="h-full w-full object-contain p-1.5" />
          : <span className="font-display text-lg font-semibold text-[var(--ink)]">{brand.clientDisplayName.slice(0, 1).toUpperCase()}</span>}
      </div>
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-semibold leading-tight text-[var(--ink)]">{brand.clientDisplayName}</p>
        <p className="truncate text-[11px] text-[var(--muted)]">Fashion Catalogue Studio</p>
      </div>
    </div>
  );
}
