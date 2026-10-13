import React from 'react';

interface AdjustmentConfirmModalProps {
    pendingAdjustment: { amount: number };
    handleCreditNote: () => void;
    handleRefund: () => void;
    setShowAdjustmentPopup: (v: boolean) => void;
    setPendingAdjustment: (v: { amount: number } | null) => void;
}

export const AdjustmentConfirmModal: React.FC<AdjustmentConfirmModalProps> = ({
    pendingAdjustment,
    handleCreditNote,
    handleRefund,
    setShowAdjustmentPopup,
    setPendingAdjustment,
}) => {
    return (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-[360px] rounded-sm shadow-xl border border-slate-200 p-5">

                <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-500">
                    Amount Reduced
                </p>

                <p className="text-center text-xl font-black text-orange-600 mt-2 mb-5">
                    ₹{pendingAdjustment.amount.toFixed(2)}
                </p>

                <div className="flex gap-3">
                    <button
                        className="flex-1 py-2.5 bg-orange-600 text-white text-xs font-black rounded-sm hover:bg-orange-700 transition"
                        onClick={handleCreditNote}
                    >
                        Credit Note
                    </button>

                    <button
                        className="flex-1 py-2.5 bg-green-600 text-white text-xs font-black rounded-sm hover:bg-green-700 transition"
                        onClick={handleRefund}
                    >
                        Refund
                    </button>
                </div>

                <button
                    className="mt-4 w-full text-[10px] font-bold text-slate-400 hover:text-slate-700"
                    onClick={() => {
                        setShowAdjustmentPopup(false);
                        setPendingAdjustment(null);
                    }}
                >
                    Cancel
                </button>

            </div>
        </div>
    );
};
