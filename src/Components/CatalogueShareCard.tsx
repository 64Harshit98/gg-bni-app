import { useEffect, useState } from "react";
import { useAuth } from "../context/auth-context";
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';

const GlobalCatalogueModal = () => {
    const { currentUser } = useAuth();
    const [show, setShow] = useState(false);
    const [shareUrl, setShareUrl] = useState("");

    // 1. Actively fetch the absolute best link for the user behind the scenes
    useEffect(() => {
        const fetchBestLink = async () => {
            if (!currentUser?.companyId) return;

            // Set the dev/fallback link immediately just in case
            const fallbackUrl = `${window.location.origin}/catalogue/${currentUser.companyId}`;
            setShareUrl(fallbackUrl);

            try {
                // Check if they have a custom subdomain
                const docRef = doc(db, 'companies', currentUser.companyId);
                const snap = await getDoc(docRef);
                if (snap.exists() && snap.data().subdomain) {
                    // Overwrite with the custom link!
                    setShareUrl(`https://${snap.data().subdomain}.sellar.in`);
                }
            } catch (err) {
                console.error("Error fetching subdomain for modal:", err);
            }
        };
        fetchBestLink();
    }, [currentUser]);

    // 2. Handle opening the modal
    useEffect(() => {
        const openHandler = (e: any) => {
            // If the event specifically forced a link, use it, otherwise keep the one we fetched
            if (e.detail && e.detail.link) {
                setShareUrl(e.detail.link);
            }
            setShow(true);
        };

        window.addEventListener("open-catalogue-share", openHandler);
        return () => window.removeEventListener("open-catalogue-share", openHandler);
    }, []);

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
                            window.open(shareUrl, "_blank");
                        }}
                    >
                        View Store
                    </button>

                    <button
                        className="w-full py-3 bg-[#F97316] text-white rounded-sm text-sm font-bold uppercase tracking-wider active:scale-95 transition-all shadow-md"
                        onClick={async () => {
                            if (navigator.share) {
                                try {
                                    await navigator.share({
                                        title: "Check out my online store!",
                                        text: "Discover our complete range of products and exclusive offers. View our digital catalog here:",
                                        url: shareUrl,
                                    });
                                    return;
                                } catch (err) {
                                    console.log("Share cancelled");
                                }
                            }

                            // Fallback: copy link instead of opening WhatsApp
                            try {
                                await navigator.clipboard.writeText(shareUrl);
                                alert("Link copied to clipboard");
                            } catch (err) {
                                console.error("Clipboard copy failed:", err);
                            }
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