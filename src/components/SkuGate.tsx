import { ReactNode } from 'react';
import { useSku } from '@/hooks/useSku';
import { SkuCapability } from '@/shared/skuPolicy';

interface SkuGateProps {
  /** The capability required to show children */
  capability: SkuCapability;
  /** Content to render when capability is enabled */
  children: ReactNode;
  /** Optional fallback content when capability is disabled */
  fallback?: ReactNode;
  /** If true, hides completely instead of showing fallback */
  hideOnly?: boolean;
}

/**
 * SKU-gated wrapper component
 * 
 * Shows children only if the current clinic's SKU allows the specified capability.
 * Use this to hide/disable admin-ish features for pilot clinics.
 * 
 * @example
 * <SkuGate capability="canSeeDiagnostics">
 *   <DiagnosticsPanel />
 * </SkuGate>
 * 
 * @example
 * <SkuGate capability="canExportReport" fallback={<UpgradePrompt />}>
 *   <ExportButton />
 * </SkuGate>
 */
export function SkuGate({ capability, children, fallback = null, hideOnly = false }: SkuGateProps) {
  const { can } = useSku();
  
  if (can(capability)) {
    return <>{children}</>;
  }
  
  if (hideOnly) {
    return null;
  }
  
  return <>{fallback}</>;
}

/**
 * Hook-based alternative for conditional logic in code
 */
export function useSkuGate(capability: SkuCapability): boolean {
  const { can } = useSku();
  return can(capability);
}
