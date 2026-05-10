import { createContext, useContext, type ReactNode } from "react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  readIds: Set<string>;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  bannerQueue: AppNotification[];
  dismissBanner: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const value = useNotifications();
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used inside NotificationProvider");
  return ctx;
}
