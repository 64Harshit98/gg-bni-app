import React, { useState, useEffect } from 'react';
import { ChevronLeft, Trash2, Check, ChevronUp, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Footer from './Footer';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { FiPackage } from 'react-icons/fi';
import { OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { useAuth } from '../context/auth-context';
import { increment, updateDoc } from "firebase/firestore";
import LeadPopUp from './PopUp';

interface CartItem {
    id: string | number;
    name: string;
    category: string;
    price: number;
    quantity: number;
    image: string;
    note: string;
    imageUrl?: string;
    moq?: number
}

interface CatalogueSalesSettings {
    minimumOrderValue: number;
}

interface Address {
    name: string;
    phone: string;
    city: string;
    state: string;
    address: string;
}

const useBusinessName = (companyId?: string) => {
    const [businessName, setBusinessName] = useState<string>('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!companyId) {
            setLoading(false);
            return;
        }
        const fetchBusinessInfo = async () => {
            try {
                const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
                const docSnap = await getDoc(docRef);
                setBusinessName(docSnap.exists() ? docSnap.data().businessName || 'Catalogue' : 'Catalogue');
            } catch (err) {
                setBusinessName('Catalogue');
            } finally {
                setLoading(false);
            }
        };
        fetchBusinessInfo();
    }, [companyId]);

    return { businessName, loading };
};

const CartPage: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState<number>(1);
    const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
    const [isPlacing, setIsPlacing] = useState(false);
    const { companyId } = useParams<{ companyId: string }>();
    const { businessName: companyName } = useBusinessName(companyId);
    const [salesSettings, setSalesSettings] = useState<CatalogueSalesSettings | null>(null);
    const [shipping, setShipping] = useState<Address>({ name: '', phone: '', city: '', state: '', address: '' });
    const [billing, setBilling] = useState<Address>({ name: '', phone: '', city: '', state: '', address: '' });
    const [isSameAsShipping, setIsSameAsShipping] = useState<boolean>(false);
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [movError, setMovError] = useState<string | null>(null);

    const getUpcomingDocId = () => {
        const upcomingKey =
            localStorage.getItem("upcoming_user_key");

        if (!upcomingKey) return null;

        return `upcoming_${upcomingKey}`;
    };

    const syncToUpcoming = async (updatedCart: CartItem[]) => {
        if (!companyId) return;

        const docId = getUpcomingDocId();
        if (!docId) return;
        const orderRef = doc(db, 'companies', companyId, 'Orders', docId);
        if (updatedCart.length === 0) {
            await deleteDoc(orderRef);
            return;
        }

        const itemsForFirebase = updatedCart.map(item => ({
            id: String(item.id),
            name: item.name,
            quantity: item.quantity,
            mrp: item.price,
            note: item.note || ''
        }));

        const totalAmount = itemsForFirebase.reduce(
            (sum, i) => sum + i.mrp * i.quantity,
            0
        );

        await setDoc(
            orderRef,
            {
                orderId: docId,
                status: 'Upcoming',
                totalAmount,
                paidAmount: 0,
                items: itemsForFirebase,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                userId: currentUser?.uid || null
            },
            { merge: true } // VERY IMPORTANT
        );
    };


    useEffect(() => {
        const savedCart = localStorage.getItem('temp_cart');
        if (savedCart) {
            try {
                const parsedCart = JSON.parse(savedCart);
                const formattedItems: CartItem[] = parsedCart.map((entry: any) => ({
                    id: entry.item.id,
                    name: entry.item.name,
                    category: entry.item.category || 'Product',
                    price:
                        entry.item.effectivePrice ||
                        entry.item.salesPrice ||
                        entry.item.mrp ||
                        0,
                    quantity: entry.quantity,
                    imageUrl: entry.item.imageUrl || 'https://via.placeholder.com/150',
                    moq: entry.item.moq || 1,
                    note: ''
                }));
                setCartItems(formattedItems);
            } catch (error) {
                console.error(error);
            }
        }
    }, []);

    const updateQuantity = (id: string | number, delta: number) => {
        const updatedItems = cartItems
            .map(item => {
                if (item.id === id) {
                    const moqQty = item.moq || 1;

                    //  MOQ STEP LOGIC
                    const stepChange = delta > 0 ? moqQty : -moqQty;

                    let newQty = item.quantity + stepChange;

                    // MOQ se neeche lock
                    newQty = Math.max(moqQty, newQty);

                    return { ...item, quantity: newQty };
                }
                return item;
            })
            .filter(item => item.quantity > 0);

        setCartItems(updatedItems);

        // localStorage sync (IMPORTANT)
        localStorage.setItem(
            'temp_cart',
            JSON.stringify(
                updatedItems.map(i => ({
                    item: {
                        id: i.id,
                        name: i.name,
                        mrp: i.price,
                        imageUrl: i.imageUrl || '',
                        moq: i.moq || 1
                    },
                    quantity: i.quantity
                }))
            )
        );

        syncToUpcoming(updatedItems);
    };

    useEffect(() => {
        if (!companyId) return;

        const fetchSalesSettings = async () => {
            try {
                const ref = doc(
                    db,
                    "companies",
                    companyId,
                    "settings",
                    "catalogue-sales-settings"
                );

                const snap = await getDoc(ref);

                if (snap.exists()) {
                    setSalesSettings(snap.data() as CatalogueSalesSettings);
                } else {
                    setSalesSettings({ minimumOrderValue: 0 });
                }
            } catch (err) {
                console.error("Failed to load MOV:", err);
                setSalesSettings({ minimumOrderValue: 0 });
            }
        };

        fetchSalesSettings();
    }, [companyId]);

    const updateItemNote = (id: string | number, note: string) => {
        setCartItems(prev => prev.map(item => item.id === id ? { ...item, note } : item));
    };

    const subtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const totalPay = subtotal;

    const isMovValid = () => {
        if (!salesSettings) return true;
        return totalPay >= (salesSettings.minimumOrderValue || 0);
    };

    const isAddressValid = (addr: Address) => {
        return (
            addr.name?.trim() &&
            addr.phone?.trim() &&
            addr.phone.length === 10 &&
            addr.city?.trim() &&
            addr.state?.trim() &&
            addr.address?.trim()
        );
    };

    const placeOrder = async () => {
        if (!companyId || !currentUser?.uid) return;
        if (!isMovValid()) {
            const required = salesSettings?.minimumOrderValue || 0;
            const short = required - totalPay;

            setMovError(
                `Minimum order value is ₹${required}. Please add ₹${short} more to place order.`
            );
            return;
        }
        //  ADDRESS VALIDATION GUARD
        const billingValid = isAddressValid(billing);
        const shippingValid = isSameAsShipping
            ? billingValid
            : isAddressValid(shipping);

        if (!billingValid || !shippingValid) {
            alert("Please fill complete billing and shipping details");
            return;
        }


        setIsPlacing(true);

        try {
            // 1️⃣ Create CONFIRMED order
            const orderDocRef = doc(
                collection(db, 'companies', companyId, 'Orders')
            );

            const orderInvoiceNumber = await OrderInvoiceNumber(companyId);

            await setDoc(orderDocRef, {
                orderId: orderInvoiceNumber,
                invoiceNumber: orderInvoiceNumber,
                status: 'Confirmed',
                totalAmount: totalPay,
                paidAmount: 0,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                items: cartItems.map(i => ({
                    id: String(i.id),
                    name: i.name,
                    quantity: i.quantity,
                    mrp: i.price,
                    note: i.note || ''
                })),
                billingDetails: billing,
                shippingDetails: isSameAsShipping ? billing : shipping,
                userLoginPhone: billing.phone,
                userName: billing.name
            });

            // STOCK UPDATE START
            for (const item of cartItems) {
                console.log("ITEM ID:", item.id);
                const docId =
                    (item as any).firestoreDocId || item.id;

                if (!docId) continue;

                const itemRef = doc(
                    db,
                    "companies",
                    companyId,
                    "items",
                    String(docId)
                );

                await updateDoc(itemRef, {
                    stock: increment(-item.quantity),
                    updatedAt: serverTimestamp()
                });
            }

            // 2️⃣ DELETE UPCOMING (STEP 5 — YAHI HAI)
            const upcomingDocId = getUpcomingDocId();

            if (upcomingDocId) {
                const upcomingRef = doc(
                    db,
                    "companies",
                    companyId,
                    "Orders",
                    upcomingDocId
                );

                await deleteDoc(upcomingRef);
            }

            // 3️⃣ Cleanup local state
            localStorage.removeItem('temp_cart');
            setCartItems([]);
            navigate(-1);

        } catch (e) {
            console.error(e);
        } finally {
            setIsPlacing(false);
        }
    };


    useEffect(() => {
        if (isSameAsShipping) {
            setShipping({ ...billing });
        }
    }, [isSameAsShipping, billing]);

    const removeFromCart = (id: string | number) => {
        const updatedCart = cartItems.filter(item => item.id !== id);
        setCartItems(updatedCart);

        localStorage.setItem(
            'temp_cart',
            JSON.stringify(
                updatedCart.map(i => ({
                    item: { id: i.id, name: i.name, mrp: i.price },
                    quantity: i.quantity
                }))
            )
        );

        //  UPCOMING LIVE UPDATE / DELETE
        syncToUpcoming(updatedCart);
    };

    const handleDrawerAction = () => {
        if (cartItems.length === 0) return;

        if (step === 1) {
            setStep(2);
            setIsDrawerOpen(false);
        } else {
            //  MOV CHECK FOR MOBILE
            if (!isMovValid()) {
                const required = salesSettings?.minimumOrderValue || 0;
                const short = required - totalPay;

                setMovError(
                    `Minimum order value is ₹${required}. Please add ₹${short} more to place order.`
                );
                return;
            }

            placeOrder();
            setIsDrawerOpen(false);
        }
    };;

    return (
        <>
            <div className="bg-gray-50 min-h-screen font-sans text-[#1A3B5D] flex flex-col">
                <LeadPopUp companyId={companyId} companyName={companyName} />
                <header className="sticky top-0 bg-white border-b border-gray-100 shadow-sm z-[60]">
                    <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-sm transition-colors">
                                    <ChevronLeft size={20} className="text-[#1A3B5D]" />
                                </button>
                                <div className="w-1 h-5 bg-[#00A3E1] rounded-sm"></div>
                                <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">My Cart</h1>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-6xl mx-auto p-4 lg:p-6 w-full flex-grow">
                    {movError && (
                        <div className="mb-4 bg-white border border-red-200 rounded-lg shadow-sm overflow-hidden">
                            <div className="flex items-start gap-3 p-4">
                                {/* left icon */}
                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                    <span className="text-red-600 font-bold">!</span>
                                </div>

                                {/* text */}
                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-red-700">
                                        Minimum Order Not Met
                                    </h4>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                        {movError}
                                    </p>
                                </div>

                                {/* close */}
                                <button
                                    onClick={() => setMovError(null)}
                                    className="text-gray-400 hover:text-red-500 font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="mb-6 flex items-center justify-center lg:justify-start gap-4">
                        <button onClick={() => setStep(1)} className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-black transition-all ${step === 1 ? 'bg-[#00A3E1] text-white' : 'bg-green-500 text-white'}`}>
                                {step > 1 ? <Check size={12} strokeWidth={4} /> : "1"}
                            </span>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${step === 1 ? 'text-[#1A3B5D]' : 'text-gray-400'}`}>Cart</span>
                        </button>
                        <div className="w-10 h-[2px] bg-gray-200" />
                        <button onClick={() => setStep(2)} className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-black transition-all ${step === 2 ? 'bg-[#00A3E1] text-white' : 'bg-gray-200 text-gray-400'}`}>2</span>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${step === 2 ? 'text-[#1A3B5D]' : 'text-gray-400'}`}>Shipping</span>
                        </button>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-5 items-start">
                        <div className="w-full lg:flex-1 space-y-3">
                            {step === 1 ? (
                                <>
                                    <div className="grid grid-cols-1 gap-2.5">
                                        {cartItems.length > 0 ? cartItems.map((item) => (
                                            <div key={item.id} className="bg-white rounded-sm p-3 shadow-sm border border-gray-10">
                                                <div className="flex gap-3">
                                                    {/* Image Container with Background */}
                                                    <div className="w-15 h-15 bg-gray-100 rounded-sm overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-100">
                                                        {item.imageUrl ? (
                                                            <img
                                                                src={item.imageUrl}
                                                                alt={item.name}
                                                                className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110"
                                                            />
                                                        ) : (
                                                            <FiPackage className="w-10 h-10 text-gray-300" />
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <h3 className="text-[10px] font-black text-[#1A3B5D] uppercase truncate">{item.name}</h3>
                                                            <button onClick={() => removeFromCart(item.id)} className="text-red-500 p-1 hover:bg-red-50 rounded-sm shrink-0">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>

                                                        <div className="flex flex-wrap items-center justify-between mt-2 gap-2">
                                                            <span className="font-black text-[#1A3B5D] text-sm shrink-0">₹{item.price}</span>
                                                            <input
                                                                type="text"
                                                                placeholder="Note..."
                                                                value={item.note}
                                                                onChange={(e) => updateItemNote(item.id, e.target.value)}
                                                                className="flex-1 min-w-[60px] bg-gray-50 rounded-sm px-2 py-1 text-[9px] font-medium border border-gray-100 outline-none h-7"
                                                            />
                                                            <div className="flex items-center bg-gray-50 rounded-sm p-0.5 border border-gray-100 shrink-0">
                                                                <button onClick={() => updateQuantity(item.id, -1)} className="w-5 h-5 flex items-center justify-center text-xs font-bold">-</button>
                                                                <span className="px-2 text-[10px] font-black">{item.quantity}</span>
                                                                <button onClick={() => updateQuantity(item.id, 1)} className="w-5 h-5 flex items-center justify-center text-[#00A3E1] text-xs font-bold">+</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="bg-white rounded-sm p-10 text-center shadow-sm border border-gray-100">
                                                <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Your cart is empty</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-white rounded-sm p-4 shadow-sm border border-gray-50">
                                        <label className="text-[8px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Special Instructions</label>
                                        <textarea placeholder="Anything else we should know?" className="w-full bg-gray-50 rounded-sm p-3 text-[10px] font-bold outline-none min-h-[60px] resize-none" />
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div className="bg-white rounded-sm shadow-sm p-4 border border-gray-50">
                                            <h3 className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-sm"></span> Billing Address
                                            </h3>
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="space-y-1">
                                                    <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                                    <input value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold outline-none" placeholder="Payer's Name" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone</label>
                                                    <input
                                                        value={billing.phone}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                            setBilling({ ...billing, phone: val });
                                                            if (isSameAsShipping) {
                                                                setShipping(prev => ({ ...prev, phone: val }));
                                                            }
                                                        }}
                                                        type="tel"
                                                        className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold outline-none"
                                                        placeholder="10 Digits Only"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">City</label>
                                                    <input value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold outline-none" placeholder="City" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">State</label>
                                                    <input value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold outline-none" placeholder="State" />
                                                </div>
                                            </div>
                                            <div className="mt-3 space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Complete Address</label>
                                                <textarea value={billing.address} onChange={(e) => setBilling({ ...billing, address: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold h-12 resize-none outline-none" placeholder="Details..."></textarea>
                                            </div>
                                        </div>

                                        {/* MOBILE ONLY — Same as Shipping (between cards) */}
                                        <div className="flex lg:hidden items-center gap-3 px-2 -mt-1">
                                            <button
                                                onClick={() => setIsSameAsShipping(!isSameAsShipping)}
                                                className={`w-9 h-4.5 rounded-sm transition-all flex items-center px-1 ${isSameAsShipping ? 'bg-[#00A3E1]' : 'bg-gray-300'
                                                    }`}
                                            >
                                                <div
                                                    className={`bg-white w-3 h-3 rounded-sm shadow-sm transition-transform ${isSameAsShipping ? 'translate-x-4.5' : 'translate-x-0'
                                                        }`}
                                                />
                                            </button>
                                            <span className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-wider">
                                                Shipping same as billing
                                            </span>
                                        </div>

                                        <div className={`bg-white rounded-sm shadow-sm p-4 border border-gray-50 transition-all ${isSameAsShipping ? 'opacity-60 pointer-events-none grayscale-[0.5]' : 'opacity-100'}`}>
                                            <h3 className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-[#00A3E1] rounded-sm"></span> Shipping Address
                                            </h3>
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="space-y-1">
                                                    <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                                    <input value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold outline-none" placeholder="Receiver's Name" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone</label>
                                                    <input
                                                        value={shipping.phone}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                            setShipping({ ...shipping, phone: val });
                                                        }}
                                                        type="tel"
                                                        className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold outline-none"
                                                        placeholder="10 Digits Only"
                                                        disabled={isSameAsShipping}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">City</label>
                                                    <input value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold outline-none" placeholder="City" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">State</label>
                                                    <input value={shipping.state} onChange={(e) => setShipping({ ...shipping, state: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold outline-none" placeholder="State" />
                                                </div>
                                            </div>
                                            <div className="mt-3 space-y-1">
                                                <label className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Complete Address</label>
                                                <textarea value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[10px] font-bold h-12 resize-none outline-none" placeholder="Details..."></textarea>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="hidden lg:flex items-center gap-3 px-2">
                                        <button onClick={() => setIsSameAsShipping(!isSameAsShipping)} className={`w-9 h-4.5 rounded-sm transition-all flex items-center px-1 ${isSameAsShipping ? 'bg-[#00A3E1]' : 'bg-gray-300'}`}>
                                            <div className={`bg-white w-3 h-3 rounded-sm shadow-sm transition-transform ${isSameAsShipping ? 'translate-x-4.5' : 'translate-x-0'}`} />
                                        </button>
                                        <span className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-wider">Shipping same as billing</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <aside className="hidden lg:block w-[300px]">
                            <div className="bg-white rounded-sm p-6 shadow-sm border border-gray-100 sticky top-24">
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
                                <button
                                    disabled={isPlacing || cartItems.length === 0}
                                    onClick={() => step === 1 ? setStep(2) : placeOrder()}
                                    className={`w-full bg-[#00A3E1] text-white py-4 rounded-sm font-black text-[10px] uppercase tracking-widest shadow-lg hover:brightness-110 transition-all active:scale-95 flex items-center justify-center 
                                      ${(isPlacing || cartItems.length === 0) ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isPlacing ? "Placing Order..." : step === 1 ? "Proceed to Shipping" : "Complete Purchase"}
                                </button>
                            </div>
                        </aside>
                    </div>
                </main>

                <div className="mt-10 lg:mt-20 w-full">
                    <Footer companyName={companyName} />
                    <div className="h-24 lg:hidden"></div>
                </div>

                {isDrawerOpen && (
                    <div className="lg:hidden fixed inset-0 bg-black/40 z-[60] backdrop-blur-[2px]" onClick={() => setIsDrawerOpen(false)} />
                )}

                <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-white rounded-sm z-[70] transition-transform duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] ${isDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                    <div className="w-12 h-1 bg-gray-200 rounded-sm mx-auto mt-3 mb-2" />
                    <div className="px-6 py-4">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[#1A3B5D] font-black text-xs uppercase tracking-widest">Order Summary</h3>
                            <button onClick={() => setIsDrawerOpen(false)} className="p-1.5 bg-gray-50 rounded-sm"><X size={16} /></button>
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
                        <button
                            onClick={handleDrawerAction}
                            disabled={cartItems.length === 0}
                            className={`w-full bg-[#1A3B5D] text-white py-4 rounded-sm font-black text-[11px] uppercase tracking-[0.2em] shadow-xl ${cartItems.length === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}>
                            {step === 1 ? "Proceed to Shipping" : "Confirm Order"}
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
                    <button
                        onClick={() => step === 1 ? setStep(2) : setIsDrawerOpen(true)}
                        disabled={cartItems.length === 0}
                        className={`bg-[#00A3E1] text-white px-10 py-3.5 rounded-sm font-black text-[10px] uppercase tracking-widest active:scale-95 transition-transform${cartItems.length === 0 ? 'opacity-60 cursor-not-allowed' : ''} `}>
                        {step === 1 ? "Checkout" : "View Summary"}
                    </button>
                </div>
            </div>
        </>
    );
};

export default CartPage;