import { useEffect, useRef } from "react";

// Plays a sound when a new Confirmed order comes in. Rides on the
// 'pdc_notification' event NotificationContext already dispatches from its
// single, date-bounded Orders listener — this hook no longer opens its own
// onSnapshot subscription.
export const useOrderSound = (companyId?: string) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);

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

        const handlePdc = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.type === "NEW_ORDER" && detail?.status === "Confirmed") {
                audioRef.current?.play().catch(() => { });
            }
        };

        window.addEventListener("pdc_notification", handlePdc);
        return () => window.removeEventListener("pdc_notification", handlePdc);
    }, [companyId]);
};
