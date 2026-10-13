import React from 'react';
import { ACTION } from '../../../enums/action.enum';
import type { Order } from '../orders.types';

interface PrintSubMenuModalProps {
    selectedOrderForAction: Order;
    setSelectedOrderForAction: (order: Order | null) => void;
    setShowPrintSubMenu: (v: boolean) => void;
    setPdfLoadingOrderId: (id: string | null) => void;
    handlePdfAction: (order: Order, action: ACTION, withDuplicate?: boolean) => void;
    _billSettings: any;
}

// Print-submenu modal (Bill-only vs Bill+Duplicate/Triplicate) — moved
// verbatim from Orders.tsx.
export const PrintSubMenuModal: React.FC<PrintSubMenuModalProps> = ({
    selectedOrderForAction,
    setSelectedOrderForAction,
    setShowPrintSubMenu,
    setPdfLoadingOrderId,
    handlePdfAction,
    _billSettings,
}) => {
    return (
        <div
            className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowPrintSubMenu(false)}
        >
            <div
                className="bg-white rounded-sm p-6 w-full max-w-xs shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 text-center">
                    Print Options
                </h3>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => {
                            const order = selectedOrderForAction;
                            setPdfLoadingOrderId(order.id);
                            setSelectedOrderForAction(null);
                            setShowPrintSubMenu(false);
                            setTimeout(() => {
                                handlePdfAction(order, ACTION.PRINT);
                            }, 50);
                        }}
                        className="w-full border py-2.5 rounded-sm font-bold text-sm"
                    >
                        Print (Bill Only)
                    </button>
                    <button
                        onClick={() => {
                            const order = selectedOrderForAction;
                            setPdfLoadingOrderId(order.id);
                            setSelectedOrderForAction(null);
                            setShowPrintSubMenu(false);
                            setTimeout(() => {
                                handlePdfAction(order, ACTION.PRINT, true);
                            }, 50);
                        }}
                        className="w-full border border-orange-400 text-orange-600 py-2.5 rounded-sm font-bold text-sm"
                    >
                        {_billSettings?.enableTriplicate
                            ? "Print (Bill + 2 Duplicates)"
                            : "Print (Bill + Duplicate)"}
                    </button>
                    <button
                        onClick={() => setShowPrintSubMenu(false)}
                        className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-700 mt-1"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
