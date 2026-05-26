import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShoppingCart, X, Minus, Plus, Trash2, Send, Pin } from 'lucide-react';
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting';
import { ROUTES } from '../constants/routes.constants';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { FiStar, FiCheckSquare, FiLoader, FiPackage, FiPlus } from 'react-icons/fi';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { Spinner } from '../constants/Spinner';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import { syncNotifyStock } from "../../src/Catalogue/utils/syncNotifyStock";
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { db } from '../lib/Firebase';
import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';

const StockIndicator: React.FC<{ stock: number }> = ({ stock }) => {
    let colorClass = 'text-green-600 bg-green-100';
    if (stock <= 10 && stock > 0) colorClass = 'text-yellow-600 bg-yellow-100';
    if (stock <= 0) colorClass = 'text-red-500 bg-red-100';
    return (
        <span className={`px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-tight whitespace-nowrap ${colorClass}`}>
            {stock} IN STOCK
        </span>
    );
};

interface QuickListedToggleProps {
    itemId: string;
    isListed: boolean;
    onToggle: (itemId: string, newState: boolean) => Promise<void>;
    disabled?: boolean;
}

const QuickListedToggle: React.FC<QuickListedToggleProps> = ({ itemId, isListed, onToggle, disabled }) => {
    const [isLoading, setIsLoading] = useState(false);
    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (disabled || isLoading) return;
        setIsLoading(true);
        try {
            await onToggle(itemId, !isListed);
        } catch (error) {
            console.error("Error toggling listed status:", error);
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <button
            onClick={handleClick}
            disabled={disabled || isLoading}
            className={`flex-1 py-1.5 rounded-sm text-[9px] font-black uppercase cursor-pointer tracking-wider transition-all flex items-center justify-center gap-1 ${isListed ? 'bg-green-500/80 text-white shadow-sm' : 'bg-gray-100 text-gray-400 cursor-pointer'
                }`}
        >
            {isLoading ? <FiLoader className="animate-spin" size={10} /> : isListed ? <FiCheckSquare size={10} /> : <FiStar size={10} />}
            {isListed ? 'Live' : 'Live'}
        </button>
    );
};

const ITEMS_PER_BATCH_RENDER = 24;
// --- NEW 3-TIER LOGIC HELPER ---
const getEffectivePriceInfo = (item: Item) => {
    const mrp = Number(item.mrp || 0);
    const itemSalesPrice = Number(item.salesPrice || 0);
    const presetDiscount = Number(item.discount || 0);

    let salePrice = 0;
    let calculatedDiscount = 0;

    if (mrp > 0 && itemSalesPrice > 0) {
        // Case 1: Both exist. Ignore DB discount. Calculate diff.
        salePrice = itemSalesPrice;
        calculatedDiscount = ((mrp - itemSalesPrice) / mrp) * 100;
    } else if (itemSalesPrice > 0) {
        // Case 2: Only Sales Price exists. Apply DB discount.
        calculatedDiscount = presetDiscount;
        salePrice = itemSalesPrice * (1 - (presetDiscount / 100));
    } else if (mrp > 0) {
        // Case 3: Only MRP exists. Apply DB discount.
        calculatedDiscount = presetDiscount;
        salePrice = mrp * (1 - (presetDiscount / 100));
    }

    // Round to 2 decimal places to ensure clean UI numbers
    salePrice = Math.round((salePrice + Number.EPSILON) * 100) / 100;

    return {
        mrp,
        salePrice,
        discountPercent: Math.round(calculatedDiscount),
        hasDiscount: calculatedDiscount > 0,
        hasBothPrices: mrp > 0 && salePrice > 0 && salePrice < mrp
    };
};

const MyShop: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const highlightItemId = location.state?.highlightItemId;
    const highlightTrigger = location.state?.trigger;
    const { groupId } = useParams<{ groupId: string }>();
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const { businessName: companyName, loading: _nameLoading } = useBusinessName(companyId);
    const dbOperations = useDatabase();

    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(groupId || 'All');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [_error, setError] = useState<string | null>(null);
    const [itemsToRenderCount, setItemsToRenderCount] = useState(ITEMS_PER_BATCH_RENDER);
    const [socialLinks, setSocialLinks] = useState<any>({});
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [selectedItemForDetails, setSelectedItemForDetails] = useState<Item | null>(null);
    const [variantGroupIds, setVariantGroupIds] = useState<string[]>([]);
    const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSalesSettings | null>(null);

    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A' | 'Price: Low-High' | 'Price: High-Low'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const isViewMode = false;
    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);
    const [isAllLive, setIsAllLive] = useState(false);
    const [showConfirmPopup, setShowConfirmPopup] = useState(false);
    const [pendingLiveState, setPendingLiveState] = useState<boolean | null>(null);
    const [showUncategorizedWarning, setShowUncategorizedWarning] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!companyId) return;

        const loadPins = async () => {
            try {
                const ref = doc(db, 'companies', companyId, 'settings', 'pinned_items');
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    const ids: string[] = snap.data().ids || [];
                    setPinnedIds(new Set(ids));
                    localStorage.setItem(`pinned_items_${companyId}`, JSON.stringify(ids));
                } else {
                    const saved = localStorage.getItem(`pinned_items_${companyId}`);
                    if (saved) setPinnedIds(new Set(JSON.parse(saved)));
                }
            } catch (err) {
                console.error("Failed to load pinned items:", err);
                const saved = localStorage.getItem(`pinned_items_${companyId}`);
                if (saved) setPinnedIds(new Set(JSON.parse(saved)));
            }
        };

        loadPins();
    }, [companyId]);

    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
    };

    const resolvedGroupId = useMemo(() => {
        if (!groupId || allItemGroups.length === 0) return groupId;
        const matchedGroup = allItemGroups.find(
            (group) => generateSlug(group.name) === groupId
        );
        return matchedGroup?.id || groupId;
    }, [groupId, allItemGroups]);

    const isUncategorized = (resolvedGroupId || selectedCategory) === 'uncategorized';

    useEffect(() => {
        if (resolvedGroupId) {
            setSelectedCategory(resolvedGroupId);
        }
    }, [resolvedGroupId]);

    useEffect(() => {
        setSearchQuery("");
    }, [groupId]);

    const addToCart = (item: Item, quantity: number = 1, isFromDrawer: boolean = false) => {
        setCart(prev => {
            const existing = prev.find(i => i.item.id === item.id);
            if (existing) {
                const newQuantity = isFromDrawer ? quantity : existing.quantity + 1;
                return prev.map(i => i.item.id === item.id ? { ...i, quantity: newQuantity } : i);
            }
            return [...prev, { item, quantity }];
        });
    };

    const removeFromCart = (itemId: string) => {
        setCart(prev => prev.filter(i => i.item.id !== itemId));
    };

    const handleShareItem = async (item: Item) => {
        if (!companyId || !item?.itemGroupId || !item?.id) return;

        const group = allItemGroups.find((g) => g.id === item.itemGroupId);
        const categorySlug = group ? generateSlug(group.name) : item.itemGroupId;
        const itemSlug = generateSlug(item.name || "product");

        let shareUrl = `${window.location.origin}/${companyId}/${categorySlug}?product=${itemSlug}&itemId=${item.id}`;

        try {
            const docRef = doc(db, 'companies', companyId);
            const snap = await getDoc(docRef);

            if (snap.exists() && snap.data().subdomain) {
                shareUrl = `https://${snap.data().subdomain}.sellar.in/${categorySlug}?product=${itemSlug}&itemId=${item.id}`;
            }
        } catch (error) {
            console.error("Error fetching subdomain for sharing:", error);
        }

        try {
            if (navigator.share) {
                const shareData: ShareData = {
                    title: `${companyName} - ${item.name}`,
                    text: `Check out ${item.name} from ${companyName}`,
                    url: shareUrl,
                };

                if (item.imageUrl && navigator.canShare) {
                    try {
                        const imageResponse = await fetch(item.imageUrl);
                        const blob = await imageResponse.blob();
                        const file = new File([blob], `${itemSlug}.jpg`, { type: blob.type });

                        if (navigator.canShare({ files: [file] })) {
                            shareData.files = [file];
                        }
                    } catch (imageError) {
                        console.warn("Could not fetch image for native sharing, falling back to text only.", imageError);
                    }
                }

                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(shareUrl);
                alert("Product link copied to clipboard!");
            }
        } catch (error) {
            console.error("Error sharing item:", error);
        }
    };

    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => prev.map(i => {
            if (i.item.id === itemId) {
                const allowZero = catalogueSettings?.allowQuantityDecreaseToZero;
                const newQty = allowZero
                    ? Math.max(0, i.quantity + delta)
                    : Math.max(1, i.quantity + delta);
                return { ...i, quantity: newQty };
            }
            return i;
        }).filter(i => i.quantity > 0));
    };

    const cartTotal = useMemo(() =>
        cart.reduce((acc, curr) => {
            const { salePrice } = getEffectivePriceInfo(curr.item);
            return acc + salePrice * curr.quantity;
        }, 0),
        [cart]
    );

    const cartCount = useMemo(() => cart.reduce((acc, curr) => acc + curr.quantity, 0), [cart]);

    const handleToggleAllLive = () => {
        if (isUncategorized) {
            setShowUncategorizedWarning(true);
            return;
        }
        setPendingLiveState(!isAllLive);
        setShowConfirmPopup(true);
    };

    const confirmToggleAllLive = async () => {
        if (!dbOperations || pendingLiveState === null) return;
        const newState = pendingLiveState;
        setShowConfirmPopup(false);
        setIsAllLive(newState);

        try {
            const activeCat = resolvedGroupId || selectedCategory;
            const itemsToUpdate = allItems.filter(item => {
                if (activeCat === 'All') return true;
                const allIds = [
                    ...(item.itemGroupId ? [item.itemGroupId] : []),
                    ...(item.itemGroupIds || []),
                ];
                return allIds.includes(activeCat);
            });

            const updates = itemsToUpdate.map(item =>
                dbOperations.updateItem(item.id!, { isListed: newState })
            );

            await Promise.all(updates);

            setAllItems(prev =>
                prev.map(item => {
                    if (activeCat === 'All') return { ...item, isListed: newState };
                    const allIds = [
                        ...(item.itemGroupId ? [item.itemGroupId] : []),
                        ...(item.itemGroupIds || []),
                    ];
                    return allIds.includes(activeCat) ? { ...item, isListed: newState } : item;
                })
            );
        } catch (err) {
            console.error("Bulk toggle failed:", err);
        } finally {
            setPendingLiveState(null);
        }
    };

    const currentCategoryName = useMemo(() => {
        if (resolvedGroupId === 'uncategorized') return 'Uncategorized';
        if (resolvedGroupId === 'All' || !resolvedGroupId) return 'All Products';

        const group = allItemGroups.find(g => g.id === resolvedGroupId);
        return group ? group.name : 'Catalogue';
    }, [allItemGroups, resolvedGroupId]);

    useEffect(() => {
        const getScrollContainer = (): HTMLElement | null => {
            return document.querySelector(
                ".flex-1.overflow-y-auto.pb-20.md\\:pb-4.scroll-smooth"
            ) as HTMLElement | null;
        };

        const timer = setTimeout(() => {
            const scrollContainer = getScrollContainer();
            if (!scrollContainer) return;

            let ticking = false;
            const handleScroll = () => {
                if (!ticking) {
                    window.requestAnimationFrame(() => {
                        const scrollTop = scrollContainer.scrollTop;
                        setIsScrolled(scrollTop > 50);
                        ticking = false;
                    });
                    ticking = true;
                }
            };

            scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
            handleScroll();

            return () => {
                scrollContainer.removeEventListener("scroll", handleScroll);
            };
        }, 300);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!Array.isArray(allItems) || allItems.length === 0) {
            setIsAllLive(false);
            return;
        }

        const activeCat = resolvedGroupId || selectedCategory;
        const filtered = allItems.filter(item => {
            if (activeCat === 'All') return true;
            const allIds = [
                ...(item.itemGroupId ? [item.itemGroupId] : []),
                ...(item.itemGroupIds || []),
            ];
            return allIds.includes(activeCat);
        });

        const allLive = filtered.length > 0 && filtered.every(item => item.isListed === true);
        setIsAllLive(allLive);
    }, [allItems, resolvedGroupId, selectedCategory]);

    // Live Sync Listener
    useEffect(() => {
        if (authLoading || !currentUser || !dbOperations || !companyId) {
            if (!authLoading && (!currentUser || !dbOperations)) {
                setPageIsLoading(false);
            }
            return;
        }

        setPageIsLoading(true);
        setError(null);
        let unsubscribeItems = () => { };

        const setupLiveSync = async () => {
            try {
                const fetchedItemGroups = await dbOperations.getItemGroups();
                setAllItemGroups(fetchedItemGroups || []);

                const businessRef = doc(db, "companies", companyId, "business_info", companyId);
                const businessSnap = await getDoc(businessRef);
                if (businessSnap.exists()) setSocialLinks(businessSnap.data());

                const settingsRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) setCatalogueSettings(settingsSnap.data() as CatalogueSalesSettings);

                const itemsRef = collection(db, "companies", companyId, "items");
                unsubscribeItems = onSnapshot(itemsRef, (snapshot) => {
                    const liveItemsList: Item[] = [];
                    snapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        liveItemsList.push({
                            ...data,
                            id: docSnap.id,
                            stock: data.stock !== undefined && data.stock !== null ? Number(data.stock) : 0,
                            isListed: data.isListed ?? false
                        } as Item);
                    });

                    setAllItems(liveItemsList);

                    if (liveItemsList.length > 0) {
                        setIsAllLive(liveItemsList.every(item => item.isListed === true));
                    }

                    setPageIsLoading(false);
                }, (err) => {
                    console.error("Live items sync failed:", err);
                    setError("Real-time inventory synchronization lost.");
                    setPageIsLoading(false);
                });

            } catch (err: any) {
                setError(err.message || "Failed to load initial data.");
                setPageIsLoading(false);
            }
        };

        setupLiveSync();

        return () => unsubscribeItems();
    }, [authLoading, currentUser, dbOperations, companyId]);

    const itemGroupMap = useMemo(() => {
        return allItemGroups.reduce((acc, group) => {
            if (group.id) {
                acc[group.id] = group.name;
            }
            return acc;
        }, {} as Record<string, string>);
    }, [allItemGroups]);

    const filteredItems = useMemo(() => {
        const activeCat = resolvedGroupId || selectedCategory;
        const validGroupIds = new Set(allItemGroups.map(g => g.id));

        const result = allItems.filter(item => {
            if (!item) return false;

            const isSearching = searchQuery.trim().length > 0;

            if (isViewMode && !item.isListed && !isSearching) {
                return false;
            }

            let matchesCategory = false;

            if (isSearching) {
                matchesCategory = true;
            } else if (activeCat === 'All') {
                matchesCategory = true;
            } else if (activeCat === 'uncategorized') {
                const allIds = [
                    ...(item.itemGroupId ? [item.itemGroupId] : []),
                    ...(item.itemGroupIds || []),
                ];
                matchesCategory = allIds.length === 0 || allIds.every(id => !validGroupIds.has(id));
            } else {
                const allIds = [
                    ...(item.itemGroupId ? [item.itemGroupId] : []),
                    ...(item.itemGroupIds || []),
                ];
                matchesCategory = allIds.includes(activeCat);
            }

            const itemName = item.name?.toLowerCase() || "";
            const matchesSearch = !isSearching ||
                itemName.includes(searchQuery.toLowerCase()) ||
                (item.barcode && item.barcode.includes(searchQuery));

            return matchesCategory && matchesSearch;
        });

        return [...result].sort((a, b) => {
            const aPinned = pinnedIds.has(a.id!);
            const bPinned = pinnedIds.has(b.id!);
            if (aPinned !== bPinned) return aPinned ? -1 : 1;
            const nameA = a.name || "";
            const nameB = b.name || "";
            if (sortOrder === 'A-Z') return nameA.localeCompare(nameB);
            if (sortOrder === 'Z-A') return nameB.localeCompare(nameA);
            if (sortOrder === 'Price: Low-High') return (a.salesPrice || a.mrp || 0) - (b.salesPrice || b.mrp || 0);
            if (sortOrder === 'Price: High-Low') return (b.salesPrice || b.mrp || 0) - (a.salesPrice || a.mrp || 0);

            return 0;
        });
    }, [
        allItems,
        selectedCategory,
        searchQuery,
        isViewMode,
        sortOrder,
        resolvedGroupId,
        allItemGroups,
        pinnedIds
    ]);

    useEffect(() => {
        if (!highlightItemId || filteredItems.length === 0) return;

        const itemIndex = filteredItems.findIndex(
            (item) => String(item.id) === String(highlightItemId)
        );

        if (itemIndex !== -1) {
            setItemsToRenderCount((prev) => Math.max(prev, itemIndex + 1));
        }

        const timer = setTimeout(() => {
            setHighlightedId(highlightItemId);

            const element = document.getElementById(highlightItemId);
            element?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });

            setTimeout(() => {
                setHighlightedId(null);
            }, 3000);

            navigate(location.pathname, { replace: true, state: {} });
        }, 300);

        return () => clearTimeout(timer);
    }, [
        highlightItemId,
        highlightTrigger,
        filteredItems,
        navigate,
        location.pathname
    ]);

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

    const resolveVariantGroup = (item: Item): string[] => {
        const itemId = String(item.id!);

        const findTrueRoot = (startId: string): Item | null => {
            const visited = new Set<string>();
            const queue = [startId];
            let bestRoot: Item | null = null;
            let bestCount = -1;

            while (queue.length > 0) {
                const currentId = queue.shift()!;
                if (visited.has(currentId)) continue;
                visited.add(currentId);

                const currentItem = allItems.find(i => String(i.id) === currentId);
                if (!currentItem) continue;

                const currentVariants: string[] = ((currentItem as any).variants || []).map(String);

                if (currentVariants.length > bestCount) {
                    bestCount = currentVariants.length;
                    bestRoot = currentItem;
                }

                currentVariants.forEach(vid => { if (!visited.has(vid)) queue.push(vid); });

                allItems.forEach(i => {
                    const iVariants: string[] = ((i as any).variants || []).map(String);
                    if (iVariants.includes(currentId) && !visited.has(String(i.id))) {
                        queue.push(String(i.id));
                    }
                });
            }

            return bestRoot;
        };

        const trueRoot = findTrueRoot(itemId);

        if (trueRoot) {
            const rootId = String(trueRoot.id!);
            const rootVariants: string[] = ((trueRoot as any).variants || []).map(String);
            return [rootId, ...rootVariants];
        }

        return [itemId];
    };

    const handleOpenEditDrawer = (item: Item) => {
        setSelectedItemForEdit(item);
        setIsDrawerOpen(true);
    };

    const handleOpenDetailDrawer = (item: Item) => {
        setSelectedItemForDetails(item);
        setVariantGroupIds(resolveVariantGroup(item));
        setIsDetailDrawerOpen(true);
    };

    const handleTogglePin = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!companyId) return;
        setPinnedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            localStorage.setItem(`pinned_items_${companyId}`, JSON.stringify([...next]));

            const settingsRef = doc(db, 'companies', companyId, 'settings', 'pinned_items');
            setDoc(settingsRef, { ids: [...next] }, { merge: true });
            return next;
        });
    };

    const handleToggleListed = async (itemId: string, newState: boolean) => {
        if (!dbOperations) return;
        try {
            await dbOperations.updateItem(itemId, { isListed: newState });
            const updatedItem = allItems.find(i => i.id === itemId);

            if (updatedItem && companyId) {
                const isNowInStock = (updatedItem.stock || 0) > 0;
                await syncNotifyStock(companyId, updatedItem.id!, isNowInStock);
            }
            setAllItems(prev => prev.map(item => item.id === itemId ? { ...item, isListed: newState } as Item : item));
        } catch (err) {
            console.error("Failed to update listed status:", err);
        }
    };

    if (authLoading || (pageIsLoading && allItems.length === 0)) {
        return <div className="flex items-center justify-center h-screen bg-[#E9F0F7]"><Spinner /></div>;
    }

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative">
            <header className="sticky top-0 z-[100] bg-white border-b border-gray-100 shadow-sm w-full">
                <div className="max-w-7xl mx-auto px-4 h-[68px] relative flex items-center justify-between">

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER}`)}
                            className="p-2 rounded-sm hover:bg-slate-200 transition-colors text-slate-700"
                            title="Back"
                        >
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

                        <span
                            className={`hidden md:inline-block transition-all duration-300 ease-out transform ${isScrolled
                                ? "opacity-100 translate-x-0"
                                : "opacity-0 -translate-x-4"
                                } text-[10px] md:text-xs font-semibold text-gray-500 uppercase whitespace-nowrap`}
                        >
                            {companyName}
                        </span>
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                        <span
                            className={`absolute transition-all duration-300 ease-out will-change-transform transform ${isScrolled
                                ? "-translate-y-6 opacity-0 scale-95"
                                : "translate-y-0 opacity-100 scale-100"
                                } text-lg font-black text-[#1A3B5D] uppercase tracking-tighter whitespace-nowrap`}
                        >
                            {companyName}
                        </span>

                        <span
                            className={`absolute transition-all duration-300 ease-out will-change-transform transform ${isScrolled
                                ? "translate-y-0 opacity-100 scale-100"
                                : "translate-y-6 opacity-0 scale-95"
                                } text-lg font-black text-[#F97316] uppercase tracking-tighter whitespace-nowrap`}
                        >
                            {currentCategoryName}
                        </span>

                        {isScrolled && (
                            <span className="md:hidden text-[12px] font-semibold text-gray-500 uppercase tracking-wide mt-10">
                                {companyName}
                            </span>
                        )}
                    </div>

                    <div className="w-10"></div>
                </div>
            </header>

            <main className="p-3 md:p-6 space-y-3 flex-1 max-w-7xl mx-auto w-full pb-24">
                <div
                    className={`flex items-center justify-center transition-all duration-300 ease-out ${isScrolled
                        ? "opacity-0 -translate-y-6 h-0 overflow-hidden"
                        : "opacity-100 translate-y-0"
                        }`}
                >
                    <h1 className="text-sm md:text-xl font-extrabold text-[#F97316] uppercase tracking-tighter">
                        {currentCategoryName}
                    </h1>
                </div>

                <div
                    className={`flex justify-center transition-all duration-300 ${isScrolled
                        ? "sticky top-[70px] z-50 "
                        : "relative"
                        }`}
                >
                    <div className="relative group md:max-w-md md:mx-auto w-full">
                        <SearchableItemInput
                            items={allItems}
                            placeholder="Search products..."
                            itemGroupMap={itemGroupMap}
                            onItemSelected={(item) => {
                                if (!item.id) return;
                                const group = allItemGroups.find(g => g.id === item.itemGroupId);
                                const uncategorizedGroup = allItemGroups.find(g => g.name.toLowerCase().trim() === "uncategorized");
                                const slug = group
                                    ? generateSlug(group.name)
                                    : uncategorizedGroup
                                        ? generateSlug(uncategorizedGroup.name)
                                        : "uncategorized";
                                navigate(`/catalogue-home/my-shop/${slug}`, {
                                    state: { highlightItemId: item.id, isUnlisted: !item.isListed }
                                });
                            }}
                        />
                    </div>
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
                                {['A-Z', 'Z-A', 'Price: Low-High', 'Price: High-Low'].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => { setSortOrder(opt as any); setIsSortOpen(false); }}
                                        className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 border-t border-gray-50 first:border-0 ${sortOrder === opt ? 'text-[#F97316]' : 'text-[#1A3B5D]'}`}
                                    >
                                        {opt.replace(':', ': ')}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <div>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                            Live All Items
                        </span>

                        <button
                            onClick={handleToggleAllLive}
                            className={`w-11 h-4 flex items-center rounded-sm p-1 transition-all duration-300 ${isAllLive ? 'bg-[#F97316]' : 'bg-gray-300'}`}
                        >
                            <div
                                className={`bg-white w-3 h-3 rounded-sm shadow-md transform transition-all duration-300 ${isAllLive ? 'translate-x-6' : 'translate-x-0'
                                    }`}
                            />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                    {itemsToDisplay.map((item) => {
                        const { mrp, salePrice, discountPercent, hasDiscount, hasBothPrices } = getEffectivePriceInfo(item);
                        const multiplier = (item as any).unitMultiplier || 1;
                        const showDiscountBadge = catalogueSettings?.showDiscountBadge && hasDiscount;

                        return (
                            <div
                                id={item.id}
                                key={item.id}
                                onClick={() => handleOpenDetailDrawer(item)}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border flex flex-col h-full transition-all duration-300 relative group hover:shadow-md cursor-pointer ${highlightedId === item.id ? 'ring-3 ring-[#F97316] shadow-lg scale-[1.02]' : pinnedIds.has(item.id!) ? 'ring-1 ring-[#F97316] shadow-lg border-[#F97316]' : 'border-gray-100'}`}>
                                <div className="aspect-square flex items-center justify-center relative overflow-hidden">
                                    {pinnedIds.has(item.id!) && (
                                        <div className="absolute top-1.5 right-1.5 z-10 bg-white text-[#F97316] rounded-sm px-1 py-1 flex items-center gap-0.5 shadow-md">
                                            <Pin size={12} className="fill-[#F97316]" />
                                        </div>
                                    )}

                                    {showDiscountBadge && (
                                        <div
                                            className={`absolute top-2 ${pinnedIds.has(item.id!) ? "right-8" : "right-2"
                                                } bg-[#F97316] text-white px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-tight shadow-md`}
                                        >
                                            {discountPercent}% OFF
                                        </div>
                                    )}
                                    <div className="absolute top-2 left-2 text-white rounded-sm text-[10px] font-black uppercase tracking-tight shadow-md">
                                        <StockIndicator stock={item.stock || 0} />
                                    </div>
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.name} className="object-contain w-full h-full transition-transform duration-500 group-hover:scale-110" />
                                    ) : (
                                        <FiPackage className="w-10 h-10 text-gray-200" />
                                    )}
                                </div>

                                <div className="p-3 flex flex-col flex-1">
                                    <div className="flex items-start justify-between mb-1">
                                        <h3 className="text-[14px] font-bold text-[#1A3B5D] uppercase leading-tight break-words overflow-hidden max-h-[2.5em]">
                                            {item.name}
                                        </h3>

                                        {!isUncategorized && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => handleTogglePin(e, item.id!)}
                                                    className={`p-1 rounded-sm transition-all ${pinnedIds.has(item.id!)
                                                        ? 'bg-[#F97316]/10 text-[#F97316]'
                                                        : 'bg-gray-100 text-gray-400 hover:bg-[#F97316] hover:text-white'
                                                        }`}
                                                    title={pinnedIds.has(item.id!) ? 'Unpin' : 'Pin to top'}
                                                >
                                                    <Pin size={12} className={pinnedIds.has(item.id!) ? 'fill-[#F97316]' : ''} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleShareItem(item);
                                                    }}
                                                    className="p-1 rounded-sm bg-[#F97316]/10 text-[#F97316] hover:bg-[#F97316] hover:text-white transition-all"
                                                    title="Share Product"
                                                >
                                                    <Send size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2 w-full min-w-0">
                                            {hasBothPrices ? (
                                                <div className="flex flex-wrap items-center gap-x-1 leading-tight min-w-0">
                                                    <p className="text-[14px] font-bold text-gray-400 line-through whitespace-nowrap shrink-0">
                                                        ₹{mrp}
                                                    </p>
                                                    <p className="text-[14px] font-black text-[#F97316] whitespace-nowrap shrink-0">
                                                        ₹{salePrice}
                                                    </p>
                                                    <span className="text-[11px] text-gray-600 font-semibold whitespace-nowrap">
                                                        ({multiplier} pcs)
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 flex-nowrap overflow-hidden min-w-0">
                                                    <p className="text-[14px] font-black text-[#F97316] whitespace-nowrap truncate max-w-[70%]">
                                                        ₹{salePrice}
                                                    </p>
                                                    <span className="text-[12px] text-gray-600 font-semibold whitespace-nowrap shrink-0">
                                                        ({multiplier} pcs)
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-auto flex gap-1">
                                        {isUncategorized ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenEditDrawer(item);
                                                }}
                                                className="w-full bg-gray-200 text-[#1A3B5D] py-1.5 rounded-sm text-[12px] font-black uppercase border border-gray-100"
                                            >
                                                Edit
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenEditDrawer(item);
                                                    }}
                                                    className="flex-1 bg-gray-200 text-[#1A3B5D] py-1.5 rounded-sm text-[12px] font-black uppercase border border-gray-100"
                                                >
                                                    Edit
                                                </button>

                                                <QuickListedToggle
                                                    itemId={item.id!}
                                                    isListed={item.isListed ?? false}
                                                    onToggle={async (itemId, newState) => {
                                                        if (isUncategorized && newState === true) {
                                                            setShowUncategorizedWarning(true);
                                                            return;
                                                        }
                                                        await handleToggleListed(itemId, newState);
                                                    }}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {hasMoreItems && <div ref={loadMoreRef} className="h-20 flex justify-center items-center"><Spinner /></div>}
            </main>

            {isCartOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
                    <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h2 className="text-sm font-black text-[#1A3B5D] uppercase tracking-wider">Your Cart ({cartCount})</h2>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-sm transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {cart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                    <ShoppingCart size={48} strokeWidth={1} />
                                    <p className="text-xs font-bold uppercase tracking-widest">Cart is empty</p>
                                </div>
                            ) : (
                                cart.map(({ item, quantity }) => (
                                    <div key={item.id} className="flex gap-4 bg-gray-50 p-3 rounded-sm border border-gray-100">
                                        <div className="w-16 h-16 bg-white rounded-sm overflow-hidden border border-gray-100 flex-shrink-0">
                                            {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <FiPackage className="w-full h-full p-4 text-gray-200" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[10px] font-black text-[#F97316] uppercase truncate">{item.name}</h4>
                                            <p className="text-xs font-black text-[#1A3B5D]">
                                                ₹{getEffectivePriceInfo(item).salePrice}
                                                {getEffectivePriceInfo(item).hasBothPrices && (
                                                    <span className="text-[10px] text-gray-400 line-through ml-1.5">
                                                        ₹{getEffectivePriceInfo(item).mrp}
                                                    </span>
                                                )}
                                            </p>
                                            <div className="flex items-center gap-3 mt-2">
                                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-sm px-2 py-1">
                                                    <button onClick={() => updateQuantity(item.id!, -1)} className="text-gray-400 hover:text-[#F97316]"><Minus size={14} /></button>
                                                    <span className="text-xs font-black w-4 text-center">{quantity}</span>
                                                    <button onClick={() => updateQuantity(item.id!, 1)} className="text-gray-400 hover:text-[#F97316]"><Plus size={14} /></button>
                                                </div>
                                                <button onClick={() => removeFromCart(item.id!)} className="text-red-400 hover:text-red-600 ml-auto"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {cart.length > 0 && (
                            <div className="p-4 border-t bg-gray-50 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-gray-400 uppercase">Subtotal</span>
                                    <span className="text-lg font-black text-[#1A3B5D]">₹{cartTotal}</span>
                                </div>
                                <button className="w-full bg-[#F97316] text-white py-4 rounded-sm font-black text-xs uppercase tracking-widest shadow-lg shadow-[#F97316]/20 active:scale-[0.98] transition-all">
                                    Checkout Now
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ItemEditDrawer
                item={selectedItemForEdit}
                isOpen={isDrawerOpen}
                onClose={() => {
                    setIsDrawerOpen(false);
                    setSelectedItemForEdit(null);
                }}
                onSaveSuccess={async (updated) => {
                    setAllItems(prev =>
                        prev.map(i =>
                            i.id === selectedItemForEdit?.id
                                ? {
                                    ...i,
                                    ...updated,
                                    stock: updated.stock !== undefined ? Number(updated.stock) : i.stock,
                                    moq: updated.moq ?? i.moq ?? 1
                                }
                                : i
                        )
                    );

                    if (companyId && selectedItemForEdit) {
                        const newStock = updated.stock !== undefined ? Number(updated.stock) : (selectedItemForEdit.stock ?? 0);
                        const isNowInStock = newStock > 0;
                        await syncNotifyStock(companyId, selectedItemForEdit.id!, isNowInStock);
                    }
                }}
            />

            {showUncategorizedWarning && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setShowUncategorizedWarning(false)}
                    />
                    <div className="relative bg-white w-[90%] max-w-sm rounded-lg shadow-xl p-5 z-10 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-sm font-black text-red-500 uppercase mb-2">
                            Warning
                        </h2>
                        <p className="text-sm font-bold text-gray-600 mb-4">
                            Please categorize the item first. You can only make it LIVE after assigning a category.
                        </p>
                        <button
                            onClick={() => setShowUncategorizedWarning(false)}
                            className="w-full bg-[#F97316] text-white py-2 rounded-sm text-xs font-black uppercase"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {showConfirmPopup && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setShowConfirmPopup(false)}
                    />
                    <div className="relative bg-white w-[90%] max-w-sm rounded-lg shadow-xl p-5 z-10 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-sm font-black text-[#1A3B5D] uppercase mb-2">
                            Confirmation
                        </h2>
                        <p className="text-lg font-bold text-gray-600 mb-4">
                            Do you want to make all items {pendingLiveState ? "LIVE" : "UNLIVE"}?
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={confirmToggleAllLive}
                                className="flex-1 bg-green-500 text-white py-2 rounded-sm text-xs font-black uppercase"
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => setShowConfirmPopup(false)}
                                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-sm text-xs font-black uppercase"
                            >
                                No
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ItemDetailDrawer
                catalogueSettings={catalogueSettings}
                item={selectedItemForDetails}
                isOpen={isDetailDrawerOpen}
                onClose={() => { setIsDetailDrawerOpen(false); setSelectedItemForDetails(null); }}
                onAddToCart={addToCart}
                initialQuantity={cart.find(i => i.item.id === selectedItemForDetails?.id)?.quantity || 0}
                onUpdateQuantity={updateQuantity}
                companyId={companyId}
                variantGroupIds={variantGroupIds}
                onVariantSelect={(variantItem) => {
                    setSelectedItemForDetails(variantItem as Item);
                    setVariantGroupIds(resolveVariantGroup(variantItem as Item));
                }}
            />

            <Footer
                companyName={companyName}
                instagram={socialLinks.instagram}
                facebook={socialLinks.facebook}
                twitter={socialLinks.twitter}
                gmail={socialLinks.gmail}
            />
        </div>
    );
};

export default MyShop;