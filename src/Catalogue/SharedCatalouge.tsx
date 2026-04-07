import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getItemGroupsByCompany, getItemsByCompany } from '../lib/ItemsFirebase';
import type { ItemGroup, Item } from '../constants/models';
import { FiPackage, FiPlus } from 'react-icons/fi';
import { ShoppingCart } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName.tsx';
import SearchBar from './SearchBar.tsx';
// import LeadPopUp from './PopUp.tsx';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/Firebase";

const SharedCataloguePage: React.FC = () => {
    const { companyId: pathId, } = useParams<{ companyId: string }>();

    // 2. Get the subdomain
    const hostname = window.location.hostname;
    const parts = hostname.split('.');

    // Explicitly ignore 'app' and 'www'
    const subdomain = (
        parts.length >= 3 &&
        !['www', 'app'].includes(parts[0].toLowerCase()) &&
        !hostname.includes('localhost')
    ) ? parts[0] : null;

    // 3. Use whichever one exists
    // If subdomain is null (because we are on app.sellar.in), it falls back to pathId
    const effectiveCompanyId = subdomain || pathId;

    // 4. IMPORTANT: Replace your check
    // If your code has something like: if (!companyId) return <div>Invalid link</div>;
    // Change it to:
    if (!effectiveCompanyId) {
        return <div>Invalid catalogue link.</div>;
    }
    const navigate = useNavigate();

    // Hooks
    const { businessName: companyName, loading: nameLoading } = useBusinessName(effectiveCompanyId);

    // States
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [socialLinks, setSocialLinks] = useState<any>({});
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const liveItems = useMemo(() => {
        return allItems.filter(item =>
            item.isListed &&
            item.itemGroupId &&
            item.itemGroupId !== 'uncategorized'
        );
    }, [allItems]);
    // const cartIconRef = useRef<HTMLButtonElement | null>(null);
    const cartCount = useMemo(() => cart.reduce((acc, curr) => acc + curr.quantity, 0), [cart]);

    const cartTotal = useMemo(() => {
        return cart.reduce((acc, curr) => {
            const price = curr.item?.salesPrice || curr.item?.mrp || 0;
            return acc + price * curr.quantity;
        }, 0);
    }, [cart]);

    useEffect(() => {
        if (!effectiveCompanyId) {
            setError("Invalid catalogue link.");
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const [fetchedItemGroups, fetchedItems] = await Promise.all([
                    getItemGroupsByCompany(effectiveCompanyId),
                    getItemsByCompany(effectiveCompanyId)
                ]);
                setItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);
                // fetch business info (social links)
                const businessRef = doc(
                    db,
                    "companies",
                    effectiveCompanyId,
                    "business_info",
                    effectiveCompanyId
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
    }, [effectiveCompanyId]);

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

    useEffect(() => {
        const savedCart = localStorage.getItem('temp_cart');
        if (savedCart) {
            setCart(JSON.parse(savedCart));
        }
    }, []);

    useEffect(() => {
        const handleStorage = () => {
            const savedCart = localStorage.getItem('temp_cart');
            if (savedCart) {
                setCart(JSON.parse(savedCart));
            }
        };

        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    const getGroupImages = (groupId: string): string[] => {
        const imgs = allItems
            .filter(item => item.itemGroupId === groupId)
            .map(item => item.imageUrl)
            .filter(Boolean) as string[];

        return imgs.slice(0, 4); // max 4 images
    };

    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) {
            return itemGroups.filter(group => {
                if (!group.id) return false;

                const itemCount = allItems.filter(
                    item => item.itemGroupId === group.id
                ).length;

                return itemCount > 0;
            });
        }

        const lowerQuery = searchQuery.toLowerCase().trim();

        return itemGroups
            .filter((group: ItemGroup) => {
                if (!group.id) return false;

                const groupItems = allItems.filter(
                    (item) => item.itemGroupId === group.id
                );

                if (groupItems.length === 0) return false;

                const catalogueMatch = fuzzyMatch(group.name, lowerQuery);

                const itemMatch =
                    groupItems.some((item: Item) =>
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
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative">

            {/* <LeadPopUp effectiveCompanyId={effectiveCompanyId} companyName={companyName} /> */}

            {/* --- HEADER --- */}
            <header className="sticky top-0 z-[100] bg-white border-b border-gray-100 shadow-sm w-full">
                <div className="max-w-7xl mx-auto px-3 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1 h-5 bg-[#F97316] rounded-sm"></div>
                            <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                                {companyName}
                            </h1>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            if (effectiveCompanyId) {
                                navigate(`/checkout/${effectiveCompanyId}`);
                            } else {
                                console.error("Company ID missing!");
                            }
                        }}
                        className="flex items-center justify-center gap-2 bg-[#F97316] text-white py-2 px-4 rounded-sm font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all relative cursor-pointer"
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
            </header>

            <main className="p-1 md:p-6 space-y-4 flex-1 max-w-7xl mx-auto w-full pb-12 md:pb-20">
                <div className='flex items-center justify-center mt-1'>
                    <h1 className="text-lg md:text-xl font-extrabold text-[#F97316] uppercase tracking-tighter">Categories</h1>
                </div>
                <div className="relative group max-w-md mx-auto w-full">
                    <SearchBar
                        items={liveItems}
                        itemGroups={itemGroups}
                        hideUncategorized={true}
                        onItemSelected={(item: any) => {
                            setSearchQuery(item.name); 
                            navigate(
                                `/product/${effectiveCompanyId}/${item.itemGroupId}`,
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
                        <span className="bg-[#F97316]/10 text-[#F97316] px-2.5 py-0.5 rounded-sm text-[10px] font-black">
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
                                    className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 ${sortOrder === 'A-Z' ? 'text-[#F97316]' : 'text-[#1A3B5D]'}`}
                                >
                                    A to Z
                                </button>
                                <button
                                    onClick={() => { setSortOrder('Z-A'); setIsSortOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 border-t border-gray-50 ${sortOrder === 'Z-A' ? 'text-[#F97316]' : 'text-[#1A3B5D]'}`}
                                >
                                    Z to A
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-0.5">
                    {filteredItems.map(group => {
                        const itemCount = allItems.filter(
                            item => item.itemGroupId === group.id
                        ).length;
                        const collageImages = getGroupImages(group.id!);
                        return (
                            <div
                                key={group.id}
                                onClick={() => navigate(`/product/${effectiveCompanyId}/${group.id}`)}
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
                                    <h3 className="text-[14px] font-bold text-[#1A3B5D] mb-1 truncate leading-tight">
                                        {group.name}
                                    </h3>

                                    <div className="flex items-center justify-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-sm border border-blue-100 w-fit mx-auto">
                                        <span className="text-[10px] font-black text-[#F97316] leading-none">
                                            {itemCount}
                                        </span>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-[#1A3B5D]/60 leading-none">
                                            Items
                                        </span>
                                    </div>

                                    <div className="mt-2 flex items-center justify-center bg-[#F97316] px-2 py-1.5 rounded-sm">
                                        <div className="flex items-center">
                                            <span className="text-[12px] font-bold uppercase text-white tracking-wider">View Products</span>
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

            {/* --- STICKY BOTTOM CART --- */}
            <div
                onClick={() => {
                    if (effectiveCompanyId) {
                        navigate(`/checkout/${effectiveCompanyId}`);
                    }
                }}
                className="fixed bottom-0 left-0 w-full md:w-[50%] md:left-1/2 md:-translate-x-1/2 z-[9999] bg-[#F97316] text-white shadow-lg cursor-pointer active:scale-[0.98] transition-all"
            >
                <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">

                    {/* Left side */}
                    <div className="flex items-center gap-3">

                        <div className="flex flex-col">
                            <span className="text-[12px] font-bold uppercase tracking-wide">
                                {cartCount} Item{cartCount > 1 ? 's' : ''}
                            </span>
                            <span className="text-[15px] font-bold">
                                ₹{cartTotal}
                            </span>
                        </div>


                        <ShoppingCart size={20} />

                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2 font-black uppercase text-[12px]">
                        View Cart →
                    </div>

                </div>
            </div>

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