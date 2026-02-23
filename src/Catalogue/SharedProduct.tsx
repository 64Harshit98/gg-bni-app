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
import { serverTimestamp, doc, setDoc, getDoc } from 'firebase/firestore';
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
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [selectedItemForDetails, setSelectedItemForDetails] = useState<Item | null>(null);
    const [socialLinks, setSocialLinks] = useState<any>({});
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A' | 'Price: Low-High' | 'Price: High-Low'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);

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

    const getEffectivePrice = (item: Item) => {
        const priceMode = catalogueSettings?.priceDisplayMode || 'both';

        const mrp = (item as any).mrp || 0;
        const salePrice = (item as any).salesPrice || mrp;

        const hasDiscount = salePrice < mrp;

        //  priority logic
        if (priceMode === 'mrp') return mrp;
        if (priceMode === 'salePrice') return salePrice;

        // both mode OR discount badge
        if (hasDiscount) return salePrice;

        return salePrice || mrp;
    };

    const addToCart = useCallback((item: Item) => {
        setCart(prev => {
            const existing = prev.find(i => i.item.id === item.id);

            const moqQty = (item as any).moq || 1;
            const effectivePrice = getEffectivePrice(item);

            const itemWithPrice = {
                ...item,
                effectivePrice //  store final price
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
    }, [catalogueSettings]);


    const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
        const newCart = prev
            .map(i => {
                if (i.item.id === itemId) {
                    const allowZero =
                        catalogueSettings?.allowQuantityDecreaseToZero;

                    const moqQty = (i.item as any).moq || 1;

                    let newQty: number;

                    // ✅ STEP BASED CHANGE (IMPORTANT)
                    const stepChange = delta > 0 ? moqQty : -moqQty;

                    if (allowZero) {
                        newQty = Math.max(0, i.quantity + stepChange);
                    } else {
                        newQty = Math.max(moqQty, i.quantity + stepChange);
                    }

                    return { ...i, quantity: newQty };
                }
                return i;
            })
            .filter(i => i.quantity > 0);

        localStorage.setItem('temp_cart', JSON.stringify(newCart));

        syncToUpcoming(newCart);
        return newCart;
    });
};
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

            // 👇 add this
            syncToUpcoming(parsed);
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
            <LeadPopUp companyId={companyId} companyName={companyName} />
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
                        const disableAddToCart =
                            catalogueSettings?.disableOutOfStockAddToCart &&
                            isOutOfStock;
                        const priceMode = catalogueSettings?.priceDisplayMode || 'both';
                        const salePrice = item.salesPrice || item.mrp;
                        const hasDiscount = salePrice < (item.mrp || 0);
                        const discountPercent = item.mrp && hasDiscount ? Math.round(((item.mrp - salePrice) / item.mrp) * 100) : 0;
                        const showDiscountBadge = catalogueSettings?.showDiscountBadge && priceMode !== 'mrp' && hasDiscount;
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
                                    <div className="flex items-center justify-between w-full">
                                        {/* LEFT */}
                                        <div className="flex flex-col">
                                            {priceMode === 'mrp' && (
                                                <p className="text-xs font-black text-[#00A3E1]">
                                                    MRP ₹{item.mrp}
                                                </p>
                                            )}

                                            {priceMode === 'salePrice' && (
                                                <p className="text-xs font-black text-[#00A3E1]">
                                                    ₹{salePrice}
                                                </p>
                                            )}

                                            {priceMode === 'both' && (
                                                <p className="text-xs font-black text-[#1A3B5D]">
                                                    MRP ₹{item.mrp}
                                                </p>
                                            )}
                                        </div>

                                        {/* RIGHT */}
                                        {priceMode === 'both' && (
                                            <p className="text-xs font-black text-[#00A3E1]">
                                                Sale ₹{salePrice}
                                            </p>
                                        )}
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
                                        ) : (
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
            />
        </div>
    );
};

export default SharedProduct;