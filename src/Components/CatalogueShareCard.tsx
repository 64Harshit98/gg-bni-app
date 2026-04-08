import { useEffect, useState } from "react";
import { useAuth } from "../context/auth-context";

const GlobalCatalogueModal = () => {
    const { currentUser } = useAuth();
    const [show, setShow] = useState(false);

    useEffect(() => {
        const openHandler = () => setShow(true);

        window.addEventListener("open-catalogue-share", openHandler);

        return () => {
            window.removeEventListener("open-catalogue-share", openHandler);
        };
    }, []);
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-500 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                onClick={() => setShow(false)}
            />

            <div className="relative bg-white rounded-sm shadow-xl p-5 w-[90%] max-w-sm z-10">
                <button
                    className="absolute top-2 right-3"
                    onClick={() => setShow(false)}
                >
                    ✕
                </button>

                <h2 className="text-lg font-semibold text-center mb-4">
                    Catalogue Actions
                </h2>

                <div className="flex flex-col gap-3">
                    <button
                        className="w-full py-2 bg-blue-500 text-white"
                        onClick={() => {
                            window.open(`/catalogue/${currentUser?.companyId}`, "_blank");
                        }}
                    >
                        View Catalogue
                    </button>

                    <button
                        className="w-full py-2 bg-green-500 text-white"
                        onClick={async () => {
                            const url = `${window.location.origin}/catalogue/${currentUser?.companyId}`;

                            if (navigator.share) {
                                try {
                                    await navigator.share({
                                        title: "Check my catalogue",
                                        url: url,
                                    });
                                    return;
                                } catch (err) {
                                    console.log("Share cancelled");
                                }
                            }

                            window.open(
                                `https://wa.me/?text=${encodeURIComponent(url)}`,
                                "_blank"
                            );
                        }}
                    >
                        Share Catalogue
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GlobalCatalogueModal;