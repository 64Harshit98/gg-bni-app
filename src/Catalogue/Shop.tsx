import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { FiX, FiPackage, FiPlus } from 'react-icons/fi';
import { Trash2, X, ChevronLeft } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import { db } from '../lib/Firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { useNavigate } from 'react-router';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SearchBar from './SearchBar';

const OrderingPage: React.FC = () => {
    // --- States ---
    const navigate = useNavigate()
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const { businessName: companyName, loading: _nameLoading } = useBusinessName(companyId);
    const dbOperations = useDatabase();
    const [_items, setItems] = useState<Item[]>([]);
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [selectedCategory, _setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [cart, setCart] = useState<any[]>([]);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [_selectedItem, _setSelectedItem] = useState<Item | null>(null);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [activeTab, setActiveTab] = useState<'My Shop' | 'Edit Shop'>('My Shop');
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);

    // --- YOUR NEW STATES ---
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
                    dbOperations.syncItems(),
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

    // --- HANDLERS ---
    const handleEdit = (group: any) => {
        setEditingId(group.id!);
        setTempName(group.name);
    };

    const handleSaveEdit = async (id: string) => {
        if (!dbOperations) {
            setModal({ message: 'Database connection error', type: State.ERROR });
            return;
        }

        try {
            await dbOperations.updateItemGroup(id, { name: tempName });
            setItemGroups(prev => prev.map(group =>
                group.id === id ? { ...group, name: tempName } : group
            ));

            setEditingId(null);
            setModal({ message: 'Name updated successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error("Update Error:", err);
            setModal({ message: 'Failed to update name', type: State.ERROR });
        }
    };

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
    }, [itemGroups, selectedCategory, searchQuery, sortOrder]);

    // --- Order Logic ---
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
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* --- FIXED HEADER SECTION --- */}
            <header className="sticky top-0 z-[100] bg-white border-b border-gray-100 shadow-sm w-full">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <ChevronLeft className="text-[#1A3B5D]" size={20} />
                        </button>
                        <div className="w-1 h-5 bg-[#00A3E1] rounded-sm"></div>
                        <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                            {companyName}
                        </h1>
                    </div>

                    <div className="hidden md:flex bg-gray-50 p-1 rounded-sm border border-gray-100 ml-52">
                        <button onClick={() => setActiveTab('My Shop')} className={`px-8 py-2 rounded-sm text-[12px] font-black uppercase transition-all ${activeTab === 'My Shop' ? 'bg-[#00A3E1] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>My Shop</button>
                        <button onClick={() => setActiveTab('Edit Shop')} className={`px-8 py-2 rounded-sm text-[12px] font-black uppercase transition-all ${activeTab === 'Edit Shop' ? 'bg-[#00A3E1] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Edit Shop</button>
                    </div>
                </div>
            </header>

            <main className="p-4 space-y-6 flex-1 max-w-7xl mx-auto w-full pb-20">

                {/* --- STICKY MOBILE TABS --- */}
                <div className="md:hidden sticky top-[58px] z-[90] flex justify-center w-full px-4 py-2 bg-[#E9F0F7]/80 backdrop-blur-sm">
                    <div className="bg-white/80 backdrop-blur-md p-1 rounded-sm flex shadow-md border border-gray-100 w-full max-w-md">
                        <button
                            onClick={() => setActiveTab('My Shop')}
                            className={`flex-1 py-2.5 rounded-sm text-[10px] font-black uppercase transition-all ${activeTab === 'My Shop' ? 'bg-[#00A3E1] text-white shadow-md' : 'text-gray-400'
                                }`}
                        >
                            My Shop
                        </button>
                        <button
                            onClick={() => setActiveTab('Edit Shop')}
                            className={`flex-1 py-2.5 rounded-sm text-[10px] font-black uppercase transition-all ${activeTab === 'Edit Shop' ? 'bg-[#00A3E1] text-white shadow-md' : 'text-gray-400'
                                }`}
                        >
                            Edit Shop
                        </button>
                    </div>
                </div>

                {/* --- SEARCH BAR --- */}
                <SearchBar
                    setSearchQuery={setSearchQuery}
                />

                {/* --- CATALOGUE COUNT & FILTER --- */}
                <div className="max-w-7xl mx-auto px-1 flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Total Catalogues:
                        </span>
                        <span className="bg-[#00A3E1]/10 text-[#00A3E1] px-2.5 py-0.5 rounded-sm text-[10px] font-black">
                            {filteredItems.length}
                        </span>
                    </div>

                    <div className="relative">
                        <button
                            onClick={() => setIsSortOpen(!isSortOpen)}
                            className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-sm shadow-sm active:scale-95 transition-all"
                        >
                            <span className="text-[10px] font-black uppercase text-[#1A3B5D]">Sort: {sortOrder}</span>
                            <FiPlus className={`transition-transform duration-300 ${isSortOpen ? 'rotate-45' : ''}`} size={12} />
                        </button>

                        {isSortOpen && (
                            <div className="absolute right-0 mt-2 w-32 bg-white rounded-sm shadow-xl border border-gray-50 z-[70] overflow-hidden">
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

                {/* --- PRODUCT GRID --- */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                    {filteredItems.map(group => {
                        // Count calculation based on existing _items state
                        const itemCount = _items.filter(item => item.itemGroupId === group.id).length;

                        return (
                            <div
                                key={group.id}
                                onClick={() => {
                                    if (activeTab === 'Edit Shop') {
                                        handleEdit(group);
                                    } else {
                                        navigate(`/catalogue-home/my-shop/${group.id}`)
                                    }
                                }}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border border-gray-100 flex flex-col transition-all group cursor-pointer active:scale-95 ${activeTab === 'Edit Shop' ? 'hover:shadow-xl hover:border-[#00A3E1]/30' : ''
                                    }`}
                            >
                                {/* --- IMAGE SECTION WITH TOP BADGE --- */}
                                <div className="aspect-square bg-[#F8FAFC] relative overflow-hidden flex items-center justify-center">
                                    {group.imageUrl ? (
                                        <img src={group.imageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={group.name} />
                                    ) : (
                                        <FiPackage className="h-10 w-10 text-gray-200" />
                                    )}
                                </div>

                                {/* --- CONTENT SECTION --- */}
                                <div className="p-3 flex flex-col flex-1">
                                    {editingId === group.id ? (
                                        <div className="space-y-2 py-1" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                autoFocus
                                                type="text"
                                                value={tempName}
                                                onChange={(e) => setTempName(e.target.value)}
                                                className="w-full bg-gray-50 border border-gray-100 rounded-sm py-1 px-2 text-[10px] font-bold outline-none"
                                            />
                                            <div className="flex gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(group.id!); }} className="flex-1 bg-[#00A3E1] text-white py-1.5 rounded-sm text-[8px] font-black uppercase">Save</button>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm("Delete product group?") && dbOperations) {
                                                            try {
                                                                await dbOperations.deleteItemGroup(group.id!);
                                                                setItemGroups(itemGroups.filter(p => p.id !== group.id));
                                                                setEditingId(null);
                                                                setModal({ message: 'Deleted successfully', type: State.SUCCESS });
                                                            } catch (err) {
                                                                console.error(err);
                                                                setModal({ message: 'Delete failed', type: State.ERROR });
                                                            }
                                                        }
                                                    }}
                                                    className="p-1.5 bg-red-50 text-red-600 rounded-sm"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1.5 bg-gray-50 text-gray-400 rounded-sm"><X size={12} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <h3 className="text-[10px] font-bold text-[#1A3B5D] mb-1.5 truncate leading-tight uppercase">
                                                {group.name}
                                            </h3>

                                            {/* Centered Item Count Badge UI */}
                                            <div className="flex items-center justify-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-sm border border-blue-100 w-fit mx-auto mb-2">
                                                <span className="text-[10px] font-black text-[#00A3E1] leading-none">
                                                    {itemCount}
                                                </span>
                                                <span className="text-[8px] font-black uppercase tracking-widest text-[#1A3B5D]/60 leading-none">
                                                    Items
                                                </span>
                                            </div>

                                            <div className="mt-auto w-full py-1.5 rounded-sm text-[9px] font-black uppercase text-center tracking-wider transition-all bg-[#00A3E1] text-white">
                                                {activeTab === 'Edit Shop' ? 'Edit Group' : 'View Products'}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </main>

            {isCustomerModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#1A3B5D]/60 backdrop-blur-md p-4">
                    <div className="bg-white rounded-sm p-8 w-full max-w-sm shadow-2xl text-center relative">
                        <button onClick={() => setIsCustomerModalOpen(false)} className="absolute top-6 right-6 text-gray-400"><FiX size={20} /></button>
                        <h3 className="text-sm font-black text-[#1A3B5D] uppercase mb-6">Customer Details</h3>
                        <div className="space-y-4">
                            <input type="text" placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full bg-gray-50 border-none rounded-sm p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-[#00A3E1]/20" />
                            <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full bg-gray-50 border-none rounded-sm p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-[#00A3E1]/20" />
                        </div>
                        <button disabled={isPlacingOrder} onClick={handleConfirmAndSaveOrder} className="w-full mt-6 bg-[#00A3E1] text-white py-4 rounded-sm font-black text-[10px] uppercase shadow-lg tracking-widest active:scale-95 disabled:opacity-50 transition-all">
                            {isPlacingOrder ? 'Placing Order...' : 'Confirm Order'}
                        </button>
                    </div>
                </div>
            )}
            <div className="w-full m-0 p-0">
                <Footer companyName={companyName} />
            </div>
        </div>
    );
};

export default OrderingPage;