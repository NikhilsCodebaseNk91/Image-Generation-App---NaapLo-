import type { ClientBrandConfig } from '../../shared/types.ts';

const cleanLabel = (value: string | undefined, fallback: string, maximum = 80) => {
  const normalized = value?.trim().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  return normalized ? normalized.slice(0, maximum) : fallback;
};

/**
 * Minimum Level 1 deployment branding. This intentionally configures only the
 * client identity presented by the common VisionxAI product shell; it is not a
 * tenant model or a theme-management system.
 */
export function getClientBrandConfig(): ClientBrandConfig {
  return {
    clientDisplayName: cleanLabel(process.env.CLIENT_DISPLAY_NAME, 'NaapLo'),
    clientLogoUrl: '/api/brand/logo',
    providerDisplayName: 'VisionxAI',
    providerAttribution: cleanLabel(process.env.PROVIDER_ATTRIBUTION, 'Powered by VisionxAI', 120),
  };
}
