import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { db } from "../lib/Firebase";
import {
  collection, updateDoc, doc, onSnapshot, setDoc,
  query, orderBy, serverTimestamp, where, Timestamp
} from "firebase/firestore";
import { useAuth } from "./auth-context"; // Adjust path if necessary

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
  markAsRead: () => { },
});

const NOTIFICATION_SEEN_ORDERS_KEY = "seenOrderNotifications";

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Refs for Global Order Tracking & Audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seenOrdersRef = useRef<Set<string>>(
    new Set(JSON.parse(localStorage.getItem(NOTIFICATION_SEEN_ORDERS_KEY) || "[]"))
  );
  const isInitialLoadRef = useRef(true);

  // ------------------------------------------------------------------
  // 1. Load notifications for the Bell UI in real-time
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // 2. GLOBAL ORDER LISTENER (Fixes the "Must be on Orders Page" bug)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!currentUser?.companyId) return;

    // Initialize audio safely
    if (!audioRef.current) {
      // IMPORTANT: Ensure this path matches the sound file in your public folder
      audioRef.current = new Audio('/notification.mp3');
    }

    // Only listen to orders from the last 7 days to prevent heavy reads on load
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 7);

    const q = query(
      collection(db, "companies", currentUser.companyId, "Orders"),
      where("createdAt", ">=", Timestamp.fromDate(dateLimit)),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      // On first load, just record what we already have so we don't spam notifications
      if (isInitialLoadRef.current) {
        snapshot.docs.forEach(doc => seenOrdersRef.current.add(doc.id));
        localStorage.setItem(NOTIFICATION_SEEN_ORDERS_KEY, JSON.stringify(Array.from(seenOrdersRef.current)));
        isInitialLoadRef.current = false;
        return;
      }

      let updated = false;

      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const orderData = change.doc.data();
          const orderId = change.doc.id;

          const isNewOrder = !seenOrdersRef.current.has(orderId);
          const isActiveOrder = orderData.status !== 'Cancelled';

          if (isNewOrder && isActiveOrder) {
            // Play Sound
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(console.error);
            }

            const partyName = orderData.userName || orderData.billingDetails?.name || 'Customer';
            const amount = Number(orderData.totalAmount || 0);

            // Extract the EXACT time the order was created from Firestore
            const exactOrderDate = orderData.createdAt?.toDate
              ? orderData.createdAt.toDate().toISOString()
              : new Date().toISOString();

            // Fire the event payload with the exact time
            window.dispatchEvent(
              new CustomEvent('pdc_notification', {
                detail: {
                  type: 'NEW_ORDER',
                  invoiceNumber: orderData.orderId,
                  partyName: partyName,
                  amount: amount,
                  status: 'UPCOMING',
                  createdAt: exactOrderDate,

                  // ✅ ADD THIS: Pass the unique Firestore document ID
                  orderDocId: orderId,
                },
              })
            );

            seenOrdersRef.current.add(orderId);
            updated = true;
          }
        }
      });

      // Update local storage so we remember these between page refreshes
      if (updated) {
        localStorage.setItem(NOTIFICATION_SEEN_ORDERS_KEY, JSON.stringify(Array.from(seenOrdersRef.current)));
      }
    });

    return () => unsub();
  }, [currentUser?.companyId]);

  // ------------------------------------------------------------------
  // 3. EVENT BUS LISTENER (Writes everything to the database)
  // ------------------------------------------------------------------
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

        const exactTimestamp = detail.createdAt ? new Date(detail.createdAt) : null;

        // ✅ 1. Create a predictable ID if we have an orderDocId, 
        // otherwise generate a random one for manual events.
        const notifRef = detail.orderDocId
          ? doc(db, "companies", currentUser.companyId, "notifications", `notif_${detail.type}_${detail.orderDocId}`)
          : doc(collection(db, "companies", currentUser.companyId, "notifications"));

        // ✅ 2. Use setDoc with merge: true
        await setDoc(
          notifRef,
          {
            message,
            status: detail.status || detail.type,
            // Only set 'read' to false if the document is brand new. 
            // merge: true ensures we don't accidentally mark it unread if another tab already clicked it!
            read: false,
            createdAt: exactTimestamp ? Timestamp.fromDate(exactTimestamp) : serverTimestamp(),
            amount: detail.amount || 0,
          },
          { merge: true }
        );
      } catch (err) {
        console.error("Failed to save notification:", err);
      }
    };

    window.addEventListener("pdc_notification", handlePdc);
    return () => window.removeEventListener("pdc_notification", handlePdc);
  }, [currentUser?.companyId]);

  // ------------------------------------------------------------------
  // 4. MARK AS READ FUNCTION
  // ------------------------------------------------------------------
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