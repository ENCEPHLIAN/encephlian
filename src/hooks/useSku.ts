import { useMemo } from 'react';
import { useUserSession } from '@/contexts/UserSessionContext';
import { getSkuPolicy, hasCapability, SkuCapabilities, SkuCapability, SkuTier } from '@/shared/skuPolicy';

interface UseSkuResult {
  /** Current SKU tier for the user's clinic */
  sku: SkuTier;
  /** Full capabilities object */
  capabilities: SkuCapabilities;
  /** Check if a specific capability is enabled */
  can: (capability: SkuCapability) => boolean;
  /** Whether user is on internal SKU (dev/ops) */
  isInternal: boolean;
  /** Whether user is on pilot SKU */
  isPilot: boolean;
  /** Whether user is on production SKU */
  isProd: boolean;
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
    
    return {
      sku,
      capabilities,
      can: (capability: SkuCapability) => hasCapability(sku, capability),
      isInternal: sku === 'internal',
      isPilot: sku === 'pilot',
      isProd: sku === 'prod',
    };
  }, [clinicContext, isAdmin]);
}
