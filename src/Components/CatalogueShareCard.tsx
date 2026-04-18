import { useEffect, useState } from "react";
import { useAuth } from "../context/auth-context";

const GlobalCatalogueModal = () => {
    const { currentUser } = useAuth();
    const [show, setShow] = useState(false);

    // 1. New state to hold the dynamic subdomain URL
    const [shareUrl, setShareUrl] = useState("");

    useEffect(() => {
        // 2. Catch the custom event payload (e: any)
        const openHandler = (e: any) => {
            // If the layout passed the custom link, use it!
            if (e.detail && e.detail.link) {
                setShareUrl(e.detail.link);
            } else {
                // Safe fallback to the old path just in case
                setShareUrl(`${window.location.origin}/catalogue/${currentUser?.companyId}`);
            }
            setShow(true);
        };

        window.addEventListener("open-catalogue-share", openHandler);

        return () => {
            window.removeEventListener("open-catalogue-share", openHandler);
        };
    }, [currentUser]); // Added currentUser to dependencies

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                onClick={() => setShow(false)}
            />

            <div className="relative bg-white rounded-sm shadow-xl p-5 w-[90%] max-w-sm z-10 animate-in zoom-in duration-200">
                <button
                    className="absolute top-2 right-3 text-gray-500 hover:text-gray-800"
                    onClick={() => setShow(false)}
                >
                    ✕
                </button>

                <h2 className="text-lg font-black text-[#1A3B5D] uppercase tracking-tight text-center mb-4 mt-2">
                    Store Actions
                </h2>

                <div className="flex flex-col gap-3">
                    <button
                        className="w-full py-3 bg-[#1A3B5D] text-white rounded-sm text-sm font-bold uppercase tracking-wider active:scale-95 transition-all"
                        onClick={() => {
                            // 3. Open the dynamic URL
                            window.open(shareUrl, "_blank");
                        }}
                    >
                        View Store
                    </button>

                    <button
                        className="w-full py-3 bg-[#F97316] text-white rounded-sm text-sm font-bold uppercase tracking-wider active:scale-95 transition-all shadow-md"
                        onClick={async () => {
                            // 4. Share the dynamic URL
                            if (navigator.share) {
                                try {
                                    await navigator.share({
                                        title: "Check out my store",
                                        url: shareUrl,
                                    });
                                    return;
                                } catch (err) {
                                    console.log("Share cancelled");
                                }
                            }

                            // Fallback to WhatsApp
                            window.open(
                                `https://wa.me/?text=${encodeURIComponent("Check out my store: " + shareUrl)}`,
                                "_blank"
                            );
                        }}
                    >
                        Share Link
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GlobalCatalogueModal;