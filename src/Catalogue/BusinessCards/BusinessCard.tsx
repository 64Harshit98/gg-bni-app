import { useAuth } from "../../context/auth-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/Firebase";
import { useEffect, useState } from "react";
import { FiShare2 } from "react-icons/fi";
function BusinessCard() {
    const { currentUser } = useAuth();
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        const fetchBusinessCardData = async () => {
            if (!currentUser?.uid || !currentUser?.companyId) return;

            try {
                // USER DATA
                const userRef = doc(
                    db,
                    "companies",
                    currentUser.companyId,
                    "users",
                    currentUser.uid
                );

                // BUSINESS DATA
                const businessRef = doc(
                    db,
                    "companies",
                    currentUser.companyId,
                    "business_info",
                    currentUser.companyId
                );

                const [userSnap, businessSnap] = await Promise.all([
                    getDoc(userRef),
                    getDoc(businessRef),
                ]);

                const userData = userSnap.exists() ? userSnap.data() : {};
                const businessData = businessSnap.exists()
                    ? businessSnap.data()
                    : {};

                setData({
                    personName: userData.name || "PERSON NAME",
                    designation: userData.designation || "Designation",
                    email: userData.email || "",
                    phone: userData.phoneNumber || "",

                    companyName: businessData.businessName || "COMPANY NAME",
                    tagline: businessData.businessCategory || "Company Tagline",
                    address: businessData.streetAddress || "",
                    website: businessData.catalogLink || "",
                });

                console.log("USER DATA =>", userData);

            } catch (err) {
                console.log("Error fetching card data", err);
            }
        };

        fetchBusinessCardData();
    }, [currentUser]);

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: data.companyName,
                    text: `Contact ${data.personName} (${data.designation}) from ${data.companyName}`,
                    url: window.location.href, // Yahan tum apna website link bhi de sakte ho
                });
            } catch (error) {
                console.log("Sharing failed", error);
            }
        } else {
            alert("Browser doesn't support sharing. Link copied to clipboard!");
            navigator.clipboard.writeText(window.location.href);
        }
    };

    if (!data) {
        return <div className="p-4">Loading card...</div>;
    }

    return (
        <div className="flex space-x-6 overflow-x-auto pb-6">

            {/* ================= DESIGN 1 ================= */}
            <div className="relative w-[350px] h-[200px] flex rounded-sm shadow-2xl overflow-hidden bg-white border border-gray-200">

                <button
                    onClick={handleShare}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black rounded-full text-white transition-all z-20"
                >
                    <FiShare2 size={16} />
                </button>

                {/* Left Dark Blue Section */}
                <div className="w-[60%] bg-[#00425A] text-white p-5 flex flex-col justify-center">
                    <h2 className="text-lg font-bold uppercase tracking-tight leading-none">{data.personName}</h2>
                    <p className="text-[9px] mb-4 opacity-80">{data.designation}</p>

                    <div className="space-y-1.5 text-[9px]">
                        <p className="flex items-center gap-2 italic">📍 {data.address}</p>
                        <p className="flex items-center gap-2 italic">📞 {data.phone}</p>
                        <p className="flex items-center gap-2 italic">✉️ {data.email}</p>
                        <p className="flex items-center gap-2 italic">🌐 {data.website}</p>
                    </div>
                </div>

                {/* Right White Section */}
                <div className="w-[40%] flex flex-col items-center justify-center p-4 border-l-2 border-white">
                    <div className="w-12 h-12 border-2 border-blue-900 rounded-full flex items-center justify-center mb-2">
                        <span className="text-blue-900 text-xl font-bold">✈️</span>
                    </div>
                    <h3 className="font-bold text-[10px] text-[#00425A] text-center uppercase leading-tight">
                        {data.companyName}
                    </h3>
                    <p className="text-[7px] text-gray-500 uppercase tracking-tighter">{data.tagline}</p>
                </div>
            </div>

            {/* ================= DESIGN 2 ================= */}
            <div className="relative w-[350px] h-[200px] flex rounded-sm shadow-2xl overflow-hidden bg-white border border-gray-200">

                <button
                    onClick={handleShare}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black rounded-full text-white transition-all z-20"
                >
                    <FiShare2 size={16} />
                </button>
                {/* Left Info Section */}
                <div className="w-[65%] p-5 flex flex-col">
                    <div className="mb-2">
                        <h3 className="font-bold text-[11px] text-black uppercase leading-none">{data.companyName}</h3>
                        <p className="text-[7px] text-gray-400 font-medium tracking-widest">{data.tagline}</p>
                    </div>

                    <div className="mt-2">
                        <h2 className="text-xl font-black text-black uppercase tracking-tighter leading-none italic">{data.personName}</h2>
                        <p className="text-[9px] text-gray-600 mb-4">{data.designation}</p>
                    </div>

                    <div className="space-y-1 text-[9px] text-black font-semibold">
                        <p className="flex items-center gap-2 underline underline-offset-2">📍 {data.address}</p>
                        <p className="flex items-center gap-2 underline underline-offset-2">📞 {data.phone}</p>
                        <p className="flex items-center gap-2 underline underline-offset-2">✉️ {data.email}</p>

                        {/* Website line aur QR Placeholder ek hi row mein */}
                        <div className="flex items-end justify-between">
                            <p className="flex items-center gap-2 underline underline-offset-2 text-cyan-700">
                                🌐 {data.website}
                            </p>

                            {/* QR Placeholder: Chota aur Right-aligned */}
                            <div className="w-8 h-8 border-2 border-dashed border-gray-400 bg-gray-50 flex flex-col items-center justify-center rounded-sm mr-2 mb-[-2px]">
                                <div className="grid grid-cols-2 gap-[1px]">
                                    <div className="w-1.5 h-1.5 bg-gray-400"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400"></div>
                                    <div className="w-1.5 h-1.5 bg-transparent"></div>
                                </div>
                                <span className="text-[5px] text-gray-400 mt-0.5 font-bold uppercase">QR</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Orange Section with Logo */}
                <div className="w-[35%] bg-[#E8A33E] flex flex-col items-center justify-center relative">
                    <div className="text-5xl opacity-90 mb-2">🕉️</div>
                </div>
            </div>

        </div>
    );
}

export default BusinessCard;
