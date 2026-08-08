import React from 'react';
import { FiSend } from 'react-icons/fi';
import { Spinner } from '../../../constants/Spinner';
import { ACTION } from '../../../enums/action.enum';
import type { Order } from '../orders.types';

interface OrderActionSheetProps {
    selectedOrderForAction: Order;
    setSelectedOrderForAction: (order: Order | null) => void;
    setShowPrintSubMenu: (v: boolean) => void;
    billType: 'estimate' | 'bill';
    setBillType: (v: 'estimate' | 'bill') => void;
    handleSendWhatsapp: (order: Order) => void;
    sendingPdf: boolean;
    pdfLoadingOrderId: string | null;
    setPdfLoadingOrderId: (id: string | null) => void;
    handlePdfAction: (order: Order, action: ACTION, withDuplicate?: boolean) => void;
    setShowQrModal: (order: Order | null) => void;
}

// Action-sheet modal (WhatsApp / Download / Print / QR) triggered from a
// selected order — moved verbatim from Orders.tsx.
export const OrderActionSheet: React.FC<OrderActionSheetProps> = ({
    selectedOrderForAction,
    setSelectedOrderForAction,
    setShowPrintSubMenu,
    billType,
    setBillType,
    handleSendWhatsapp,
    sendingPdf,
    pdfLoadingOrderId,
    setPdfLoadingOrderId,
    handlePdfAction,
    setShowQrModal,
}) => {
    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => { setSelectedOrderForAction(null); setShowPrintSubMenu(false); }}>
            <div className="bg-white rounded-sm p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex mb-4 bg-slate-100 rounded-sm p-1">
                    {['bill', 'estimate'].map((type) => (
                        <button
                            key={type}
                            onClick={() => setBillType(type as any)}
                            className={`flex-1 py-2 text-xs font-bold uppercase rounded-sm transition-all ${billType === type
                                ? 'bg-white text-[#F97316] shadow-sm'
                                : 'text-slate-500'
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => handleSendWhatsapp(selectedOrderForAction)}
                        disabled={sendingPdf || pdfLoadingOrderId === selectedOrderForAction.id}
                        className="w-full bg-[#25D366] text-white py-2.5 rounded-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {sendingPdf ? (
                            <Spinner />
                        ) : (
                            <>
                                <FiSend /> Share on WhatsApp
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => {
                            const order = selectedOrderForAction;

                            setPdfLoadingOrderId(order.id);   // spinner start

                            setSelectedOrderForAction(null);

                            setTimeout(() => {
                                handlePdfAction(order, ACTION.DOWNLOAD);
                            }, 50);
                        }}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-sm font-bold flex items-center justify-center"
                    >
                        Download PDF
                    </button>
                    <button
                        onClick={() => {
                            setShowPrintSubMenu(true);
                        }}
                        className="w-full border py-2.5 rounded-sm font-bold"
                    >
                        Print
                    </button>
                    <button
                        disabled
                        onClick={() => {
                            setShowQrModal(selectedOrderForAction);
                            setSelectedOrderForAction(null);
                        }}
                        className="w-full bg-gray-400 cursor-not-allowed text-white py-2.5 rounded-sm font-bold"
                    >
                        Generate QR Code
                    </button>
                </div>
            </div>
        </div>
    );
};
