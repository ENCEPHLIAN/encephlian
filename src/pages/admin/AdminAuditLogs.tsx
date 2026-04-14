import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, User, Building2, FileText, Shield,
  Trash2, ScrollText, ChevronDown, ChevronRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  event_type: string;
  event_data: Record<string, any>;
  created_at: string;
};

type DateRange = "24h" | "7d" | "30d" | "all";

const DATE_RANGE_LIMIT: Record<DateRange, number> = {
  "24h": 50,
  "7d": 200,
  "30d": 500,
  all: 1000,
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  "24h": "Last 24h",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

function getEventCategory(eventType: string): string {
  if (eventType.includes("user")) return "user";
  if (eventType.includes("clinic")) return "clinic";
  if (eventType.includes("study")) return "study";
  if (eventType.includes("role")) return "role";
  if (eventType.includes("cleanup") || eventType.includes("delete")) return "cleanup";
  return "other";
}

function getEventIcon(eventType: string) {
  const cat = getEventCategory(eventType);
  if (cat === "user") return User;
  if (cat === "clinic") return Building2;
  if (cat === "study") return FileText;
  if (cat === "role") return Shield;
  if (cat === "cleanup") return Trash2;
  return ScrollText;
}

function getEventBadgeClass(eventType: string): string {
  const cat = getEventCategory(eventType);
  if (cat === "user") return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
  if (cat === "clinic") return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
  if (cat === "study") return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  if (cat === "role") return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
  if (cat === "cleanup") return ""; // use destructive variant
  return ""; // use outline variant
}

function getEventBadgeVariant(eventType: string): "destructive" | "outline" | "secondary" {
  const cat = getEventCategory(eventType);
  if (cat === "cleanup") return "destructive";
  if (cat === "other") return "outline";
  return "secondary";
}

function extractTarget(eventData: Record<string, any>): string | null {
  if (eventData?.clinic_name) return eventData.clinic_name;
  if (eventData?.user_email) return eventData.user_email;
  if (eventData?.study_id) return String(eventData.study_id).slice(0, 8) + "…";
  if (eventData?.clinic_id) return String(eventData.clinic_id).slice(0, 8) + "…";
  return null;
}

function EventDataDetails({ data }: { data: Record<string, any> }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs text-muted-foreground italic">No details</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground font-mono py-0.5 whitespace-nowrap">{k}</dt>
          <dd className="font-mono text-foreground break-all py-0.5">
            {v === null ? (
              <span className="text-muted-foreground/60">null</span>
            ) : typeof v === "object" ? (
              <span className="text-muted-foreground">{JSON.stringify(v)}</span>
            ) : (
              String(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminAuditLogs() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const limit = DATE_RANGE_LIMIT[dateRange];

  const { data: logs, isLoading, dataUpdatedAt } = useQuery<AuditLog[]>({
    queryKey: ["admin-audit-logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_recent_audit_logs", {
        p_limit: limit,
      });
      if (error) throw error;
      return data as AuditLog[];
    },
    refetchInterval: 30000,
  });

  const uniqueActors = useMemo(() => {
    if (!logs) return [];
    const seen = new Set<string>();
    const actors: string[] = [];
    for (const log of logs) {
      if (log.actor_email && !seen.has(log.actor_email)) {
        seen.add(log.actor_email);
        actors.push(log.actor_email);
      }
    }
    return actors.sort();
  }, [logs]);

  const filtered = useMemo(() => {
    if (!logs) return [];
    return logs.filter((log) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !log.event_type.toLowerCase().includes(q) &&
          !log.actor_email?.toLowerCase().includes(q)
        ) return false;
      }
      if (categoryFilter !== "all") {
        if (getEventCategory(log.event_type) !== categoryFilter) return false;
      }
      if (actorFilter !== "all") {
        if (log.actor_email !== actorFilter) return false;
      }
      return true;
    });
  }, [logs, search, categoryFilter, actorFilter]);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const lastRefresh = dataUpdatedAt
    ? format(new Date(dataUpdatedAt), "HH:mm:ss")
    : null;

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {logs?.length ?? 0} events loaded
          {lastRefresh && <span className="ml-2 opacity-60">· refreshed {lastRefresh}</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Event or actor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="clinic">Clinic</SelectItem>
            <SelectItem value="study">Study</SelectItem>
            <SelectItem value="role">Role</SelectItem>
            <SelectItem value="cleanup">Cleanup</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actorFilter} onValueChange={setActorFilter}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="All actors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            {uniqueActors.map((email) => (
              <SelectItem key={email} value={email}>{email}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((k) => (
              <SelectItem key={k} value={k}>{DATE_RANGE_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || categoryFilter !== "all" || actorFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => { setSearch(""); setCategoryFilter("all"); setActorFilter("all"); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-6" />
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Event</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Actor</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Target</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length > 0 ? (
                filtered.map((log) => {
                  const Icon = getEventIcon(log.event_type);
                  const isExpanded = expandedRows.has(log.id);
                  const target = extractTarget(log.event_data);
                  const badgeVariant = getEventBadgeVariant(log.event_type);
                  const badgeClass = getEventBadgeClass(log.event_type);
                  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

                  return (
                    <>
                      <tr
                        key={log.id}
                        className="hover:bg-accent/20 transition-colors cursor-pointer"
                        onClick={() => toggleRow(log.id)}
                      >
                        {/* Expand toggle */}
                        <td className="pl-3 pr-1 py-3 text-muted-foreground/50">
                          <ChevronIcon className="h-3.5 w-3.5" />
                        </td>

                        {/* Event type */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <Badge
                              variant={badgeVariant}
                              className={cn("font-mono text-[10px] h-4 px-1.5", badgeClass)}
                            >
                              {log.event_type}
                            </Badge>
                          </div>
                        </td>

                        {/* Actor */}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {log.actor_email ?? (
                            <span className="italic opacity-60">system</span>
                          )}
                        </td>

                        {/* Target */}
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          {target ?? <span className="opacity-40">—</span>}
                        </td>

                        {/* When */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          <span
                            title={format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                            className="cursor-default"
                          >
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded details */}
                      {isExpanded && (
                        <tr key={`${log.id}-details`} className="bg-muted/20">
                          <td />
                          <td colSpan={4} className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                Event data
                              </p>
                              <EventDataDetails data={log.event_data} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    No audit events match current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
