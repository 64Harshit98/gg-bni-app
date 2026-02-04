import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShoppingCart, Edit3, Minus, Plus, ChevronLeft } from 'lucide-react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { FiStar, FiCheckSquare, FiLoader, FiPackage, FiPlus } from 'react-icons/fi';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { Spinner } from '../constants/Spinner';
import { useParams, useNavigate } from 'react-router-dom';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SearchBar from './SearchBar';
import { serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';

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
            className={`flex-1 py-1.5 rounded-sm text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${isListed ? 'bg-green-500 text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}
        >
            {isLoading ? <FiLoader className="animate-spin" size={10} /> : isListed ? <FiCheckSquare size={10} /> : <FiStar size={10} />}
            {isListed ? 'Listed' : 'List'}
        </button>
    );
};

const ITEMS_PER_BATCH_RENDER = 24;

const SharedProduct: React.FC = () => {
    const navigate = useNavigate();
    // FIX: companyId extraction moved before its usage
    const { companyId, groupId } = useParams<{ companyId: string, groupId: string }>();
    const { businessName: companyName } = useBusinessName(companyId);

    const { currentUser, loading: authLoading } = useAuth();
    const dbOperations = useDatabase();
    const [isViewMode, _setIsViewMode] = useState(true);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [itemsToRenderCount, setItemsToRenderCount] = useState(ITEMS_PER_BATCH_RENDER);

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [selectedItemForDetails, setSelectedItemForDetails] = useState<Item | null>(null);

    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A' | 'Price: Low-High' | 'Price: High-Low'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);

    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);

    // --- New Firebase Sync Function ---
    const syncToUpcoming = async (updatedCart: { item: Item; quantity: number }[]) => {
        if (!companyId || !currentUser?.uid) return;

        try {
            const userUid = currentUser.uid;
            const loginName = currentUser?.name || "Guest User";
            const orderDocId = `CART-${userUid}`;
            const orderDocRef = doc(db, 'companies', companyId, 'Orders', orderDocId);

            const itemsForFirebase = updatedCart.map(c => ({
                id: String(c.item.id),
                name: c.item.name,
                quantity: c.quantity,
                mrp: (c.item as any).mrp || (c.item as any).rate || (c.item as any).price || 0
            }));

            if (itemsForFirebase.length === 0) return;

            await setDoc(orderDocRef, {
                orderId: `UPC-${userUid.substring(userUid.length - 4).toUpperCase()}`,
                userName: loginName,
                status: 'Upcoming',
                totalAmount: itemsForFirebase.reduce((acc, curr) => acc + (Number(curr.mrp) * curr.quantity), 0),
                paidAmount: 0,
                createdAt: serverTimestamp(),
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                items: itemsForFirebase,
                userId: userUid
            }, { merge: true });
        } catch (err) {
            console.error("Sync Error:", err);
        }
    };

    const addToCart = useCallback((item: Item, quantity: number = 1, isFromDrawer: boolean = false) => {
        setCart(prev => {
            const existing = prev.find(i => i.item.id === item.id);
            let newCart;
            if (existing) {
                const newQuantity = isFromDrawer ? quantity : existing.quantity + 1;
                newCart = prev.map(i => i.item.id === item.id ? { ...i, quantity: newQuantity } : i);
            } else {
                newCart = [...prev, { item, quantity }];
            }
            localStorage.setItem('temp_cart', JSON.stringify(newCart));

            syncToUpcoming(newCart); // <-- Ye line add hui hai
            return newCart;
        });
    }, [companyId, currentUser]);

    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => {
            const newCart = prev.map(i => {
                if (i.item.id === itemId) {
                    const newQty = Math.max(0, i.quantity + delta);
                    return { ...i, quantity: newQty };
                }
                return i;
            }).filter(i => i.quantity > 0);

            localStorage.setItem('temp_cart', JSON.stringify(newCart));

            syncToUpcoming(newCart); // <-- Ye line add hui hai
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
                setAllItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);
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
            const matchesGroup = item.itemGroupId === groupId;
            if (isViewMode && !item.isListed) return false;
            return matchesGroup && item.name.toLowerCase().includes(searchQuery.toLowerCase());
        });

        return [...result].sort((a, b) => {
            if (sortOrder === 'A-Z') return a.name.localeCompare(b.name);
            if (sortOrder === 'Z-A') return b.name.localeCompare(a.name);
            if (sortOrder === 'Price: Low-High') return (a.mrp || 0) - (b.mrp || 0);
            if (sortOrder === 'Price: High-Low') return (b.mrp || 0) - (a.mrp || 0);
            return 0;
        });
    }, [allItems, searchQuery, isViewMode, sortOrder, groupId]);

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
        if (savedCart) setCart(JSON.parse(savedCart));
    }, []);

    const handleOpenEditDrawer = (item: Item) => {
        setSelectedItemForEdit(item);
        setIsDrawerOpen(true);
    };

    const handleOpenDetailDrawer = (item: Item) => {
        setSelectedItemForDetails(item);
        setIsDetailDrawerOpen(true);
    };

    const handleToggleListed = async (itemId: string, newState: boolean) => {
        if (!dbOperations) return;
        try {
            await dbOperations.updateItem(itemId, { isListed: newState });
            setAllItems(prev => prev.map(item => item.id === itemId ? { ...item, isListed: newState } as Item : item));
        } catch (err) {
            console.error("Failed to update listed status:", err);
        }
    };

    if (authLoading || (pageIsLoading && allItems.length === 0)) {
        return <div className="flex items-center justify-center h-screen bg-[#E9F0F7]"><Spinner /></div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-screen bg-[#E9F0F7] text-red-500">{error}</div>;
    }

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative overflow-x-hidden">
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
                        setSearchQuery={setSearchQuery}
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
                        return (
                            <div key={item.id} onClick={() => isViewMode ? handleOpenDetailDrawer(item) : handleOpenEditDrawer(item)} className={`bg-white rounded-sm overflow-hidden shadow-sm border border-gray-100 flex flex-col transition-all duration-300 relative group hover:shadow-md cursor-pointer ${!isViewMode ? 'ring-1 ring-[#00A3E1]/10' : ''}`}>
                                <div className="aspect-square bg-[#F8FAFC] flex items-center justify-center relative overflow-hidden">
                                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110" /> : <FiPackage className="w-10 h-10 text-gray-200" />}
                                    {!isViewMode && <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm p-1.5 rounded-sm shadow-sm"><Edit3 size={10} className="text-[#00A3E1]" /></div>}
                                </div>
                                <div className="p-3 flex flex-col flex-1">
                                    <h3 className="text-[10px] font-black text-[#1A3B5D] mb-1 truncate uppercase leading-tight">{item.name}</h3>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-black text-[#00A3E1]">₹{item.mrp}</p>
                                    </div>
                                    <div className="mt-auto flex gap-1">
                                        {isViewMode ? (
                                            cartItem ? (
                                                <div className="w-full flex items-center justify-between bg-gray-50 rounded-sm px-1 py-1 border border-gray-100">
                                                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id!, -1); }} className="p-1.5 bg-white shadow-sm text-[#00A3E1] hover:bg-[#00A3E1] hover:text-white rounded-sm transition-all"><Minus size={12} strokeWidth={3} /></button>
                                                    <span className="text-xs font-black text-[#1A3B5D]">{cartItem.quantity}</span>
                                                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id!, 1); }} className="p-1.5 bg-white shadow-sm text-[#00A3E1] hover:bg-[#00A3E1] hover:text-white rounded-sm transition-all"><Plus size={12} strokeWidth={3} /></button>
                                                </div>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); addToCart(item); }} className="w-full bg-[#00A3E1] text-white py-2 rounded-xs text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2">
                                                    <Plus size={12} /> Add to Cart
                                                </button>
                                            )
                                        ) : (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); handleOpenEditDrawer(item); }} className="flex-1 bg-gray-50 text-[#1A3B5D] py-1.5 rounded-sm text-[9px] font-black uppercase border border-gray-100">Edit</button>
                                                <QuickListedToggle itemId={item.id!} isListed={item.isListed ?? false} onToggle={handleToggleListed} />
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

            <Footer companyName={companyName} />

            <ItemEditDrawer
                item={selectedItemForEdit}
                isOpen={isDrawerOpen}
                onClose={() => { setIsDrawerOpen(false); setSelectedItemForEdit(null); }}
                onSaveSuccess={(updated) => setAllItems(prev => prev.map(i => i.id === selectedItemForEdit?.id ? { ...i, ...updated } as Item : i))}
            />

            <ItemDetailDrawer
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