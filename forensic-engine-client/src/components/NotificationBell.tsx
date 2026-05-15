import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Bell, Check, CheckCheck, ExternalLink, FileText, AlertTriangle, MessageSquare, Link2, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  share_accessed: { icon: Link2, color: "text-emerald-400", label: "Share Link" },
  extraction_complete: { icon: FileText, color: "text-blue-400", label: "Extraction" },
  new_findings: { icon: AlertTriangle, color: "text-amber-400", label: "Findings" },
  case_status: { icon: Check, color: "text-teal-400", label: "Case Update" },
  feedback_response: { icon: MessageSquare, color: "text-purple-400", label: "Feedback" },
  share_expiring: { icon: Clock, color: "text-orange-400", label: "Expiring" },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const { data: unreadCount = 0 } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 15000, // Poll every 15s
  });

  const { data: notifs = [], refetch } = trpc.notifications.list.useQuery(undefined, {
    enabled: open,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => { refetch(); },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => { refetch(); },
  });

  const utils = trpc.useUtils();

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleNotifClick(notif: any) {
    if (!notif.readAt) {
      markRead.mutate({ notificationId: notif.id });
      utils.notifications.unreadCount.invalidate();
    }
    if (notif.linkUrl) {
      navigate(notif.linkUrl);
      setOpen(false);
    }
  }

  function handleMarkAllRead() {
    markAllRead.mutate();
    utils.notifications.unreadCount.invalidate();
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[500px] bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={handleMarkAllRead}
                >
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />
                  Mark all read
                </Button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto flex-1">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No notifications yet</p>
                <p className="text-xs mt-1 opacity-60">We'll let you know when something important happens</p>
              </div>
            ) : (
              notifs.map((notif: any) => {
                const config = TYPE_CONFIG[notif.type] || { icon: Bell, color: "text-muted-foreground", label: "Update" };
                const Icon = config.icon;
                const isUnread = !notif.readAt;

                return (
                  <button
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-white/5 transition-colors flex gap-3 ${
                      isUnread ? "bg-white/[0.03]" : "opacity-70"
                    }`}
                  >
                    {/* Icon */}
                    <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-sm font-medium ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                          {notif.title}
                        </span>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${config.color} bg-white/5`}>
                          {config.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">
                          {timeAgo(notif.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Link indicator */}
                    {notif.linkUrl && (
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 mt-1 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
