import React, { useState, useEffect, useRef } from "react";
import { useNotifications } from "../context/NotificationContext";
import { FiBell } from "react-icons/fi";

const NotificationBell: React.FC = () => {
  const { notifications, markAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = () => {
    const newOpen = !open;
    setOpen(newOpen);

    if (newOpen) {
      setVisibleCount(5);
    }

    // Mark all unread as read when opening
    if (newOpen) {
      notifications
        .filter((n) => !n.read)
        .forEach((n) => markAsRead(n.id));
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        open &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="cursor-pointer relative" onClick={handleOpen}>
        <FiBell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-1 rounded-full">
            {unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white shadow-lg rounded-lg z-50">
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No notifications</p>
          ) : (
            <>
            <div className="max-h-80 overflow-y-auto rounded-sm">
              {notifications.slice(0, visibleCount).map((n) => {
                let bgColor = "bg-white";

                if (n.status === "OVERDUE") {
                  bgColor = "bg-red-50";
                } else if (n.status === "UPCOMING") {
                  bgColor = "bg-yellow-50";
                } else if (n.status === "PAID") {
                  bgColor = "bg-green-50";
                }

                return (
                  <div
                    key={n.id}
                    className={`p-3 border-b text-sm text-gray-700 ${bgColor}`}
                  >
                    <div className="flex flex-col gap-1">
                      <p className="leading-snug">{n.message}</p>

                      {n.createdAt && (
                        <div className="text-[11px] text-gray-500 text-right">
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
              <div className="p-2 text-center border-t">
                <button
                  onClick={() => setVisibleCount((prev) => prev + 10)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Load more
                </button>
              </div>
            )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;