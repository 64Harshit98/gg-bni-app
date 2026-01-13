import { useState, useEffect } from 'react'; // useEffect add kiya hai
import { ChevronLeft,Trash2, Check, ChevronUp, X } from 'lucide-react';

const CartPage = () => {
    const [step, setStep] = useState(1);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // --- 1. Address States ---
    const [shipping, setShipping] = useState({ name: '', phone: '', city: '', state: '', address: '' });
    const [billing, setBilling] = useState({ name: '', phone: '', city: '', state: '', address: '' });
    const [isSameAsShipping, setIsSameAsShipping] = useState(false);

    // --- 2. Auto-copy Logic ---
    // Ye logic apne component ke andar rakhein
    useEffect(() => {
        if (isSameAsShipping) {
            setShipping({
                name: billing.name,
                phone: billing.phone,
                city: billing.city,
                state: billing.state,
                address: billing.address
            });
        }
    }, [isSameAsShipping, billing]);

    const cartItems = [
        { id: 1, name: 'Modern Desk Lamp', category: 'Home Decor', price: 999, image: 'https://images.unsplash.com/photo-1534073828943-f801091bb18c?w=300' },
        { id: 2, name: 'Scandinavian Chair', category: 'Home Decor', price: 999, image: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=300' },
    ];

    const handleDrawerAction = () => {
        if (step === 1) {
            setStep(2);
            setIsDrawerOpen(false);
        } else {
            alert('Order Placed!');
            setIsDrawerOpen(false);
        }
    };

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] pb-20 lg:pb-0 lg:h-screen lg:overflow-hidden">
            {/* --- HEADER --- */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
                    <h1 className="text-[#1A3B5D] font-black tracking-[0.1em] text-sm lg:text-base uppercase italic">GiftingGuru</h1>
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                        Checkout Process
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto p-4 lg:p-6 lg:h-[calc(100vh-60px)] flex flex-col">
                {/* --- NAVIGATION & STEPPER --- */}
                <div className="mb-6">
                    <div className="flex items-center mb-4">
                        <button
                            onClick={() => step === 2 ? setStep(1) : window.history.back()}
                            className="p-1.5 bg-white rounded-lg shadow-sm hover:text-[#00A3E1] border border-gray-50 mr-4"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <div>
                            <h2 className="text-base lg:text-xl font-black text-[#1A3B5D] uppercase tracking-wider leading-none">
                                {step === 1 ? "Your Cart" : "Shipping & Billing"}
                            </h2>
                            <div className="flex items-center gap-4 mt-2">
                                <button onClick={() => setStep(1)} className="flex items-center gap-1.5 outline-none">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${step === 1 ? 'bg-[#1A3B5D] text-white' : 'bg-green-500 text-white'}`}>
                                        {step > 1 ? <Check size={10} strokeWidth={4} /> : "1"}
                                    </span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${step === 1 ? 'text-[#1A3B5D]' : 'text-gray-400'}`}>Cart</span>
                                </button>
                                <div className="w-6 h-[1px] bg-gray-300" />
                                <button onClick={() => setStep(2)} className="flex items-center gap-1.5 outline-none">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${step === 2 ? 'bg-[#1A3B5D] text-white' : 'bg-gray-200 text-gray-400 border border-gray-300'}`}>2</span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${step === 2 ? 'text-[#1A3B5D]' : 'text-gray-400'}`}>Shipping</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-5 items-start flex-1 lg:overflow-hidden">
                    {/* LEFT SIDE: Content */}
                    <div className="w-full lg:flex-1 space-y-3 lg:overflow-y-auto lg:pr-2 custom-scrollbar lg:max-h-full">
                        {step === 1 ? (
                            <>
                                <div className="grid grid-cols-1 gap-2.5">
                                    {cartItems.map((item) => (
                                        <div key={item.id} className="bg-white rounded-[16px] p-3 shadow-sm border border-gray-50">
                                            <div className="flex gap-3">
                                                <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover" />
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="text-[10px] font-black text-[#1A3B5D] uppercase">{item.name}</h3>
                                                        <button className="text-red-400 p-1 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-1">
                                                        <span className="font-black text-[#1A3B5D] text-sm italic">₹{item.price}</span>
                                                        <div className="flex items-center bg-gray-50 rounded-lg p-0.5 border border-gray-100">
                                                            <button className="w-5 h-5 flex items-center justify-center text-xs font-bold">-</button>
                                                            <span className="px-2 text-[10px] font-black">1</span>
                                                            <button className="w-5 h-5 flex items-center justify-center text-[#00A3E1] text-xs font-bold">+</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-white rounded-[16px] p-4 shadow-sm border border-gray-50">
                                    <label className="text-[8px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Special Instructions</label>
                                    <textarea placeholder="Anything else we should know?" className="w-full bg-gray-50 rounded-xl p-3 text-[10px] font-bold outline-none min-h-[60px] resize-none" />
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4 pb-4">
                                {/* 1. BILLING ADDRESS CARD */}
                                <div className="bg-white rounded-[24px] shadow-sm p-5 border border-gray-50">
                                    <h3 className="text-[10px] font-black text-[#1A3B5D] uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span> Billing Address
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                                <input value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold outline-none" placeholder="Payer's Name" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone</label>
                                                <input value={billing.phone} onChange={(e) => setBilling({ ...billing, phone: e.target.value })} type="tel" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold outline-none" placeholder="+91" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">City</label>
                                                <input value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold outline-none" placeholder="City" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">State</label>
                                                <input value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold outline-none" placeholder="State" />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Complete Address</label>
                                            <textarea value={billing.address} onChange={(e) => setBilling({ ...billing, address: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold h-16 resize-none outline-none" placeholder="Billing address details..."></textarea>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. TOGGLE BUTTON SECTION */}
                                <div className="flex items-center gap-3 px-2">
                                    <button
                                        onClick={() => setIsSameAsShipping(!isSameAsShipping)}
                                        className={`w-10 h-5 rounded-full transition-all duration-300 flex items-center px-1 ${isSameAsShipping ? 'bg-[#00A3E1]' : 'bg-gray-300'}`}
                                    >
                                        <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-sm transition-transform duration-300 ${isSameAsShipping ? 'translate-x-4.5' : 'translate-x-0'}`} />
                                    </button>
                                    <span className="text-[10px] font-black text-[#1A3B5D] uppercase tracking-wider">Shipping address same as billing</span>
                                </div>

                                {/* 3. SHIPPING ADDRESS CARD */}
                                <div className={`bg-white rounded-[24px] shadow-sm p-5 border border-gray-50 transition-all duration-500 ${isSameAsShipping ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
                                    <h3 className="text-[10px] font-black text-[#1A3B5D] uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-[#00A3E1] rounded-full"></span> Shipping Address
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                                <input value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold outline-none" placeholder="Receiver's Name" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone</label>
                                                <input value={shipping.phone} onChange={(e) => setShipping({ ...shipping, phone: e.target.value })} type="tel" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold outline-none" placeholder="+91" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">City</label>
                                                <input value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold outline-none" placeholder="City" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">State</label>
                                                <input value={shipping.state} onChange={(e) => setShipping({ ...shipping, state: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold outline-none" placeholder="State" />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Complete Address</label>
                                            <textarea value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] font-bold h-16 resize-none outline-none" placeholder="Flat No, Building, Street..."></textarea>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* DESKTOP SIDEBAR */}
                    <aside className="hidden lg:block w-[300px]">
                        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 sticky top-0">
                            <h3 className="text-[#1A3B5D] font-black text-xs uppercase tracking-wider mb-4 pb-2 border-b border-gray-50">Order Summary</h3>
                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                                    <span>Subtotal</span> <span className="text-[#1A3B5D]">₹1,998</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                                    <span>Delivery</span> <span className="text-green-500">Free</span>
                                </div>
                                <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                                    <span className="text-[#1A3B5D] font-black text-xs uppercase">Total Pay</span>
                                    <span className="text-xl font-black text-[#00A3E1]">₹1,998</span>
                                </div>
                            </div>
                            <button onClick={() => step === 1 ? setStep(2) : alert('Order Placed!')} className="w-full bg-[#1A3B5D] text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-[#00A3E1] transition-all transform active:scale-95">
                                {step === 1 ? "Proceed to Shipping" : "Complete Purchase"}
                            </button>
                        </div>
                    </aside>
                </div>
            </main>

            {/* --- MOBILE DRAWER OVERLAY --- */}
            {isDrawerOpen && (
                <div className="lg:hidden fixed inset-0 bg-black/40 z-[60] backdrop-blur-[2px]" onClick={() => setIsDrawerOpen(false)} />
            )}

            {/* --- MOBILE DRAWER CONTENT --- */}
            <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-[70] transition-transform duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] ${isDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-2" />
                <div className="px-6 py-4">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-[#1A3B5D] font-black text-xs uppercase tracking-widest">Order Summary</h3>
                        <button onClick={() => setIsDrawerOpen(false)} className="p-1.5 bg-gray-50 rounded-full"><X size={16} /></button>
                    </div>
                    <div className="space-y-4 mb-8">
                        <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-gray-400">
                            <span>Items (2)</span> <span className="text-[#1A3B5D]">₹1,998</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-gray-400">
                            <span>Shipping</span> <span className="text-green-500">Free</span>
                        </div>
                        <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                            <span className="text-[#1A3B5D] font-black text-sm uppercase">Amount Payable</span>
                            <span className="text-2xl font-black text-[#00A3E1]">₹1,998</span>
                        </div>
                    </div>
                    <button onClick={handleDrawerAction} className="w-full bg-[#1A3B5D] text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-blue-900/10">
                        {step === 1 ? "Proceed to Shipping" : "Confirm & Pay Now"}
                    </button>
                </div>
            </div>

            {/* --- MOBILE STICKY FOOTER --- */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-50">
                <div className="flex flex-col" onClick={() => setIsDrawerOpen(true)}>
                    <div className="flex items-center gap-1">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total Pay</span>
                        <ChevronUp size={12} className="text-[#00A3E1]" />
                    </div>
                    <span className="text-xl font-black text-[#1A3B5D]">₹1,998</span>
                </div>
                <button
                    onClick={() => step === 1 ? setStep(2) : setIsDrawerOpen(true)}
                    className="bg-[#00A3E1] text-white px-10 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-transform"
                >
                    {step === 1 ? "Checkout" : "View Summary"}
                </button>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default CartPage;