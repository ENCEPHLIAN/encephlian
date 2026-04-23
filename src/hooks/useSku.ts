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
  /**
   * Whether this user should see / transact in a token wallet.
   *
   * FALSE for super_admin and management — they don't sign reports, don't
   * top up tokens, and the DB refuses to credit them (see migration
   * 20260423020000_gate_wallets_to_clinicians.sql). UI uses this to hide
   * the Wallet nav entry, the Billing dropdown, and render a "—" instead
   * of a balance.
   */
  hasWallet: boolean;
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
 * Admin roles (super_admin / management) still inherit the `internal` SKU
 * capability surface so they can access every admin feature, but they are
 * flagged `hasWallet = false` and the 'wallet' nav item is stripped so
 * nothing wallet-shaped renders for them.
 */
export function useSku(): UseSkuResult {
  const { clinicContext, isAdmin } = useUserSession();

  return useMemo(() => {
    const rawSku = isAdmin ? 'internal' : (clinicContext?.sku as SkuTier | undefined);
    const sku: SkuTier = rawSku || 'pilot';
    const capabilities = getSkuPolicy(sku);
    const baseNav = getVisibleNavItems(sku);

    const hasWallet = !isAdmin;
    const visibleNav = hasWallet ? baseNav : baseNav.filter((id) => id !== 'wallet');

    return {
      sku,
      capabilities,
      can: (capability: SkuCapability) => hasCapability(sku, capability),
      isInternal: sku === 'internal',
      isPilot: sku === 'pilot',
      hasWallet,
      visibleNav,
      isNavVisible: (id: NavItemId) => visibleNav.includes(id),
    };
  }, [clinicContext, isAdmin]);
}
