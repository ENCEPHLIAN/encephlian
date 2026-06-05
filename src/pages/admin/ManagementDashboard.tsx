/**
 * ManagementDashboard — per-clinic operations dashboard for the `management`
 * role. Mounted by AdminRoute when the user has role 'management' but not
 * 'super_admin'. Super_admin continues to land on AdminDashboard.
 *
 * P0 ships four panels: Throughput (A), Pipeline Health (B), Signal
 * Quality (C), and the always-rendered Honest Gaps footer (G). Panels D
 * (Clinician Utilization), E (Wallet), F (Activity Feed) are P1; cross-
 * clinic benchmark + daily-snapshot table are P2.
 *
 * Density tracks SKU per design §4. P0 ships a single-column-fallback
 * layout for all SKUs — mobile responsive polish is P1.
 *
 * Spec: docs/per_clinic_ops_dashboard_design.md §3 + §10.
 */

import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { AlertCircle, Building2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUserSession } from "@/contexts/UserSessionContext";
import { useSku } from "@/hooks/useSku";
import { useManagementDashboardData } from "@/hooks/useManagementDashboardData";
import ThroughputPanel from "@/components/management/ThroughputPanel";
import PipelineHealthPanel from "@/components/management/PipelineHealthPanel";
import SignalQualityPanel from "@/components/management/SignalQualityPanel";
import HonestGapsFooter from "@/components/management/HonestGapsFooter";

export default function ManagementDashboard() {
  const navigate = useNavigate();
  const { clinicContext } = useUserSession();
  const { isPilot, isInternal } = useSku();
  const data = useManagementDashboardData();

  const clinicName = clinicContext?.clinic_name ?? "your clinic";
  const lastUpdatedAt = data.throughput?.generated_at
    ?? data.pipeline?.generated_at
    ?? data.signalQuality?.generated_at
    ?? null;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-lg font-semibold tracking-tight">
              Operations — {clinicName}
            </h1>
            {isInternal && (
              <Badge variant="outline" className="h-5 text-[10px] uppercase">
                internal
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, d MMMM yyyy · HH:mm")}
            {lastUpdatedAt && (
              <>
                {" · "}
                <span className="text-muted-foreground/70">
                  data {formatDistanceToNow(new Date(lastUpdatedAt), { addSuffix: true })}
                </span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void data.refetch()}
          disabled={data.isLoading}
        >
          <RefreshCw className={"h-3.5 w-3.5 mr-1.5" + (data.isLoading ? " animate-spin" : "")} />
          Refresh
        </Button>
      </header>

      {/* Auth / clinic-missing fallback */}
      {!data.isLoading && !data.clinicId && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
            No clinic linked to your account
          </div>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
            The management dashboard is scoped to one clinic at a time. Your account does not have
            a clinic membership yet — please contact ENCEPHLIAN support to be added.
          </p>
        </div>
      )}

      {/* Query error */}
      {data.isError && data.error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4" />
            Dashboard data failed to load
          </div>
          <p className="text-xs text-red-700/80 dark:text-red-300/80 font-mono leading-snug">
            {data.error.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 border-red-500/30 text-red-700 dark:text-red-300"
            onClick={() => void data.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Panels — single-column fallback for P0 across all SKUs. */}
      {data.clinicId && (
        <>
          <ThroughputPanel
            data={data.throughput}
            isLoading={data.isLoading}
            isPilot={isPilot}
          />
          <PipelineHealthPanel
            data={data.pipeline}
            isLoading={data.isLoading}
            isPilot={isPilot}
          />
          <SignalQualityPanel
            data={data.signalQuality}
            isLoading={data.isLoading}
            isPilot={isPilot}
          />
        </>
      )}

      {/* Honest gaps — always renders, even before clinic resolves. */}
      <HonestGapsFooter />

      {/* Footer: navigation shortcuts the management user may still want.
          These point to existing admin pages — clinician-side drill-down
          stays at /app/* (which management users can also access). */}
      <footer className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
        <button
          onClick={() => navigate("/admin/studies")}
          className="hover:text-foreground transition-colors"
        >
          All studies
        </button>
        <span className="text-border">·</span>
        <button
          onClick={() => navigate("/admin/models")}
          className="hover:text-foreground transition-colors"
        >
          Model status
        </button>
        <span className="text-border">·</span>
        <button
          onClick={() => navigate("/admin/account")}
          className="hover:text-foreground transition-colors"
        >
          Account
        </button>
      </footer>
    </div>
  );
}
