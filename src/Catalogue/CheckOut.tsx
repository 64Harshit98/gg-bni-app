import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Check, ChevronUp, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Footer from './Footer';
import { FiPackage } from 'react-icons/fi';
import LeadPopUp from './PopUp';
import { FaWhatsapp } from 'react-icons/fa';
import { Spinner } from '../Components/ui/spinner';
import { Button } from '../Components/ui/button';
import { AddressFields } from './components/checkout/AddressFields';
import {
    type CartItem,
    type CatalogueSalesSettings,
    type Address,
    type SocialLinks,
    resolveCompanyIdBySubdomain,
    fetchBusinessInfo as fetchBusinessInfoService,
    fetchCatalogueSalesSettings,
    subscribeToLeadStatus,
    syncCartToUpcomingOrder,
    clearUpcomingOrderItems,
    deleteUpcomingOrderDraft,
    placeOrder as placeOrderService,
} from '../services/catalogue/checkout.service';

const useBusinessName = (effectiveCompanyId?: string) => {
    const [businessName, setBusinessName] = useState<string>('');
    const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!effectiveCompanyId) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        const load = async () => {
            const info = await fetchBusinessInfoService(effectiveCompanyId);
            if (cancelled) return;
            setBusinessName(info.businessName);
            setSocialLinks(info.socialLinks);
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [effectiveCompanyId]);

    return { businessName, loading, socialLinks };
};

const CartPage: React.FC = () => {
    const navigate = useNavigate();
    const { companyId: pathId } = useParams<{ companyId: string }>();

    const [step, setStep] = useState<number>(1);
    const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
    const [isPlacing, setIsPlacing] = useState(false);
    const [showAlert, setShowAlert] = useState(false);

    // 1. States for subdomain resolution
    const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
    const [domainResolveError, setDomainResolveError] = useState(false);
    const [isResolvingDomain, setIsResolvingDomain] = useState(true);

    // 2. Safely extract the subdomain
    const hostname = window.location.hostname;
    const parts = hostname.split('.');

    const subdomain = useMemo(() => {
        return (
            parts.length >= 3 &&
            !['www', 'app'].includes(parts[0].toLowerCase()) &&
            !hostname.includes('localhost')
        ) ? parts[0] : null;
    }, [hostname, parts]);

    // 3. Resolve the subdomain string into the true Firestore Document ID
    useEffect(() => {
        const resolveDomain = async () => {
            if (subdomain) {
                const { companyId, redirectTo } = await resolveCompanyIdBySubdomain(subdomain);

                if (redirectTo) {
                    // Redirect logic: Preserve the pathname so they stay on the Cart page!
                    window.location.replace(`https://${redirectTo}.sellar.in${window.location.pathname}`);
                    return;
                }

                if (companyId) {
                    setResolvedCompanyId(companyId);
                } else {
                    setDomainResolveError(true);
                }
            } else if (pathId) {
                setResolvedCompanyId(pathId);
            } else {
                setDomainResolveError(true);
            }
            setIsResolvingDomain(false);
        };

        resolveDomain();
    }, [subdomain, pathId]);

    // 4. Point the effective ID to the newly resolved state
    const effectiveCompanyId = resolvedCompanyId;

    const { businessName: companyName, socialLinks } = useBusinessName(effectiveCompanyId || "");
    const whatsappLink = useMemo(() => {
        const rawNumber = socialLinks?.whatsappNumber || socialLinks?.phoneNumber || '';
        const digits = rawNumber.replace(/\D/g, '');
        if (!digits) return null;
        const fullNumber = digits.length === 10 ? `91${digits}` : digits;
        const message = encodeURIComponent(`Hi, I'm interested in your products at ${companyName}.`);
        return `https://wa.me/${fullNumber}?text=${message}`;
    }, [socialLinks, companyName]);

    const [salesSettings, setSalesSettings] = useState<CatalogueSalesSettings | null>(null);
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
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [movError, setMovError] = useState<string | null>(null);
    const [orderSuccess, setOrderSuccess] = useState(false);
    const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
    const [leadStatus, setLeadStatus] = useState<"approved" | "pending" | "declined" | null>(null);
    const [approvalError, setApprovalError] = useState<string | null>(null);
    const [specialInstruction, setSpecialInstruction] = useState("");

    const syncToUpcoming = async (updatedCart: CartItem[]) => {
        if (!effectiveCompanyId) return;
        await syncCartToUpcomingOrder(effectiveCompanyId, updatedCart);
    };
    useEffect(() => {
        if (movError) {
            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        }
    }, [movError]);

    useEffect(() => {
        const savedCart = localStorage.getItem('temp_cart');
        if (savedCart) {
            try {
                interface StoredCartEntry {
                    item: {
                        id: string | number;
                        name: string;
                        groupId?: string;
                        groupid?: string;
                        category?: string;
                        mrp?: number;
                        salesPrice?: number;
                        imageUrl?: string;
                        moq?: number;
                        tax?: number;
                        unit?: string;
                        unitMultiplier?: number;
                        multiplier?: number;
                    };
                    quantity: number;
                }
                const parsedCart: StoredCartEntry[] = JSON.parse(savedCart);
                const formattedItems: CartItem[] = parsedCart.map((entry) => ({
                    id: entry.item.id,
                    name: entry.item.name,
                    category: entry.item.groupId || entry.item.groupid || entry.item.category || 'Product',
                    groupId: entry.item.groupId || entry.item.groupid || '',
                    mrp: entry.item.mrp || 0,
                    salesPrice: entry.item.salesPrice || entry.item.mrp || 0,
                    quantity: entry.quantity,
                    imageUrl: entry.item.imageUrl || '',
                    moq: entry.item.moq || 1,
                    tax: entry.item.tax || 0,
                    note: '',
                    unit: entry.item.unit ?? "pcs",
                    unitMultiplier: entry.item.unitMultiplier ?? entry.item.multiplier ?? 1,
                }));
                setCartItems(formattedItems);
            } catch (error) {
                console.error(error);
            }
        }
    }, []);

    useEffect(() => {
        if (!effectiveCompanyId) return;
        let cancelled = false;
        fetchCatalogueSalesSettings(effectiveCompanyId).then((settings) => {
            if (!cancelled) setSalesSettings(settings);
        });
        return () => { cancelled = true; };
    }, [effectiveCompanyId]);

    useEffect(() => {
        if (!effectiveCompanyId) return;

        const leadData = JSON.parse(
            localStorage.getItem("leadData") || "{}"
        );

        const phone = (leadData.number || "")
            .replace(/\D/g, "")
            .trim();

        if (!phone) {
            setLeadStatus(null);
            return;
        }

        const unsubscribe = subscribeToLeadStatus(effectiveCompanyId, phone, setLeadStatus);

        return () => unsubscribe();
    }, [effectiveCompanyId]);

    const updateItemNote = (id: string | number, note: string) => {
        setCartItems(prev => prev.map(item => item.id === id ? { ...item, note } : item));
    };

    // 1. Evaluate the master tax logic
    const scheme = salesSettings?.gstScheme?.toLowerCase() || 'regular';
    const taxType = salesSettings?.taxType?.toLowerCase() || 'inclusive';

    // 2. Calculate Subtotal & Tax safely handling both scenarios
    let totalTaxAmount = 0;
    let baseSubtotal = 0;

    const applyExclusiveTax = scheme === 'regular' && taxType === 'exclusive';

    const subtotal = cartItems.reduce((acc, item) => {
        const qty = item.quantity;
        const price = item.salesPrice;
        const taxRate = item.tax || 0;

        let itemBaseAmount = 0;
        let itemTaxAmount = 0;
        let itemTotalAmount = 0;

        if (scheme === 'regular') {
            if (taxType === 'exclusive') {
                // EXCLUSIVE: Tax is calculated on top of the base price
                itemBaseAmount = price * qty;
                itemTaxAmount = itemBaseAmount * (taxRate / 100);
                itemTotalAmount = itemBaseAmount + itemTaxAmount;
            } else {
                // INCLUSIVE: Tax is already inside the price, we extract it
                itemTotalAmount = price * qty;
                itemBaseAmount = itemTotalAmount / (1 + (taxRate / 100));
                itemTaxAmount = itemTotalAmount - itemBaseAmount;
            }
        } else {
            // EXEMPT / COMPOSITION: No tax to display or calculate
            itemBaseAmount = price * qty;
            itemTaxAmount = 0;
            itemTotalAmount = itemBaseAmount;
        }

        baseSubtotal += itemBaseAmount;
        totalTaxAmount += itemTaxAmount;

        return acc + itemTotalAmount;
    }, 0);

    const totalPay = Math.round(subtotal);

    const isMovValid = () => {
        if (!salesSettings) return true;
        return totalPay >= (salesSettings.minimumOrderValue || 0);
    };

    const isUserApproved = leadStatus === "approved";
    const hidePriceEnabled = salesSettings?.hidePrice === true;
    const approvalEnabled = salesSettings?.requireApproval === true;
    const shouldShowPrice = !hidePriceEnabled && (!approvalEnabled || isUserApproved);

    const placeOrder = async () => {
        // Immediate lock to prevent double-clicks
        if (isPlacing || cartItems.length === 0) return;

        // Basic address validation
        const billingValid = billing.name?.trim() && billing.phone?.length === 10 && billing.address?.trim() && billing.city?.trim() && billing.state?.trim();
        const shippingValid = isSameAsShipping ? billingValid : (shipping.name?.trim() && shipping.phone?.length === 10 && shipping.address?.trim()) && shipping.city?.trim() && shipping.state?.trim();

        if (!billingValid || !shippingValid) {
            setShowAlert(true);
            return;
        }

        setIsPlacing(true);

        try {
            // ATOMIC TRANSACTION: Create order, increment voucher, deduct stock
            const finalInvoiceNumber = await placeOrderService({
                companyId: effectiveCompanyId!,
                cartItems,
                billing,
                shipping,
                isSameAsShipping,
                specialInstruction,
                totalPay,
                subtotal,
                totalTaxAmount,
                baseSubtotal,
                applyExclusiveTax,
                scheme,
                taxType,
            });

            // SUCCESS CLEANUP
            localStorage.removeItem('temp_cart');
            const upcomingUserKey = localStorage.getItem("upcoming_user_key");
            if (upcomingUserKey && effectiveCompanyId) {
                try {
                    await deleteUpcomingOrderDraft(effectiveCompanyId, upcomingUserKey);
                } catch (err) {
                    console.warn("Could not delete upcoming draft:", err);
                }
            }
            localStorage.removeItem("upcoming_user_key");
            // localStorage.removeItem("leadSubmitted");
            // localStorage.removeItem("leadData");
            setPlacedOrderId(finalInvoiceNumber);
            setOrderSuccess(true);

            // Tell MyShop to decrease the stock in the UI (Zero Firebase Reads!)
            cartItems.forEach(item => {
                window.dispatchEvent(new CustomEvent('local_stock_update', {
                    detail: {
                        itemId: String(item.id),
                        delta: -Number(item.quantity)
                    }
                }));
            });

            setCartItems([]);

        } catch (e) {
            console.error("Critical Transaction Error:", e);
            alert("Failed to place order. No numbers were skipped.");
        } finally {
            setIsPlacing(false);
        }
    };

    const updateQuantity = (id: string | number, delta: number) => {
        const updatedItems = cartItems
            .map(item => {
                if (item.id === id) {
                    const moqQty = item.moq || 1;
                    let newQty = item.quantity + delta;
                    newQty = Math.max(moqQty, newQty);
                    return { ...item, quantity: newQty };
                }
                return item;
            })
            .filter(item => item.quantity > 0);

        setCartItems(updatedItems);
        localStorage.setItem('temp_cart', JSON.stringify(updatedItems.map(i => ({
            item: { ...i },
            quantity: i.quantity
        }))));
        syncToUpcoming(updatedItems);
    };

    const removeFromCart = (id: string | number) => {
        const updatedCart = cartItems.filter(item => item.id !== id);
        setCartItems(updatedCart);
        localStorage.setItem('temp_cart', JSON.stringify(updatedCart.map(i => ({
            item: { ...i },
            quantity: i.quantity
        }))));
        if (updatedCart.length === 0) {
            // If cart is now empty, wipe the upcoming doc's items too
            const userKey = localStorage.getItem("upcoming_user_key");
            if (userKey && effectiveCompanyId) {
                clearUpcomingOrderItems(effectiveCompanyId, userKey)
                    .catch(err => console.error("Empty cart sync error:", err));
            }
        } else {
            syncToUpcoming(updatedCart);
        }
    };

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
                <p className="text-muted-foreground text-sm">This checkout link is invalid or has expired.</p>
            </div>
        );
    }

    if (isResolvingDomain) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#E9F0F7] text-[#1A3B5D]">
                <Spinner size="xl" />
                <span className="font-bold">Loading Checkout...</span>
            </div>
        );
    }

    return (
        <>
            <div className="bg-muted min-h-screen font-sans text-[#1A3B5D] flex flex-col">
                {salesSettings?.requireApproval && (
                    <LeadPopUp companyId={effectiveCompanyId || ""} companyName={companyName} />
                )}

                {showAlert && (
                    <div className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-200">
                        <div className="bg-card rounded-sm p-6 w-[320px] shadow-lg text-center">
                            <h2 className="text-lg font-semibold mb-2 text-red-600">
                                Incomplete Details
                            </h2>
                            <p className="text-sm text-muted-foreground mb-4">
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
                        <div className="bg-card rounded-sm shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in duration-300">

                            {/* icon */}
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                                <Check size={36} className="text-green-600" strokeWidth={3} />
                            </div>

                            {/* title */}
                            <h2 className="text-xl font-black text-[#1A3B5D] uppercase tracking-tight">
                                Order Placed Successfully
                            </h2>

                            {/* subtitle */}
                            <p className="text-xs text-muted-foreground mt-2">
                                Your order has been received and is being processed.
                            </p>

                            {/* order id */}
                            {placedOrderId && (
                                <div className="mt-4 bg-muted border border-border rounded-sm p-3">
                                    <p className="text-[12px] text-muted-foreground font-bold uppercase">
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
                                    className="flex-1 py-3 bg-muted text-[#1A3B5D] text-xs font-black rounded-sm"
                                >
                                    Continue Shopping
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <header className="sticky top-0 bg-card border-b border-border shadow-sm z-[60]">
                    <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => navigate(-1)} className="p-2 rounded-sm hover:bg-muted transition-colors text-foreground">
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
                        <div className="mb-4 bg-card border border-red-200 rounded-sm shadow-sm overflow-hidden">
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
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {movError}
                                    </p>
                                </div>

                                {/* close */}
                                <button
                                    onClick={() => setMovError(null)}
                                    className="text-muted-foreground hover:text-red-500 font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}
                    {approvalError && (
                        <div className="mb-4 bg-card border border-red-200 rounded-sm shadow-sm overflow-hidden">
                            <div className="flex items-start gap-3 p-4">
                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                    <span className="text-red-600 font-bold">!</span>
                                </div>

                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-red-700">
                                        Order Not Allowed
                                    </h4>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {approvalError}
                                    </p>
                                </div>

                                <button
                                    onClick={() => setApprovalError(null)}
                                    className="text-muted-foreground hover:text-red-500 font-bold"
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
                            <span className={`text-[12px] font-black uppercase tracking-widest ${step === 1 ? 'text-[#1A3B5D]' : 'text-muted-foreground'}`}>Cart</span>
                        </button>
                        <div className="w-10 h-[2px] bg-muted" />
                        <button onClick={() => setStep(2)} className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-sm flex items-center justify-center text-[12px] font-black transition-all ${step === 2 ? 'bg-[#F97316] text-white' : 'bg-muted text-muted-foreground'}`}>2</span>
                            <span className={`text-[12px] font-black uppercase tracking-widest ${step === 2 ? 'text-[#1A3B5D]' : 'text-muted-foreground'}`}>Shipping</span>
                        </button>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-5 items-start">
                        <div className="w-full lg:flex-1 space-y-3">
                            {step === 1 ? (
                                <>
                                    <div className="grid grid-cols-1 gap-2.5">
                                        {cartItems.length > 0 ? cartItems.map((item) => (
                                            <div key={item.id} className="bg-card rounded-sm p-3 shadow-sm border border-gray-10">
                                                <div className="flex gap-3">
                                                    {/* Image Container with Background */}
                                                    <div className="w-15 h-15 bg-muted rounded-sm overflow-hidden flex-shrink-0 flex items-center justify-center border border-border">
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

                                                                <span className="text-[10px] font-semibold text-muted-foreground">
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
                                                                className="flex-1 min-w-[60px] bg-muted rounded-sm px-2 py-1 text-[9px] font-medium border border-border outline-none h-7"
                                                            />
                                                            <div className="flex items-center bg-muted rounded-sm p-0.5 border border-border shrink-0">
                                                                <button onClick={() => updateQuantity(item.id, -1)} className="w-5 h-5 flex items-center justify-center text-xs font-bold">-</button>
                                                                <span className="px-2 text-[12px] font-black">{item.quantity}</span>
                                                                <button onClick={() => updateQuantity(item.id, 1)} className="w-5 h-5 flex items-center justify-center text-[#F97316] text-xs font-bold">+</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="bg-card rounded-sm p-10 text-center shadow-sm border border-border">
                                                <p className="text-muted-foreground font-bold uppercase text-[12px] tracking-widest">Your cart is empty</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-card rounded-sm p-4 shadow-sm border border-gray-50">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase mb-2 block tracking-widest">Special Instructions</label>
                                        <textarea
                                            value={specialInstruction}
                                            onChange={(e) => setSpecialInstruction(e.target.value)}
                                            placeholder="Anything else we should know?" className="w-full bg-muted rounded-sm p-3 text-[14px] font-bold outline-none min-h-[60px] resize-none" />
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <AddressFields
                                            title="Billing Address"
                                            dotClassName="bg-gray-400"
                                            address={billing}
                                            onChange={setBilling}
                                            namePlaceholder="Payer's Name"
                                            onPhoneChange={(val) => {
                                                if (isSameAsShipping) {
                                                    setShipping(prev => ({ ...prev, phone: val }));
                                                }
                                            }}
                                        />

                                        {/* MOBILE ONLY — Same as Shipping (between cards) */}
                                        <div className="flex lg:hidden items-center gap-3 px-2 -mt-1">
                                            <button
                                                onClick={() => setIsSameAsShipping(!isSameAsShipping)}
                                                className={`w-9 h-4.5 rounded-sm transition-all flex items-center px-1 ${isSameAsShipping ? 'bg-[#F97316]' : 'bg-gray-300'
                                                    }`}
                                            >
                                                <div
                                                    className={`bg-card w-3 h-3 rounded-sm shadow-sm transition-transform ${isSameAsShipping ? 'translate-x-4.5' : 'translate-x-0'
                                                        }`}
                                                />
                                            </button>
                                            <span className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-wider">
                                                Shipping details same as billing details
                                            </span>
                                        </div>

                                        <AddressFields
                                            title="Shipping Address"
                                            dotClassName="bg-[#F97316]"
                                            address={shipping}
                                            onChange={setShipping}
                                            namePlaceholder="Receiver's Name"
                                            disabled={isSameAsShipping}
                                        />
                                    </div>
                                    <div className="hidden lg:flex items-center gap-3 px-2">
                                        <button onClick={() => setIsSameAsShipping(!isSameAsShipping)} className={`w-9 h-4.5 rounded-sm transition-all flex items-center px-1 ${isSameAsShipping ? 'bg-[#F97316]' : 'bg-gray-300'}`}>
                                            <div className={`bg-card w-3 h-3 rounded-sm shadow-sm transition-transform ${isSameAsShipping ? 'translate-x-4.5' : 'translate-x-0'}`} />
                                        </button>
                                        <span className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-wider">Shipping details same as billing details</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <aside className="hidden lg:block w-[300px]">
                            <div className="bg-card rounded-sm p-6 shadow-sm border border-border sticky top-24">
                                <h3 className="text-[#1A3B5D] font-black text-xs uppercase tracking-wider mb-4 pb-2 border-b border-gray-50">Order Summary</h3>
                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between items-center text-[12px] font-bold text-muted-foreground uppercase">
                                        <span>Subtotal</span>
                                        <span className="text-[#1A3B5D]"> {shouldShowPrice ? `₹${baseSubtotal.toFixed(2)}` : "—"}</span>
                                    </div>

                                    {totalTaxAmount > 0 && (
                                        <div className="flex justify-between items-center text-[12px] font-bold text-muted-foreground uppercase">
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
                                <Button
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
                                    className="w-full h-auto bg-[#F97316] text-white py-4 rounded-sm font-black text-[12px] uppercase tracking-widest shadow-lg hover:bg-[#F97316] hover:brightness-110 transition-all active:scale-95 disabled:opacity-70"
                                >
                                    {isPlacing ? "Placing Order..." : step === 1 ? "Proceed to Shipping" : "Complete Purchase"}
                                </Button>
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

                <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-card rounded-sm z-[70] transition-transform duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] ${isDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                    <div className="w-12 h-1 bg-muted rounded-sm mx-auto mt-3 mb-2" />
                    <div className="px-6 py-4">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[#1A3B5D] font-black text-xs uppercase tracking-widest">Order Summary</h3>
                            <button onClick={() => setIsDrawerOpen(false)} className="p-1.5 bg-muted rounded-sm"><X size={16} /></button>
                        </div>
                        <div className="space-y-4 mb-8">
                            <div className="flex justify-between items-center text-[12px] font-bold text-muted-foreground uppercase">
                                <span>Subtotal</span>
                                <span className="text-[#1A3B5D]"> {shouldShowPrice ? `₹${baseSubtotal.toFixed(2)}` : "—"}</span>
                            </div>

                            {totalTaxAmount > 0 && (
                                <div className="flex justify-between items-center text-[12px] font-bold text-muted-foreground uppercase">
                                    <span>Tax</span>
                                    <span className="text-[#1A3B5D]"> {shouldShowPrice ? `₹${totalTaxAmount.toFixed(2)}` : "—"}</span>
                                </div>
                            )}

                            <div className="pt-4 border-t border-border flex justify-between items-center">
                                <span className="text-[#1A3B5D] font-black text-sm uppercase">Amount Payable</span>
                                <span className="text-2xl font-black text-[#F97316]">
                                    {shouldShowPrice ? `₹${totalPay.toLocaleString()}` : "—"}
                                </span>
                            </div>
                        </div>
                        <Button
                            onClick={handleDrawerAction}
                            disabled={cartItems.length === 0}
                            className="w-full h-auto bg-[#1A3B5D] text-white py-4 rounded-sm font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:bg-[#1A3B5D] hover:brightness-110 disabled:opacity-60">
                            {step === 1 ? "Proceed to Shipping" : "Confirm Order"}
                        </Button>
                    </div>
                </div>

                <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-4 flex items-center justify-between shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-50">
                    <div className="flex flex-col" onClick={() => setIsDrawerOpen(true)}>
                        <div className="flex items-center gap-1">
                            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Total Pay</span>
                            <ChevronUp size={12} className="text-[#F97316]" />
                        </div>
                        <span className="text-xl font-black text-[#1A3B5D]">
                            {shouldShowPrice ? `₹${totalPay.toLocaleString()}` : "—"}
                        </span>
                    </div>
                    <Button
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
                        className="h-auto bg-[#F97316] text-white px-10 py-3.5 rounded-sm font-black text-[12px] uppercase tracking-widest active:scale-95 transition-transform hover:bg-[#F97316] hover:brightness-110 disabled:opacity-60">
                        {step === 1 ? "Checkout" : "View Summary"}
                    </Button>
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