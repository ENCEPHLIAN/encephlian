import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, AlertTriangle, CheckCircle2, Brain,
  CreditCard, Clock, AlertCircle, X, ArrowRight,
  Inbox, Eye, Coins, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type AppNotification, type NotifType, type NotifCategory } from "@/hooks/useNotifications";
import { useNotificationContext } from "@/contexts/NotificationContext";
import { useSku } from "@/hooks/useSku";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

/* ─── Notification appearance config ────────────────────── */

const NOTIF_CONFIG: Record<NotifType, {
  icon: any;
  iconBg: string;
  iconColor: string;
  accentColor: string;
}> = {
  triage_complete: {
    icon: CheckCircle2,
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-500",
    accentColor: "bg-emerald-500",
  },
  triage_started: {
    icon: Brain,
    iconBg: "bg-purple-500/15",
    iconColor: "text-purple-500",
    accentColor: "bg-purple-500",
  },
  pipeline_error: {
    icon: AlertCircle,
    iconBg: "bg-destructive/15",
    iconColor: "text-destructive",
    accentColor: "bg-destructive",
  },
  sla_breach: {
    icon: AlertTriangle,
    iconBg: "bg-red-500/15",
    iconColor: "text-red-500",
    accentColor: "bg-red-500",
  },
  sla_warning: {
    icon: Clock,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-500",
    accentColor: "bg-amber-500",
  },
  token_credit: {
    icon: Coins,
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-500",
    accentColor: "bg-blue-500",
  },
  token_low: {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-500",
    accentColor: "bg-amber-500",
  },
};

/* ─── Time grouping ─────────────────────────────────────── */

type TimeGroup = { label: string; notifs: AppNotification[] };

function groupByTime(notifs: AppNotification[]): TimeGroup[] {
  const now = dayjs();
  const groups: Record<string, AppNotification[]> = {
    "Just now":   [],
    "Today":      [],
    "Yesterday":  [],
    "Earlier":    [],
  };

  for (const n of notifs) {
    const t = dayjs(n.createdAt);
    const diffMin = now.diff(t, "minute");
    if (diffMin < 10) {
      groups["Just now"].push(n);
    } else if (t.isSame(now, "day")) {
      groups["Today"].push(n);
    } else if (t.isSame(now.subtract(1, "day"), "day")) {
      groups["Yesterday"].push(n);
    } else {
      groups["Earlier"].push(n);
    }
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, notifs: list }));
}

/* ─── Single notification row ───────────────────────────── */

function NotifRow({
  notif,
  isRead,
  onRead,
  onDismiss,
}: {
  notif: AppNotification;
  isRead: boolean;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  const cfg = NOTIF_CONFIG[notif.type];
  const Icon = cfg.icon;

  const handleClick = () => {
    onRead(notif.id);
    if (notif.href) navigate(notif.href);
  };

  return (
    <div
      className={cn(
        "animate-notif-in group relative flex items-start gap-3 px-4 py-3 transition-colors",
        "hover:bg-muted/50 cursor-pointer",
        !isRead && "bg-primary/3"
      )}
      onClick={handleClick}
    >
      {/* Unread accent bar */}
      {!isRead && (
        <span className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full", cfg.accentColor)} />
      )}

      {/* Icon */}
      <div className={cn(
        "mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
        cfg.iconBg
      )}>
        <Icon className={cn("h-4 w-4", cfg.iconColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-6">
        <p className={cn(
          "text-sm leading-snug",
          !isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"
        )}>
          {notif.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
          {notif.body}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground/60">
            {dayjs(notif.createdAt).fromNow()}
          </span>
          {/* Inline action CTAs — type-specific */}
          {notif.type === "triage_complete" && notif.href && (
            <button
              className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 hover:bg-emerald-500/25 transition-colors"
              onClick={(e) => { e.stopPropagation(); onRead(notif.id); navigate(notif.href!); }}
            >
              Open Report →
            </button>
          )}
          {notif.type === "pipeline_error" && notif.href && (
            <button
              className="text-[10px] bg-destructive/15 text-destructive border border-destructive/30 rounded px-1.5 py-0.5 hover:bg-destructive/25 transition-colors"
              onClick={(e) => { e.stopPropagation(); onRead(notif.id); navigate(notif.href!); }}
            >
              Retry →
            </button>
          )}
          {notif.type === "token_low" && (
            <button
              className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 hover:bg-amber-500/25 transition-colors"
              onClick={(e) => { e.stopPropagation(); onRead(notif.id); navigate("/app/wallet"); }}
            >
              Add Tokens →
            </button>
          )}
          {notif.type === "sla_breach" && notif.href && (
            <button
              className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 hover:bg-red-500/25 transition-colors"
              onClick={(e) => { e.stopPropagation(); onRead(notif.id); navigate(notif.href!); }}
            >
              View Study →
            </button>
          )}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        className="absolute top-2.5 right-3 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onDismiss(notif.id); }}
        title="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ─── Tab bar ───────────────────────────────────────────── */

type FilterTab = "all" | "alert" | "report" | "billing";

function TabBar({
  active,
  onChange,
  counts,
}: {
  active: FilterTab;
  onChange: (t: FilterTab) => void;
  counts: Record<FilterTab, number>;
}) {
  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all",     label: "All"     },
    { id: "alert",   label: "Alerts"  },
    { id: "report",  label: "Reports" },
    { id: "billing", label: "Billing" },
  ];

  return (
    <div className="flex gap-0 border-b border-border/40">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative",
            "hover:text-foreground",
            active === t.id
              ? "text-foreground"
              : "text-muted-foreground"
          )}
        >
          {t.label}
          {counts[t.id] > 0 && t.id !== "all" && (
            <span className={cn(
              "h-4 min-w-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums",
              t.id === "alert" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
            )}>
              {counts[t.id] > 9 ? "9+" : counts[t.id]}
            </span>
          )}
          {active === t.id && (
            <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */

export function NotificationBell() {
  const { notifications, unreadCount, readIds, markAsRead, markAllRead, dismiss } = useNotificationContext();
  const { isPilot } = useSku();

  const [open, setOpen] = useState(false);
  // Pilot sees only reports and alerts, not billing
  const [tab, setTab] = useState<FilterTab>(isPilot ? "report" : "all");
  const [ringing, setRinging] = useState(false);
  const prevUnreadRef = useRef(unreadCount);

  // Trigger bell animation when unread count increases
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setRinging(true);
      const t = setTimeout(() => setRinging(false), 900);
      return () => clearTimeout(t);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // Filter by tab
  const filtered = tab === "all"
    ? notifications
    : notifications.filter((n) => {
        const cat = n.category;
        if (tab === "alert")   return cat === "alert";
        if (tab === "report")  return cat === "report";
        if (tab === "billing") return cat === "billing";
        return true;
      });

  const unreadFiltered = filtered.filter((n) => !readIds.has(n.id)).length;

  // Per-tab unread counts for badges
  const tabCounts: Record<FilterTab, number> = {
    all:     notifications.filter((n) => !readIds.has(n.id)).length,
    alert:   notifications.filter((n) => !readIds.has(n.id) && n.category === "alert").length,
    report:  notifications.filter((n) => !readIds.has(n.id) && n.category === "report").length,
    billing: notifications.filter((n) => !readIds.has(n.id) && n.category === "billing").length,
  };

  const timeGroups = groupByTime(filtered);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell
            className={cn(
              "h-4 w-4 transition-colors",
              unreadCount > 0 ? "text-foreground" : "text-muted-foreground",
              ringing && "animate-bell-ring"
            )}
          />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute top-1 right-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white tabular-nums",
                "bg-destructive min-w-[14px] h-[14px] px-[3px]",
                "transition-transform",
                ringing && "scale-125"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] p-0 shadow-2xl border-border/50 bg-background/95 backdrop-blur"
        style={{ maxHeight: "calc(100vh - 80px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadFiltered > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
                {unreadFiltered} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Eye className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* Tab bar */}
        <TabBar active={tab} onChange={setTab} counts={tabCounts} />

        {/* Notification list */}
        <ScrollArea style={{ maxHeight: "430px" }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Inbox className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {tab === "all" ? "All clear" : `No ${tab} notifications`}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  New activity will appear here in real time
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {timeGroups.map(({ label, notifs }) => (
                <div key={label}>
                  <div className="sticky top-0 z-10 px-4 py-1.5 bg-muted/60 backdrop-blur-sm border-b border-border/20">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {label}
                    </span>
                  </div>
                  {notifs.map((n) => (
                    <NotifRow
                      key={n.id}
                      notif={n}
                      isRead={readIds.has(n.id)}
                      onRead={(id) => { markAsRead(id); setOpen(false); }}
                      onDismiss={dismiss}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border/40 px-4 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/50">
            Real-time · last 7 days
          </span>
          {filtered.length > 0 && unreadFiltered > 0 && (
            <button
              onClick={() => { markAllRead(); }}
              className="text-[10px] text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              Dismiss all visible
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
