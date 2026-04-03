import { useAuth } from "../../context/auth-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/Firebase";
import { useEffect, useState, useRef } from "react";
import { FiShare2, FiDownload } from "react-icons/fi"; // Download icon add kiya
import { toPng } from 'html-to-image'; // Install this: npm install html-to-image

function BusinessCard() {
    const { currentUser } = useAuth();
    const [data, setData] = useState<any>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [uploadedCard, setUploadedCard] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Cards ke liye references
    const cardRef1 = useRef<HTMLDivElement>(null);
    const cardRef2 = useRef<HTMLDivElement>(null);

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

        const safeName = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

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

    const handleUploadCard = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fileURL = URL.createObjectURL(file);
        setUploadedCard(fileURL)
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

    const handleShare = async () => {
        if (navigator.share) {
            try { await navigator.share({ title: data.companyName, url: window.location.href }); }
            catch (e) { console.log(e); }
        } else { navigator.clipboard.writeText(window.location.href); alert("Link Copied!"); }
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
                {/* ================= DESIGN 1 ================= */}
                <div ref={cardRef1} className="relative flex-shrink-0 w-[280px] h-[155px] flex rounded shadow-md overflow-hidden bg-white border border-gray-200 snap-center">
                    <div className="absolute top-1.5 right-1.5 flex gap-1 z-20 no-export">
                        <button onClick={() => downloadCard(cardRef1, formatName(data.personName))} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
                            <FiDownload size={10} />
                        </button>
                        <button onClick={handleShare} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
                            <FiShare2 size={10} />
                        </button>
                    </div>

                    <div className="w-[60%] bg-[#00425A] text-white p-3 flex flex-col justify-center">
                        <h2 className="text-xs font-bold uppercase truncate">{formatName(data.personName)}</h2>
                        <p className="text-[7px] mb-2 opacity-80">{data.role}</p>
                        <div className="space-y-0.5 text-[7px] opacity-90 italic font-light">
                            <p className="">📍 {data.address}</p>
                            <p>📞 {data.phone}</p>
                            <p className="truncate">✉️ {data.email}</p>
                        </div>
                    </div>
                    <div className="w-[40%] flex flex-col items-center justify-center p-2 text-center bg-white">
                        <div className="w-7 h-7 border border-blue-900 rounded-full flex items-center justify-center mb-1 text-[10px]">✈️</div>
                        <h3 className="font-bold text-[7px] text-[#00425A] uppercase leading-tight">{data.companyName}</h3>
                        <p className="text-[5px] text-gray-400 uppercase leading-tight">{data.tagline}</p>
                    </div>
                </div>

                {/* ================= DESIGN 2 ================= */}
                <div ref={cardRef2} className="relative flex-shrink-0 w-[280px] h-[155px] flex flex-col rounded-sm shadow-lg overflow-hidden bg-white border border-gray-100 snap-center p-4">
                    <div className="absolute top-2 right-2 flex gap-1 z-20 mt-1 no-export">
                        <button onClick={() => downloadCard(cardRef2, formatName(data.personName))} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
                            <FiDownload size={10} />
                        </button>
                        <button onClick={handleShare} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100">
                            <FiShare2 size={10} />
                        </button>
                    </div>

                    <div className="flex justify-between items-center w-full mb-1">
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col">
                                <h3 className="font-extrabold text-[8px] uppercase tracking-wider text-gray-800 leading-none">{data.companyName}</h3>
                                <p className="text-[5px] text-gray-400 font-medium uppercase tracking-tighter">{data.tagline}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 pr-12"> {/* Space for buttons */}
                            <span className="text-[6px] font-black bg-[#00425A] text-white px-2 py-1 rounded-full uppercase tracking-widest shadow-sm">
                                {data.role}
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center border-y border-gray-50 my-2 py-2">
                        <h2 className="text-xl font-black uppercase italic tracking-tight text-gray-900 leading-none">{formatName(data.personName)}</h2>
                        <div className="h-0.5 w-8 bg-orange-400 mt-2 rounded-sm"></div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[7px]">{data.email}</span>
                        </div>
                    </div>

                    <div className="mt-auto">
                        <div className="flex items-center justify-between text-[7px] font-semibold text-gray-600 px-1 mb-1.5 gap-1.5">
                            <div className="h-3 w-[1px] bg-gray-200"></div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-orange-500">📞</span>
                                <span>{data.phone}</span>
                            </div>
                            <div className="h-3 w-[1px] bg-gray-200"></div>
                            <div className="flex items-center">
                                <span className="text-orange-500">📍</span>
                                <span className="">{data.address}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ================= DESIGN 3 (UPLOAD CARD) ================= */}
                <div className="relative flex-shrink-0 w-[280px] h-[155px] flex flex-col items-center justify-center rounded-sm shadow-lg overflow-hidden bg-white border border-dashed border-gray-300 snap-center p-4">

                    {!uploadedCard ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            {/* Preview */}
                                <img
                                    src={uploadedCard}
                                    alt="Uploaded card"
                                    className="w-full h-full object-contain rounded"
                                />
                            {/* Buttons */}
                            <div className="absolute top-1.5 right-1.5 flex gap-1 z-20 no-export">
                                <a
                                    href={uploadedCard}
                                    download="my-business-card"
                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-600 border border-gray-100"
                                >
                                    <FiDownload size={10} />
                                </a>

                                <button
                                    onClick={() => setUploadedCard(null)}
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