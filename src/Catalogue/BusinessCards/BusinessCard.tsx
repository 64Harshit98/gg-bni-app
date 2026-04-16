import { useAuth } from "../../context/auth-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/Firebase";
import { useEffect, useState, useRef } from "react";
import { FiShare2, FiDownload } from "react-icons/fi"; // Download icon add kiya
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

const STORAGE_KEY = "businessCard_uploadedCard";
function BusinessCard() {
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
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setUploadedCard(saved);
    }, []);
    const handleScroll = () => {
        if (scrollRef.current) {
            const scrollLeft = scrollRef.current.scrollLeft;
            const index = Math.round(scrollLeft / 296);
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
        if (!file) return;
        try {
            const compressed = await compressImage(file);
            setUploadedCard(compressed);
            localStorage.setItem(STORAGE_KEY, compressed);
        } catch (err) {
            console.error("Compression error:", err);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target?.result as string;
                setUploadedCard(base64);
                localStorage.setItem(STORAGE_KEY, base64);
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

    const removeUploadedCard = () => {
        setUploadedCard(null);
        localStorage.removeItem(STORAGE_KEY);
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

    return (
        <div className="relative w-full">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex flex-nowrap overflow-x-auto gap-4 p-4 pb-8 md:pb-4 snap-x snap-mandatory md:snap-none scrollbar-hide"
            >
                {/* ================= DESIGN 1 (FIXED) ================= */}
                <div ref={cardRef1} className="relative flex-shrink-0 w-[280px] h-[155px] flex rounded shadow-md overflow-hidden bg-white border border-gray-200 snap-center">
                    <div className="absolute top-1.5 right-1.5 flex gap-1 z-20 no-export">
                        <button onClick={() => downloadCard(cardRef1, formatName(data.personName))} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
                            <FiDownload size={10} />
                        </button>
                        <button onClick={() => handleShare(cardRef1, formatName(data.personName))} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
                            <FiShare2 size={10} />
                        </button>
                    </div>

                    {/* Left panel */}
                    <div className="w-[58%] bg-[#00425A] text-white p-3 flex flex-col justify-between h-full">
                        <div>
                            <h2 className="text-[11px] font-bold uppercase tracking-wide truncate leading-tight">
                                {formatName(data.personName)}
                            </h2>
                            <p className="text-[8px] opacity-75 mt-0.5 truncate">{data.role}</p>
                        </div>
                        <div className="space-y-[3px] text-[8px] opacity-90 font-light">
                            {/* Address */}
                            <div className="flex items-center gap-1 overflow-hidden">
                                <svg className="shrink-0" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                                    <circle cx="12" cy="9" r="2.5" />
                                </svg>
                                <span className="truncate">{data.address}</span>
                            </div>
                            {/* Phone */}
                            <div className="flex items-center gap-1">
                                <svg className="shrink-0" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.12 1.18 2 2 0 012.1 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92v2z" />
                                </svg>
                                <span>{data.phone}</span>
                            </div>
                            {/* Email */}
                            <div className="flex items-center gap-1 overflow-hidden">
                                <svg className="shrink-0" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                                <span className="truncate">{data.email}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right panel */}
                    <div className="w-[42%] flex flex-col items-center justify-center p-3 text-center bg-white">
                        <div className="w-7 h-7 border border-blue-900 rounded-full flex items-center justify-center mb-1 text-[10px]">✈️</div>
                        <h3 className="font-bold text-[8px] text-[#00425A] uppercase leading-tight line-clamp-2 px-1">
                            {data.companyName}
                        </h3>
                        <p className="text-[6.5px] text-gray-400 uppercase leading-tight mt-0.5 truncate w-full px-1">
                            {data.tagline}
                        </p>
                    </div>
                </div>

                {/* ================= DESIGN 2 (FIXED) ================= */}
                <div ref={cardRef2} className="relative flex-shrink-0 w-[280px] h-[155px] flex flex-col rounded-sm shadow-lg overflow-hidden bg-white border border-gray-100 snap-center p-3">
                    <div className="absolute top-1.5 right-1.5 flex gap-1 z-20 no-export">
                        <button onClick={() => downloadCard(cardRef2, formatName(data.personName))} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
                            <FiDownload size={10} />
                        </button>
                        <button onClick={() => handleShare(cardRef2, formatName(data.personName))} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
                            <FiShare2 size={10} />
                        </button>
                    </div>

                    {/* Header row */}
                    <div className="flex justify-between items-start w-full mb-1">
                        <div className="flex flex-col min-w-0 flex-1 pr-2">
                            <h3 className="font-extrabold text-[8.5px] uppercase tracking-wider text-gray-800 leading-none truncate">
                                {data.companyName}
                            </h3>
                            <p className="text-[6.5px] text-gray-400 font-medium uppercase tracking-tighter mt-0.5 truncate">
                                {data.tagline}
                            </p>
                        </div>
                        {/* Role badge — flex-shrink-0 prevents overlap with buttons */}
                        <span className="flex-shrink-0 text-[7px] font-black bg-[#00425A] text-white px-2 py-0.5 rounded-full uppercase tracking-widest mr-14 whitespace-nowrap">
                            {data.role.length > 12 ? data.role.slice(0, 12) + "…" : data.role}
                        </span>
                    </div>

                    {/* Center — name */}
                    <div className="flex-1 flex flex-col items-center justify-center border-y border-gray-50 py-1.5 min-h-0">
                        <h2 className="text-[14px] font-black uppercase italic tracking-tight text-gray-900 leading-none truncate max-w-full px-2">
                            {formatName(data.personName)}
                        </h2>
                        <div className="h-0.5 w-7 bg-orange-400 mt-1.5 rounded-sm"></div>
                        <div className="flex items-center gap-1 mt-1 overflow-hidden max-w-full px-2">
                            <svg className="shrink-0" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <span className="text-[8px] text-gray-600 truncate">{data.email}</span>
                        </div>
                    </div>

                    {/* Footer row */}
                    <div className="mt-auto pt-1.5">
                        <div className="flex items-center gap-2 text-[8px] font-medium text-gray-600 overflow-hidden">
                            <svg className="shrink-0" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5">
                                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.12 1.18 2 2 0 012.1 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92v2z" />
                            </svg>
                            <span className="whitespace-nowrap">{data.phone}</span>
                            <div className="h-3 w-[1px] bg-gray-200 shrink-0"></div>
                            <svg className="shrink-0" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5">
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                                <circle cx="12" cy="9" r="2.5" />
                            </svg>
                            <span className="truncate">{data.address}</span>
                        </div>
                    </div>
                </div>

                {/* ================= DESIGN 3 (UPLOAD CARD) ================= */}
                <div
                    ref={uploadedCardRef}
                    className="relative flex-shrink-0 w-[280px] h-[155px] flex flex-col items-center justify-center rounded-sm shadow-lg overflow-hidden bg-white border border-dashed border-gray-300 snap-center p-4"
                >

                    {!uploadedCard ? (
                        <label className="flex flex-col items-center justify-center cursor-pointer text-center">
                            <div className="text-gray-400 text-xs font-semibold mb-2">
                                Upload Your Business Card
                            </div>
                            <div className="px-3 py-1 bg-blue-600 text-white text-[10px] rounded">
                                Upload Card
                            </div>
                            <input
                                type="file"
                                accept="image/png, image/jpeg, image/jpg, image/webp"
                                className="hidden"
                                onChange={handleUploadCard}
                            />
                        </label>
                    ) : (
                        <>
                            {/* Preview */}
                            <img
                                src={uploadedCard}
                                alt="Uploaded card"
                                className="w-full h-full object-contain rounded"
                            />

                            {/* Action buttons — same layout as Design 1 & 2 */}
                            <div className="absolute top-1.5 right-1.5 flex gap-1 z-20 no-export">
                                {/* Download */}
                                <button
                                    onClick={downloadUploadedCard}
                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100"
                                >
                                    <FiDownload size={10} />
                                </button>

                                {/* Share */}
                                <button
                                    onClick={handleShareUploadedCard}
                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100"
                                >
                                    <FiShare2 size={10} />
                                </button>
                                {/* Remove / Replace */}
                                <button
                                    onClick={removeUploadedCard}
                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="w-[10px] h-[10px]"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Dots */}
            <div className="absolute bottom-2 left-0 right-0 flex md:hidden justify-center gap-1.5 pointer-events-none">
                {cards.map((_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${activeIndex === i ? "bg-blue-600 w-3" : "bg-gray-300 w-1"}`} />
                ))}
            </div>
        </div>
    );
}

export default BusinessCard;