import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting'
import { ShoppingCart, Minus, Plus, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { FiPackage, FiPlus } from 'react-icons/fi';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { Spinner } from '../constants/Spinner';
import { useParams, useNavigate } from 'react-router-dom';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SearchBar from './SearchBar';
import { serverTimestamp, doc, setDoc, getDoc, getDocs, updateDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useLocation } from 'react-router-dom';
import LeadPopUp from './PopUp';
import { getItemGroupsByCompany, getItemsByCompany } from '../lib/ItemsFirebase';
import { runTransaction } from 'firebase/firestore';

const ITEMS_PER_BATCH_RENDER = 24;

const SharedProduct: React.FC = () => {
    const navigate = useNavigate();
    const { companyId: pathId, groupId } = useParams<{ companyId: string, groupId: string }>();

    const hostname = window.location.hostname;
    const parts = hostname.split('.');

    const subdomain = (
        parts.length >= 3 &&
        !['www', 'app'].includes(parts[0].toLowerCase()) &&
        !hostname.includes('localhost')
    ) ? parts[0] : null;

    const effectiveCompanyId = subdomain || pathId;

    if (!effectiveCompanyId) {
        return <div>Invalid catalogue link.</div>;
    }
    const { businessName: companyName } = useBusinessName(effectiveCompanyId);
    const location = useLocation();
    const highlightItemId = location.state?.highlightItemId;
    const { currentUser, loading: authLoading } = useAuth();
    const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSalesSettings | null>(null);
    const [itemsToRenderCount, setItemsToRenderCount] = useState(ITEMS_PER_BATCH_RENDER);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [_isLeadFilled, setIsLeadFilled] = useState(false);
    const [forceLeadOpen, setForceLeadOpen] = useState(false);
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
    const [showNotifySuccess, setShowNotifySuccess] = useState(false);
    const [notifiedItems, setNotifiedItems] = useState<Record<string, boolean>>({});
    const cartIconRef = useRef<HTMLButtonElement | null>(null);

    const getUserKey = () => {
        let key = localStorage.getItem('guest_uid');
        if (!key) {
            key = crypto.randomUUID();
            localStorage.setItem('guest_uid', key);
        }
        return key;
    };
    const isUserApproved = leadStatus === "approved";
    const isUserDeclined = leadStatus === "declined";
    const isUserPending = leadStatus === "pending";
    const approvalEnabled = catalogueSettings?.requireApproval === true;
    const hidePriceEnabled = catalogueSettings?.hidePrice === true;
    const cartCount = useMemo(() => cart.reduce((acc, curr) => acc + curr.quantity, 0), [cart]);

    const cartTotal = useMemo(() => {
        return cart.reduce((acc, curr) => {
            const price = curr.item?.salesPrice || curr.item?.mrp || 0;
            return acc + price * curr.quantity;
        }, 0);
    }, [cart]);

    // --- New Firebase Sync Function ---
    const generateCatalogueInvoiceNumber = async (companyId: string): Promise<string> => {
        if (!companyId) throw new Error("Missing companyId");

        const settingsRef = doc(
            db,
            "companies",
            companyId,
            "settings",
            "catalogue-sales-settings"
        );

        return await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(settingsRef);

            let prefix = "ORD-";
            let currentNumber = 1001;

            if (snap.exists()) {
                const data = snap.data() as CatalogueSalesSettings;
                prefix = data.voucherPrefix || "ORD-";
                currentNumber = data.currentVoucherNumber || 1001;
            }

            const invoice = `${prefix}${currentNumber}`;

            transaction.set(
                settingsRef,
                {
                    currentVoucherNumber: currentNumber + 1,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            return invoice;
        });
    };
    const syncToUpcoming = async (
        updatedCart: { item: Item; quantity: number }[]
    ) => {
        if (!effectiveCompanyId || updatedCart.length === 0) return;
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

            const itemsForFirebase = updatedCart.map(c => {
                const multiplier = c.item.unitMultiplier ?? 1;
                const basePrice = (c.item.salesPrice ?? c.item.mrp) || 0;
                const salePrice = basePrice * multiplier;

                return {
                    id: String(c.item.id),
                    docId: c.item.firestoreDocId || c.item.id,
                    name: c.item.name,
                    quantity: c.quantity,

                    mrp: c.item.mrp || 0,
                    salesPrice: salePrice,

                    unit: c.item.unit,
                    unitMultiplier: multiplier,

                    finalPrice: salePrice * c.quantity
                };
            });

            const orderRef = doc(
                db,
                "companies",
                effectiveCompanyId,
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
                : await generateCatalogueInvoiceNumber(effectiveCompanyId);

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
                        (acc: number, curr) => acc + curr.finalPrice,
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
        if (showNotifySuccess) {
            const t = setTimeout(() => {
                setShowNotifySuccess(false);
            }, 3000);

            return () => clearTimeout(t);
        }
    }, [showNotifySuccess]);

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
        const alreadyFilled = !approvalEnabled || localStorage.getItem("leadSubmitted") === "true";
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

            const multiplier = (item as any).unitMultiplier || 1;
            const itemWithPrice = {
                ...item,
                tax: Number(item.tax ?? 0),
                unit: item.unit,
                unitMultiplier: item.unitMultiplier || 1,
                mrp: (item.mrp || 0) * multiplier,
                salesPrice: ((item.salesPrice ?? item.mrp) || 0) * multiplier,
                groupid: item.itemGroupId
            };
            const newCart = existing
                ? prev.map(i =>
                    i.item.id === item.id
                        ? { ...i, quantity: i.quantity + moqQty }
                        : i
                )
                : [...prev, { item: itemWithPrice, quantity: moqQty }];

            localStorage.setItem(
                'temp_cart',
                JSON.stringify(
                    newCart.map(c => ({
                        item: {
                            ...c.item,
                            groupId: c.item.itemGroupId
                        },
                        quantity: c.quantity
                    }))
                )
            );
            return newCart;
        });
    }, [approvalEnabled]);

    const handleNotifyRequest = async (item: Item) => {
        try {
            if (!effectiveCompanyId) return;

            // SAME CHECK as Add to Cart
            const alreadyFilled = !approvalEnabled || localStorage.getItem("leadSubmitted") === "true";

            // lead not filled → popup dikhao
            if (!alreadyFilled) {
                setForceLeadOpen(false);
                setTimeout(() => setForceLeadOpen(true), 0);
                return;
            }

            const leadData = JSON.parse(
                localStorage.getItem("leadData") || "{}"
            );

            const name = leadData?.name || "Guest User";
            const number = (leadData?.number || "")
                .replace(/\D/g, "")
                .trim();

            if (!number) {
                setForceLeadOpen(true);
                return;
            }

            //  rest same
            const ref = doc(
                db,
                "companies",
                effectiveCompanyId,
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
                        inStock: (item.stock || 0) > 0,
                    },
                ];

            await setDoc(
                ref,
                {
                    customerName: name,
                    customerNumber: number,
                    type: "notify",
                    items: updatedItems,
                    inStock: false,
                    messageSent: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            setShowNotifySuccess(true);
            setNotifiedItems(prev => ({ ...prev, [item.id!]: true }));
        } catch (err) {
            console.error("Notify error:", err);
        }
    };

    const fetchUserNotifyStatus = async () => {
        try {
            if (!effectiveCompanyId) return;

            const leadData = JSON.parse(
                localStorage.getItem("leadData") || "{}"
            );

            const number = (leadData?.number || "")
                .replace(/\D/g, "")
                .trim();

            if (!number) return;

            const ref = doc(
                db,
                "companies",
                effectiveCompanyId,
                "NotifyRequests",
                number
            );

            const snap = await getDoc(ref);

            if (!snap.exists()) return;

            const items = snap.data()?.items || [];

            const map: Record<string, boolean> = {};

            items.forEach((i: any) => {
                if (i.id) {
                    map[i.id] = true;
                }
            });

            setNotifiedItems(map);
        } catch (err) {
            console.error("Fetch notify status error:", err);
        }
    };

    const syncNotifyStockStatus = async (items: Item[]) => {
        if (!effectiveCompanyId) return;

        try {
            const notifySnap = await getDocs(
                collection(db, "companies", effectiveCompanyId, "NotifyRequests")
            );

            const updates: Promise<any>[] = [];

            notifySnap.forEach(docSnap => {
                const data = docSnap.data();
                const notifyItems = (data.items || []).map((ni: any) => {
                    const matchedItem = items.find(i => i.id === ni.id);
                    const isNowInStock = matchedItem && (matchedItem.stock || 0) > 0;

                    return {
                        ...ni,
                        inStock: Boolean(isNowInStock)
                    };
                });
                // check if ANY item now in stock
                const isAnyAvailable = notifyItems.some(
                    (ni: any) => ni.inStock === true
                );

                // ALWAYS sync — not only when true
                if (data.inStock !== isAnyAvailable) {
                    updates.push(
                        updateDoc(docSnap.ref, {
                            inStock: isAnyAvailable,
                            items: notifyItems,
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

    const animateToCart = (img: HTMLImageElement) => {
        if (!cartIconRef.current) return;

        const cartRect = cartIconRef.current.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();

        const clone = img.cloneNode(true) as HTMLImageElement;

        clone.style.position = "fixed";
        clone.style.left = `${imgRect.left}px`;
        clone.style.top = `${imgRect.top}px`;
        clone.style.width = `${imgRect.width}px`;
        clone.style.height = `${imgRect.height}px`;
        clone.style.transition = "all 0.6s ease";
        clone.style.zIndex = "9999";
        clone.style.pointerEvents = "none";

        document.body.appendChild(clone);

        requestAnimationFrame(() => {
            clone.style.left = `${cartRect.left}px`;
            clone.style.top = `${cartRect.top}px`;
            clone.style.width = "20px";
            clone.style.height = "20px";
            clone.style.opacity = "0.5";
        });

        setTimeout(() => {
            clone.remove();
        }, 600);
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

    useEffect(() => {
        // 1. Remove !currentUser from the guard so public users can pass
        if (authLoading || !effectiveCompanyId || !groupId) return;

        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                setError(null);

                // 2. Use direct library calls or manual Firestore queries 
                // instead of dbOperations which requires a login
                const [fetchedItemGroups, fetchedItems] = await Promise.all([
                    getItemGroupsByCompany(effectiveCompanyId),
                    getItemsByCompany(effectiveCompanyId)
                ]);

                // 3. Fetch Catalogue Sales Settings
                const settingsRef = doc(
                    db,
                    'companies',
                    effectiveCompanyId,
                    'settings',
                    'catalogue-sales-settings'
                );
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    setCatalogueSettings(settingsSnap.data() as CatalogueSalesSettings);
                }

                // 4. Update state with fetched data
                setAllItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);

                // 5. Trigger side effects like stock sync
                syncNotifyStockStatus(fetchedItems);

                // 6. Fetch Business/Social Info
                const businessRef = doc(
                    db,
                    "companies",
                    effectiveCompanyId,
                    "business_info",
                    effectiveCompanyId
                );
                const businessSnap = await getDoc(businessRef);
                if (businessSnap.exists()) {
                    setSocialLinks(businessSnap.data());
                }

            } catch (err: any) {
                console.error("Fetch Public Data Error:", err);
                setError(err instanceof Error ? err.message : 'Failed to load data.');
            } finally {
                setPageIsLoading(false);
            }
        };

        fetchData();

        // 7. Dependency array: Remove currentUser and dbOperations 
        // to prevent re-triggering when auth state changes
    }, [authLoading, effectiveCompanyId, groupId]);

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
            setCheckingApproval(false);
            return;
        }

        setCheckingApproval(true);

        // DIRECT QUERY (REALTIME)
        const q = query(
            collection(db, "companies", effectiveCompanyId, "AuthorizedUser"),
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
    }, [effectiveCompanyId, leadPhone]);

    useEffect(() => {
        const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");

        if (leadData?.number && localStorage.getItem("leadSubmitted")) {
            setIsLeadFilled(true);
        }
    }, []);

    useEffect(() => {
        fetchUserNotifyStatus();
    }, [effectiveCompanyId]);

    const filteredItems = useMemo(() => {
        const result = allItems.filter(item => {
            //  hide unlisted items (LIVE RULE)
            if (!item.isListed) return false;
            const matchesGroup = item.itemGroupId === groupId;
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
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative">
            {approvalEnabled && <LeadPopUp
                companyId={effectiveCompanyId}
                companyName={companyName}
                forceOpen={approvalEnabled && forceLeadOpen && !leadStatus}
                onLeadSubmit={() => {
                    setIsLeadFilled(true);
                    setForceLeadOpen(false);
                    localStorage.setItem("leadJustSubmitted", "true");

                    const leadData = JSON.parse(
                        localStorage.getItem("leadData") || "{}"
                    );

                    const phone = leadData.number || "";
                    setLeadPhone(phone);

                    //  CRITICAL FIX — fetch again after lead submit
                    setTimeout(() => {
                        fetchUserNotifyStatus();
                    }, 300);
                }}
            />}
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

                            <div className="w-1 h-5 bg-[#F97316] rounded-sm"></div>

                            <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                                {companyName}
                            </h1>
                        </div>

                        {/* Right Side Cart Button (Already optimized) */}
                        <button
                            ref={cartIconRef}
                            onClick={() => navigate(`/checkout/${effectiveCompanyId}`)}
                            className="flex items-center justify-center gap-2 bg-[#F97316] text-white py-2 px-3 md:px-4 rounded-sm font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all relative mr-1 md:mr-0"
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
                {approvalEnabled && isUserDeclined && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-sm text-center">
                        Your request has been declined. Please contact the business.
                    </div>
                )}

                {showNotifySuccess && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-sm text-center relative animate-fade-in">
                        You will be notified when item is back in stock
                        <button
                            onClick={() => setShowNotifySuccess(false)}
                            className="absolute right-2 top-2 text-green-600 font-black"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {approvalEnabled && isUserPending && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-bold rounded-sm text-center">
                        Your request is under review. Prices will be visible after approval.
                    </div>
                )}
                <div className='flex items-center justify-center'>
                    <h1 className="text-sm md:text-xl font-extrabold text-[#F97316] uppercase tracking-tighter">{currentCategoryName}</h1>
                </div>
                <div className="relative group md:max-w-md md:mx-auto w-full">
                    <SearchBar
                        items={allItems}
                        onItemSelected={(item: any) => {
                            setSearchQuery(item.name); // agar query update karni hai
                            navigate(
                                `/product/${effectiveCompanyId}/${item.itemGroupId}`,
                                { state: { highlightItemId: item.id } }
                            );
                        }}
                    />
                </div>

                <div className="max-w-7xl mx-auto px-1 flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Products:</span>
                        <span className="bg-[#F97316]/10 text-[#F97316] px-2.5 py-0.5 rounded-sm text-[10px] font-black">{filteredItems.length}</span>
                    </div>
                    <div className="relative">
                        <button onClick={() => setIsSortOpen(!isSortOpen)} className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-sm shadow-sm active:scale-95 transition-all">
                            <span className="text-[10px] font-black uppercase text-[#1A3B5D]">Sort: {sortOrder}</span>
                            <FiPlus className={`transition-transform duration-300 ${isSortOpen ? 'rotate-45' : ''}`} size={12} />
                        </button>
                        {isSortOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-white rounded-sm shadow-xl border border-gray-50 z-[70] overflow-hidden">
                                {(['A-Z', 'Z-A', 'Price: Low-High', 'Price: High-Low'] as const).map((opt) => (
                                    <button key={opt} onClick={() => { setSortOrder(opt); setIsSortOpen(false); }} className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 border-t border-gray-50 first:border-0 ${sortOrder === opt ? 'text-[#F97316]' : 'text-[#1A3B5D]'}`}>
                                        {opt.replace(':', ': ')}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0.5">
                    {itemsToDisplay.map((item) => {
                        const cartItem = cart.find(i => i.item.id === item.id);
                        const isOutOfStock =
                            !catalogueSettings?.allowNegativeInventory &&
                            (item.stock || 0) <= 0;
                        const showNotifyButton = catalogueSettings?.enableOutOfStockNotification && isOutOfStock;
                        const disableAddToCart = isOutOfStock;
                        const basePrice = item.salesPrice || item.mrp;
                        const multiplier = (item as any).unitMultiplier || 1;
                        const salePrice = basePrice * multiplier
                        const mrp = (item.mrp || 0) * multiplier;
                        const hasBothPrices =
                            item.salesPrice &&
                            item.mrp &&
                            item.salesPrice < item.mrp;
                        const hasDiscount = salePrice < mrp;
                        const discountPercent = mrp && hasDiscount ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;
                        const showDiscountBadge = !hidePriceEnabled && catalogueSettings?.showDiscountBadge && hasDiscount;
                        // const unitMultiplier = (item as any).unitMultiplier || 1;
                        // const unit = (item as any).unit || "pcs";

                        // let unitLabel = "";
                        // if (unit === "pcs") unitLabel = `(1 pcs)`;
                        // else if (unit === "box") unitLabel = `(10 pcs)`;
                        // else if (unit === "doz") unitLabel = `(12 pcs)`;
                        // else if (unit === "qt") unitLabel = `(100 pcs)`;
                        // else if (unit === "ton") unitLabel = `(1000 pcs)`;
                        // else if (unit === "pkt") {
                        //     const packetSize = (item as any).packetSize || unitMultiplier;
                        //     unitLabel = `(${packetSize} pcs)`;
                        // }
                        return (
                            <div
                                id={item.id}
                                key={item.id}
                                onClick={() => handleOpenDetailDrawer(item)}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border flex flex-col transition-all duration-300 relative group hover:shadow-md cursor-pointer ${activeHighlight === item.id
                                    ? 'ring-2 ring-[#F97316] scale-105 bg-blue-50 border-[#F97316] z-100'
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
                                    {isOutOfStock && (
                                        <div className="absolute top-2 left-2 bg-orange-500 text-white px-1 py-0.5 rounded-sm text-[10px] font-black uppercase">
                                            Out of Stock
                                        </div>
                                    )}

                                    {/*  DISCOUNT BADGE */}
                                    {showDiscountBadge && (
                                        <div className="absolute top-2 right-2 bg-[#F97316] text-white px-2 py-0.5 rounded-sm text-[10px] font-black uppercase tracking-tight shadow-md">
                                            {discountPercent}% OFF
                                        </div>
                                    )}
                                </div>

                                {/* CONTENT */}
                                <div className="p-3 flex flex-col flex-1">
                                    <h3 className="text-[12px] font-black text-[#1A3B5D] mb-1 uppercase leading-tight">
                                        {item.name}
                                    </h3>

                                    {/* PRICE */}
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2 w-full">

                                            {/* PRICE (only when allowed) */}
                                            {!hidePriceEnabled && (!approvalEnabled || isUserApproved) && (
                                                <>
                                                    {hasBothPrices ? (
                                                        <>
                                                            <p className="text-[14px] font-bold text-gray-500 line-through">
                                                                ₹{mrp}
                                                            </p>

                                                            <p className="text-[14px] font-black text-[#F97316]">
                                                                ₹{salePrice}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="text-[14px] font-black text-[#F97316]">
                                                            ₹{salePrice}
                                                        </p>
                                                    )}
                                                </>
                                            )}

                                            {/* UNIT (ALWAYS visible) */}
                                            <span className="text-[12px] text-gray-600 font-semibold">
                                                ({item.unitMultiplier || 1} pcs)
                                            </span>

                                        </div>
                                    </div>

                                    {/* CART AREA */}
                                    <div className="mt-auto flex gap-1">
                                        {cartItem ? (
                                            <div className="w-full flex items-center justify-between bg-gray-50 rounded-sm px-1 py-1 border border-gray-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateQuantity(item.id!, -1);
                                                    }}
                                                    className="p-1.5 bg-white shadow-sm text-[#F97316] hover:bg-[#F97316] hover:text-white rounded-sm transition-all"
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
                                                    className="p-1.5 bg-white shadow-sm text-[#F97316] hover:bg-[#F97316] hover:text-white rounded-sm transition-all"
                                                >
                                                    <Plus size={12} strokeWidth={3} />
                                                </button>
                                            </div>
                                        ) : showNotifyButton ? (
                                            //  CASE 1: Notify enabled + OOS
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!notifiedItems[item.id!]) {
                                                        handleNotifyRequest(item);
                                                    }
                                                }}
                                                className={`w-full py-2 rounded-xs text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center justify-center gap-2 ${notifiedItems[item.id!]
                                                    ? 'bg-green-600 text-white cursor-default'
                                                    : 'bg-orange-500 text-white active:scale-95'
                                                    }`}>
                                                {notifiedItems[item.id!] ? '✓ We will notify you' : '🔔 Notify Me'}
                                            </button>
                                        ) : (
                                            // CASE 2: normal add to cart (may be disabled)
                                            <button
                                                // disabled={disableAddToCart}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // if (disableAddToCart) return;
                                                    const card = e.currentTarget.closest(".group");
                                                    const img = card?.querySelector("img") as HTMLImageElement;
                                                    if (img) animateToCart(img);
                                                    addToCart(item);
                                                }}
                                                className={`w-full py-2 rounded-xs text-[12px] font-black uppercase tracking-widest mt-1 shadow-sm transition-all flex items-center justify-center gap-2 ${disableAddToCart
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-[#F97316] text-white active:scale-95'
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

            {/* --- STICKY BOTTOM CART --- */}
            <div
                onClick={() => {
                    if (effectiveCompanyId) {
                        navigate(`/checkout/${effectiveCompanyId}`);
                    }
                }}
                className="fixed bottom-0 left-0 w-full md:w-[50%] md:left-1/2 md:-translate-x-1/2 z-[1000] bg-[#F97316] text-white shadow-lg cursor-pointer active:scale-[0.98] transition-all"
            >
                <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">

                    {/* Left side */}
                    <div className="flex items-center gap-3">

                        <div className="flex flex-col">
                            <span className="text-[12px] font-bold uppercase tracking-wide">
                                {cartCount} Item{cartCount > 1 ? 's' : ''}
                            </span>
                            <span className="text-[15px] font-bold">
                                ₹{cartTotal}
                            </span>
                        </div>


                        <ShoppingCart size={20} />

                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2 font-black uppercase text-[12px]">
                        View Cart →
                    </div>

                </div>
            </div>

            <ItemDetailDrawer
                catalogueSettings={catalogueSettings}
                item={selectedItemForDetails}
                isOpen={isDetailDrawerOpen}
                onClose={() => { setIsDetailDrawerOpen(false); setSelectedItemForDetails(null); }}
                onAddToCart={addToCart}
                initialQuantity={cart.find(i => i.item.id === selectedItemForDetails?.id)?.quantity || 0}
                isCustomerApproved={isUserApproved}
                onRequireLead={() => {
                    setForceLeadOpen(true);
                }}
                onUpdateQuantity={updateQuantity}
            />
        </div>
    );
};

export default SharedProduct;