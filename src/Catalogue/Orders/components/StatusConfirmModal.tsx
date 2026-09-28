import React from 'react';
import type { OrderStatus } from '../orders.types';

interface StatusConfirmModalProps {
    selectedOrderForConfirm: string;
    setSelectedOrderForConfirm: (v: string | null) => void;
    handleUpdateStatus: (
        orderId: string,
        currentStatus: OrderStatus,
        manualNextStatus?: OrderStatus
    ) => Promise<void>;
}

export const StatusConfirmModal: React.FC<StatusConfirmModalProps> = ({
    selectedOrderForConfirm,
    setSelectedOrderForConfirm,
    handleUpdateStatus,
}) => {
    return (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-[340px] rounded-sm shadow-xl border border-slate-200 p-5">
                <p className="text-center text-sm font-semibold text-slate-700 mb-1">
                    Move order to <span className="text-orange-600">Completed</span>?
                </p>
                <p className="text-center text-[11px] text-slate-400 mb-5">
                    This action cannot be undone.
                </p>
                <div className="flex gap-3">
                    <button
                        className="flex-1 py-2.5 bg-slate-200 text-slate-800 text-xs font-black rounded-sm hover:bg-slate-300 transition"
                        onClick={() => setSelectedOrderForConfirm(null)}
                    >
                        Cancel
                    </button>
                    <button
                        className="flex-1 py-2.5 bg-orange-600 text-white text-xs font-black rounded-sm hover:bg-orange-700 transition"
                        onClick={() => {
                            const orderId = selectedOrderForConfirm;
                            setSelectedOrderForConfirm(null);
                            handleUpdateStatus(orderId, 'Packed', 'Completed');
                        }}
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};
