import React, { useState, useEffect } from 'react';
import { ChevronLeft, Trash2, Check, ChevronUp, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// --- Types Definitions ---
interface CartItem {
    id: string | number;
    name: string;
    category: string;
    price: number;
    quantity: number;
    image: string;
    note: string;
}

interface Address {
    name: string;
    phone: string;
    city: string;
    state: string;
    address: string;
}

const CartPage: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<number>(1);
    const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

    // --- 1. Address States ---
    const [shipping, setShipping] = useState<Address>({ name: '', phone: '', city: '', state: '', address: '' });
    const [billing, setBilling] = useState<Address>({ name: '', phone: '', city: '', state: '', address: '' });
    const [isSameAsShipping, setIsSameAsShipping] = useState<boolean>(false);

    // --- 2. Dynamic Cart State ---
    const [cartItems, setCartItems] = useState<CartItem[]>([]);

    // --- 3. Load Data from LocalStorage ---
    useEffect(() => {
        const savedCart = localStorage.getItem('temp_cart');
        if (savedCart) {
            try {
                const parsedCart = JSON.parse(savedCart);
                const formattedItems: CartItem[] = parsedCart.map((entry: any) => ({
                    id: entry.item.id,
                    name: entry.item.name,
                    category: entry.item.category || 'Product',
                    price: entry.item.mrp || 0,
                    quantity: entry.quantity,
                    image: entry.item.imageUrl || 'https://via.placeholder.com/150',
                    note: '' 
                }));
                setCartItems(formattedItems);
            } catch (error) {
                console.error("Error parsing cart data", error);
            }
        }
    }, []);

    // --- 4. Logic Functions ---
    const updateQuantity = (id: string | number, delta: number) => {
        const updatedItems = cartItems.map(item => {
            if (item.id === id) {
                const newQty = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        });
        setCartItems(updatedItems);
        
        const savedCart = localStorage.getItem('temp_cart');
        if (savedCart) {
            const parsedCart = JSON.parse(savedCart);
            const newLS = parsedCart.map((entry: any) => 
                entry.item.id === id ? { ...entry, quantity: Math.max(1, entry.quantity + delta) } : entry
            );
            localStorage.setItem('temp_cart', JSON.stringify(newLS));
        }
    };

    const updateItemNote = (id: string | number, note: string) => {
        setCartItems(prev => prev.map(item => item.id === id ? { ...item, note } : item));
    };

    const subtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const totalPay = subtotal;

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

    const removeFromCart = (id: string | number) => {
        const updatedCart = cartItems.filter(item => item.id !== id);
        setCartItems(updatedCart);
        const savedCart = localStorage.getItem('temp_cart');
        if (savedCart) {
            const parsedCart = JSON.parse(savedCart);
            const newLocalStorageCart = parsedCart.filter((entry: any) => entry.item.id !== id);
            localStorage.setItem('temp_cart', JSON.stringify(newLocalStorageCart));
        }
    };

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
        <div className="bg-gray-50 min-h-screen font-sans text-[#1A3B5D] pb-20 lg:pb-0 lg:h-screen lg:overflow-hidden">
            <header className="sticky top-0 bg-white border-b border-gray-100 shadow-sm z-[60]">
                <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <ChevronLeft size={20} className="text-[#1A3B5D]" />
                            </button>
                            <div className="w-1 h-5 bg-[#00A3E1] rounded-full"></div>
                            <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">My Cart</h1>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto p-4 lg:p-6 lg:h-[calc(100vh-64px)] flex flex-col">
                <div className="mb-6 flex items-center justify-center lg:justify-start gap-4">
                    <button onClick={() => setStep(1)} className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${step === 1 ? 'bg-[#00A3E1] text-white' : 'bg-green-500 text-white'}`}>
                            {step > 1 ? <Check size={12} strokeWidth={4} /> : "1"}
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${step === 1 ? 'text-[#1A3B5D]' : 'text-gray-400'}`}>Cart</span>
                    </button>
                    <div className="w-10 h-[2px] bg-gray-200" />
                    <button onClick={() => setStep(2)} className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${step === 2 ? 'bg-[#00A3E1] text-white' : 'bg-gray-200 text-gray-400'}`}>2</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${step === 2 ? 'text-[#1A3B5D]' : 'text-gray-400'}`}>Shipping</span>
                    </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-5 items-start flex-1 lg:overflow-hidden">
                    <div className="w-full lg:flex-1 space-y-3 lg:overflow-y-auto lg:pr-2 custom-scrollbar lg:max-h-full">
                        {step === 1 ? (
                            <>
                                <div className="grid grid-cols-1 gap-2.5">
                                    {cartItems.length > 0 ? cartItems.map((item) => (
                                        <div key={item.id} className="bg-white rounded-[16px] p-3 shadow-sm border border-gray-50">
                                            <div className="flex gap-3">
                                                <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover" />
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="text-[10px] font-black text-[#1A3B5D] uppercase">{item.name}</h3>
                                                        <button onClick={() => removeFromCart(item.id)} className="text-red-400 p-1 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-2 gap-2">
                                                        <span className="font-black text-[#1A3B5D] text-sm italic shrink-0">₹{item.price}</span>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Add note..." 
                                                            value={item.note}
                                                            onChange={(e) => updateItemNote(item.id, e.target.value)}
                                                            className="flex-1 bg-gray-50 rounded-md px-2 py-1 text-[9px] font-medium border border-gray-100 outline-none h-7"
                                                        />
                                                        <div className="flex items-center bg-gray-50 rounded-lg p-0.5 border border-gray-100 shrink-0">
                                                            <button onClick={() => updateQuantity(item.id, -1)} className="w-5 h-5 flex items-center justify-center text-xs font-bold">-</button>
                                                            <span className="px-2 text-[10px] font-black">{item.quantity}</span>
                                                            <button onClick={() => updateQuantity(item.id, 1)} className="w-5 h-5 flex items-center justify-center text-[#00A3E1] text-xs font-bold">+</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="bg-white rounded-[16px] p-10 text-center shadow-sm border border-gray-100">
                                            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Your cart is empty</p>
                                        </div>
                                    )}
                                </div>
                                <div className="bg-white rounded-[16px] p-4 shadow-sm border border-gray-50">
                                    <label className="text-[8px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Special Instructions</label>
                                    <textarea placeholder="Anything else we should know?" className="w-full bg-gray-50 rounded-xl p-3 text-[10px] font-bold outline-none min-h-[60px] resize-none" />
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4 pb-4">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="bg-white rounded-[20px] shadow-sm p-4 border border-gray-50">
                                        <h3 className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span> Billing Address
                                        </h3>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <div className="space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                                <input value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold outline-none" placeholder="Payer's Name" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone</label>
                                                <input value={billing.phone} onChange={(e) => setBilling({ ...billing, phone: e.target.value })} type="tel" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold outline-none" placeholder="+91" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">City</label>
                                                <input value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold outline-none" placeholder="City" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">State</label>
                                                <input value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold outline-none" placeholder="State" />
                                            </div>
                                        </div>
                                        <div className="mt-3 space-y-1">
                                            <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Complete Address</label>
                                            <textarea value={billing.address} onChange={(e) => setBilling({ ...billing, address: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold h-12 resize-none outline-none" placeholder="Details..."></textarea>
                                        </div>
                                    </div>

                                    <div className={`bg-white rounded-[20px] shadow-sm p-4 border border-gray-50 transition-all ${isSameAsShipping ? 'opacity-60 pointer-events-none grayscale-[0.5]' : 'opacity-100'}`}>
                                        <h3 className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-[#00A3E1] rounded-full"></span> Shipping Address
                                        </h3>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <div className="space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                                <input value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold outline-none" placeholder="Receiver's Name" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone</label>
                                                <input value={shipping.phone} onChange={(e) => setShipping({ ...shipping, phone: e.target.value })} type="tel" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold outline-none" placeholder="+91" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">City</label>
                                                <input value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold outline-none" placeholder="City" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">State</label>
                                                <input value={shipping.state} onChange={(e) => setShipping({ ...shipping, state: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold outline-none" placeholder="State" />
                                            </div>
                                        </div>
                                        <div className="mt-3 space-y-1">
                                            <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Complete Address</label>
                                            <textarea value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-[10px] font-bold h-12 resize-none outline-none" placeholder="Details..."></textarea>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 px-2">
                                    <button onClick={() => setIsSameAsShipping(!isSameAsShipping)} className={`w-9 h-4.5 rounded-full transition-all flex items-center px-1 ${isSameAsShipping ? 'bg-[#00A3E1]' : 'bg-gray-300'}`}>
                                        <div className={`bg-white w-3 h-3 rounded-full shadow-sm transition-transform ${isSameAsShipping ? 'translate-x-4.5' : 'translate-x-0'}`} />
                                    </button>
                                    <span className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-wider">Shipping same as billing</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <aside className="hidden lg:block w-[300px]">
                        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 sticky top-0">
                            <h3 className="text-[#1A3B5D] font-black text-xs uppercase tracking-wider mb-4 pb-2 border-b border-gray-50">Order Summary</h3>
                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                                    <span>Subtotal</span> <span className="text-[#1A3B5D]">₹{subtotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                                    <span>Delivery</span> <span className="text-green-500">Free</span>
                                </div>
                                <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                                    <span className="text-[#00A3E1] font-black text-xs uppercase">Total Pay</span>
                                    <span className="text-xl font-black text-[#00A3E1]">₹{totalPay.toLocaleString()}</span>
                                </div>
                            </div>
                            <button onClick={() => step === 1 ? setStep(2) : alert('Order Placed!')} className="w-full bg-[#00A3E1] text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:brightness-110 transition-all active:scale-95">
                                {step === 1 ? "Proceed to Shipping" : "Complete Purchase"}
                            </button>
                        </div>
                    </aside>
                </div>
            </main>

            {isDrawerOpen && (
                <div className="lg:hidden fixed inset-0 bg-black/40 z-[60] backdrop-blur-[2px]" onClick={() => setIsDrawerOpen(false)} />
            )}

            <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-[70] transition-transform duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] ${isDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-2" />
                <div className="px-6 py-4">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-[#1A3B5D] font-black text-xs uppercase tracking-widest">Order Summary</h3>
                        <button onClick={() => setIsDrawerOpen(false)} className="p-1.5 bg-gray-50 rounded-full"><X size={16} /></button>
                    </div>
                    <div className="space-y-4 mb-8">
                        <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-gray-400">
                            <span>Items ({cartItems.length})</span> <span className="text-[#1A3B5D]">₹{subtotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-gray-400">
                            <span>Shipping</span> <span className="text-green-500">Free</span>
                        </div>
                        <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                            <span className="text-[#1A3B5D] font-black text-sm uppercase">Amount Payable</span>
                            <span className="text-2xl font-black text-[#00A3E1]">₹{totalPay.toLocaleString()}</span>
                        </div>
                    </div>
                    <button onClick={handleDrawerAction} className="w-full bg-[#1A3B5D] text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl">
                        {step === 1 ? "Proceed to Shipping" : "Confirm & Pay Now"}
                    </button>
                </div>
            </div>

            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-50">
                <div className="flex flex-col" onClick={() => setIsDrawerOpen(true)}>
                    <div className="flex items-center gap-1">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total Pay</span>
                        <ChevronUp size={12} className="text-[#00A3E1]" />
                    </div>
                    <span className="text-xl font-black text-[#1A3B5D]">₹{totalPay.toLocaleString()}</span>
                </div>
                <button onClick={() => step === 1 ? setStep(2) : setIsDrawerOpen(true)} className="bg-[#00A3E1] text-white px-10 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-transform">
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