import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { db } from "../lib/Firebase";
import {
  collection, addDoc, updateDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp
} from "firebase/firestore";
import { useAuth } from "./auth-context";

interface Notification {
  id: string;
  message: string;
  read: boolean;
  createdAt?: any;
}

interface NotificationContextType {
  notifications: Notification[];
  markAsRead: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  markAsRead: () => {},
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 1. Load notifications from Firestore in real-time
  useEffect(() => {
    if (!currentUser?.companyId) return;

    const q = query(
      collection(db, "companies", currentUser.companyId, "notifications"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const loaded: Notification[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        message: doc.data().message,
        read: doc.data().read ?? false,
        createdAt: doc.data().createdAt,
      }));
      setNotifications(loaded);
    });

    return () => unsub();
  }, [currentUser?.companyId]);

  // 2. Listen to PDC events and save to Firestore
  useEffect(() => {
    if (!currentUser?.companyId) return;

    const handlePdc = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const message =
        detail.status === "OVERDUE"
          ? `⚠️ Overdue cheque for ${detail.partyName} (Invoice ${detail.invoiceNumber}) — Cheque #${detail.chequeNumber} was due on ${detail.chequeDate}`
          : `🔔 Cheque due soon for ${detail.partyName} (Invoice ${detail.invoiceNumber}) — Cheque #${detail.chequeNumber} on ${detail.chequeDate}`;

      try {
        await addDoc(
          collection(db, "companies", currentUser.companyId!, "notifications"),
          {
            message,
            read: false,
            createdAt: serverTimestamp(),
          }
        );
      } catch (err) {
        console.error("Failed to save notification:", err);
      }
    };

    window.addEventListener("pdc_notification", handlePdc);
    return () => window.removeEventListener("pdc_notification", handlePdc);
  }, [currentUser?.companyId]);

  // 3. Mark as read — update Firestore
  const markAsRead = useCallback(
    async (id: string) => {
      if (!currentUser?.companyId) return;
      try {
        await updateDoc(
          doc(db, "companies", currentUser.companyId, "notifications", id),
          { read: true }
        );
      } catch (err) {
        console.error("Failed to mark notification as read:", err);
      }
    },
    [currentUser?.companyId]
  );

  return (
    <NotificationContext.Provider value={{ notifications, markAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);