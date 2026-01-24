/**
 * SKU Policy System for ENCEPHLIAN
 * 
 * Defines clinic-level feature gating. Backend remains identical;
 * this controls what clinicians see/do at the E-plane (frontend).
 * 
 * Three tiers:
 * - internal: Full enterprise version (dev/ops, growing clinics)
 * - pilot: Minimal value unit (accelerated triage only, pay-per-use)
 * - demo: Showcase mode with guided tutorials
 */

export type SkuTier = 'internal' | 'pilot' | 'demo';

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
  
  // UI Experience
  showGuidedTour: boolean;
  showFullNavigation: boolean;
}

export type SkuCapability = keyof SkuCapabilities;

/**
 * Navigation items visible per SKU tier
 * 
 * - pilot: Absolute minimum for instant value (Dashboard, Studies, Wallet)
 * - demo: Same as internal but with guided overlays
 * - internal: Full enterprise navigation
 */
export type NavItemId = 
  | 'dashboard' 
  | 'studies' 
  | 'lanes' 
  | 'reports' 
  | 'viewer' 
  | 'files' 
  | 'notes' 
  | 'templates' 
  | 'wallet' 
  | 'support';

const PILOT_NAV: NavItemId[] = ['dashboard', 'studies', 'wallet'];
const FULL_NAV: NavItemId[] = ['dashboard', 'studies', 'lanes', 'reports', 'viewer', 'files', 'notes', 'templates', 'wallet', 'support'];

export function getVisibleNavItems(sku: SkuTier): NavItemId[] {
  switch (sku) {
    case 'pilot':
      return PILOT_NAV;
    case 'demo':
    case 'internal':
    default:
      return FULL_NAV;
  }
}

/**
 * SKU Policy Definitions
 * 
 * - internal: Full access, direct API, no payments (dev/ops, enterprise)
 * - pilot: Minimal features, proxy-only, payments enabled (paid pilots, value unit)
 * - demo: Full features visible, guided tour, no real payments (showcase)
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
    enablePayments: true,
    showGuidedTour: false,
    showFullNavigation: true,
  },
  pilot: {
    canSeeDiagnostics: false,
    canRunInference: true,
    canGenerateReport: true,
    canExportReport: true,
    canViewRawWaveforms: true,
    canSeeArtifactsOverlay: false,
    mustUseReadApiProxy: true,
    enablePayments: true,
    showGuidedTour: false,
    showFullNavigation: false,
  },
  demo: {
    canSeeDiagnostics: false,
    canRunInference: true,
    canGenerateReport: true,
    canExportReport: true,
    canViewRawWaveforms: true,
    canSeeArtifactsOverlay: true,
    mustUseReadApiProxy: true,
    enablePayments: false,
    showGuidedTour: true,
    showFullNavigation: true,
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
  internal: 'Internal',
  pilot: 'Pilot',
  demo: 'Demo',
};

/**
 * SKU descriptions for admin UI
 */
export const SKU_DESCRIPTIONS: Record<SkuTier, string> = {
  internal: 'Full platform with all features (development/ops)',
  pilot: 'Production value unit: Upload → Triage → Report',
  demo: 'Showcase mode with guided tutorials and sample data',
};

/**
 * All available SKU tiers for dropdowns
 */
export const SKU_TIERS: SkuTier[] = ['internal', 'pilot', 'demo'];
