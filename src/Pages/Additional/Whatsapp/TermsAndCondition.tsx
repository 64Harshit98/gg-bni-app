import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import { FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';

interface TermsModalProps {
    isOpen: boolean;
    onAccept: () => void; // Parent component controls what happens next
}

const TermsAgreementModal: React.FC<TermsModalProps> = ({ isOpen, onAccept }) => {
    const { currentUser } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleAccept = async () => {
        // 1. Get Company ID safely
        const companyId = (currentUser as any)?.companyId;

        if (!currentUser || !companyId) {
            setError("Session invalid. Please refresh.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // 2. Record Agreement in Firestore
            const companyRef = doc(db, 'companies', companyId);
            await updateDoc(companyRef, {
                termsAccepted: true,
                termsAcceptedAt: serverTimestamp(),
                termsVersion: "1.0"
            });

            // 3. Tell Parent Component to proceed (Move to QR Step)
            onAccept();

        } catch (err) {
            console.error("Error accepting terms:", err);
            setError("Connection failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="bg-orange-50 border-b border-orange-100 p-6 flex items-start gap-4 shrink-0">
                    <div className="bg-orange-100 p-2 rounded-full text-orange-600 mt-1">
                        <FiAlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">User Agreement</h2>
                        <p className="text-gray-600 text-sm mt-1">Please accept these terms to generate your WhatsApp QR Code.</p>
                    </div>
                </div>

                {/* Scrollable Terms */}
                <div className="p-6 overflow-y-auto space-y-4">
                    <TermItem number={1} title="Message Distribution">
                        You agree to send messages only to recipients who have explicitly opted in.
                    </TermItem>
                    <TermItem number={2} title="Unsolicited Messages">
                        Unsolicited messaging is prohibited and will result in account bans.
                    </TermItem>
                    <TermItem number={3} title="Reporting and Blocking">
                        High block rates from recipients may cause WhatsApp to restrict your number.
                    </TermItem>
                    <TermItem number={4} title="Opt-Out Mechanism">
                        You must provide a clear way for users to unsubscribe (e.g., "Reply STOP").
                    </TermItem>
                    <TermItem number={5} title="Compliance">
                        You must comply with all applicable local data privacy laws.
                    </TermItem>

                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-4 rounded-r-lg flex gap-3">
                        <FiInfo className="text-yellow-600 w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-xs text-yellow-800 leading-relaxed">
                            <strong>Important:</strong> Violating these terms may result in your WhatsApp number being permanently blocked.
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded text-center font-medium">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
                    <button
                        onClick={handleAccept}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {isSubmitting ? "Saving..." : (
                            <>
                                <FiCheckCircle className="w-5 h-5" />
                                I Agree - Generate QR Code
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

const TermItem: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
    <div className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3 mb-1">
            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                {number}
            </div>
            <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
        </div>
        <p className="text-gray-600 text-xs pl-8 leading-relaxed">
            {children}
        </p>
    </div>
);

export default TermsAgreementModal;