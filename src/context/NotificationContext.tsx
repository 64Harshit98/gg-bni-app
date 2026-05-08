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
  status?: string;
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
        status: doc.data().status,
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
      let message = "";

      if (detail.type === "NEW_ORDER") {
        message = `🔔 New order from ${detail.partyName || "Customer"} (Order ${detail.invoiceNumber || "-"}) — Amount ₹${detail.amount || 0}`;
      } else if (detail.type === "PAYMENT_RECEIVED") {
        message = `✅ Payment received from ${detail.partyName || "Customer"} (Order ${detail.invoiceNumber || "-"}) — Amount ₹${detail.amount || 0}`;
      } else if (detail.status === "OVERDUE") {
        message = `⚠️ Overdue cheque for ${detail.partyName} (Invoice ${detail.invoiceNumber}) — Cheque #${detail.chequeNumber} of ₹${detail.amount} was due on ${detail.chequeDate}`;
      } else if (detail.status === "UPCOMING") {
        message = `🔔 Cheque due soon for ${detail.partyName} (Invoice ${detail.invoiceNumber}) — Cheque #${detail.chequeNumber} of ₹${detail.amount} on ${detail.chequeDate}`;
      } else if (detail.status === "PAID") {
        message = `✅ Payment received from ${detail.partyName} (Invoice ${detail.invoiceNumber}) — Amount ₹${detail.amount}`;
      }

      try {
        if (!message) return;
        await addDoc(
          collection(db, "companies", currentUser.companyId!, "notifications"),
          {
            message,
            status: detail.status,
            read: false,
            createdAt: serverTimestamp(),
            amount: detail.amount || 0,
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