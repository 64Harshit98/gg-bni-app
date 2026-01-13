import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getItemsByCompany, getItemGroupsByCompany } from '../lib/ItemsFirebase';
import type { Item, ItemGroup } from '../constants/models';
import { FiPackage, FiPlus } from 'react-icons/fi';
import { Search, Heart, ShoppingCart } from 'lucide-react';
import { Spinner } from '../constants/Spinner';

const SharedCataloguePage: React.FC = () => {
    // --- ORIGINAL LOGIC (DO NOT CHANGE) ---
    const { companyId } = useParams<{ companyId: string }>();
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<string[]>(['All']);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [companyName] = useState<string>('Catalogue');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);

    useEffect(() => {
        if (!companyId) {
            setError("Invalid catalogue link.");
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const [fetchedItems, fetchedItemGroups] = await Promise.all([
                    getItemsByCompany(companyId),
                    getItemGroupsByCompany(companyId)
                ]);
                setItems(fetchedItems);
                const categoryNames = fetchedItemGroups.map((group: ItemGroup) => group.name);
                setCategories(['All', ...categoryNames]);
            } catch (err: any) {
                setError(err.message || 'Failed to load catalogue.');
                console.error("Fetch Error:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [companyId]);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesCategory = selectedCategory === 'All' || item.itemGroupId === selectedCategory;
            const matchesSearch =
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (item.barcode && item.barcode.includes(searchQuery));
            return matchesCategory && matchesSearch;
        });
    }, [items, selectedCategory, searchQuery]);

    // HandleGoToOrderPage and navigate removed as requested

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen bg-[#E9F0F7]"><Spinner /> <span className="ml-2 font-bold text-[#1A3B5D]">Loading...</span></div>;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-red-500 p-4 bg-[#E9F0F7]">
                <p className="text-center font-bold mb-4">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative overflow-x-hidden">
            {/* --- HEADER --- */}
            <header className="sticky top-0 z-[60] bg-white border-b border-gray-100 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1 h-5 bg-[#00A3E1] rounded-full"></div>
                        <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                            {companyName}<span className="text-[#00A3E1]">.</span>
                        </h1>
                    </div>
                    <button
                        onClick={() => setIsCartOpen(true)}
                        className="flex items-center justify-center gap-2 bg-[#00A3E1] text-white py-2 px-4 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all relative"
                    >
                        <ShoppingCart size={14} />
                        <span>Cart</span>
    
                    </button>
                </div>
            </header>

            <main className="p-4 md:p-6 space-y-6 flex-1 max-w-7xl mx-auto w-full pb-10">
                {/* --- SEARCH BAR --- */}
                <div className="relative group max-w-md mx-auto w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-gray-100 rounded-2xl py-3.5 pl-11 pr-4 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-[#00A3E1]/10 transition-all"
                    />
                </div>

                {/* --- CATALOGUE COUNT & CATEGORIES --- */}
                {/* <div className="max-w-7xl mx-auto px-1 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Items:</span>
                        <span className="bg-[#00A3E1]/10 text-[#00A3E1] px-2.5 py-0.5 rounded-full text-[10px] font-black">
                            {filteredItems.length}
                        </span>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scrollbar-hide">
                        {categories.map(category => (
                            <button
                                key={category}
                                onClick={() => setSelectedCategory(category)}
                                className={`whitespace-nowrap px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-full transition-all ${selectedCategory === category ? 'bg-[#00A3E1] text-white shadow-md' : 'bg-white text-gray-400 border border-gray-100'}`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div> */}

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

                {/* --- PRODUCT GRID --- */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {filteredItems.map(item => (
                        <div
                            key={item.id}
                            // onClick removed to disable routing
                            className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100 flex flex-col transition-all group"
                        >
                            <div className="aspect-square bg-[#F8FAFC] relative overflow-hidden flex items-center justify-center">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={item.name} />
                                ) : (
                                    <FiPackage className="h-10 w-10 text-gray-200" />
                                )}
                                <div className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm">
                                    <Heart size={14} className="text-gray-300" />
                                </div>
                            </div>

                            <div className="p-3 flex flex-col flex-1">
                                <h3 className="text-[10px] font-bold text-[#1A3B5D] mb-0.5 truncate leading-tight">
                                    {item.name}
                                </h3>
                                {/* <div className="mt-1 flex justify-between items-center">
                                    <span className="text-[12px] font-black text-[#00A3E1]">₹{item.mrp.toFixed(2)}</span>
                                </div> */}
                                {/* Simple display button without click handler */}
                                <div className="mt-2 w-full py-2 rounded-lg text-[9px] font-black uppercase text-center tracking-wider bg-[#00A3E1] text-white opacity-90">
                                    Product Details
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {filteredItems.length === 0 && (
                    <div className="text-center py-20">
                        <div className="bg-white inline-block p-6 rounded-[32px] shadow-sm border border-gray-100">
                            <FiPackage className="mx-auto h-12 w-12 text-gray-200 mb-4" />
                            <p className="text-[11px] font-black uppercase text-gray-400 tracking-widest">No products found</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default SharedCataloguePage;