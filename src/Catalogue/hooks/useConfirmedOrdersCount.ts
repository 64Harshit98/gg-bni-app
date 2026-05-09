import { useEffect, useState } from "react";
import { db } from "../../lib/Firebase";
import {
    collection,
    query,
    where,
    onSnapshot
} from "firebase/firestore";

export const useConfirmedOrdersCount = (companyId?: string) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!companyId) return;

        const ordersRef = collection(
            db,
            "companies",
            companyId,
            "Orders"
        );

        const q = query(
            ordersRef,
            where("status", "==", "Confirmed")
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {

                // sirf aaj ke orders count karenge
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);

                const todayEnd = new Date();
                todayEnd.setHours(23, 59, 59, 999);

                const todayOrders = snapshot.docs.filter((doc) => {
                    const data = doc.data();

                    if (!data.createdAt) return false;

                    const createdAt = data.createdAt.toDate();

                    return (
                        createdAt >= todayStart &&
                        createdAt <= todayEnd
                    );
                });

                setCount(todayOrders.length);
            },
            (err) => {
                console.error("Realtime count error:", err);
            }
        );

        return () => unsubscribe();

    }, [companyId]);

    return count;
};