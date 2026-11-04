import React from 'react';

interface DeleteConfirmModalProps {
    pendingDeleteOrderId: string;
    pendingDeleteWarning: string | null;
    setShowDeleteConfirmModal: (v: boolean) => void;
    setPendingDeleteOrderId: (v: string | null) => void;
    setPendingDeleteWarning: (v: string | null) => void;
    handleDeleteOrder: (orderId: string, skipConfirm?: boolean) => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
    pendingDeleteOrderId,
    pendingDeleteWarning,
    setShowDeleteConfirmModal,
    setPendingDeleteOrderId,
    setPendingDeleteWarning,
    handleDeleteOrder,
}) => {
    return (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-[360px] rounded-sm shadow-xl border border-slate-200 p-5">
                <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    Delete Order
                </p>
                <p className="text-center text-sm text-slate-600 mb-5 leading-snug">
                    {pendingDeleteWarning || (
                        <>Are you sure you want to <span className="text-red-600 font-bold">delete this order</span>? This action cannot be undone.</>
                    )}
                </p>
                <div className="flex gap-3">
                    <button
                        className="flex-1 py-2.5 bg-slate-200 text-slate-800 text-xs font-black rounded-sm hover:bg-slate-300 transition"
                        onClick={() => {
                            setShowDeleteConfirmModal(false);
                            setPendingDeleteOrderId(null);
                            setPendingDeleteWarning(null);
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        className="flex-1 py-2.5 bg-red-600 text-white text-xs font-black rounded-sm hover:bg-red-700 transition"
                        onClick={async () => {
                            const orderId = pendingDeleteOrderId;
                            setShowDeleteConfirmModal(false);
                            setPendingDeleteOrderId(null);
                            setPendingDeleteWarning(null);
                            await handleDeleteOrder(orderId, true);
                        }}
                    >
                        Delete Order
                    </button>
                </div>
            </div>
        </div>
    );
};
