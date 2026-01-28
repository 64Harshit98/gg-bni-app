import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getItemGroupsByCompany, getItemsByCompany } from '../lib/ItemsFirebase';
import type { ItemGroup, Item } from '../constants/models';
import { FiPackage, FiPlus } from 'react-icons/fi';
import {ShoppingCart, ChevronLeft } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
// import { doc, getDoc } from 'firebase/firestore'; // Firebase imports
// import { db } from '../lib/Firebase'; // DB import
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName.tsx';
import SearchBar from './SearchBar.tsx';

// --- Custom Hook Integrated ---
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

const SharedCataloguePage: React.FC = () => {
    const { companyId } = useParams<{ companyId: string }>();
    const navigate = useNavigate();

    // Hooks
    const { businessName: companyName, loading: nameLoading } = useBusinessName(companyId);

    // States
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);

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
                const [fetchedItemGroups, fetchedItems] = await Promise.all([
                    getItemGroupsByCompany(companyId),
                    getItemsByCompany(companyId)
                ]);

                setItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);
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
        const result = itemGroups.filter(group => {
            const matchesSearch = group.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesSearch;
        });

        return [...result].sort((a, b) => {
            if (sortOrder === 'A-Z') return a.name.localeCompare(b.name);
            return b.name.localeCompare(a.name);
        });
    }, [itemGroups, searchQuery, sortOrder]);

    // Added nameLoading to the main loading check
    if (isLoading || nameLoading) {
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
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-gray-100 rounded-sm transition-colors"
                        >
                            <ChevronLeft size={20} className="text-[#1A3B5D]" />
                        </button>

                        <div className="flex items-center gap-1.5">
                            <div className="w-1 h-5 bg-[#00A3E1] rounded-sm"></div>
                            <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                                {companyName}
                            </h1>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            if (companyId) {
                                navigate(`/checkout/${companyId}`);
                            } else {
                                console.error("Company ID missing!");
                            }
                        }}
                        className="flex items-center justify-center gap-2 bg-[#00A3E1] text-white py-2 px-4 rounded-sm font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all relative cursor-pointer"
                    >
                        <ShoppingCart size={14} />
                        <span>Cart</span>
                    </button>
                </div>
            </header>

            <main className="p-4 md:p-6 space-y-6 flex-1 max-w-7xl mx-auto w-full pb-10">
                <div className='flex items-center justify-center'>
                    <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                        {companyName}
                    </h1>
                </div>

                {/* Rest of the code remains exactly same */}
                <div className="relative group max-w-md mx-auto w-full">
                    <SearchBar
                        setSearchQuery={setSearchQuery}
                    />
                </div>

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
                            className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-sm shadow-sm active:scale-95 transition-all cursor-pointer"
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

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {filteredItems.map(group => {
                        const itemCount = allItems.filter(item => item.itemGroupId === group.id).length;

                        return (
                            <div
                                key={group.id}
                                onClick={() => navigate(`/product/${companyId}/${group.id}`)}
                                className="bg-white rounded-sm overflow-hidden shadow-sm border border-gray-100 flex flex-col transition-all group cursor-pointer active:scale-95"
                            >
                                <div className="aspect-square bg-[#F8FAFC] relative overflow-hidden flex items-center justify-center">
                                    {group.imageUrl ? (
                                        <img src={group.imageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={group.name} />
                                    ) : (
                                        <FiPackage className="h-10 w-10 text-gray-200" />
                                    )}
                                </div>

                                <div className="p-3 flex flex-col flex-1">
                                    <h3 className="text-[10px] font-bold text-[#1A3B5D] mb-1 truncate leading-tight">
                                        {group.name}
                                    </h3>

                                    <div className="flex items-center justify-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-sm border border-blue-100 w-fit mx-auto">
                                        <span className="text-[10px] font-black text-[#00A3E1] leading-none">
                                            {itemCount}
                                        </span>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-[#1A3B5D]/60 leading-none">
                                            Items
                                        </span>
                                    </div>

                                    <div className="mt-2 flex items-center justify-center bg-[#00A3E1] px-2 py-1.5 rounded-sm">
                                        <div className="flex items-center">
                                            <span className="text-[8px] font-bold uppercase text-white tracking-wider">View Products</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {filteredItems.length === 0 && (
                    <div className="text-center py-20">
                        <div className="bg-white inline-block p-6 rounded-sm shadow-sm border border-gray-100">
                            <FiPackage className="mx-auto h-12 w-12 text-gray-200 mb-4" />
                            <p className="text-[11px] font-black uppercase text-gray-400 tracking-widest">No catalogues found</p>
                        </div>
                    </div>
                )}
            </main>

            {/* FOOTER */}
            <Footer companyName={companyName} />
        </div>
    );
};

export default SharedCataloguePage;