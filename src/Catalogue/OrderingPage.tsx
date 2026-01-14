import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { FiX, FiPackage, FiPlus, FiEdit3 } from 'react-icons/fi';
import { Search, Home, FileText, UserRound, Heart, Trash2, X } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
// import { ItemDetailDrawer } from '../Components/ItemDetails';
import { db } from '../lib/Firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { useNavigate } from 'react-router';


const OrderingPage: React.FC = () => {
    // --- States ---
    const navigate = useNavigate()
    const { currentUser, loading: authLoading } = useAuth();
    const dbOperations = useDatabase();
    const [items, setItems] = useState<Item[]>([]);
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [selectedCategory, _setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [cart, setCart] = useState<any[]>([]);
    // const [isCartOpen, setIsCartOpen] = useState(false);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [_selectedItem, setSelectedItem] = useState<Item | null>(null);
    // const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [activeTab, setActiveTab] = useState<'My Shop' | 'Edit Shop'>('My Shop');
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);

    // --- YOUR NEW STATES (Added as requested) ---
    const [editingId, setEditingId] = useState<string | null>(null);
    const [tempName, setTempName] = useState('');

    // --- Fetch Data ---
    useEffect(() => {
        if (authLoading || !currentUser || !dbOperations) {
            setPageIsLoading(authLoading || !dbOperations);
            return;
        }

        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                const [fetchedItems, fetchedItemGroups] = await Promise.all([
                    dbOperations.getItems(),
                    dbOperations.getItemGroups()
                ]);

                setItems(fetchedItems.filter(item => item.isListed));

                const groupMap = new Map<string, ItemGroup>();
                fetchedItemGroups.forEach(group => {
                    if (!groupMap.has(group.name.toLowerCase())) {
                        groupMap.set(group.name.toLowerCase(), group);
                    }
                });

                const sortedGroups = Array.from(groupMap.values()).sort((a, b) =>
                    a.name.localeCompare(b.name)
                );
                setItemGroups(sortedGroups);

            } catch (err: any) {
                console.error("Error fetching data:", err);
            } finally {
                setPageIsLoading(false);
            }
        };

        fetchData();
    }, [authLoading, currentUser, dbOperations]);

    // --- YOUR NEW HANDLERS (Added as requested) ---
    const handleEdit = (group: any) => {
        setEditingId(group.id!);
        setTempName(group.name);
    };


    const handleSaveEdit = (id: string) => {
        setItems(items.map(p => p.id === id ? { ...p, name: tempName } : p));
        setEditingId(null);
    };

    // --- Cart Logic (Untouched) ---
    // const handleAddToCart = (item: Item, quantity: number, isFromDrawer: boolean = false) => {
    //     setCart(prev => {
    //         if (!item.id) return prev;
    //         const existing = prev.find(ci => ci.id === item.id);
    //         if (existing) {
    //             const newQty = isFromDrawer ? quantity : existing.quantity + quantity;
    //             return prev.map(ci => ci.id === item.id ? { ...ci, quantity: newQty } : ci);
    //         }
    //         return [...prev, { id: item.id, name: item.name, mrp: item.mrp, quantity, imageUrl: item.imageUrl || null }];
    //     });
    // };

    // const handleUpdateCartQuantity = (id: string, delta: number) => {
    //     setCart(prev => {
    //         const item = prev.find(i => i.id === id);
    //         if (!item) return prev;
    //         const newQty = item.quantity + delta;
    //         return newQty <= 0
    //             ? prev.filter(i => i.id !== id)
    //             : prev.map(i => i.id === id ? { ...i, quantity: newQty } : i);
    //     });
    // };

    // --- Memos ---
    const cartValue = useMemo(() => cart.reduce((acc, item) => acc + (item.mrp * item.quantity), 0), [cart]);


    const filteredItems = useMemo(() => {
        const result = itemGroups.filter(item => {
            const matchesCat = selectedCategory === 'All' || item.id === selectedCategory;
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });

        return [...result].sort((a, b) => {
            if (sortOrder === 'A-Z') return a.name.localeCompare(b.name);
            return b.name.localeCompare(a.name);
        });
    }, [items, selectedCategory, searchQuery, sortOrder]);

    // --- Order Logic (Untouched) ---
    const handleConfirmAndSaveOrder = async () => {
        if (!customerName || !customerPhone) {
            setModal({ message: 'Please enter customer details', type: State.ERROR });
            return;
        }
        setIsPlacingOrder(true);
        try {
            const newOrderId = await OrderInvoiceNumber(currentUser!.companyId!);
            const ordersRef = collection(db, 'companies', currentUser!.companyId!, 'Orders');

            await addDoc(ordersRef, {
                orderId: newOrderId,
                items: cart,
                totalAmount: cartValue,
                status: 'Upcoming',
                createdAt: serverTimestamp(),
                userName: customerName,
                userPhone: customerPhone,
                companyId: currentUser!.companyId,
            });

            setModal({ message: `Order ${newOrderId} placed successfully!`, type: State.SUCCESS });
            setCart([]);
            setIsCustomerModalOpen(false);
            setCustomerName('');
            setCustomerPhone('');
        } catch (err) {
            console.error("Order Error:", err);
            setModal({ message: 'Failed to place order', type: State.ERROR });
        } finally {
            setIsPlacingOrder(false);
        }
    };

    if (pageIsLoading) return <div className="flex items-center justify-center h-screen bg-[#E9F0F7]"><Spinner /></div>;

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative overflow-x-hidden">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* --- HEADER --- */}
            <header className="sticky top-0 z-[60] bg-white border-b border-gray-100 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-3">
                    <div className="flex">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1 h-5 bg-[#00A3E1] rounded-full"></div>
                            <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                                MyCatalogue<span className="text-[#00A3E1]">.</span>
                            </h1>
                        </div>

                        <div className="ml-50 hidden md:flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                            <button onClick={() => setActiveTab('My Shop')} className={`px-8 py-2 rounded-lg text-[12px] font-black uppercase transition-all ${activeTab === 'My Shop' ? 'bg-[#00A3E1] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>My Shop</button>
                            <button onClick={() => setActiveTab('Edit Shop')} className={`px-8 py-2 rounded-lg text-[12px] font-black uppercase transition-all ${activeTab === 'Edit Shop' ? 'bg-[#00A3E1] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Edit Shop</button>
                        </div>

                        {/* <button onClick={() => setIsCartOpen(true)} className="bg-[#1A3B5D] text-white py-2 px-4 rounded-xl font-black text-[10px] uppercase shadow-lg flex items-center gap-2 transition-transform active:scale-95">
                            <ShoppingCart size={14} />
                            <span>₹{cartValue.toFixed(0)}</span>
                        </button> */}
                    </div>
                </div>
            </header>

            <main className="p-4 md:p-6 space-y-6 flex-1 max-w-7xl mx-auto w-full pb-32">

                <div className="md:hidden flex justify-center w-full">
                    <div className="bg-white/80 backdrop-blur-md p-1 rounded-2xl flex shadow-sm border border-gray-100 w-full max-w-md">
                        <button
                            onClick={() => setActiveTab('My Shop')}
                            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'My Shop' ? 'bg-[#00A3E1] text-white shadow-md' : 'text-gray-400'}`}
                        >
                            My Shop
                        </button>
                        <button
                            onClick={() => setActiveTab('Edit Shop')}
                            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'Edit Shop' ? 'bg-[#00A3E1] text-white shadow-md' : 'text-gray-400'}`}
                        >
                            Edit Shop
                        </button>
                    </div>
                </div>
                {/* --- SEARCH BAR --- */}
                <div className="relative group max-w-md mx-auto w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-gray-100 rounded-2xl py-3.5 pl-11 pr-4 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-[#00A3E1]/10 transition-all" />
                </div>

                {/* --- CATALOGUE COUNT & FILTER --- */}
                <div className="max-w-7xl mx-auto px-1 flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Total Catalogues:
                        </span>
                        <span className="bg-[#00A3E1]/10 text-[#00A3E1] px-2.5 py-0.5 rounded-full text-[10px] font-black">
                            {filteredItems.length}
                        </span>
                    </div>

                    {/* Filter Button */}
                    <div className="relative">
                        <button
                            onClick={() => setIsSortOpen(!isSortOpen)}
                            className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-xl shadow-sm active:scale-95 transition-all"
                        >
                            <span className="text-[10px] font-black uppercase text-[#1A3B5D]">Sort: {sortOrder}</span>
                            <FiPlus className={`transition-transform duration-300 ${isSortOpen ? 'rotate-45' : ''}`} size={12} />
                        </button>

                        {/* Dropdown Menu */}
                        {isSortOpen && (
                            <div className="absolute right-0 mt-2 w-32 bg-white rounded-2xl shadow-xl border border-gray-50 z-[70] overflow-hidden">
                                <button
                                    onClick={() => { setSortOrder('A-Z'); setIsSortOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 ${sortOrder === 'A-Z' ? 'text-[#00A3E1]' : 'text-[#1A3B5D]'}`}
                                >
                                    A to Z
                                </button>
                                <button
                                    onClick={() => { setSortOrder('Z-A'); setIsSortOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 border-t border-gray-50 ${sortOrder === 'Z-A' ? 'text-[#00A3E1]' : 'text-[#1A3B5D]'}`}
                                >
                                    Z to A
                                </button>
                            </div>
                        )}
                    </div>
                </div>


                {/* --- CATEGORY FILTERS --- */}
                {/* <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <button onClick={() => setSelectedCategory('All')} className={`whitespace-nowrap px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-full transition-all ${selectedCategory === 'All' ? 'bg-[#00A3E1] text-white shadow-md' : 'bg-white text-gray-400 border border-gray-100'}`}>All</button>
                    {itemGroups.map(group => (
                        <button key={group.id} onClick={() => setSelectedCategory(group.id!)} className={`whitespace-nowrap px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-full transition-all ${selectedCategory === group.id ? 'bg-[#00A3E1] text-white shadow-md' : 'bg-white text-gray-400 border border-gray-100'}`}>{group.name}</button>
                    ))}
                </div> */}

                {/* --- PRODUCT GRID WITH YOUR UI CODE --- */}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {itemGroups.map(group => (
                        <div
                            key={group.id}
                            // Yahan humne onClick handler card par laga diya hai
                            onClick={() => {
                                if (activeTab === 'Edit Shop') {
                                    handleEdit(group);
                                } else {
                                    navigate(`/MyShop/${currentUser?.companyId}/${group.id}`)
                                }
                            }}
                            className={`bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100 flex flex-col transition-all group cursor-pointer active:scale-95 ${activeTab === 'Edit Shop' ? 'hover:shadow-xl hover:border-[#00A3E1]/30' : ''
                                }`}
                        >
                            <div className="aspect-square bg-[#F8FAFC] relative overflow-hidden flex items-center justify-center">
                                (
                                <FiPackage className="h-10 w-10 text-gray-200" />
                                )
                                <div className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm">
                                    {activeTab === 'Edit Shop' ? <FiEdit3 size={14} className="text-[#00A3E1]" /> : <Heart size={14} className="text-gray-300" />}
                                </div>
                            </div>

                            <div className="p-2.5 flex flex-col flex-1">
                                {editingId === group.name ? (
                                    /* e.stopPropagation() zaroori hai taaki input click karne pe card ka click event dobara na chale */
                                    <div className="space-y-2 py-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={tempName}
                                            onChange={(e) => setTempName(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-100 rounded-lg py-1 px-2 text-[10px] font-bold outline-none"
                                        />
                                        <div className="flex gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(group.id!); }} className="flex-1 bg-[#00A3E1] text-white py-1.5 rounded-md text-[8px] font-black uppercase">Save</button>
                                            <button onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete product?")) { setItems(items.filter(p => p.id !== group.id)); setEditingId(null); } }} className="p-1.5 bg-red-50 text-red-500 rounded-md"><Trash2 size={12} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1.5 bg-gray-50 text-gray-400 rounded-md"><X size={12} /></button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="text-[9px] md:text-[10px] font-bold text-[#1A3B5D] mb-0.5 truncate leading-tight">{group.name}</h3>
                                        <div className="flex justify-between items-center mt-1">
                                            {/* Price placeholder agar chahiye ho toh */}
                                        </div>
                                        {/* Ye button ab sirf visual indicator hai, logic card ke onClick mein hai */}
                                        <div className="mt-1.5 w-full py-1.5 rounded-lg text-[9px] font-black uppercase text-center tracking-wider transition-all bg-[#00A3E1] text-white">
                                            {activeTab === 'Edit Shop' ? 'Edit' : 'View'}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            {/* --- MOBILE NAV & MODALS (Remaining Untouched) --- */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-100 px-4 py-3 z-50">
                <div className="flex justify-between items-center gap-3">
                    <button className="flex flex-1 flex-col items-center gap-1 text-gray-300">
                        <FileText size={20} />
                        <span className="text-[9px] font-black uppercase">Orders</span>
                    </button>
                    <button className="flex flex-1 flex-col items-center gap-1 text-[#00A3E1]">
                        <Home size={20} />
                        <span className="text-[9px] font-black uppercase">Home</span>
                    </button>
                    <button className="flex flex-1 flex-col items-center gap-1 text-gray-300">
                        <UserRound size={20} />
                        <span className="text-[9px] font-black uppercase">Profile</span>
                    </button>
                </div>
            </div>

            {isCustomerModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#1A3B5D]/60 backdrop-blur-md p-4">
                    <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl text-center relative">
                        <button onClick={() => setIsCustomerModalOpen(false)} className="absolute top-6 right-6 text-gray-400"><FiX size={20} /></button>
                        <h3 className="text-sm font-black text-[#1A3B5D] uppercase mb-6">Customer Details</h3>
                        <div className="space-y-4">
                            <input type="text" placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full bg-gray-50 border-none rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-[#00A3E1]/20" />
                            <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full bg-gray-50 border-none rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-[#00A3E1]/20" />
                        </div>
                        <button disabled={isPlacingOrder} onClick={handleConfirmAndSaveOrder} className="w-full mt-6 bg-[#00A3E1] text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg tracking-widest active:scale-95 disabled:opacity-50 transition-all">
                            {isPlacingOrder ? 'Placing Order...' : 'Confirm Order'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};



export default OrderingPage;