import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShoppingCart, Edit3, X, Minus, Plus, Trash2, ChevronLeft } from 'lucide-react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { FiStar, FiCheckSquare, FiLoader, FiPackage, FiPlus } from 'react-icons/fi';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { Spinner } from '../constants/Spinner';
import { useNavigate, useParams } from 'react-router-dom';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SearchBar from './SearchBar';
// import { doc, getDoc } from 'firebase/firestore';
// import { db } from '../lib/Firebase';

// const useBusinessName = (companyId?: string) => {
//     const [businessName, setBusinessName] = useState<string>('');
//     const [loading, setLoading] = useState(true);

//     useEffect(() => {
//         if (!companyId) {
//             setLoading(false);
//             return;
//         }
//         const fetchBusinessInfo = async () => {
//             try {
//                 // Correct multi-tenant path as per your logic
//                 const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
//                 const docSnap = await getDoc(docRef);
//                 setBusinessName(docSnap.exists() ? docSnap.data().businessName || 'Catalogue' : 'Catalogue');
//             } catch (err) {
//                 console.error("Error fetching business name:", err);
//                 setBusinessName('Catalogue');
//             } finally {
//                 setLoading(false);
//             }
//         };
//         fetchBusinessInfo();
//     }, [companyId]);

//     return { businessName, loading };
// };

const StockIndicator: React.FC<{ stock: number }> = ({ stock }) => {
    let colorClass = 'text-green-600 bg-green-100';
    if (stock <= 10 && stock > 0) colorClass = 'text-yellow-600 bg-yellow-100';
    if (stock <= 0) colorClass = 'text-red-500 bg-red-100';
    return (
        <span className={`px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-tight ${colorClass}`}>
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
            className={`flex-1 py-1.5 rounded-sm text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${isListed ? 'bg-green-500 text-white shadow-sm' : 'bg-gray-100 text-gray-400'
                }`}
        >
            {isLoading ? <FiLoader className="animate-spin" size={10} /> : isListed ? <FiCheckSquare size={10} /> : <FiStar size={10} />}
            {isListed ? 'Listed' : 'List'}
        </button>
    );
};

const ITEMS_PER_BATCH_RENDER = 24;

const MyShop: React.FC = () => {
    const navigate = useNavigate()
    const { groupId } = useParams<{ groupId: string }>();
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const { businessName: companyName, loading: _nameLoading } = useBusinessName(companyId);
    const dbOperations = useDatabase();

    const [isViewMode, setIsViewMode] = useState(true);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(groupId || 'All');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [_error, setError] = useState<string | null>(null);
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
    const [allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);

    // Sync selectedCategory when groupId changes from URL
    useEffect(() => {
        if (groupId) {
            setSelectedCategory(groupId);
        }
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

    const currentCategoryName = useMemo(() => {
        const group = allItemGroups.find(g => g.id === groupId);
        return group ? group.name : 'Catalogue';
    }, [allItemGroups, groupId]);

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
                    dbOperations.syncItems()
                ]);
                setAllItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);
            } catch (err: any) {
                setError(err.message || 'Failed to load initial data.');
            } finally {
                setPageIsLoading(false);
            }
        };
        fetchData();
    }, [authLoading, currentUser, dbOperations]);

    // 3. Updated Filter logic with safety checks
    const filteredItems = useMemo(() => {
        const activeCat = groupId || selectedCategory;

        const result = allItems.filter(item => {
            if (!item) return false;
            if (isViewMode && !item.isListed) return false;

            const matchesCategory = activeCat === 'All' || item.itemGroupId === activeCat;
            const itemName = item.name?.toLowerCase() || "";
            const matchesSearch = itemName.includes(searchQuery.toLowerCase()) ||
                (item.barcode && item.barcode.includes(searchQuery));

            return matchesCategory && matchesSearch;
        });

        return [...result].sort((a, b) => {
            const nameA = a.name || "";
            const nameB = b.name || "";
            if (sortOrder === 'A-Z') return nameA.localeCompare(nameB);
            if (sortOrder === 'Z-A') return nameB.localeCompare(nameA);
            if (sortOrder === 'Price: Low-High') return (a.mrp || 0) - (b.mrp || 0);
            if (sortOrder === 'Price: High-Low') return (b.mrp || 0) - (a.mrp || 0);
            return 0;
        });
    }, [allItems, selectedCategory, searchQuery, isViewMode, sortOrder, groupId]);

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

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative">
            {/* --- HEADER SECTION --- */}
            <header className="sticky top-0 z-[10] bg-white border-b border-gray-100 shadow-sm w-full">
                <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-2 relative">
                    <div className="flex items-center justify-between">
                        {/* LEFT: Logo/Name */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-1 hover:bg-gray-100 rounded-sm transition-colors"
                            >
                                <ChevronLeft className="text-[#1A3B5D]" size={20} />
                            </button>
                            <div className="w-1 h-5 bg-[#00A3E1] rounded-sm"></div>
                            <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                                {companyName}
                            </h1>
                        </div>

                        {/* MOBILE ONLY: Category Name (Right Side) */}
                        <div className="md:hidden flex flex-col items-end bg-blue-50/50 px-2 py-1 rounded-sm border-r-2 border-[#00A3E1]">
                            <span className="text-[11px] font-[900] text-[#1A3B5D] uppercase truncate max-w-[110px] tracking-tight">
                                {currentCategoryName}
                            </span>
                        </div>

                        {/* DESKTOP ONLY: Tabs (Keep as is) */}
                        <div className="hidden md:flex bg-gray-50 p-1 rounded-sm border border-gray-100 scale-90 absolute left-1/2 -translate-x-1/2">
                            <button onClick={() => setIsViewMode(true)} className={`px-8 py-2 rounded-sm text-[12px] font-black uppercase transition-all ${isViewMode ? 'bg-[#00A3E1] text-white shadow-sm' : 'text-gray-400'}`}>My Items</button>
                            <button onClick={() => setIsViewMode(false)} className={`px-8 py-2 rounded-sm text-[12px] font-black uppercase transition-all ${!isViewMode ? 'bg-[#00A3E1] text-white shadow-sm' : 'text-gray-400'}`}>Edit Items</button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="p-3 md:p-6 space-y-4 flex-1 max-w-7xl mx-auto w-full pb-24">
                <div className='hidden md:flex items-center justify-center'>
                    <h1 className="text-xs md:text-sm font-black text-[#00A3E1] uppercase tracking-tighter">{currentCategoryName}</h1>
                </div>

                <div className="md:hidden sticky top-[58px] z-[10] flex justify-center w-full px-4 py-2 bg-[#E9F0F7]/80 backdrop-blur-sm">
                    <div className="bg-white/80 backdrop-blur-md p-1 rounded-sm flex shadow-md border border-gray-100 w-full max-w-md">
                        <button
                            onClick={() => setIsViewMode(true)}
                            className={`flex-1 py-2 rounded-sm text-[12px] font-black uppercase transition-all text-center ${isViewMode ? 'bg-[#00A3E1] text-white shadow-sm' : 'text-gray-400'}`}
                        >
                            My Items
                        </button>
                        <button
                            onClick={() => setIsViewMode(false)}
                            className={`flex-1 py-2 rounded-sm text-[12px] font-black uppercase transition-all text-center ${!isViewMode ? 'bg-[#00A3E1] text-white shadow-sm' : 'text-gray-400'}`}
                        >
                            Edit Items
                        </button>
                    </div>
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

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {itemsToDisplay.map((item) => {
                        const cartItem = cart.find(i => i.item.id === item.id);
                        return (
                            <div
                                key={item.id}
                                onClick={() => isViewMode ? handleOpenDetailDrawer(item) : handleOpenEditDrawer(item)}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border border-gray-100 flex flex-col transition-all duration-300 relative group hover:shadow-md cursor-pointer ${!isViewMode ? 'ring-1 ring-[#00A3E1]/10' : ''}`}
                            >
                                <div className="aspect-square bg-[#F8FAFC] flex items-center justify-center relative overflow-hidden">
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.name} className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110" />
                                    ) : (
                                        <FiPackage className="w-10 h-10 text-gray-200" />
                                    )}
                                    {!isViewMode && (
                                        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm p-1.5 rounded-sm shadow-sm">
                                            <Edit3 size={10} className="text-[#00A3E1]" />
                                        </div>
                                    )}
                                </div>

                                <div className="p-3 flex flex-col flex-1">
                                    <h3 className="text-[10px] font-black text-[#1A3B5D] mb-1 truncate uppercase leading-tight">{item.name}</h3>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-black text-[#00A3E1]">₹{item.mrp}</p>
                                        <StockIndicator stock={item.stock || 0} />
                                    </div>

                                    <div className="mt-1 flex gap-1">
                                        {isViewMode ? (
                                            cartItem ? (
                                                <div className="w-full flex items-center justify-between bg-gray-50 rounded-sm px-1 py-1 border border-gray-100">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.id!, -1); }}
                                                        className="p-1.5 bg-white shadow-sm text-[#00A3E1] hover:bg-[#00A3E1] hover:text-white rounded-sm transition-all"
                                                    >
                                                        <Minus size={12} strokeWidth={3} />
                                                    </button>
                                                    <span className="text-xs font-black text-[#1A3B5D]">{cartItem.quantity}</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.id!, 1); }}
                                                        className="p-1.5 bg-white shadow-sm text-[#00A3E1] hover:bg-[#00A3E1] hover:text-white rounded-sm transition-all"
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
                                                    className="w-full bg-[#00A3E1] text-white py-2 rounded-sm text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
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
                                                    className="flex-1 bg-gray-50 text-[#1A3B5D] py-1.5 rounded-sm text-[9px] font-black uppercase border border-gray-100"
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
                                            <h4 className="text-[10px] font-black text-[#00A3E1] uppercase truncate">{item.name}</h4>
                                            <p className="text-xs font-black text-[#1A3B5D]">₹{item.mrp}</p>
                                            <div className="flex items-center gap-3 mt-2">
                                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-sm px-2 py-1">
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
                                <button className="w-full bg-[#00A3E1] text-white py-4 rounded-sm font-black text-xs uppercase tracking-widest shadow-lg shadow-[#00A3E1]/20 active:scale-[0.98] transition-all">
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
            <Footer companyName={companyName} />
        </div>
    );
};

export default MyShop;