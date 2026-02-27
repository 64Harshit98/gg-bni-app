import React, { useState, useEffect } from 'react';
import { db } from '../lib/Firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { X, CheckCircle } from 'lucide-react';

interface LeadPopUpProps {
    companyId?: string;
    companyName?: string;
    forceOpen?: boolean;
    onLeadSubmit?: () => void;
}

const compressImage = (file: File, maxWidth = 1000, quality = 0.7): Promise<File> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.readAsDataURL(file);
        reader.onload = (e) => {
            img.src = e.target?.result as string;
        };

        img.onload = () => {
            const canvas = document.createElement("canvas");
            const scale = Math.min(maxWidth / img.width, 1);

            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext("2d");
            if (!ctx) return reject("Canvas error");

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) return reject("Compression failed");

                    const compressedFile = new File([blob], file.name, {
                        type: "image/jpeg",
                        lastModified: Date.now(),
                    });

                    resolve(compressedFile);
                },
                "image/jpeg",
                quality
            );
        };

        img.onerror = reject;
    });
};

const LeadPopUp: React.FC<LeadPopUpProps> = ({
    companyId,
    companyName,
    forceOpen,
    onLeadSubmit
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [step, setStep] = useState(1); // 1: Form, 2: Success
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: '', number: '' });
    const [cardFile, setCardFile] = useState<File | null>(null);
    const [cardPreview, setCardPreview] = useState<string | null>(null);

    useEffect(() => {
        const isFilled = localStorage.getItem("leadSubmitted");

        // agar lead already filled hai → kabhi popup nahi
        if (isFilled === "true") {
            setIsVisible(false);
            return;
        }

        // FORCE OPEN (add to cart case)
        if (forceOpen) {
            setIsVisible(true);
            return;
        }

        // normal auto popup
        const timer = setTimeout(() => {
            setIsVisible(true);
        }, 5000);

        return () => clearTimeout(timer);
    }, [forceOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!companyId) return alert("Company not found");

        setLoading(true);

        try {
            // Duplicate check
            const q = query(
                collection(db, "companies", companyId, "AuthorizedUser"),
                where("customerNumber", "==", formData.number)
            );

            const existing = await getDocs(q);

            if (!existing.empty) {
                const docData = existing.docs[0].data();

                // localStorage sync
                localStorage.setItem(
                    "leadData",
                    JSON.stringify({
                        name: docData.customerName,
                        number: docData.customerNumber
                    })
                );
                localStorage.setItem("leadSubmitted", "true");

                // MOST IMPORTANT — parent notify
                onLeadSubmit?.();

                setStep(3);
                setLoading(false);

                // thoda fast close
                setTimeout(() => setIsVisible(false), 1500);

                return;
            }

            let businessCardUrl = "Placeholder";

            if (cardFile && companyId) {
                const storage = getStorage();
                const storageRef = ref(
                    storage,
                    `companies/companyId/AuthorizedUser/${Date.now()}_${cardFile.name}`
                );

                await uploadBytes(storageRef, cardFile);
                businessCardUrl = await getDownloadURL(storageRef);
            }

            await addDoc(
                collection(db, "companies", companyId, "AuthorizedUser"),
                {
                    customerName: formData.name,
                    customerNumber: formData.number,
                    businessCard: businessCardUrl,
                    companyId,
                    companyName: companyName || "Shared Catalogue",
                    status: "pending",
                    createdAt: serverTimestamp(),
                }
            );

            localStorage.setItem(
                "leadData",
                JSON.stringify({
                    name: formData.name,
                    number: formData.number
                })
            );
            localStorage.setItem("leadSubmitted", "true");
            onLeadSubmit?.(); // parent ko bolo lead fill ho gaya

            // EXISTING UPCOMING ORDER UPDATE KARO
            try {
                const upcomingUserKey =
                    localStorage.getItem("upcoming_user_key");

                if (upcomingUserKey && companyId) {
                    const { doc, updateDoc } = await import("firebase/firestore");

                    const orderRef = doc(
                        db,
                        "companies",
                        companyId,
                        "Orders",
                        `upcoming_${upcomingUserKey}`
                    );

                    await updateDoc(orderRef, {
                        userName: formData.name,
                        userLoginPhone: formData.number
                    });
                }
            } catch (err) {
                console.log("No upcoming order to update");
            }

            setStep(2);
            setTimeout(() => setIsVisible(false), 4000);

        } catch (error) {
            console.error("Firestore Save Error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // compress before save
            const compressed = await compressImage(file, 1000, 0.7);

            setCardFile(compressed);
            setCardPreview(URL.createObjectURL(compressed));
        } catch (err) {
            console.error("Compression failed, using original", err);

            // fallback
            setCardFile(file);
            setCardPreview(URL.createObjectURL(file));
        }
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\D/g, ''); // Sirf numbers allow karega (Regex)
        if (value.length <= 10) {
            setFormData({ ...formData, number: value });
        }
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-xs shadow-2xl overflow-hidden relative border-t-4 border-[#00A3E1]">

                {/* Close Button */}
                <button
                    onClick={() => {
                        setIsVisible(false);
                    }}
                    className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors"
                >
                    <X size={24} />
                </button>

                {step === 1 ? (
                    <div className="p-8">

                        <p className="text-gray-500 text-lg mb-6 font-bold">Please share your details to get the best business deals.</p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Your Name</label>
                                <input
                                    required
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xs focus:border-[#00A3E1] outline-none text-sm transition-all"
                                    placeholder="Your name"
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">
                                    Phone Number
                                </label>
                                <input
                                    required
                                    type="text" // 'tel' ya 'number' ki jagah 'text' use karenge control ke liye
                                    inputMode="numeric" // Mobile keyboard par sirf numbers dikhayega
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xs focus:border-[#00A3E1] outline-none text-sm transition-all"
                                    placeholder="10-digit mobile number"
                                    value={formData.number} // Value ko bind karna zaroori hai
                                    onChange={handleNumberChange}
                                />
                            </div>

                            {/* Business Card Upload */}
                            <div className="relative">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">
                                    Business Card
                                </label>

                                {/* Gallery/File picker */}
                                <input
                                    id="businessCardFile"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleCardUpload}
                                    className="hidden"
                                />

                                {/* Camera capture */}
                                <input
                                    id="businessCardCamera"
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handleCardUpload}
                                    className="hidden"
                                />

                                {/* Custom buttons */}
                                <div className="grid grid-cols-2 gap-2">

                                    {/* Choose from gallery */}
                                    <label
                                        htmlFor="businessCardFile"
                                        className="cursor-pointer flex items-center justify-center gap-2 py-3 text-[11px] font-bold text-slate-700 bg-gray-100 border border-gray-200 rounded-xs hover:bg-gray-200 active:scale-95 transition-all"
                                    >
                                        🖼 Choose File
                                    </label>

                                    {/* Camera capture */}
                                    <label
                                        htmlFor="businessCardCamera"
                                        className="cursor-pointer flex items-center justify-center gap-2 py-3 text-[11px] font-bold text-white bg-[#00A3E1] rounded-xs hover:bg-[#1A3B5D] active:scale-95 transition-all"
                                    >
                                        📸 Click Photo
                                    </label>
                                </div>

                                {/* Preview */}
                                {cardPreview && (
                                    <div className="mt-3 border rounded-xs p-2 bg-gray-50">
                                        <img
                                            src={cardPreview}
                                            alt="Business Card Preview"
                                            className="h-28 w-full object-contain"
                                        />
                                    </div>
                                )}
                            </div>
                            <button
                                disabled={loading}
                                className={`w-full py-4 rounded-xs font-black text-xs uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 ${loading ? 'bg-gray-300' : 'bg-[#00A3E1] hover:bg-[#1A3B5D]'}`}
                            >
                                {loading ? 'Processing...' : 'Submit Details'}
                            </button>
                        </form>
                    </div>
                ) : step === 2 ? (
                    <div className="p-12 text-center flex flex-col items-center">
                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 animate-bounce">
                            <CheckCircle size={40} strokeWidth={3} />
                        </div>
                        <h2 className="text-2xl font-black text-[#1A3B5D] uppercase tracking-tighter">Thank You!</h2>
                        <p className="text-gray-500 text-sm mt-2">We have received your information. Our team will contact you shortly.</p>
                    </div>
                ) : step === 3 ? (

                    /* ================= DUPLICATE ================= */
                    <div className="p-12 text-center flex flex-col items-center">
                        <div className="w-20 h-20 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle size={40} strokeWidth={3} />
                        </div>

                        <h2 className="text-2xl font-black text-[#1A3B5D] uppercase tracking-tighter">
                            Already Submitted
                        </h2>

                        <p className="text-gray-500 text-sm mt-2">
                            This number has already shared details with us.
                        </p>
                    </div>

                ) : null}
            </div>
        </div>
    );
};

export default LeadPopUp;