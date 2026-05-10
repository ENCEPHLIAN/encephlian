import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, AppNotification } from "@/hooks/useNotifications";

/* ─── Single banner ─────────────────────────────────────── */

function Banner({
  notif,
  onDismiss,
}: {
  notif: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(notif.id), 8000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [notif.id, onDismiss]);

  const isError = notif.type === "pipeline_error" || notif.type === "sla_breach";
  const Icon = isError ? AlertCircle : CheckCircle2;

  return (
    <div
      className={cn(
        "animate-slide-down flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border",
        "max-w-lg w-full mx-auto",
        isError
          ? "bg-destructive/10 border-destructive/20 text-destructive"
          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{notif.title}</p>
        <p className="text-xs opacity-80 mt-0.5 line-clamp-1">{notif.body}</p>
      </div>
      {notif.href && (
        <button
          onClick={() => { onDismiss(notif.id); navigate(notif.href!); }}
          className="flex items-center gap-1 text-xs font-medium opacity-80 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
        >
          View <ArrowRight className="h-3 w-3" />
        </button>
      )}
      <button
        onClick={() => onDismiss(notif.id)}
        className="opacity-50 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */

export function LiveAlertBanner() {
  const { bannerQueue, dismissBanner } = useNotifications();

  if (bannerQueue.length === 0) return null;

  return (
    <div className="fixed top-[68px] inset-x-0 z-50 flex flex-col gap-2 px-4 pointer-events-none">
      {bannerQueue.slice(0, 3).map((notif) => (
        <div key={notif.id} className="pointer-events-auto">
          <Banner notif={notif} onDismiss={dismissBanner} />
        </div>
      ))}
    </div>
  );
}
