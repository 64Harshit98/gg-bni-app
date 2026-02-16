import React, { useState, useEffect } from 'react';
import { db } from '../lib/Firebase'; // Storage ko import karna mat bhulna
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { X, CheckCircle } from 'lucide-react';

const LeadPopUp: React.FC<{ companyId?: string; companyName?: string }> = ({ companyId, companyName }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [step, setStep] = useState(1); // 1: Form, 2: Success
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: '', number: '' });

    useEffect(() => {
        // 5 Second ka delay
        const timer = setTimeout(() => {
            const isFilled = sessionStorage.getItem('leadSubmitted');
            if (!isFilled) setIsVisible(true);
        }, 5000);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Simple Firestore entry bina storage/photo ke
            await addDoc(collection(db, 'AuthorizedUser'), {
                customerName: formData.name,
                customerNumber: formData.number,
                businessCard: "Placeholder", // Static text kyunki hum photo nahi le rahe
                companyId: companyId || 'unknown',
                companyName: companyName || 'Shared Catalogue',
                status: 'pending',
                createdAt: serverTimestamp(),
            });

            sessionStorage.setItem('leadSubmitted', 'true');
            setStep(2);
            setTimeout(() => setIsVisible(false), 4000);
        } catch (error) {
            console.error("Firestore Save Error:", error);
            alert("Submission failed. Please check your Firestore Rules.");
        } finally {
            setLoading(false);
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-xs shadow-2xl overflow-hidden relative border-t-4 border-[#00A3E1]">

                {/* Close Button */}
                <button
                    onClick={() => setIsVisible(false)}
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
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">
                                    Business Card (Optional)
                                </label>
                                <div className="flex items-center justify-center w-full h-14 border-2 border-dashed border-gray-200 bg-gray-50 rounded-xs">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 italic">
                                        Business Card Placeholder
                                    </span>
                                </div>
                            </div>

                            <button
                                disabled={loading}
                                className={`w-full py-4 rounded-xs font-black text-xs uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 ${loading ? 'bg-gray-300' : 'bg-[#00A3E1] hover:bg-[#1A3B5D]'}`}
                            >
                                {loading ? 'Processing...' : 'Submit Details'}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="p-12 text-center flex flex-col items-center">
                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 animate-bounce">
                            <CheckCircle size={40} strokeWidth={3} />
                        </div>
                        <h2 className="text-2xl font-black text-[#1A3B5D] uppercase tracking-tighter">Thank You!</h2>
                        <p className="text-gray-500 text-sm mt-2">We have received your information. Our team will contact you shortly.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeadPopUp;