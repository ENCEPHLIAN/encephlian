import { useNavigate } from "react-router-dom";
import { Bell, AlertTriangle, FileCheck, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useNotifications, AppNotification, NotifType } from "@/hooks/useNotifications";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const ICON_MAP: Record<NotifType, { icon: any; color: string }> = {
  pipeline_failed: { icon: AlertTriangle, color: "text-destructive" },
  report_ready:    { icon: FileCheck,     color: "text-green-500"   },
  payment_success: { icon: CreditCard,    color: "text-blue-500"    },
  sla_breach:      { icon: AlertTriangle, color: "text-orange-500"  },
};

function NotifRow({
  notif,
  isRead,
  onRead,
}: {
  notif: AppNotification;
  isRead: boolean;
  onRead: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { icon: Icon, color } = ICON_MAP[notif.type];

  const handleClick = () => {
    onRead(notif.id);
    if (notif.href) navigate(notif.href);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
        !isRead && "bg-primary/5"
      )}
    >
      <div className={cn("mt-0.5 shrink-0", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug truncate", !isRead && "font-medium")}>
          {notif.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
          {notif.body}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          {dayjs(notif.createdAt).fromNow()}
        </p>
      </div>
      {!isRead && (
        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
      )}
    </button>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, readIds, markAsRead, markAllRead } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] p-0 shadow-xl border-border/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[400px] overflow-y-auto divide-y divide-border/30">
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((n) => (
              <NotifRow
                key={n.id}
                notif={n}
                isRead={readIds.has(n.id)}
                onRead={markAsRead}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t border-border/40 px-4 py-2.5 text-center">
            <span className="text-xs text-muted-foreground">
              Showing last 7 days
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
