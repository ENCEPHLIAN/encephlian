import { useMemo } from 'react';
import { useUserSession } from '@/contexts/UserSessionContext';
import { 
  getSkuPolicy, 
  hasCapability, 
  getVisibleNavItems,
  SkuCapabilities, 
  SkuCapability, 
  SkuTier,
  NavItemId 
} from '@/shared/skuPolicy';

interface UseSkuResult {
  /** Current SKU tier for the user's clinic */
  sku: SkuTier;
  /** Full capabilities object */
  capabilities: SkuCapabilities;
  /** Check if a specific capability is enabled */
  can: (capability: SkuCapability) => boolean;
  /** Whether user is on internal SKU (dev/ops) */
  isInternal: boolean;
  /** Whether user is on pilot SKU (production value unit) */
  isPilot: boolean;
  /** Whether user is on demo SKU (showcase) */
  isDemo: boolean;
  /** Navigation items visible for this SKU */
  visibleNav: NavItemId[];
  /** Check if a nav item is visible */
  isNavVisible: (id: NavItemId) => boolean;
}

/**
 * Hook to access SKU-based feature gating
 * 
 * Reads clinic SKU from UserSessionContext and returns
 * computed capabilities for the current tenant.
 * 
 * Admin users (super_admin/management) always see internal capabilities.
 */
export function useSku(): UseSkuResult {
  const { clinicContext, isAdmin } = useUserSession();
  
  return useMemo(() => {
    // Admins always get internal SKU capabilities
    const rawSku = isAdmin ? 'internal' : (clinicContext?.sku as SkuTier | undefined);
    const sku: SkuTier = rawSku || 'pilot';
    const capabilities = getSkuPolicy(sku);
    const visibleNav = getVisibleNavItems(sku);
    
    return {
      sku,
      capabilities,
      can: (capability: SkuCapability) => hasCapability(sku, capability),
      isInternal: sku === 'internal',
      isPilot: sku === 'pilot',
      isDemo: false, // Demo is now a mode toggle, not a SKU
      visibleNav,
      isNavVisible: (id: NavItemId) => visibleNav.includes(id),
    };
  }, [clinicContext, isAdmin]);
}
