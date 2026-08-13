import React, { useState, useEffect } from 'react';
import { Trash2, Check, ChevronUp, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Footer from '../Footer';
import LeadPopUp from '../PopUp';
import { FaWhatsapp } from 'react-icons/fa';
import { FiPackage } from 'react-icons/fi';
import { indianStates } from '../../Components/IndianStates';
import type { Address } from './checkOut.types';
import {
    deriveTaxContext,
    computeCartTotals,
    isMinimumOrderValueMet,
} from './checkOut.calculations';
import {
    useBusinessInfo,
    useCart,
    useCheckoutSettings,
    useDomainResolution,
    usePlaceOrder,
} from './hooks';

const CartPage: React.FC = () => {
    const navigate = useNavigate();
    const { companyId: pathId } = useParams<{ companyId: string }>();

    const [step, setStep] = useState<number>(1);
    const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
    const [showAlert, setShowAlert] = useState(false);

    const { subdomain, effectiveCompanyId, domainResolveError, isResolvingDomain } = useDomainResolution(pathId);

    const { companyName, socialLinks, whatsappLink } = useBusinessInfo(effectiveCompanyId);

    const { salesSettings, leadStatus } = useCheckoutSettings(effectiveCompanyId);

    const getSavedLead = () => {
        try {
            const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");
            return {
                name: leadData.name || '',
                phone: (leadData.number || '').replace(/\D/g, '').trim(),
            };
        } catch {
            return { name: '', phone: '' };
        }
    };

    const [shipping, setShipping] = useState<Address>(() => {
        const lead = getSavedLead();
        return { name: lead.name, phone: lead.phone, city: '', state: '', address: '', gstin: '' };
    });
    const [billing, setBilling] = useState<Address>(() => {
        const lead = getSavedLead();
        return { name: lead.name, phone: lead.phone, city: '', state: '', address: '', gstin: '' };
    });
    const [isSameAsShipping, setIsSameAsShipping] = useState<boolean>(false);
    const [movError, setMovError] = useState<string | null>(null);
    const [approvalError, setApprovalError] = useState<string | null>(null);
    const [specialInstruction, setSpecialInstruction] = useState("");

    const { cartItems, setCartItems, updateItemNote, updateQuantity, removeFromCart } = useCart(effectiveCompanyId, salesSettings);

    useEffect(() => {
        if (movError) {
            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        }
    }, [movError]);

    // 1. Evaluate the master tax logic
    const { scheme, taxType, applyExclusiveTax } = deriveTaxContext(salesSettings);

    // 2. Calculate Subtotal & Tax safely handling both scenarios
    const { baseSubtotal, totalTaxAmount, subtotal, totalPay } = computeCartTotals(cartItems, scheme, taxType);

    const isMovValid = () => isMinimumOrderValueMet(salesSettings, totalPay);

    const isUserApproved = leadStatus === "approved";
    const hidePriceEnabled = salesSettings?.hidePrice === true;
    const approvalEnabled = salesSettings?.requireApproval === true;
    const shouldShowPrice = !hidePriceEnabled && (!approvalEnabled || isUserApproved);

    const { isPlacing, orderSuccess, placedOrderId, placeOrder } = usePlaceOrder({
        effectiveCompanyId,
        billing,
        shipping,
        isSameAsShipping,
        cartItems,
        setCartItems,
        specialInstruction,
        scheme,
        taxType,
        applyExclusiveTax,
        totalPay,
        subtotal,
        totalTaxAmount,
        baseSubtotal,
        setShowAlert,
    });

    useEffect(() => {
        if (isSameAsShipping) {
            setShipping({ ...billing });
        }
    }, [isSameAsShipping, billing]);

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
    };

    if (domainResolveError) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#E9F0F7] text-[#1A3B5D]">
                <h2 className="text-2xl font-black mb-2">Store Not Found</h2>
                <p className="text-gray-500 text-sm">This checkout link is invalid or has expired.</p>
            </div>
        );
    }

    if (isResolvingDomain) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#E9F0F7]">
                <span className="font-bold text-[#1A3B5D]">Loading Checkout...</span>
            </div>
        );
    }

    return (
        <>
            <div className="bg-gray-50 min-h-screen font-sans text-[#1A3B5D] flex flex-col">
                {salesSettings?.requireApproval && (
                    <LeadPopUp companyId={effectiveCompanyId || ""} companyName={companyName} />
                )}

                {showAlert && (
                    <div className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-200">
                        <div className="bg-white rounded-sm p-6 w-[320px] shadow-lg text-center">
                            <h2 className="text-lg font-semibold mb-2 text-red-600">
                                Incomplete Details
                            </h2>
                            <p className="text-sm text-gray-600 mb-4">
                                Please fill all the details
                            </p>
                            <button
                                onClick={() => setShowAlert(false)}
                                className="bg-blue-500 text-white px-4 py-2 rounded-sm hover:bg-blue-600"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                )}

                {orderSuccess && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-sm shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in duration-300">

                            {/* icon */}
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                                <Check size={36} className="text-green-600" strokeWidth={3} />
                            </div>

                            {/* title */}
                            <h2 className="text-xl font-black text-[#1A3B5D] uppercase tracking-tight">
                                Order Placed Successfully
                            </h2>

                            {/* subtitle */}
                            <p className="text-xs text-gray-500 mt-2">
                                Your order has been received and is being processed.
                            </p>

                            {/* order id */}
                            {placedOrderId && (
                                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-sm p-3">
                                    <p className="text-[12px] text-gray-400 font-bold uppercase">
                                        Order ID
                                    </p>
                                    <p className="text-sm font-black text-[#1A3B5D]">
                                        {placedOrderId}
                                    </p>
                                </div>
                            )}

                            {/* buttons */}
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => navigate(subdomain ? '/' : `/catalogue/${effectiveCompanyId}`)}
                                    className="flex-1 py-3 bg-gray-100 text-[#1A3B5D] text-xs font-black rounded-sm"
                                >
                                    Continue Shopping
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <header className="sticky top-0 bg-white border-b border-gray-100 shadow-sm z-[60]">
                    <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => navigate(-1)} className="p-2 rounded-sm hover:bg-slate-200 transition-colors text-slate-700">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <line x1="19" y1="12" x2="5" y2="12"></line>
                                        <polyline points="12 19 5 12 12 5"></polyline>
                                    </svg>
                                </button>
                                <div className="w-1 h-5 bg-[#F97316] rounded-sm"></div>
                                <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">My Cart</h1>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-6xl mx-auto p-4 lg:p-6 w-full flex-grow">
                    {movError && (
                        <div className="mb-4 bg-white border border-red-200 rounded-sm shadow-sm overflow-hidden">
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
                    {approvalError && (
                        <div className="mb-4 bg-white border border-red-200 rounded-sm shadow-sm overflow-hidden">
                            <div className="flex items-start gap-3 p-4">
                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                    <span className="text-red-600 font-bold">!</span>
                                </div>

                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-red-700">
                                        Order Not Allowed
                                    </h4>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                        {approvalError}
                                    </p>
                                </div>

                                <button
                                    onClick={() => setApprovalError(null)}
                                    className="text-gray-400 hover:text-red-500 font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="mb-6 flex items-center justify-center lg:justify-start gap-4">
                        <button onClick={() => setStep(1)} className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-sm flex items-center justify-center text-[12px] font-black transition-all ${step === 1 ? 'bg-[#F97316] text-white' : 'bg-green-500 text-white'}`}>
                                {step > 1 ? <Check size={12} strokeWidth={4} /> : "1"}
                            </span>
                            <span className={`text-[12px] font-black uppercase tracking-widest ${step === 1 ? 'text-[#1A3B5D]' : 'text-gray-400'}`}>Cart</span>
                        </button>
                        <div className="w-10 h-[2px] bg-gray-200" />
                        <button onClick={() => setStep(2)} className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-sm flex items-center justify-center text-[12px] font-black transition-all ${step === 2 ? 'bg-[#F97316] text-white' : 'bg-gray-200 text-gray-400'}`}>2</span>
                            <span className={`text-[12px] font-black uppercase tracking-widest ${step === 2 ? 'text-[#1A3B5D]' : 'text-gray-400'}`}>Shipping</span>
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

                                                            <div className="leading-tight">
                                                                <h3 className="text-[12px] font-black text-[#1A3B5D] uppercase">
                                                                    {item.name}
                                                                </h3>

                                                                <span className="text-[10px] font-semibold text-gray-500">
                                                                    ({item.unitMultiplier ?? 1} pcs)
                                                                </span>
                                                            </div>

                                                            <button
                                                                onClick={() => removeFromCart(item.id)}
                                                                className="text-red-500 p-1 hover:bg-red-50 rounded-sm shrink-0"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>

                                                        <div className="flex flex-wrap items-center justify-between mt-2 gap-2">
                                                            <span className="font-black text-[#1A3B5D] text-sm shrink-0">
                                                                {shouldShowPrice ? `₹${item.salesPrice}` : "---"}
                                                            </span>
                                                            <input
                                                                type="text"
                                                                placeholder="Note..."
                                                                value={item.note}
                                                                onChange={(e) => updateItemNote(item.id, e.target.value)}
                                                                className="flex-1 min-w-[60px] bg-gray-50 rounded-sm px-2 py-1 text-[9px] font-medium border border-gray-100 outline-none h-7"
                                                            />
                                                            <div className="flex items-center bg-gray-50 rounded-sm p-0.5 border border-gray-100 shrink-0">
                                                                <button onClick={() => updateQuantity(item.id, -1)} className="w-5 h-5 flex items-center justify-center text-xs font-bold">-</button>
                                                                <span className="px-2 text-[12px] font-black">{item.quantity}</span>
                                                                <button onClick={() => updateQuantity(item.id, 1)} className="w-5 h-5 flex items-center justify-center text-[#F97316] text-xs font-bold">+</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="bg-white rounded-sm p-10 text-center shadow-sm border border-gray-100">
                                                <p className="text-gray-400 font-bold uppercase text-[12px] tracking-widest">Your cart is empty</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-white rounded-sm p-4 shadow-sm border border-gray-50">
                                        <label className="text-[10px] font-black text-gray-600 uppercase mb-2 block tracking-widest">Special Instructions</label>
                                        <textarea
                                            value={specialInstruction}
                                            onChange={(e) => setSpecialInstruction(e.target.value)}
                                            placeholder="Anything else we should know?" className="w-full bg-gray-50 rounded-sm p-3 text-[14px] font-bold outline-none min-h-[60px] resize-none" />
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
                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name
                                                        <span className="text-red-500 ml-0.5">*</span>
                                                    </label>
                                                    <input value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none" placeholder="Payer's Name" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone
                                                        <span className="text-red-500 ml-0.5">*</span>
                                                    </label>
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
                                                        className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none"
                                                        placeholder="10 Digits Only"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">City
                                                        <span className="text-red-500 ml-0.5">*</span>
                                                    </label>
                                                    <input value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none" placeholder="City" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">State
                                                        <span className="text-red-500 ml-0.5">*</span>
                                                    </label>
                                                    <select
                                                        value={billing.state}
                                                        onChange={(e) => setBilling({ ...billing, state: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none"
                                                    >
                                                        <option value="">Select State</option>
                                                        {indianStates.map((state) => (
                                                            <option key={state} value={state}>
                                                                {state}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="mt-3 space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Complete Address
                                                    <span className="text-red-500 ml-0.5">*</span>
                                                </label>
                                                <textarea value={billing.address} onChange={(e) => setBilling({ ...billing, address: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold h-12 resize-none outline-none overflow-hidden" placeholder="Details..."></textarea>
                                            </div>
                                            <div className="space-y-1 col-span-2">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">
                                                    GSTIN (Optional)
                                                </label>
                                                <input
                                                    value={billing.gstin || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        if (val.length <= 15) {
                                                            setBilling({ ...billing, gstin: val });
                                                        }
                                                    }}
                                                    type="text"
                                                    className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none"
                                                    placeholder="Enter GSTIN"
                                                />
                                            </div>
                                        </div>

                                        {/* MOBILE ONLY — Same as Shipping (between cards) */}
                                        <div className="flex lg:hidden items-center gap-3 px-2 -mt-1">
                                            <button
                                                onClick={() => setIsSameAsShipping(!isSameAsShipping)}
                                                className={`w-9 h-4.5 rounded-sm transition-all flex items-center px-1 ${isSameAsShipping ? 'bg-[#F97316]' : 'bg-gray-300'
                                                    }`}
                                            >
                                                <div
                                                    className={`bg-white w-3 h-3 rounded-sm shadow-sm transition-transform ${isSameAsShipping ? 'translate-x-4.5' : 'translate-x-0'
                                                        }`}
                                                />
                                            </button>
                                            <span className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-wider">
                                                Shipping details same as billing details
                                            </span>
                                        </div>

                                        <div className={`bg-white rounded-sm shadow-sm p-4 border border-gray-50 transition-all ${isSameAsShipping ? 'opacity-60 pointer-events-none grayscale-[0.5]' : 'opacity-100'}`}>
                                            <h3 className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-[#F97316] rounded-sm"></span> Shipping Address
                                            </h3>
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name
                                                        <span className="text-red-500 ml-0.5">*</span>
                                                    </label>
                                                    <input value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none" placeholder="Receiver's Name" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone
                                                        <span className="text-red-500 ml-0.5">*</span>
                                                    </label>
                                                    <input
                                                        value={shipping.phone}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                            setShipping({ ...shipping, phone: val });
                                                        }}
                                                        type="tel"
                                                        className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none"
                                                        placeholder="10 Digits Only"
                                                        disabled={isSameAsShipping}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">City
                                                        <span className="text-red-500 ml-0.5">*</span>
                                                    </label>
                                                    <input value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} type="text" className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none" placeholder="City" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">State
                                                        <span className="text-red-500 ml-0.5">*</span>
                                                    </label>
                                                    <select
                                                        value={shipping.state}
                                                        onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                                                        disabled={isSameAsShipping}
                                                        className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none"
                                                    >
                                                        <option value="">Select State</option>
                                                        {indianStates.map((state) => (
                                                            <option key={state} value={state}>
                                                                {state}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="mt-3 space-y-1">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Complete Address
                                                    <span className="text-red-500 ml-0.5">*</span>
                                                </label>
                                                <textarea value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold h-12 resize-none outline-none overflow-hidden" placeholder="Details..."></textarea>
                                            </div>
                                            <div className="space-y-1 col-span-2">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">
                                                    GSTIN (Optional)
                                                </label>
                                                <input
                                                    value={shipping.gstin || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        if (val.length <= 15) {
                                                            setShipping({ ...shipping, gstin: val });
                                                        }
                                                    }}
                                                    type="text"
                                                    className="w-full bg-gray-50 border border-gray-100 rounded-sm p-2 text-[12px] font-bold outline-none"
                                                    placeholder="Enter GSTIN"
                                                    disabled={isSameAsShipping}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="hidden lg:flex items-center gap-3 px-2">
                                        <button onClick={() => setIsSameAsShipping(!isSameAsShipping)} className={`w-9 h-4.5 rounded-sm transition-all flex items-center px-1 ${isSameAsShipping ? 'bg-[#F97316]' : 'bg-gray-300'}`}>
                                            <div className={`bg-white w-3 h-3 rounded-sm shadow-sm transition-transform ${isSameAsShipping ? 'translate-x-4.5' : 'translate-x-0'}`} />
                                        </button>
                                        <span className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-wider">Shipping details same as billing details</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <aside className="hidden lg:block w-[300px]">
                            <div className="bg-white rounded-sm p-6 shadow-sm border border-gray-100 sticky top-24">
                                <h3 className="text-[#1A3B5D] font-black text-xs uppercase tracking-wider mb-4 pb-2 border-b border-gray-50">Order Summary</h3>
                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between items-center text-[12px] font-bold text-gray-400 uppercase">
                                        <span>Subtotal</span>
                                        <span className="text-[#1A3B5D]"> {shouldShowPrice ? `₹${baseSubtotal.toFixed(2)}` : "—"}</span>
                                    </div>

                                    {totalTaxAmount > 0 && (
                                        <div className="flex justify-between items-center text-[12px] font-bold text-gray-400 uppercase">
                                            <span>Tax</span>
                                            <span className="text-[#1A3B5D]"> {shouldShowPrice ? `₹${totalTaxAmount.toFixed(2)}` : "—"}</span>
                                        </div>
                                    )}

                                    <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                                        <span className="text-[#F97316] font-black text-xs uppercase">Total Pay</span>
                                        <span className="text-xl font-black text-[#F97316]">
                                            {shouldShowPrice ? `₹${totalPay.toLocaleString()}` : "—"}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    disabled={isPlacing || cartItems.length === 0}
                                    onClick={() => {
                                        if (step === 1) {
                                            // MOV check
                                            if (!isMovValid()) {
                                                const required = salesSettings?.minimumOrderValue || 0;
                                                const short = required - totalPay;

                                                setMovError(
                                                    `Please add ₹${short} more to place order.`
                                                );
                                                return;
                                            }

                                            setMovError(null);
                                            setStep(2);
                                        } else {
                                            placeOrder();
                                        }
                                    }}
                                    className={`w-full bg-[#F97316] text-white py-4 rounded-sm font-black text-[12px] uppercase tracking-widest shadow-lg hover:brightness-110 transition-all active:scale-95 flex items-center justify-center 
                                      ${(isPlacing || cartItems.length === 0) ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isPlacing ? "Placing Order..." : step === 1 ? "Proceed to Shipping" : "Complete Purchase"}
                                </button>
                            </div>
                        </aside>
                    </div>
                </main>

                <div className="mt-10 lg:mt-20 w-full">
                    <Footer
                        companyName={companyName}
                        instagram={socialLinks?.instagram}
                        facebook={socialLinks?.facebook}
                        twitter={socialLinks?.twitter}
                        gmail={socialLinks?.gmail}
                    />
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
                            <div className="flex justify-between items-center text-[12px] font-bold text-gray-400 uppercase">
                                <span>Subtotal</span>
                                <span className="text-[#1A3B5D]"> {shouldShowPrice ? `₹${baseSubtotal.toFixed(2)}` : "—"}</span>
                            </div>

                            {totalTaxAmount > 0 && (
                                <div className="flex justify-between items-center text-[12px] font-bold text-gray-400 uppercase">
                                    <span>Tax</span>
                                    <span className="text-[#1A3B5D]"> {shouldShowPrice ? `₹${totalTaxAmount.toFixed(2)}` : "—"}</span>
                                </div>
                            )}

                            <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                                <span className="text-[#1A3B5D] font-black text-sm uppercase">Amount Payable</span>
                                <span className="text-2xl font-black text-[#F97316]">
                                    {shouldShowPrice ? `₹${totalPay.toLocaleString()}` : "—"}
                                </span>
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
                            <ChevronUp size={12} className="text-[#F97316]" />
                        </div>
                        <span className="text-xl font-black text-[#1A3B5D]">
                            {shouldShowPrice ? `₹${totalPay.toLocaleString()}` : "—"}
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            if (step === 1) {
                                // MOV check FIRST
                                if (!isMovValid()) {
                                    const required = salesSettings?.minimumOrderValue || 0;
                                    const short = required - totalPay;

                                    setMovError(
                                        `Minimum order value is ₹${required}. Please add ₹${short} more to place order.`
                                    );
                                    return;
                                }

                                setMovError(null);
                                setStep(2);
                            } else {
                                setIsDrawerOpen(true);
                            }
                        }}
                        disabled={cartItems.length === 0}
                        className={`bg-[#F97316] text-white px-10 py-3.5 rounded-sm font-black text-[12px] uppercase tracking-widest active:scale-95 transition-transform${cartItems.length === 0 ? 'opacity-60 cursor-not-allowed' : ''} `}>
                        {step === 1 ? "Checkout" : "View Summary"}
                    </button>
                </div>
            </div>
            {whatsappLink && (
                <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[40] bg-[#25D366] text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all"
                    title="Chat on WhatsApp"
                >
                    <FaWhatsapp size={26} />
                </a>
            )}
        </>
    );
};

export default CartPage;