import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getItemGroupsByCompany, getItemsByCompany } from '../lib/ItemsFirebase';
import type { ItemGroup, Item } from '../constants/models';
import { FiPackage, FiPlus } from 'react-icons/fi';
import { ShoppingCart} from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName.tsx';
import SearchBar from './SearchBar.tsx';
import LeadPopUp from './PopUp.tsx';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/Firebase";

const SharedCataloguePage: React.FC = () => {
    const { companyId } = useParams<{ companyId: string }>();
    const navigate = useNavigate();

    // Hooks
    const { businessName: companyName, loading: nameLoading } = useBusinessName(companyId);

    // States
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [socialLinks, setSocialLinks] = useState<any>({});
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
                // fetch business info (social links)
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
                setError(err.message || 'Failed to load catalogue.');
                console.error("Fetch Error:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [companyId]);

    const fuzzyMatch = (text: string, query: string) => {
        const normalize = (str: string) =>
            str.toLowerCase().replace(/\s+/g, '');

        const normalizedText = normalize(text);
        const normalizedQuery = normalize(query);

        // Direct partial match
        if (normalizedText.includes(normalizedQuery)) return true;

        // Word-by-word loose matching
        return normalizedQuery.split('').every(char =>
            normalizedText.includes(char)
        );
    };

    const getGroupImages = (groupId: string): string[] => {
        const imgs = allItems
            .filter(item => item.itemGroupId === groupId)
            .map(item => item.imageUrl)
            .filter(Boolean) as string[];

        return imgs.slice(0, 4); // max 4 images
    };

    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return itemGroups;

        const lowerQuery = searchQuery.toLowerCase().trim();

        const itemsGrouped = allItems.reduce<Record<string, Item[]>>((acc, item: Item) => {
            if (!item.itemGroupId) return acc;
            if (!acc[item.itemGroupId]) acc[item.itemGroupId] = [];
            acc[item.itemGroupId].push(item);
            return acc;
        }, {});

        return itemGroups
            .filter((group: ItemGroup) => {
                if (!group.id) return false;

                const catalogueMatch = fuzzyMatch(group.name, lowerQuery);

                const itemMatch =
                    itemsGrouped[group.id]?.some((item: Item) =>
                        fuzzyMatch(item.name, lowerQuery)
                    ) ?? false;

                return catalogueMatch || itemMatch;
            })
            .sort((a, b) =>
                sortOrder === 'A-Z'
                    ? a.name.localeCompare(b.name)
                    : b.name.localeCompare(a.name)
            );

    }, [itemGroups, allItems, searchQuery, sortOrder]);

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

            <LeadPopUp companyId={companyId} companyName={companyName} />

            {/* --- HEADER --- */}
            <header className="sticky top-0 z-[60] bg-white border-b border-gray-100 shadow-sm">
                <div className="max-w-7xl mx-auto px-3 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
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

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1">
                    {filteredItems.map(group => {
                        const itemCount = allItems.filter(item => item.itemGroupId === group.id).length;
                        const collageImages = getGroupImages(group.id!);
                        return (
                            <div
                                key={group.id}
                                onClick={() => navigate(`/product/${companyId}/${group.id}`)}
                                className="bg-white rounded-sm overflow-hidden shadow-sm border border-gray-100 flex flex-col transition-all group cursor-pointer active:scale-95"
                            >
                                <div className="aspect-square bg-[#F8FAFC] relative overflow-hidden">
                                    {collageImages.length > 0 ? (
                                        <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-[2px] p-[2px]">
                                            {collageImages.map((img, index) => (
                                                <div key={index} className="w-full h-full overflow-hidden rounded-[2px]">
                                                    <img
                                                        src={img}
                                                        alt={`product-${index}`}
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                </div>
                                            ))}

                                            {/* filler boxes */}
                                            {Array.from({ length: 4 - collageImages.length }).map((_, i) => (
                                                <div
                                                    key={`empty-${i}`}
                                                    className="w-full h-full bg-gray-100 flex items-center justify-center"
                                                >
                                                    <FiPackage className="h-4 w-4 text-gray-300" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <FiPackage className="h-10 w-10 text-gray-200" />
                                        </div>
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

export default SharedCataloguePage;