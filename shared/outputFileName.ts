import type { OutputType } from './outputTypes.ts';

const safeSegment = (value: string, fallback: string) => {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return normalized || fallback;
};

export function buildOutputFileName(productId: string, outputType: OutputType): string {
  const product = safeSegment(productId, 'catalogue');
  const view = safeSegment(outputType.toLowerCase(), 'view');
  return `NaapLo-${product}-${view}.png`;
}

export function buildProductFolderName(productId: string): string {
  return safeSegment(productId, 'catalogue');
}
