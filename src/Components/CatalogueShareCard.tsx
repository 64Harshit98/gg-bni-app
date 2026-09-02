import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/auth-context";
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import QRCode from 'react-qr-code';

const GlobalCatalogueModal = () => {
    const { currentUser } = useAuth();
    const [show, setShow] = useState(false);
    const [shareUrl, setShareUrl] = useState("");
     const [companyName, setCompanyName] = useState("Our Store");
    const qrPrintRef = useRef<HTMLDivElement>(null);

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
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.subdomain) {
                        // Overwrite with the custom link!
                        setShareUrl(`https://${data.subdomain}.sellar.in`);
                    }
                    if (data.name || data.businessName) {
                        setCompanyName(data.name || data.businessName);
                    }
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

    const handlePrintQR = () => {
        const qrMarkup = qrPrintRef.current?.innerHTML;
        if (!qrMarkup) return;

        const printWindow = window.open("", "_blank", "width=500,height=650");
        if (!printWindow) {
            alert("Popup blocked. Please allow popups to print the QR code.");
            return;
        }

        printWindow.document.write(`
            <html>
                <head>
                    <title>Store QR Code</title>
                    <style>
                        * { box-sizing: border-box; }
                        body {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            margin: 0;
                            padding: 24px;
                            font-family: 'Segoe UI', Arial, sans-serif;
                            background: #f4f6f8;
                        }
                        .card {
                            width: 100%;
                            max-width: 380px;
                            background: #ffffff;
                            border-radius: 20px;
                            padding: 36px 32px 28px;
                            text-align: center;
                            box-shadow: 0 10px 30px rgba(26, 59, 93, 0.08);
                            border: 1px solid #e7ebf0;
                            position: relative;
                        }
                        .accent-bar {
                            height: 6px;
                            width: 64px;
                            background: linear-gradient(90deg, #1A3B5D, #F97316);
                            border-radius: 999px;
                            margin: 0 auto 20px;
                        }
                        .eyebrow {
                            font-size: 11px;
                            font-weight: 700;
                            letter-spacing: 2px;
                            text-transform: uppercase;
                            color: #F97316;
                            margin: 0 0 6px;
                        }
                        h1 {
                            font-size: 20px;
                            font-weight: 800;
                            color: #1A3B5D;
                            margin: 0 0 4px;
                        }
                        .subtitle {
                            font-size: 13px;
                            color: #7b8794;
                            margin: 0 0 24px;
                        }
                        .qr-wrap {
                            display: inline-block;
                            padding: 18px;
                            border: 2px solid #1A3B5D;
                            border-radius: 16px;
                            margin-bottom: 20px;
                        }
                        .qr-wrap svg { width: 240px; height: 240px; display: block; }
                        .url-box {
                            font-size: 12.5px;
                            color: #1A3B5D;
                            font-weight: 600;
                            word-break: break-all;
                            background: #f4f6f8;
                            border-radius: 10px;
                            padding: 10px 14px;
                            margin: 0 0 4px;
                        }
                        .footer-note {
                            font-size: 10.5px;
                            color: #b0b8c1;
                            margin-top: 16px;
                            letter-spacing: 0.5px;
                        }
                        @media print {
                            body { background: #fff; padding: 0; }
                            .card { box-shadow: none; border: 1px solid #ddd; }
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <p class="eyebrow">Scan &amp; Explore</p>
                        <h1>${companyName}</h1>
                        <p class="subtitle">Scan the QR code to view our full catalogue</p>
                        <div class="qr-wrap">${qrMarkup}</div>
                        <p class="url-box">${shareUrl}</p>
                        <p class="footer-note">POWERED BY SELLAR.IN</p>
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();

        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
        };
    };

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

                    {/* Hidden QR — rendered off-screen, its HTML is grabbed for printing */}
                    <div ref={qrPrintRef} style={{ position: "absolute", left: "-9999px" }}>
                        {shareUrl && <QRCode value={shareUrl} size={260} viewBox="0 0 256 256" />}
                    </div>

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

                    <button
                        className="w-full py-3 bg-white text-[#1A3B5D] border-2 border-[#1A3B5D] rounded-sm text-sm font-bold uppercase tracking-wider active:scale-95 transition-all"
                        onClick={handlePrintQR}
                    >
                        Print QR
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GlobalCatalogueModal;