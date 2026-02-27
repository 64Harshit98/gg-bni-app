import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting'
import { ShoppingCart, Minus, Plus, ChevronLeft } from 'lucide-react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { FiPackage, FiPlus } from 'react-icons/fi';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { Spinner } from '../constants/Spinner';
import { useParams, useNavigate } from 'react-router-dom';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SearchBar from './SearchBar';
import { serverTimestamp, doc, setDoc, getDoc, getDocs, updateDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { useLocation } from 'react-router-dom';
import LeadPopUp from './PopUp';

const ITEMS_PER_BATCH_RENDER = 24;

const SharedProduct: React.FC = () => {
    const navigate = useNavigate();
    const { companyId, groupId } = useParams<{ companyId: string, groupId: string }>();
    const { businessName: companyName } = useBusinessName(companyId);
    const location = useLocation();
    const highlightItemId = location.state?.highlightItemId;
    const { currentUser, loading: authLoading } = useAuth();
    const dbOperations = useDatabase();
    const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSalesSettings | null>(null);
    const [itemsToRenderCount, setItemsToRenderCount] = useState(ITEMS_PER_BATCH_RENDER);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [_isLeadFilled, setIsLeadFilled] = useState(false);
    const [forceLeadOpen, setForceLeadOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [selectedItemForDetails, setSelectedItemForDetails] = useState<Item | null>(null);
    const [socialLinks, setSocialLinks] = useState<any>({});
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A' | 'Price: Low-High' | 'Price: High-Low'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);
    const [leadStatus, setLeadStatus] = useState<"approved" | "pending" | "declined" | null>(null);
    const [_checkingApproval, setCheckingApproval] = useState<boolean>(true);
    const [leadPhone, setLeadPhone] = useState<string>("");

    const getUserKey = () => {
        let key = localStorage.getItem('guest_uid');
        if (!key) {
            key = crypto.randomUUID();
            localStorage.setItem('guest_uid', key);
        }
        return key;
    };

    // --- New Firebase Sync Function ---
    const syncToUpcoming = async (
        updatedCart: { item: Item; quantity: number }[]
    ) => {
        if (!companyId || updatedCart.length === 0) return;
        const leadData = JSON.parse(
            sessionStorage.getItem("leadData") || "{}"
        );
        try {
            const leadData = JSON.parse(
                localStorage.getItem("leadData") || "{}"
            );

            // number normalize
            const cleanNumber = (leadData.number || "")
                .replace(/\D/g, "")
                .trim();

            // STABLE UPCOMING KEY (FIXED)
            let userKey: string =
                localStorage.getItem("upcoming_user_key") || "";

            if (!userKey) {
                userKey =
                    cleanNumber ||
                    currentUser?.uid ||
                    getUserKey();

                localStorage.setItem("upcoming_user_key", userKey);
            }

            const loginName = currentUser?.name || "Guest User";

            const itemsForFirebase = updatedCart.map(c => ({
                id: String(c.item.id),
                docId: c.item.firestoreDocId || c.item.id,
                name: c.item.name,
                quantity: c.quantity,
                mrp:
                    (c.item as any).effectivePrice ||
                    (c.item as any).salesPrice ||
                    (c.item as any).mrp ||
                    0
            }));

            const orderRef = doc(
                db,
                "companies",
                companyId,
                "Orders",
                `upcoming_${userKey}`
            );

            const snap = await getDoc(orderRef);
            const leadSubmitted =
                localStorage.getItem("leadSubmitted") === "true";

            const leadJustSubmitted =
                localStorage.getItem("leadJustSubmitted") === "true";

            //  BLOCK only when:
            // old lead AND upcoming doc exist nahi karta
            if (leadSubmitted && !leadJustSubmitted && !snap.exists()) {
                return;
            }
            const invoiceNumber = snap.exists()
                ? snap.data().invoiceNumber
                : await OrderInvoiceNumber(companyId);

            const existingData = snap.exists() ? snap.data() : {};

            await setDoc(
                orderRef,
                {
                    orderId: invoiceNumber,
                    invoiceNumber,
                    userId: userKey,

                    //  NAME OVERWRITE NAHI HOGA
                    userName:
                        existingData.userName ||
                        leadData.name ||
                        loginName,

                    userLoginPhone:
                        existingData.userLoginPhone ||
                        cleanNumber ||
                        "",

                    status: "Upcoming",
                    isLead: true, //  ADD THIS

                    items: itemsForFirebase,
                    totalAmount: itemsForFirebase.reduce(
                        (acc, curr) => acc + curr.mrp * curr.quantity,
                        0
                    ),
                    paidAmount: 0,

                    createdAt: snap.exists()
                        ? snap.data().createdAt
                        : serverTimestamp(),

                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            localStorage.removeItem("leadJustSubmitted");
        } catch (err) {
            console.error("Sync Upcoming Error:", err);
        }
    };

    useEffect(() => {
        if (cart.length > 0) {
            syncToUpcoming(cart);
        }
    }, [cart]);

    useEffect(() => {
        if (highlightItemId) {
            setActiveHighlight(highlightItemId);

            setTimeout(() => {
                setActiveHighlight(null);
            }, 3000);

            setTimeout(() => {
                const element = document.getElementById(highlightItemId);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    }, [highlightItemId]);

    const addToCart = useCallback((item: Item) => {
        //  SINGLE SOURCE OF TRUTH
        const alreadyFilled =
            localStorage.getItem("leadSubmitted") === "true";

        // lead not filled → popup dikhao
        if (!alreadyFilled) {
            setForceLeadOpen(false);
            setTimeout(() => setForceLeadOpen(true), 0);
            return;
        }

        // lead filled → cart allow
        setCart(prev => {
            const existing = prev.find(i => i.item.id === item.id);

            const moqQty = (item as any).moq || 1;

            const itemWithPrice = {
                ...item,
            };

            const newCart = existing
                ? prev.map(i =>
                    i.item.id === item.id
                        ? { ...i, quantity: i.quantity + moqQty }
                        : i
                )
                : [...prev, { item: itemWithPrice, quantity: moqQty }];

            localStorage.setItem('temp_cart', JSON.stringify(newCart));
            return newCart;
        });
    }, []);

    const handleNotifyRequest = async (item: Item) => {
        try {
            if (!companyId) return;

            const leadData = JSON.parse(
                localStorage.getItem("leadData") || "{}"
            );

            const name = leadData?.name || "Guest User";
            const number = (leadData?.number || "")
                .replace(/\D/g, "")
                .trim();

            if (!number) {
                alert("Please fill your details first");
                setForceLeadOpen(true);
                return;
            }

            // SEPARATE COLLECTION (IMPORTANT)
            const ref = doc(
                db,
                "companies",
                companyId,
                "NotifyRequests",
                number
            );

            const snap = await getDoc(ref);

            let existingItems: any[] = [];

            if (snap.exists()) {
                existingItems = snap.data()?.items || [];
            }

            const alreadyExists = existingItems.find(
                (i: any) => i.id === item.id
            );

            const updatedItems = alreadyExists
                ? existingItems
                : [
                    ...existingItems,
                    {
                        id: item.id,
                        name: item.name,
                        qty: 1,
                    },
                ];

            await setDoc(
                ref,
                {
                    customerName: name,
                    customerNumber: number,
                    type: "notify",
                    items: updatedItems,

                    // CRITICAL FIELDS
                    inStock: false,
                    messageSent: false,

                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            alert("You will be notified when item is back in stock");
        } catch (err) {
            console.error("Notify error:", err);
        }
    };

    const syncNotifyStockStatus = async (items: Item[]) => {
        if (!companyId) return;

        try {
            const notifySnap = await getDocs(
                collection(db, "companies", companyId, "NotifyRequests")
            );

            const updates: Promise<any>[] = [];

            notifySnap.forEach(docSnap => {
                const data = docSnap.data();
                const notifyItems = data.items || [];

                // check if ANY item now in stock
                const isAnyAvailable = notifyItems.some((ni: any) => {
                    const matchedItem = items.find(i => i.id === ni.id);
                    return matchedItem && (matchedItem.stock || 0) > 0;
                });

                if (isAnyAvailable && data.inStock === false) {
                    updates.push(
                        updateDoc(docSnap.ref, {
                            inStock: true,
                            updatedAt: new Date(),
                        })
                    );
                }
            });

            await Promise.all(updates);
        } catch (err) {
            console.error("Notify stock sync error:", err);
        }
    };

    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => {
            const newCart = prev
                .map(i => {
                    if (i.item.id === itemId) {
                        //  MOQ safe fallback
                        const moqQty =
                            (i.item as any).moq && (i.item as any).moq > 0
                                ? (i.item as any).moq
                                : 1;

                        const stepChange = delta > 0 ? moqQty : -moqQty;
                        const newQty = i.quantity + stepChange;

                        //  UNIVERSAL REMOVE RULE
                        if (newQty < moqQty) return null;

                        return { ...i, quantity: newQty };
                    }
                    return i;
                })
                .filter(Boolean) as { item: Item; quantity: number }[];

            localStorage.setItem('temp_cart', JSON.stringify(newCart));
            return newCart;
        });
    };
    const isUserApproved = leadStatus === "approved";
    const isUserDeclined = leadStatus === "declined";
    const isUserPending = leadStatus === "pending";
    const cartCount = useMemo(() => cart.reduce((acc, curr) => acc + curr.quantity, 0), [cart]);

    useEffect(() => {
        if (authLoading || !currentUser || !dbOperations || !companyId) return;
        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                const [fetchedItemGroups, fetchedItems] = await Promise.all([
                    dbOperations.getItemGroups(),
                    dbOperations.syncItems()
                ]);
                const settingsRef = doc(
                    db,
                    'companies',
                    companyId,
                    'settings',
                    'catalogue-sales-settings'
                );

                const settingsSnap = await getDoc(settingsRef);

                if (settingsSnap.exists()) {
                    setCatalogueSettings(settingsSnap.data() as CatalogueSalesSettings);
                }
                setAllItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);
                syncNotifyStockStatus(fetchedItems);
                const businessRef = doc(
                    db,
                    "companies",
                    companyId,
                    "business_info",
                    companyId
                );

                const businessSnap = await getDoc(businessRef);

                if (businessSnap.exists()) {
                    setSocialLinks(businessSnap.data());
                }
            } catch (err: any) {
                setError(err instanceof Error ? err.message : 'Failed to load data.');
            } finally {
                setPageIsLoading(false);
            }
        };
        fetchData();
    }, [authLoading, currentUser, dbOperations, companyId]);

    useEffect(() => {
        if (!companyId) return;

        const leadData = JSON.parse(
            localStorage.getItem("leadData") || "{}"
        );

        const phone = (leadData.number || "")
            .replace(/\D/g, "")
            .trim();

        if (!phone) {
            setLeadStatus(null);
            setCheckingApproval(false);
            return;
        }

        setCheckingApproval(true);

        // DIRECT QUERY (REALTIME)
        const q = query(
            collection(db, "companies", companyId, "AuthorizedUser"),
            where("customerNumber", "==", phone)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                if (snapshot.empty) {
                    setLeadStatus(null);
                } else {
                    const data = snapshot.docs[0].data();
                    const status = data.status || "pending";
                    setLeadStatus(status);
                }

                setCheckingApproval(false);
            },
            (error) => {
                console.error("Realtime approval error:", error);
                setLeadStatus(null);
                setCheckingApproval(false);
            }
        );

        return () => unsubscribe();
    }, [companyId, leadPhone]);

    useEffect(() => {
        const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");

        if (leadData?.number && localStorage.getItem("leadSubmitted")) {
            setIsLeadFilled(true);
        }
    }, []);

    const filteredItems = useMemo(() => {
        const result = allItems.filter(item => {
            //  hide unlisted items (LIVE RULE)
            if (!item.isListed) return false;

            const matchesGroup = item.itemGroupId === groupId;

            //  hide out of stock (existing logic)
            if (
                !catalogueSettings?.showOutOfStockItems &&
                (item.stock || 0) <= 0
            ) {
                return false;
            }

            return (
                matchesGroup &&
                item.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        });

        return [...result].sort((a, b) => {
            if (sortOrder === 'A-Z') return a.name.localeCompare(b.name);
            if (sortOrder === 'Z-A') return b.name.localeCompare(a.name);
            if (sortOrder === 'Price: Low-High') return (a.mrp || 0) - (b.mrp || 0);
            if (sortOrder === 'Price: High-Low') return (b.mrp || 0) - (a.mrp || 0);
            return 0;
        });
    }, [allItems, searchQuery, sortOrder, groupId, catalogueSettings]);

    const currentCategoryName = useMemo(() => {
        const group = allItemGroups.find(g => g.id === groupId);
        return group ? group.name : 'Catalogue';
    }, [allItemGroups, groupId]);

    const itemsToDisplay = useMemo(() => filteredItems.slice(0, itemsToRenderCount), [filteredItems, itemsToRenderCount]);
    const hasMoreItems = useMemo(() => itemsToRenderCount < filteredItems.length, [itemsToRenderCount, filteredItems.length]);

    const loadMoreItems = useCallback(() => {
        if (!hasMoreItems) return;
        setItemsToRenderCount(prev => prev + ITEMS_PER_BATCH_RENDER);
    }, [hasMoreItems]);

    useEffect(() => {
        if (!loadMoreRef.current) return;
        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMoreItems) loadMoreItems();
        }, { threshold: 0.1 });
        observerRef.current.observe(loadMoreRef.current);
        return () => observerRef.current?.disconnect();
    }, [hasMoreItems, loadMoreItems]);

    useEffect(() => {
        const savedCart = localStorage.getItem('temp_cart');
        if (savedCart) {
            const parsed = JSON.parse(savedCart);
            setCart(parsed);
        }
    }, []);

    const handleOpenDetailDrawer = (item: Item) => {
        setSelectedItemForDetails(item);
        setIsDetailDrawerOpen(true);
    };

    if (authLoading || (pageIsLoading && allItems.length === 0)) {
        return <div className="flex items-center justify-center h-screen bg-[#E9F0F7]"><Spinner /></div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-screen bg-[#E9F0F7] text-red-500">{error}</div>;
    }

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative overflow-x-hidden">
            <LeadPopUp
                companyId={companyId}
                companyName={companyName}
                forceOpen={forceLeadOpen && !leadStatus}
                onLeadSubmit={() => {
                    setIsLeadFilled(true);
                    setForceLeadOpen(false);
                    localStorage.setItem("leadJustSubmitted", "true");

                    const leadData = JSON.parse(
                        localStorage.getItem("leadData") || "{}"
                    );

                    setLeadPhone(leadData.number || "");
                }}
            />
            <header className="sticky top-0 bg-white border-b border-gray-100 shadow-sm z-[60]">
                <div className="max-w-7xl mx-auto px-1 md:px-4 py-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center justify-center gap-1">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 hover:bg-gray-100 rounded-sm transition-colors -ml-1 md:ml-0"
                            >
                                <ChevronLeft size={20} className="text-[#1A3B5D]" />
                            </button>

                            <div className="w-1 h-5 bg-[#00A3E1] rounded-sm"></div>

                            <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                                {companyName}
                            </h1>

                            {currentCategoryName && (
                                <div className="md:hidden flex items-center justify-center gap-2">
                                    <span className="text-gray-300 font-light text-sm">|</span>
                                    <span className="text-[11px] font-bold text-slate-500 truncate max-w-[120px] uppercase tracking-[0.25em]">
                                        {currentCategoryName}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Right Side Cart Button (Already optimized) */}
                        <button
                            onClick={() => navigate(`/checkout/${companyId}`)}
                            className="flex items-center justify-center gap-2 bg-[#00A3E1] text-white py-2 px-3 md:px-4 rounded-sm font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all relative mr-1 md:mr-0"
                        >
                            <ShoppingCart size={16} />
                            <span className="hidden md:inline">Cart</span>
                            {cartCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] w-4 h-4 rounded-sm flex items-center justify-center border-2 border-white">
                                    {cartCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            <main className="p-3 md:p-6 space-y-4 flex-1 max-w-7xl mx-auto w-full pb-24">
                {isUserDeclined && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-sm text-center">
                        Your request has been declined. Please contact the business.
                    </div>
                )}

                {isUserPending && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-bold rounded-sm text-center">
                        Your request is under review. Prices will be visible after approval.
                    </div>
                )}
                <div className='hidden md:flex items-center justify-center'>
                    <h1 className="text-xs md:text-sm font-black text-[#00A3E1] uppercase tracking-tighter">{currentCategoryName}</h1>
                </div>
                <div className="relative group md:max-w-md md:mx-auto w-full">
                    <SearchBar
                        items={allItems}
                        onItemSelected={(item: any) => {
                            setSearchQuery(item.name); // agar query update karni hai
                            navigate(
                                `/product/${companyId}/${item.itemGroupId}`,
                                { state: { highlightItemId: item.id } }
                            );
                        }}
                    />
                </div>

                <div className="max-w-7xl mx-auto px-1 flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Products:</span>
                        <span className="bg-[#00A3E1]/10 text-[#00A3E1] px-2.5 py-0.5 rounded-sm text-[10px] font-black">{filteredItems.length}</span>
                    </div>
                    <div className="relative">
                        <button onClick={() => setIsSortOpen(!isSortOpen)} className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-sm shadow-sm active:scale-95 transition-all">
                            <span className="text-[10px] font-black uppercase text-[#1A3B5D]">Sort: {sortOrder}</span>
                            <FiPlus className={`transition-transform duration-300 ${isSortOpen ? 'rotate-45' : ''}`} size={12} />
                        </button>
                        {isSortOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-white rounded-sm shadow-xl border border-gray-50 z-[70] overflow-hidden">
                                {(['A-Z', 'Z-A', 'Price: Low-High', 'Price: High-Low'] as const).map((opt) => (
                                    <button key={opt} onClick={() => { setSortOrder(opt); setIsSortOpen(false); }} className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 border-t border-gray-50 first:border-0 ${sortOrder === opt ? 'text-[#00A3E1]' : 'text-[#1A3B5D]'}`}>
                                        {opt.replace(':', ': ')}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {itemsToDisplay.map((item) => {
                        const cartItem = cart.find(i => i.item.id === item.id);
                        const isOutOfStock = (item.stock || 0) <= 0;
                        const showNotifyButton = catalogueSettings?.enableOutOfStockNotification && isOutOfStock;
                        const disableAddToCart = !catalogueSettings?.enableOutOfStockNotification && isOutOfStock;
                        const salePrice = item.salesPrice || item.mrp;
                        const mrp = item.mrp || 0;
                        const hasBothPrices =
                            item.salesPrice &&
                            item.mrp &&
                            item.salesPrice < item.mrp;
                        const hasDiscount = salePrice < (item.mrp || 0);
                        const discountPercent = item.mrp && hasDiscount ? Math.round(((item.mrp - salePrice) / item.mrp) * 100) : 0;
                        const showDiscountBadge = catalogueSettings?.showDiscountBadge && hasDiscount;
                        return (
                            <div
                                id={item.id}
                                key={item.id}
                                onClick={() => handleOpenDetailDrawer(item)}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border flex flex-col transition-all duration-300 relative group hover:shadow-md cursor-pointer ${activeHighlight === item.id
                                    ? 'ring-2 ring-[#00A3E1] scale-105 bg-blue-50 border-[#00A3E1]'
                                    : 'border-gray-100'
                                    }`}
                            >
                                {/* IMAGE */}
                                <div className="aspect-square bg-[#F8FAFC] flex items-center justify-center relative overflow-hidden">
                                    {item.imageUrl ? (
                                        <img
                                            src={item.imageUrl}
                                            alt={item.name}
                                            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110"
                                        />
                                    ) : (
                                        <FiPackage className="w-10 h-10 text-gray-200" />
                                    )}

                                    {/*  DISCOUNT BADGE */}
                                    {showDiscountBadge && (
                                        <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-tight shadow-md">
                                            {discountPercent}% OFF
                                        </div>
                                    )}
                                </div>

                                {/* CONTENT */}
                                <div className="p-3 flex flex-col flex-1">
                                    <h3 className="text-[10px] font-black text-[#1A3B5D] mb-1 truncate uppercase leading-tight">
                                        {item.name}
                                    </h3>

                                    {/* PRICE */}
                                    {isUserApproved ? (<div className="flex items-center justify-between w-full">
                                        <div className="flex items-center justify-between w-full">
                                            {hasBothPrices ? (
                                                <>
                                                    {/* struck MRP */}
                                                    <p className="text-[11px] font-bold text-gray-400 line-through">
                                                        ₹{mrp}
                                                    </p>

                                                    {/* sale */}
                                                    <p className="text-xs font-black text-[#00A3E1]">
                                                        ₹{salePrice}
                                                    </p>
                                                </>
                                            ) : (
                                                <p className="text-xs font-black text-[#00A3E1]">
                                                    ₹{salePrice}
                                                </p>
                                            )}
                                        </div>
                                    </div>) : (
                                        <div className="mt-2 w-full text-center">
                                            <span className="inline-block text-[9px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded-sm leading-tight">
                                                Price will be visible after approval
                                            </span>
                                        </div>
                                    )}

                                    {/* CART AREA */}
                                    <div className="mt-auto flex gap-1">
                                        {cartItem ? (
                                            <div className="w-full flex items-center justify-between bg-gray-50 rounded-sm px-1 py-1 border border-gray-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateQuantity(item.id!, -1);
                                                    }}
                                                    className="p-1.5 bg-white shadow-sm text-[#00A3E1] hover:bg-[#00A3E1] hover:text-white rounded-sm transition-all"
                                                >
                                                    <Minus size={12} strokeWidth={3} />
                                                </button>

                                                <span className="text-xs font-black text-[#1A3B5D]">
                                                    {cartItem.quantity}
                                                </span>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateQuantity(item.id!, 1);
                                                    }}
                                                    className="p-1.5 bg-white shadow-sm text-[#00A3E1] hover:bg-[#00A3E1] hover:text-white rounded-sm transition-all"
                                                >
                                                    <Plus size={12} strokeWidth={3} />
                                                </button>
                                            </div>
                                        ) : showNotifyButton ? (
                                            //  CASE 1: Notify enabled + OOS
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleNotifyRequest(item);
                                                }}
                                                className="w-full py-2 rounded-xs text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center justify-center gap-2 bg-orange-500 text-white active:scale-95"
                                            >
                                                🔔 Notify Me
                                            </button>
                                        ) : (
                                            // CASE 2: normal add to cart (may be disabled)
                                            <button
                                                disabled={disableAddToCart}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (disableAddToCart) return;
                                                    addToCart(item);
                                                }}
                                                className={`w-full py-2 rounded-xs text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center justify-center gap-2 ${disableAddToCart
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-[#00A3E1] text-white active:scale-95'
                                                    }`}
                                            >
                                                <Plus size={12} /> Add to Cart
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
                {hasMoreItems && <div ref={loadMoreRef} className="h-20 flex justify-center items-center"><Spinner /></div>}
            </main>

            <Footer
                companyName={companyName}
                instagram={socialLinks.instagram}
                facebook={socialLinks.facebook}
                twitter={socialLinks.twitter}
                gmail={socialLinks.gmail}
            />

            <ItemEditDrawer
                item={selectedItemForEdit}
                isOpen={isDrawerOpen}
                onClose={() => { setIsDrawerOpen(false); setSelectedItemForEdit(null); }}
                onSaveSuccess={(updated) => setAllItems(prev => prev.map(i => i.id === selectedItemForEdit?.id ? { ...i, ...updated } as Item : i))}
            />

            <ItemDetailDrawer
                catalogueSettings={catalogueSettings}
                item={selectedItemForDetails}
                isOpen={isDetailDrawerOpen}
                onClose={() => { setIsDetailDrawerOpen(false); setSelectedItemForDetails(null); }}
                onAddToCart={addToCart}
                initialQuantity={cart.find(i => i.item.id === selectedItemForDetails?.id)?.quantity || 1}
                isCustomerApproved={isUserApproved}
                onRequireLead={() => {
                    setForceLeadOpen(true);
                }}
            />
        </div>
    );
};

export default SharedProduct;