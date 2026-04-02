import { useEffect, useRef } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../lib/Firebase";

export const useOrderSound = (companyId?: string) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const seenOrdersRef = useRef<Set<string>>(
        new Set(JSON.parse(localStorage.getItem("seenOrders") || "[]"))
    );

    const isInitialLoad = useRef(true); 

    useEffect(() => {
        const audio = new Audio("/sounds/order-confirmed.mp3");
        audio.preload = "auto";
        audioRef.current = audio;

        const unlock = () => {
            audio.muted = true;
            audio.play()
                .then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.muted = false;
                })
                .catch(() => { });

            window.removeEventListener("pointerdown", unlock);
        };

        window.addEventListener("pointerdown", unlock);

        return () => window.removeEventListener("pointerdown", unlock);
    }, []);

    useEffect(() => {
        if (!companyId) return;

        const q = query(
            collection(db, "companies", companyId, "Orders"),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (isInitialLoad.current) {
                snapshot.docs.forEach(doc => {
                    seenOrdersRef.current.add(doc.id);
                });

                isInitialLoad.current = false;
                return;
            }

            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const doc = change.doc;
                    const data = doc.data();

                    if (
                        !seenOrdersRef.current.has(doc.id) &&
                        data.status === "Confirmed"
                    ) {
                        audioRef.current?.play().catch(() => { });
                        seenOrdersRef.current.add(doc.id);
                    }
                }
            });

            localStorage.setItem(
                "seenOrders",
                JSON.stringify(Array.from(seenOrdersRef.current))
            );
        });

        return () => unsubscribe();
    }, [companyId]);
};