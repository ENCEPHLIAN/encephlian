/**
 * SKU Policy System for ENCEPHLIAN
 * 
 * Defines clinic-level feature gating. Backend remains identical;
 * this controls what clinicians see/do at the E-plane (frontend).
 * 
 * Two tiers:
 * - internal: Full dev/ops version with all features (your development build)
 * - pilot: Production value unit (what ships to real clinics)
 * 
 * Note: "Demo Mode" is a separate toggle for viewing sample data,
 * not a SKU tier. Any clinic (pilot or internal) can toggle demo mode.
 */

export type SkuTier = 'internal' | 'pilot';

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
  showFullNavigation: boolean;
}

export type SkuCapability = keyof SkuCapabilities;

/**
 * Navigation items visible per SKU tier
 * 
 * - pilot: Focused flow (Dashboard, Studies, Wallet)
 * - internal: Full navigation
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
    case 'internal':
    default:
      return FULL_NAV;
  }
}

/**
 * SKU Policy Definitions
 * 
 * - internal: Full access, direct API (dev/ops)
 * - pilot: Production value unit, proxy-enforced, payments enabled
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
    showFullNavigation: false,
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
};

/**
 * SKU descriptions for admin UI
 */
export const SKU_DESCRIPTIONS: Record<SkuTier, string> = {
  internal: 'Full platform with all features (development/ops)',
  pilot: 'Production value unit: Upload → Triage → Report',
};

/**
 * All available SKU tiers for dropdowns
 */
export const SKU_TIERS: SkuTier[] = ['internal', 'pilot'];
