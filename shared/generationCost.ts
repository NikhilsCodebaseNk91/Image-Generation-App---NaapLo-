import type { GenerationQuality } from './types.ts';

// Output-only estimates for the app's current 1024x1536 GPT Image 2 requests.
// Reference-image input, retries, amendments, taxes, and provider price changes are excluded.
const GPT_IMAGE_2_PORTRAIT_OUTPUT_USD: Record<GenerationQuality, number> = {
  draft: 0.005,
  final: 0.165,
};

export function estimateOutputCostUsd(
  provider: string | undefined,
  model: string | undefined,
  quality: GenerationQuality,
  viewCount: number,
): number | null {
  if (provider?.toLowerCase() !== 'openai' || model?.toLowerCase() !== 'gpt-image-2') return null;
  return GPT_IMAGE_2_PORTRAIT_OUTPUT_USD[quality] * Math.max(0, viewCount);
}

export function formatEstimatedUsd(value: number): string {
  return value < 0.1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`;
}
