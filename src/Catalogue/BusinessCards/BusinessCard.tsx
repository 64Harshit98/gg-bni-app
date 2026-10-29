import { useAuth } from "../../context/auth-context";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../lib/Firebase";
import { useEffect, useState, useRef } from "react";
import { toPng } from 'html-to-image'; // Install this: npm install html-to-image
import { sanitizeName } from "../utils/stringUtils";

// ─── Compress uploaded card image (same logic as EditProfilePage) ───────────
const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = () => {
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 450; // business card is landscape

            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error("Canvas context failed")); return; }

            ctx.drawImage(img, 0, 0, width, height);

            // Convert to base64 string (JPEG, 60% quality) so we can store in localStorage
            const base64 = canvas.toDataURL('image/jpeg', 0.6);
            URL.revokeObjectURL(img.src);
            resolve(base64);
        };

        img.onerror = (error) => { URL.revokeObjectURL(img.src); reject(error); };
    });
};

/* ---------- Theme (POS = blue, Catalogue = orange) ---------- */

export type BusinessCardTheme = 'pos' | 'catalogue';

// NOTE: full class strings only (Tailwind can't see dynamically built class names)
const THEMES = {
    pos: {
        btnSecondary: "border border-[#7a8aa3] bg-white text-[#0f172b] hover:bg-[#f5f7ff]",
        btnPrimary: "border border-transparent bg-[#155dfc] text-white hover:bg-[#1447e6]",
        btnDanger: "border border-transparent text-[#d5000c] hover:bg-[#ffeef0]",
        frame: "border-[#dfe6fb]",      // card face border
        divider: "border-[#dfe6fb]",    // line under company row (design 2)
        monogram: "border-[#155dfc] text-[#155dfc]",
        dotActive: "bg-[#155dfc]",
    },
    catalogue: {
        btnSecondary: "border border-[#7a8aa3] bg-white text-[#0f172b] hover:bg-[#fff8f2]",
        btnPrimary: "border border-transparent bg-[#c2410c] text-white hover:bg-[#9a3412]",
        btnDanger: "border border-transparent text-[#d5000c] hover:bg-[#ffeef0]",
        frame: "border-[#f6e1d0]",
        divider: "border-[#f6e1d0]",
        monogram: "border-[#c2410c] text-[#c2410c]",
        dotActive: "bg-[#c2410c]",
    },
} as const;

type ThemeTokens = (typeof THEMES)[BusinessCardTheme];

/* ---------- UI-only helpers (no logic) ---------- */

const Ico = ({ className = "w-4 h-4", children }: { className?: string; children: React.ReactNode }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${className}`}
        aria-hidden="true"
    >
        {children}
    </svg>
);

const PinIco = () => (
    <Ico className="w-[11px] h-[11px]">
        <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
        <circle cx="12" cy="9" r="2.5" />
    </Ico>
);
const PhoneIco = () => (
    <Ico className="w-[11px] h-[11px]">
        <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" />
    </Ico>
);
const MailIco = () => (
    <Ico className="w-[11px] h-[11px]">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
    </Ico>
);

const BTN =
    "inline-flex h-8 items-center justify-center gap-2 rounded-sm px-3 text-[13px] font-medium leading-5 whitespace-nowrap transition-colors cursor-pointer";

const DownloadShare = ({
    onDownload,
    onShare,
    t,
    children,
}: {
    onDownload: () => void;
    onShare: () => void;
    t: ThemeTokens;
    children?: React.ReactNode;
}) => (
    <div className="flex flex-wrap gap-1.5">
        <button onClick={onDownload} className={`${BTN} ${t.btnSecondary}`}>
            <Ico>
                <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
            </Ico>
            Download
        </button>
        <button onClick={onShare} className={`${BTN} ${t.btnPrimary}`}>
            <Ico>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
            </Ico>
            Share
        </button>
        {children}
    </div>
);

// const STORAGE_KEY = "businessCard_uploadedCard";
// theme defaults to "pos" so the existing POS usage (<BusinessCard />) keeps working unchanged
function BusinessCard({ theme = 'pos' }: { theme?: BusinessCardTheme }) {
    const t = THEMES[theme];
    // Card face frame (same as .bc in the design)
    const BC = `aspect-[1.75] overflow-hidden rounded-sm border ${t.frame} text-[10px] leading-[14px]`;

    const { currentUser } = useAuth();
    const [data, setData] = useState<any>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [uploadedCard, setUploadedCard] = useState<string | null>(null);
    const uploadedCardRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Cards ke liye references
    const cardRef1 = useRef<HTMLDivElement>(null);
    const cardRef2 = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchUploadedCard = async () => {
            if (!currentUser?.companyId || !currentUser?.uid) return;
            try {
                const cardRef = doc(db, "companies", currentUser.companyId, "business_cards", currentUser.uid);
                const cardSnap = await getDoc(cardRef);
                if (cardSnap.exists()) {
                    setUploadedCard(cardSnap.data().uploadedCard || null);
                }
            } catch (err) {
                console.error("Error fetching uploaded card:", err);
            }
        };
        fetchUploadedCard();
    }, [currentUser?.companyId, currentUser?.uid]);
    const handleScroll = () => {
        if (scrollRef.current) {
            const scrollLeft = scrollRef.current.scrollLeft;
            const index = Math.round(scrollLeft / 272); // 260px card + 12px gap
            setActiveIndex(index);
        }
    };

    // Card Download Karne ka function
    const downloadCard = async (ref: React.RefObject<HTMLDivElement | null>, name: string) => {
        if (!ref.current) return;

        const buttons = ref.current.querySelectorAll(".no-export");

        const safeName = sanitizeName(name);

        try {
            // hide buttons
            buttons.forEach((el) => ((el as HTMLElement).style.display = "none"));

            const dataUrl = await toPng(ref.current, {
                cacheBust: true,
                pixelRatio: 3
            });

            const link = document.createElement("a");
            link.download = `${safeName}-business-card.png`;
            link.href = dataUrl;
            link.click();

        } catch (err) {
            console.error("Image generation error:", err);
        } finally {
            // show buttons again
            buttons.forEach((el) => ((el as HTMLElement).style.display = "flex"));
        }
    };

    const handleUploadCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser?.companyId || !currentUser?.uid) return;

        const cardRef = doc(db, "companies", currentUser.companyId, "business_cards", currentUser.uid);

        const saveCard = async (base64: string) => {
            setUploadedCard(base64);
            try {
                await setDoc(cardRef, { uploadedCard: base64, updatedAt: new Date().toISOString() }, { merge: true });
            } catch (err) {
                console.error("Error saving uploaded card:", err);
            }
        };

        try {
            const compressed = await compressImage(file);
            await saveCard(compressed);
        } catch (err) {
            console.error("Compression error:", err);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target?.result as string;
                saveCard(base64);
            };
            reader.readAsDataURL(file);
        }
    };
    const downloadUploadedCard = () => {
        if (!uploadedCard) return;
        const link = document.createElement("a");
        link.download = "my-business-card.jpg";
        link.href = uploadedCard;
        link.click();
    };

    const handleShareUploadedCard = async () => {
        if (!uploadedCard) return;
        try {
            const response = await fetch(uploadedCard);
            const blob = await response.blob();
            const file = new File([blob], "my-business-card.jpg", { type: 'image/jpeg' });

            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: "My Business Card" });
            } else {
                downloadUploadedCard();
            }
        } catch (err) {
            console.error("Share error:", err);
        }
    };

    const removeUploadedCard = async () => {
        setUploadedCard(null);
        if (!currentUser?.companyId || !currentUser?.uid) return;
        try {
            const cardRef = doc(db, "companies", currentUser.companyId, "business_cards", currentUser.uid);
            await setDoc(cardRef, { uploadedCard: null }, { merge: true });
        } catch (err) {
            console.error("Error removing uploaded card:", err);
        }
    };
    useEffect(() => {
        const fetchBusinessCardData = async () => {
            if (!currentUser?.uid || !currentUser?.companyId) return;
            try {
                const userRef = doc(db, "companies", currentUser.companyId, "users", currentUser.uid);
                const businessRef = doc(db, "companies", currentUser.companyId, "business_info", currentUser.companyId);
                const [userSnap, businessSnap] = await Promise.all([getDoc(userRef), getDoc(businessRef)]);

                const userData = userSnap.exists() ? userSnap.data() : {};
                const businessData = businessSnap.exists() ? businessSnap.data() : {};

                setData({
                    personName: userData.name || "PERSON NAME",
                    role: String(userData.role || "Owner"),
                    email: userData.email || "",
                    phone: userData.phoneNumber || "",
                    companyName: businessData.businessName || "COMPANY NAME",
                    tagline: businessData.businessCategory || "Company Tagline",
                    address: businessData.streetAddress || "",
                    website: businessData.catalogLink || "",
                });
            } catch (err) { console.log("Error", err); }
        };
        fetchBusinessCardData();
    }, [currentUser]);

    const handleShare = async (ref: React.RefObject<HTMLDivElement | null>, name: string) => {
        if (!ref.current) return;

        const buttons = ref.current.querySelectorAll(".no-export");
        const safeName = sanitizeName(name);

        try {
            // Hide buttons
            buttons.forEach((el) => ((el as HTMLElement).style.display = "none"));

            const dataUrl = await toPng(ref.current, {
                cacheBust: true,
                pixelRatio: 3
            });

            // Convert base64 to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const file = new File([blob], `${safeName}-business-card.png`, { type: 'image/png' });

            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `${data.companyName} - Business Card`,
                });
            } else {
                // Fallback: download the image
                const link = document.createElement("a");
                link.download = `${safeName}-business-card.png`;
                link.href = dataUrl;
                link.click();
                alert("Card downloaded!");
            }
        } catch (err) {
            console.error("Share error:", err);
        } finally {
            // Show buttons again
            buttons.forEach((el) => ((el as HTMLElement).style.display = "flex"));
        }
    };

    if (!data) return <div className="p-4 text-[10px]">Loading...</div>;

    const cards = [0, 1, 2];

    const formatName = (fullName: string) => {
        if (!fullName) return "";

        const parts = fullName.trim().split(/\s+/);

        if (parts.length === 1) return parts[0]; // sirf ek naam

        return `${parts[0]} ${parts[parts.length - 1]}`;
    };

    const shownName = formatName(data.personName);
    const companyInitial = String(data.companyName || "S").trim().charAt(0).toUpperCase();

    return (
        <div className="relative w-full min-w-0">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="-mx-4 flex flex-nowrap gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scrollbar-hide md:-mx-5 md:px-5 lg:mx-0 lg:flex-wrap lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0 lg:snap-none"
            >
                {/* ================= DESIGN 1 — dark ================= */}
                <div className="grid w-[260px] min-w-0 shrink-0 snap-center gap-2">
                    <div ref={cardRef1} className={`${BC} grid grid-cols-[1.4fr_1fr] bg-white`}>
                        {/* Left panel */}
                        <div className="flex min-w-0 flex-col bg-[#0f172b] p-3 text-white">
                            <div className="truncate text-[13px] font-semibold uppercase leading-[18px]">{shownName}</div>
                            <div className="truncate opacity-80">{data.role}</div>
                            <div className="mt-auto grid gap-[3px]">
                                {data.address && (
                                    <span className="flex min-w-0 items-center gap-[5px]">
                                        <PinIco />
                                        <span className="line-clamp-2">{data.address}</span>
                                    </span>
                                )}
                                {data.phone && (
                                    <span className="flex min-w-0 items-center gap-[5px]">
                                        <PhoneIco />
                                        <span className="truncate">{data.phone}</span>
                                    </span>
                                )}
                                {data.email && (
                                    <span className="flex min-w-0 items-center gap-[5px]">
                                        <MailIco />
                                        <span className="truncate">{data.email}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Right panel */}
                        <div className="grid min-w-0 place-content-center justify-items-center gap-1.5 px-2 text-center text-[10px] tracking-[0.06em] text-[#0f172b]">
                            <span className={`grid h-8 w-8 place-items-center rounded-sm border-2 text-sm font-bold ${t.monogram}`}>
                                {companyInitial}
                            </span>
                            <b className="line-clamp-2 break-words uppercase">{data.companyName}</b>
                        </div>
                    </div>
                    <DownloadShare
                        t={t}
                        onDownload={() => downloadCard(cardRef1, shownName)}
                        onShare={() => handleShare(cardRef1, shownName)}
                    />
                </div>

                {/* ================= DESIGN 2 — light ================= */}
                <div className="grid w-[260px] min-w-0 shrink-0 snap-center gap-2">
                    <div ref={cardRef2} className={`${BC} flex flex-col bg-white p-3 text-[#0f172b]`}>
                        {/* Top */}
                        <div className={`flex items-center justify-between gap-2 border-b ${t.divider} pb-2 tracking-[0.06em]`}>
                            <b className="min-w-0 truncate uppercase">{data.companyName}</b>
                            <span className="inline-flex h-[18px] shrink-0 items-center whitespace-nowrap rounded-sm bg-[#0f172b] px-2 text-[9px] font-semibold uppercase leading-[18px] tracking-[0.03em] text-white">
                                {data.role.length > 12 ? data.role.slice(0, 12) + "…" : data.role}
                            </span>
                        </div>

                        {/* Middle */}
                        <div className="grid min-h-0 min-w-0 flex-1 place-content-center justify-items-center gap-1 text-[15px] font-semibold italic">
                            <span className="max-w-full truncate">{shownName}</span>
                            <i className="h-0.5 w-6 bg-[#ff3a36]" />
                            {data.email && (
                                <span className="flex max-w-full items-center gap-[5px] text-[10px] font-normal not-italic text-[#45556c]">
                                    <MailIco />
                                    <span className="truncate">{data.email}</span>
                                </span>
                            )}
                        </div>

                        {/* Bottom */}
                        <div className="flex min-w-0 gap-3 text-[#45556c]">
                            {data.phone && (
                                <span className="flex shrink-0 items-center gap-[5px]">
                                    <PhoneIco />
                                    {data.phone}
                                </span>
                            )}
                            {data.address && (
                                <span className="flex min-w-0 items-center gap-[5px]">
                                    <PinIco />
                                    <span className="truncate">{data.address}</span>
                                </span>
                            )}
                        </div>
                    </div>
                    <DownloadShare
                        t={t}
                        onDownload={() => downloadCard(cardRef2, shownName)}
                        onShare={() => handleShare(cardRef2, shownName)}
                    />
                </div>

                {/* ================= DESIGN 3 — upload ================= */}
                {!uploadedCard ? (
                    <div
                        ref={uploadedCardRef}
                        className="flex aspect-[1.75] w-[260px] min-w-0 shrink-0 snap-center flex-col items-center justify-center gap-1.5 rounded-sm border-[1.5px] border-dashed border-[#7a8aa3] p-2 text-center text-xs leading-[18px] text-[#45556c]"
                    >
                        <Ico className="h-5 w-5">
                            <path d="M12 21V9M7 14l5-5 5 5M4 3h16" />
                        </Ico>
                        <span>Have your own printed card? Upload a photo and share it from here.</span>
                        <label className={`${BTN} ${t.btnSecondary}`}>
                            Upload card
                            <input
                                type="file"
                                accept="image/png, image/jpeg, image/jpg, image/webp"
                                className="hidden"
                                onChange={handleUploadCard}
                            />
                        </label>
                    </div>
                ) : (
                    <div className="grid w-[260px] min-w-0 shrink-0 snap-center gap-2">
                        <div ref={uploadedCardRef} className={`${BC} bg-white`}>
                            {/* Preview */}
                            <img
                                src={uploadedCard}
                                alt="Uploaded card"
                                className="h-full w-full object-contain"
                            />
                        </div>
                        <DownloadShare t={t} onDownload={downloadUploadedCard} onShare={handleShareUploadedCard}>
                            {/* Remove (icon-only so all 3 buttons fit in 260px) */}
                            <button
                                onClick={removeUploadedCard}
                                aria-label="Remove uploaded card"
                                title="Remove"
                                className={`${BTN} ${t.btnDanger} px-2`}
                            >
                                <Ico>
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </Ico>
                            </button>
                        </DownloadShare>
                    </div>
                )}
            </div>

            {/* Dots — only while the cards scroll sideways (phones/tablets); desktop wraps them */}
            <div className="flex justify-center gap-1 pb-3 pt-1 pointer-events-none lg:hidden">
                {cards.map((_, i) => (
                    <div
                        key={i}
                        className={`h-1.5 rounded-sm transition-all duration-300 ${activeIndex === i ? `w-4 ${t.dotActive}` : "w-1.5 bg-[#7a8aa3]"}`}
                    />
                ))}
            </div>
        </div>
    );
}

export default BusinessCard;