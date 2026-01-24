/**
 * SKU Policy System for ENCEPHLIAN
 * 
 * Defines clinic-level feature gating. Backend remains identical;
 * this controls what clinicians see/do at the E-plane (frontend).
 */

export type SkuTier = 'internal' | 'pilot' | 'prod';

export interface SkuCapabilities {
  // Admin/diagnostic features
  canSeeDiagnostics: boolean;
  canRunInference: boolean;
  canGenerateReport: boolean;
  canExportReport: boolean;
  
  // Viewer features
  canViewRawWaveforms: boolean;
  canSeeArtifactsOverlay: boolean;
  
  // Infrastructure
  mustUseReadApiProxy: boolean;
  
  // Billing
  enablePayments: boolean;
}

export type SkuCapability = keyof SkuCapabilities;

/**
 * SKU Policy Definitions
 * 
 * - internal: Full access, direct API, no payments (dev/ops)
 * - pilot: Limited features, proxy-only, payments enabled (paid pilots)
 * - prod: Full features, proxy recommended, payments enabled (production)
 */
const SKU_POLICIES: Record<SkuTier, SkuCapabilities> = {
  internal: {
    canSeeDiagnostics: true,
    canRunInference: true,
    canGenerateReport: true,
    canExportReport: true,
    canViewRawWaveforms: true,
    canSeeArtifactsOverlay: true,
    mustUseReadApiProxy: false,
    enablePayments: false,
  },
  pilot: {
    canSeeDiagnostics: false,
    canRunInference: true,
    canGenerateReport: true,
    canExportReport: false,
    canViewRawWaveforms: true,
    canSeeArtifactsOverlay: false,
    mustUseReadApiProxy: true,
    enablePayments: true,
  },
  prod: {
    canSeeDiagnostics: false,
    canRunInference: true,
    canGenerateReport: true,
    canExportReport: true,
    canViewRawWaveforms: true,
    canSeeArtifactsOverlay: true,
    mustUseReadApiProxy: true,
    enablePayments: true,
  },
};

/**
 * Get capabilities for a given SKU tier
 */
export function getSkuPolicy(sku: SkuTier | string | null | undefined): SkuCapabilities {
  const tier = (sku as SkuTier) || 'pilot';
  return SKU_POLICIES[tier] || SKU_POLICIES.pilot;
}

/**
 * Check if a specific capability is enabled for a SKU
 */
export function hasCapability(sku: SkuTier | string | null | undefined, capability: SkuCapability): boolean {
  const policy = getSkuPolicy(sku);
  return policy[capability];
}

/**
 * SKU display labels for admin UI
 */
export const SKU_LABELS: Record<SkuTier, string> = {
  internal: 'Internal (Dev)',
  pilot: 'Pilot',
  prod: 'Production',
};

/**
 * All available SKU tiers for dropdowns
 */
export const SKU_TIERS: SkuTier[] = ['internal', 'pilot', 'prod'];
