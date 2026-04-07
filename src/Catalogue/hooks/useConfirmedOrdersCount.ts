import { useEffect, useState } from "react";
import { db } from "../../lib/Firebase";
import {
    collection,
    getDocs,
    query,
    where,
    Timestamp
} from "firebase/firestore";

export const useConfirmedOrdersCount = (companyId?: string) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!companyId) return;

        const fetchCount = async () => {
            try {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);

                const todayEnd = new Date();
                todayEnd.setHours(23, 59, 59, 999);

                const ordersRef = collection(
                    db,
                    "companies",
                    companyId,
                    "Orders"
                );

                const q = query(
                    ordersRef,
                    where("status", "==", "Confirmed"),
                    where("createdAt", ">=", Timestamp.fromDate(todayStart)),
                    where("createdAt", "<=", Timestamp.fromDate(todayEnd))
                );

                const snapshot = await getDocs(q);

                setCount(snapshot.size); 
            } catch (err) {
                console.error("Count fetch error:", err);
            }
        };

        fetchCount();
    }, [companyId]);

    return count;
};