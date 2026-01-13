import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, ShoppingCart, Edit3, Home, FileText, UserRound, X, Minus, Plus, Trash2 } from 'lucide-react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { FiStar, FiCheckSquare, FiLoader, FiPackage, FiPlus } from 'react-icons/fi';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { Spinner } from '../constants/Spinner';

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
            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${isListed ? 'bg-green-500 text-white shadow-sm' : 'bg-gray-100 text-gray-400'
                }`}
        >
            {isLoading ? <FiLoader className="animate-spin" size={10} /> : isListed ? <FiCheckSquare size={10} /> : <FiStar size={10} />}
            {isListed ? 'Listed' : 'List'}
        </button>
    );
};

const ITEMS_PER_BATCH_RENDER = 24;

const SharedProduct: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const dbOperations = useDatabase();
    const [isViewMode, setIsViewMode] = useState(true);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [_allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);
    const [selectedCategory] = useState('All');
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
    const [isCartOpen, setIsCartOpen] = useState(false);

    const addToCart = useCallback((item: Item, quantity: number = 1, isFromDrawer: boolean = false) => {
        setCart(prev => {
            const existing = prev.find(i => i.item.id === item.id);
            if (existing) {
                const newQuantity = isFromDrawer ? quantity : existing.quantity + 1;
                return prev.map(i => i.item.id === item.id ? { ...i, quantity: newQuantity } : i);
            }
            return [...prev, { item, quantity }];
        });
    }, []);

    const removeFromCart = (itemId: string) => {
        setCart(prev => prev.filter(i => i.item.id !== itemId));
    };

    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => prev.map(i => {
            if (i.item.id === itemId) {
                const newQty = Math.max(0, i.quantity + delta);
                return { ...i, quantity: newQty };
            }
            return i;
        }).filter(i => i.quantity > 0));
    };

    const cartTotal = useMemo(() => cart.reduce((acc, curr) => acc + (curr.item.mrp || 0) * curr.quantity, 0), [cart]);
    const cartCount = useMemo(() => cart.reduce((acc, curr) => acc + curr.quantity, 0), [cart]);

    useEffect(() => {
        if (authLoading || !currentUser || !dbOperations) {
            if (!authLoading && (!currentUser || !dbOperations)) setPageIsLoading(false);
            return;
        }
        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                setError(null);
                const [fetchedItemGroups, fetchedItems] = await Promise.all([
                    dbOperations.getItemGroups(),
                    dbOperations.getItems()
                ]);
                setAllItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Failed to load initial data.');
            } finally {
                setPageIsLoading(false);
            }
        };
        fetchData();
    }, [authLoading, currentUser, dbOperations]);

    const filteredItems = useMemo(() => {
        const result = allItems.filter(item => {
            if (isViewMode && !item.isListed) return false;
            const matchesCategory = selectedCategory === 'All' || item.itemGroupId === selectedCategory;
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || (item.barcode && item.barcode.includes(searchQuery));
            return matchesCategory && matchesSearch;
        });

        return [...result].sort((a, b) => {
            if (sortOrder === 'A-Z') return a.name.localeCompare(b.name);
            if (sortOrder === 'Z-A') return b.name.localeCompare(a.name);
            if (sortOrder === 'Price: Low-High') return (a.mrp || 0) - (b.mrp || 0);
            if (sortOrder === 'Price: High-Low') return (b.mrp || 0) - (a.mrp || 0);
            return 0;
        });
    }, [allItems, selectedCategory, searchQuery, isViewMode, sortOrder]);

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
                <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1 h-5 bg-[#00A3E1] rounded-full"></div>
                            <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                                MyShop<span className="text-[#00A3E1]">.</span>
                            </h1>
                        </div>

                        <button
                            onClick={() => setIsCartOpen(true)}
                            className="flex items-center justify-center gap-2 bg-[#00A3E1] text-white py-2 px-4 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all relative"
                        >
                            <ShoppingCart size={14} />
                            <span>Cart</span>
                            {cartCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                                    {cartCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            <main className="p-3 md:p-6 space-y-4 flex-1 max-w-7xl mx-auto w-full pb-24">
                <div className='flex items-center justify-center'>
                    <h1 className="text-xs md:text-sm font-black text-[#00A3E1] uppercase tracking-tighter">
                        Catalogue Name
                    </h1>
                </div>
                <div className="relative group md:max-w-md md:mx-auto w-full">

                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                        type="text"
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-gray-100 rounded-xl py-2.5 pl-10 pr-4 text-xs outline-none shadow-sm focus:ring-1 focus:ring-[#00A3E1]/20 transition-all"
                    />
                </div>

                <div className="max-w-7xl mx-auto px-1 flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Products:</span>
                        <span className="bg-[#00A3E1]/10 text-[#00A3E1] px-2.5 py-0.5 rounded-full text-[10px] font-black">{filteredItems.length}</span>
                    </div>

                    <div className="relative">
                        <button onClick={() => setIsSortOpen(!isSortOpen)} className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-xl shadow-sm active:scale-95 transition-all">
                            <span className="text-[10px] font-black uppercase text-[#1A3B5D]">Sort: {sortOrder}</span>
                            <FiPlus className={`transition-transform duration-300 ${isSortOpen ? 'rotate-45' : ''}`} size={12} />
                        </button>
                        {isSortOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-white rounded-2xl shadow-xl border border-gray-50 z-[70] overflow-hidden">
                                {['A-Z', 'Z-A', 'Price: Low-High', 'Price: High-Low'].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => { setSortOrder(opt as any); setIsSortOpen(false); }}
                                        className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 border-t border-gray-50 first:border-0 ${sortOrder === opt ? 'text-[#00A3E1]' : 'text-[#1A3B5D]'}`}
                                    >
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
                            <div
                                key={item.id}
                                onClick={() => isViewMode ? handleOpenDetailDrawer(item) : handleOpenEditDrawer(item)}
                                className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col transition-all duration-300 relative group hover:shadow-md cursor-pointer ${!isViewMode ? 'ring-1 ring-[#00A3E1]/10' : ''}`}
                            >
                                <div className="aspect-square bg-[#F8FAFC] flex items-center justify-center relative overflow-hidden">
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.name} className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110" />
                                    ) : (
                                        <FiPackage className="w-10 h-10 text-gray-200" />
                                    )}
                                    {!isViewMode && (
                                        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-sm">
                                            <Edit3 size={10} className="text-[#00A3E1]" />
                                        </div>
                                    )}
                                </div>

                                <div className="p-3 flex flex-col flex-1">
                                    <h3 className="text-[10px] font-black text-[#1A3B5D] mb-1 truncate uppercase leading-tight">{item.name}</h3>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-black text-[#00A3E1]">₹{item.mrp}</p>
                                    </div>

                                    <div className="mt-auto flex gap-1">
                                        {isViewMode ? (
                                            cartItem ? (
                                                <div className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-1 py-1 border border-gray-100">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.id!, -1); }}
                                                        className="p-1.5 bg-white shadow-sm text-[#00A3E1] hover:bg-[#00A3E1] hover:text-white rounded-lg transition-all"
                                                    >
                                                        <Minus size={12} strokeWidth={3} />
                                                    </button>
                                                    <span className="text-xs font-black text-[#1A3B5D]">{cartItem.quantity}</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.id!, 1); }}
                                                        className="p-1.5 bg-white shadow-sm text-[#00A3E1] hover:bg-[#00A3E1] hover:text-white rounded-lg transition-all"
                                                    >
                                                        <Plus size={12} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        addToCart(item);
                                                    }}
                                                    className="w-full bg-[#00A3E1] text-white py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Plus size={12} />
                                                    Add to Cart
                                                </button>
                                            )
                                        ) : (
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenEditDrawer(item);
                                                    }}
                                                    className="flex-1 bg-gray-50 text-[#1A3B5D] py-1.5 rounded-lg text-[9px] font-black uppercase border border-gray-100"
                                                >
                                                    Edit
                                                </button>
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

            {isCartOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
                    <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h2 className="text-sm font-black text-[#1A3B5D] uppercase tracking-wider">Your Cart ({cartCount})</h2>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
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
                                    <div key={item.id} className="flex gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                        <div className="w-16 h-16 bg-white rounded-xl overflow-hidden border border-gray-100 flex-shrink-0">
                                            {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" /> : <FiPackage className="w-full h-full p-4 text-gray-200" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[10px] font-black text-[#00A3E1] uppercase truncate">{item.name}</h4>
                                            <p className="text-xs font-black text-[#1A3B5D]">₹{item.mrp}</p>
                                            <div className="flex items-center gap-3 mt-2">
                                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
                                                    <button onClick={() => updateQuantity(item.id!, -1)} className="text-gray-400 hover:text-[#00A3E1]"><Minus size={14} /></button>
                                                    <span className="text-xs font-black w-4 text-center">{quantity}</span>
                                                    <button onClick={() => updateQuantity(item.id!, 1)} className="text-gray-400 hover:text-[#00A3E1]"><Plus size={14} /></button>
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
                                <button className="w-full bg-[#00A3E1] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-[#00A3E1]/20 active:scale-[0.98] transition-all">
                                    Checkout Now
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-100 px-4 py-3 z-50">
                <div className="flex justify-between items-center gap-3">
                    <button className="flex flex-1 flex-col items-center gap-1 text-gray-300">
                        <FileText size={20} /><span className="text-[9px] font-black uppercase">Orders</span>
                    </button>
                    <button onClick={() => setIsViewMode(!isViewMode)} className={`flex flex-1 flex-col items-center gap-1 ${isViewMode ? 'text-[#00A3E1]' : 'text-orange-500'}`}>
                        <Home size={20} /><span className="text-[9px] font-black uppercase">{isViewMode ? 'Shop' : 'Admin'}</span>
                    </button>
                    <button className="flex flex-1 flex-col items-center gap-1 text-gray-300">
                        <UserRound size={20} /><span className="text-[9px] font-black uppercase">Profile</span>
                    </button>
                </div>
            </div>

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