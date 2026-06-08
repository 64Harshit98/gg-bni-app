import React, { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { db } from '../lib/Firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Item } from '../constants/models';
import { FiPackage } from 'react-icons/fi';

interface BulkQuotePopupProps {
    item: Item;
    companyId: string;
    onClose: () => void;
}

const BulkQuotePopup: React.FC<BulkQuotePopupProps> = ({ item, companyId, onClose }) => {
    const [quantity, setQuantity] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
        if (!quantity.trim()) return;
        setLoading(true);
        try {
            const leadData = JSON.parse(localStorage.getItem('leadData') || '{}');
            await addDoc(collection(db, 'companies', companyId, 'BulkQuoteRequests'), {
                itemId: item.id,
                itemName: item.name,
                itemImage: item.imageUrl || null,
                quantity: quantity.trim(),
                note: note.trim(),
                customerName: leadData.name || 'Guest',
                customerNumber: leadData.number || '',
                status: 'pending',
                createdAt: serverTimestamp(),
            });
            setSubmitted(true);
            setTimeout(() => onClose(), 3000);
        } catch (err) {
            console.error('Bulk Quote Error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-sm shadow-2xl border-t-4 border-[#F97316] overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-xs font-black uppercase tracking-widest text-[#1A3B5D]">
                        Bulk Quote Request
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {submitted ? (
                    <div className="p-10 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3 animate-bounce">
                            <CheckCircle size={32} strokeWidth={3} />
                        </div>
                        <h3 className="text-lg font-black text-[#1A3B5D] uppercase">Request Sent!</h3>
                        <p className="text-gray-500 text-xs mt-1">We'll get back to you with the best price.</p>
                    </div>
                ) : (
                    <div className="p-4 space-y-4">

                        {/* Item Info Row — matches whiteboard layout */}
                        <div className="flex gap-3 bg-gray-50 border border-gray-100 rounded-sm p-3">

                            {/* Image (left) */}
                            <div className="w-20 h-20 shrink-0 bg-white border border-gray-200 rounded-sm flex items-center justify-center overflow-hidden">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                                ) : (
                                    <FiPackage className="w-8 h-8 text-gray-300" />
                                )}
                            </div>

                            {/* Right side: Name + QTY */}
                            <div className="flex flex-col justify-between flex-1 min-w-0">
                                <p className="text-[11px] font-black text-[#1A3B5D] uppercase leading-tight line-clamp-2">
                                    {item.name}
                                </p>
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                        Quantity
                                    </label>
                                    <input
                                        type="text"
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                        placeholder="e.g. 50 pcs / 5 dozen"
                                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-sm bg-white focus:border-[#F97316] outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Note field (full width below — matches whiteboard) */}
                        <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                Note / Requirements
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={3}
                                placeholder="Describe your requirements, preferred delivery, etc."
                                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-sm bg-gray-50 focus:border-[#F97316] outline-none resize-none"
                            />
                        </div>

                        {/* Submit */}
                        <button
                            disabled={loading || !quantity.trim()}
                            onClick={handleSubmit}
                            className={`w-full py-3 rounded-sm text-xs font-black uppercase tracking-widest text-white transition-all active:scale-95 ${loading || !quantity.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#F97316] hover:bg-[#ea6c0a]'}`}
                        >
                            {loading ? 'Sending...' : 'Send Quote Request'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BulkQuotePopup;