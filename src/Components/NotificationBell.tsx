import React, { useState } from "react";
import { useNotifications } from "../context/NotificationContext";
import { FiBell } from "react-icons/fi";

const NotificationBell: React.FC = () => {
  const { notifications, markAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = () => {
    const newOpen = !open;
    setOpen(newOpen);

    // Mark all unread as read when opening
    if (newOpen) {
      notifications
        .filter((n) => !n.read)
        .forEach((n) => markAsRead(n.id));
    }
  };

  return (
    <div className="relative">
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
            <div className="max-h-64 overflow-y-auto">
              {notifications.slice(0, 5).map((n) => {
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
                    <p>{n.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;