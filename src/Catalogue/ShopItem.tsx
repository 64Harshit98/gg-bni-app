import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Download, Loader2, Package } from 'lucide-react';
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting';
import { ROUTES } from '../constants/routes.constants';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { Spinner } from '../constants/Spinner';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import { syncNotifyStock } from "../../src/Catalogue/utils/syncNotifyStock";
import SearchableItemInput from '../UseComponents/SearchIteminput';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from './enum/cata_permissions.enum';
import { cn } from '../lib/utils';
import { Badge, EmptyState, ConfirmDialog } from '../Components/ui';
import {
  fetchPinnedItemIds,
  savePinnedItemIds,
  fetchCompanySubdomain,
  fetchBusinessSocialLinks,
  fetchCatalogueSalesSettings,
  subscribeToShopItems,
  type ShopSocialLinks,
} from '../services/catalogue/shopItem.service';
import { ShopHeader } from './components/ShopItem/ShopHeader';
import { ProductCard } from './components/ShopItem/ProductCard';
import { CartDrawer } from './components/ShopItem/CartDrawer';
import { SortDropdown, type ShopSortOrder } from './components/ShopItem/SortDropdown';
import { getEffectivePriceInfo, downloadCataloguePdf } from './components/ShopItem/pdfExport';
import {
  generateSlug,
  resolveGroupId,
  getCurrentCategoryName,
  buildItemGroupMap,
  filterAndSortShopItems,
  resolveVariantGroup,
} from './components/ShopItem/shopItemHelpers';

const ITEMS_PER_BATCH_RENDER = 24;

const MyShop: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const highlightItemId = location.state?.highlightItemId;
    const highlightTrigger = location.state?.trigger;
    const { groupId } = useParams<{ groupId: string }>();
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const { businessName: companyName } = useBusinessName(companyId);
    const dbOperations = useDatabase();

    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(groupId || 'All');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [, setError] = useState<string | null>(null);
    const [itemsToRenderCount, setItemsToRenderCount] = useState(ITEMS_PER_BATCH_RENDER);
    const [socialLinks, setSocialLinks] = useState<ShopSocialLinks>({});
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [selectedItemForDetails, setSelectedItemForDetails] = useState<Item | null>(null);
    const [variantGroupIds, setVariantGroupIds] = useState<string[]>([]);
    const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSalesSettings | null>(null);

    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    const [sortOrder, setSortOrder] = useState<ShopSortOrder>('A-Z');
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
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        if (!companyId) return;

        const loadPins = async () => {
            try {
                const ids = await fetchPinnedItemIds(companyId);
                if (ids !== null) {
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

    const resolvedGroupId = useMemo(
        () => resolveGroupId(groupId, allItemGroups),
        [groupId, allItemGroups]
    );

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

        // ADDED &cId=${companyId} to the base URL
        let shareUrl = `${window.location.origin}/${companyId}/${categorySlug}?product=${itemSlug}&itemId=${item.id}&cId=${companyId}`;

        try {
            const subdomain = await fetchCompanySubdomain(companyId);

            if (subdomain) {
                // ADDED &cId=${companyId} to the subdomain URL
                shareUrl = `https://${subdomain}.sellar.in/${categorySlug}?product=${itemSlug}&itemId=${item.id}&cId=${companyId}`;
            }
        } catch (error) {
            console.error("Error fetching subdomain for sharing:", error);
        }

        try {
            const shareText = `Check out ${item.name} from ${companyName}`;

            if (navigator.share) {
                await navigator.share({
                    title: item.name,
                    text: shareText,
                    url: shareUrl,
                });
            } else {
                await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                alert("Product link copied to clipboard!");
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
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

    const handleDownloadPDF = async () => {
        // 1. Filter out unlisted items immediately
        const liveItemsToPrint = filteredItems.filter(item => item.isListed === true);

        // 2. Prevent empty PDF generation
        if (liveItemsToPrint.length === 0) {
            alert("There are no LIVE items in this category to generate a PDF.");
            return;
        }

        setIsGeneratingPDF(true);

        try {
            await downloadCataloguePdf(liveItemsToPrint, companyName, currentCategoryName);
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF. Check console for details.");
        } finally {
            setIsGeneratingPDF(false);
        }
    };
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

    const currentCategoryName = useMemo(
        () => getCurrentCategoryName(resolvedGroupId, allItemGroups),
        [allItemGroups, resolvedGroupId]
    );

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

                const businessSocialLinks = await fetchBusinessSocialLinks(companyId);
                if (businessSocialLinks) setSocialLinks(businessSocialLinks);

                const salesSettings = await fetchCatalogueSalesSettings(companyId);
                if (salesSettings) setCatalogueSettings(salesSettings);

                unsubscribeItems = subscribeToShopItems(
                    companyId,
                    (liveItemsList) => {
                        setAllItems(liveItemsList);

                        if (liveItemsList.length > 0) {
                            setIsAllLive(liveItemsList.every(item => item.isListed === true));
                        }

                        setPageIsLoading(false);
                    },
                    (err) => {
                        console.error("Live items sync failed:", err);
                        setError("Real-time inventory synchronization lost.");
                        setPageIsLoading(false);
                    }
                );

            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load initial data.");
                setPageIsLoading(false);
            }
        };

        setupLiveSync();

        return () => unsubscribeItems();
    }, [authLoading, currentUser, dbOperations, companyId]);

    const itemGroupMap = useMemo(
        () => buildItemGroupMap(allItemGroups),
        [allItemGroups]
    );

    const filteredItems = useMemo(() => filterAndSortShopItems({
        allItems,
        allItemGroups,
        activeCategory: resolvedGroupId || selectedCategory,
        searchQuery,
        isViewMode,
        sortOrder,
        pinnedIds,
    }), [
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

    const handleOpenEditDrawer = (item: Item) => {
        setSelectedItemForEdit(item);
        setIsDrawerOpen(true);
    };

    const handleOpenDetailDrawer = (item: Item) => {
        setSelectedItemForDetails(item);
        setVariantGroupIds(resolveVariantGroup(item, allItems));
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
            savePinnedItemIds(companyId, [...next]);
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

    const handleQuickToggleListed = async (itemId: string, newState: boolean) => {
        if (isUncategorized && newState === true) {
            setShowUncategorizedWarning(true);
            return;
        }
        await handleToggleListed(itemId, newState);
    };

    if (authLoading || (pageIsLoading && allItems.length === 0)) {
        return <div className="flex items-center justify-center h-screen bg-background"><Spinner /></div>;
    }

    return (
        <div className="aurora relative flex min-h-screen flex-col bg-background font-sans text-foreground">
            <ShopHeader
                companyName={companyName}
                categoryName={currentCategoryName}
                isScrolled={isScrolled}
                onBack={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER}`)}
            />

            <main className="p-3 md:p-6 space-y-3 flex-1 max-w-7xl mx-auto w-full pb-24">
                <div
                    className={cn(
                        'relative w-full flex items-center justify-center transition-all duration-300 ease-out',
                        isScrolled ? 'opacity-0 -translate-y-6 h-0 overflow-hidden' : 'opacity-100 translate-y-0',
                    )}
                >
                    <h1 className="text-sm md:text-xl font-extrabold uppercase tracking-tighter text-gradient">
                        {currentCategoryName}
                    </h1>
                    <button
                        onClick={handleDownloadPDF}
                        disabled={filteredItems.length === 0 || isGeneratingPDF}
                        className="absolute right-0 flex items-center gap-1.5 bg-card border border-border px-3 py-1.5 rounded-md shadow-xs active:scale-95 transition-all text-foreground hover:text-primary disabled:opacity-50"
                        title="Download PDF Catalogue"
                    >
                        {isGeneratingPDF ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        <span className="text-[10px] font-black uppercase hidden sm:inline">
                            {isGeneratingPDF ? 'Generating...' : 'PDF'}
                        </span>
                    </button>
                </div>

                <div
                    className={cn(
                        'flex justify-center transition-all duration-300',
                        isScrolled ? 'sticky top-[70px] z-50' : 'relative',
                    )}
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
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Products:</span>
                        <Badge variant="info">{filteredItems.length}</Badge>
                    </div>

                    <SortDropdown
                        sortOrder={sortOrder}
                        isOpen={isSortOpen}
                        onToggleOpen={() => setIsSortOpen(!isSortOpen)}
                        onSelect={(opt) => { setSortOrder(opt); setIsSortOpen(false); }}
                    />
                </div>
                <ShowWrapper requiredPermission={Cata_Permissions.ViewEditButton}>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xs">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                            Live All Items
                        </span>

                        <button
                            onClick={handleToggleAllLive}
                            className={cn(
                                'w-11 h-4 flex items-center rounded-full p-1 transition-all duration-300',
                                isAllLive ? 'bg-primary' : 'bg-muted',
                            )}
                        >
                            <div
                                className={cn(
                                    'bg-card w-3 h-3 rounded-full shadow-md transform transition-all duration-300',
                                    isAllLive ? 'translate-x-6' : 'translate-x-0',
                                )}
                            />
                        </button>
                    </div>
                </ShowWrapper>

                {itemsToDisplay.length === 0 ? (
                    <EmptyState
                        icon={<Package />}
                        title="No products found"
                        description={searchQuery ? 'No products match your search.' : 'There are no products in this category yet.'}
                    />
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {itemsToDisplay.map((item) => (
                            <ProductCard
                                key={item.id}
                                item={item}
                                isUncategorized={isUncategorized}
                                isHighlighted={highlightedId === item.id}
                                isPinned={pinnedIds.has(item.id!)}
                                showDiscountBadgeSetting={!!catalogueSettings?.showDiscountBadge}
                                onOpenDetail={handleOpenDetailDrawer}
                                onTogglePin={handleTogglePin}
                                onShare={handleShareItem}
                                onOpenEdit={handleOpenEditDrawer}
                                onToggleListed={handleQuickToggleListed}
                            />
                        ))}
                    </div>
                )}

                {hasMoreItems && <div ref={loadMoreRef} className="h-20 flex justify-center items-center"><Spinner /></div>}
            </main>

            <CartDrawer
                isOpen={isCartOpen}
                cart={cart}
                cartCount={cartCount}
                cartTotal={cartTotal}
                onClose={() => setIsCartOpen(false)}
                onUpdateQuantity={updateQuantity}
                onRemoveFromCart={removeFromCart}
            />

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
                itemGroupRoute={`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`}
            />

            <ConfirmDialog
                open={showUncategorizedWarning}
                onOpenChange={setShowUncategorizedWarning}
                title="Warning"
                description="Please categorize the item first. You can only make it LIVE after assigning a category."
                confirmLabel="Got it"
                cancelLabel="Close"
                onConfirm={() => setShowUncategorizedWarning(false)}
            />

            <ConfirmDialog
                open={showConfirmPopup}
                onOpenChange={setShowConfirmPopup}
                title="Confirmation"
                description={`Do you want to make all items ${pendingLiveState ? "LIVE" : "UNLIVE"}?`}
                confirmLabel="Yes"
                cancelLabel="No"
                onConfirm={confirmToggleAllLive}
            />

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
                    setVariantGroupIds(resolveVariantGroup(variantItem as Item, allItems));
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
