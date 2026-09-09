import type { GenerationCost, GenerationQuality, GenerationUsage } from './types.ts';

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

const OPENAI_GPT_IMAGE_2_USD_PER_MILLION = {
  inputText: 5,
  inputImage: 8,
  outputImage: 30,
};

export function calculateGenerationCost(
  provider: string,
  model: string,
  quality: GenerationQuality,
  usage?: GenerationUsage,
): GenerationCost | undefined {
  const normalizedProvider = provider.toLowerCase();
  const normalizedModel = model.toLowerCase();
  if (normalizedProvider !== 'openai' || !normalizedModel.startsWith('gpt-image-2')) return undefined;

  if (
    usage
    && typeof usage.inputTextTokens === 'number'
    && typeof usage.inputImageTokens === 'number'
    && typeof usage.outputImageTokens === 'number'
  ) {
    const amountUsd = (
      usage.inputTextTokens * OPENAI_GPT_IMAGE_2_USD_PER_MILLION.inputText
      + usage.inputImageTokens * OPENAI_GPT_IMAGE_2_USD_PER_MILLION.inputImage
      + usage.outputImageTokens * OPENAI_GPT_IMAGE_2_USD_PER_MILLION.outputImage
    ) / 1_000_000;
    return {
      currency: 'USD',
      amountUsd,
      basis: 'PROVIDER_USAGE',
      isMinimum: false,
      pricingSource: 'OpenAI GPT Image 2 token rates checked 2026-09-09',
    };
  }

  const fallback = estimateOutputCostUsd(provider, model, quality, 1);
  if (fallback === null) return undefined;
  return {
    currency: 'USD',
    amountUsd: fallback,
    basis: 'OUTPUT_ESTIMATE',
    isMinimum: true,
    pricingSource: 'OpenAI GPT Image 2 portrait output estimate checked 2026-09-09',
  };
}
