import React, { useState } from "react";
import { useNotifications } from "../context/NotificationContext";
import { FiBell } from "react-icons/fi";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../Components/ui/popover"; // Adjust import path as needed

const NotificationBell: React.FC = () => {
  const { notifications, markAsRead } = useNotifications();
  const [visibleCount, setVisibleCount] = useState(5);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setVisibleCount(5);
      // Mark all unread as read when opening
      notifications
        .filter((n) => !n.read)
        .forEach((n) => markAsRead(n.id));
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div className="cursor-pointer relative z-50 flex items-center justify-center p-2 rounded-md hover:bg-muted transition-colors">
          <FiBell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full translate-x-1 -translate-y-1">
              {unreadCount}
            </span>
          )}
        </div>
      </PopoverTrigger>

      {/* align="end" tells it to align to the right edge of the bell.
        The Popover will automatically shift left if it hits the screen edge!
        sideOffset={8} gives it a little breathing room from the bell icon.
      */}
      <PopoverContent
        align="end"
        sideOffset={8}
        className="z-[9999] w-80 max-w-[90vw] p-0 shadow-lg sm:max-w-sm"      >
        {notifications.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No notifications</p>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto rounded-t-md">
              {notifications.slice(0, visibleCount).map((n) => {
                let bgColor = "bg-card";

                if (n.status === "OVERDUE") {
                  bgColor = "bg-destructive/10";
                } else if (n.status === "UPCOMING" || n.status === "Upcoming") {
                  bgColor = "bg-warning/10";
                } else if (n.status === "PAID") {
                  bgColor = "bg-success/10";
                } else if (n.status === "Confirmed") {
                  bgColor = "bg-info/10";
                }

                return (
                  <div
                    key={n.id}
                    className={`py-3 pl-3 pr-4 border-b text-sm text-foreground ${bgColor}`}
                  >
                    <div className="flex flex-col gap-1">
                      <p className="leading-snug">{n.message}</p>

                      {n.createdAt && (
                        <div className="text-[11px] text-muted-foreground text-right">
                          {new Date(n.createdAt.seconds * 1000).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {visibleCount < notifications.length && (
              <div className="p-2 text-center border-t bg-muted rounded-b-md">
                <button
                  onClick={(e) => {
                    e.preventDefault(); // Prevent closing the popover
                    setVisibleCount((prev) => prev + 10);
                  }}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;