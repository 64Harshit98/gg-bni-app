import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getItemGroupsByCompany, getItemsByCompany } from '../lib/ItemsFirebase';
import type { ItemGroup, Item } from '../constants/models';
import { FiPackage, FiPlus } from 'react-icons/fi';
import { ShoppingCart, Pin } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName.tsx';
import SearchBar from './SearchBar.tsx';
// import LeadPopUp from './PopUp.tsx';
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/Firebase";
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting';
import LeadPopUp from './PopUp.tsx';

const SharedCataloguePage: React.FC = () => {
    const { companyId: pathId } = useParams<{ companyId: string }>();
    const navigate = useNavigate();

    // 1. States for subdomain resolution
    const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
    const [domainResolveError, setDomainResolveError] = useState(false);

    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
    };

    // 2. Safely extract the subdomain
    const hostname = window.location.hostname;
    const parts = hostname.split('.');

    // Explicitly ignore 'app' and 'www'
    const subdomain = useMemo(() => {
        return (
            parts.length >= 3 &&
            !['www', 'app'].includes(parts[0].toLowerCase()) &&
            !hostname.includes('localhost')
        ) ? parts[0] : null;
    }, [hostname, parts]);

    // 3. Resolve the subdomain string into the true Firestore Document ID
    useEffect(() => {
        const resolveDomain = async () => {
            if (subdomain) {
                try {
                    // Query the companies collection for the matching subdomain alias
                    const companiesRef = collection(db, 'companies');
                    const q = query(companiesRef, where('domainAliases', 'array-contains', subdomain));
                    const snap = await getDocs(q);

                    if (!snap.empty) {
                        const companyDoc = snap.docs[0];
                        const data = companyDoc.data();

                        // Redirect logic: If they used an old link, push them to the new active one
                        if (data.subdomain && data.subdomain !== subdomain) {
                            window.location.replace(`https://${data.subdomain}.sellar.in`);
                            return;
                        }

                        // Success: Set the actual Firestore ID
                        setResolvedCompanyId(companyDoc.id);
                    } else {
                        // Subdomain does not exist in the database
                        setDomainResolveError(true);
                    }
                } catch (error) {
                    console.error("Error resolving subdomain:", error);
                    setDomainResolveError(true);
                }
            } else if (pathId) {
                // If visited via standard Firebase Hosting (/catalogue/:companyId)
                setResolvedCompanyId(pathId);
            } else {
                setDomainResolveError(true);
            }
        };

        resolveDomain();
    }, [subdomain, pathId]);

    // 4. Point the effective ID to the newly resolved state
    const effectiveCompanyId = resolvedCompanyId;

    // Hooks
    const { businessName: companyName, loading: nameLoading } = useBusinessName(effectiveCompanyId || "");
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
    const [isSearchSticky, setIsSearchSticky] = useState(false);
    const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSalesSettings | null>(null);
    const hidePriceEnabled = catalogueSettings?.hidePrice === true;
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
    const [timedPopupOpen, setTimedPopupOpen] = useState(false);
    const [personalizationItem, setPersonalizationItem] = useState<Item | null>(null);
    const [personalizationText, setPersonalizationText] = useState('');
    const [showPersonalizationSuccess, setShowPersonalizationSuccess] = useState(false);
    const [forceLeadOpen, setForceLeadOpen] = useState(false);
    const [showLeadSuccess, setShowLeadSuccess] = useState(false);
    const liveItems = useMemo(() => {
        return allItems.filter(item => {
            if (!item.isListed) return false;
            const allIds = [
                ...(item.itemGroupId ? [item.itemGroupId] : []),
                ...(item.itemGroupIds || []),
            ];
            return allIds.length > 0 && allIds.some(id => id !== 'uncategorized');
        });
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
        const handleScroll = () => {
            // Header ki approximate height
            const stickyTriggerPoint = 110;

            if (window.scrollY > stickyTriggerPoint) {
                setIsSearchSticky(true);
            } else {
                setIsSearchSticky(false);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

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

                // FETCH BUSINESS INFO
                const businessRef = doc(db, "companies", effectiveCompanyId, "business_info", effectiveCompanyId);
                const businessSnap = await getDoc(businessRef);
                if (businessSnap.exists()) {
                    setSocialLinks(businessSnap.data());
                }

                // FETCH CATALOGUE SALES SETTINGS
                const settingsRef = doc(db, "companies", effectiveCompanyId, "settings", "catalogue-sales-settings");
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    setCatalogueSettings(settingsSnap.data() as CatalogueSalesSettings);
                }

                // FIX: FETCH PINNED CATEGORIES VIA HTTP INSTEAD OF WEBSOCKETS
                const pinnedRef = doc(db, 'companies', effectiveCompanyId, 'settings', 'pinned_categories');
                const pinnedSnap = await getDoc(pinnedRef);
                if (pinnedSnap.exists()) {
                    setPinnedIds(new Set(pinnedSnap.data().ids || []));
                } else {
                    setPinnedIds(new Set());
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
        // Only run if approval is required
        if (!catalogueSettings?.requireApproval) return;

        // Don't run if already filled
        const alreadyFilled = localStorage.getItem("leadSubmitted") === "true";
        if (alreadyFilled) return;

        const timer = setTimeout(() => {
            setTimedPopupOpen(true);
        }, 10000); // 10 seconds

        return () => clearTimeout(timer);
    }, [catalogueSettings?.requireApproval]);

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
            .filter(item => {
                const allIds = [
                    ...(item.itemGroupId ? [item.itemGroupId] : []),
                    ...(item.itemGroupIds || []),
                ];
                return allIds.includes(groupId);
            })
            .map(item => item.imageUrl)
            .filter(Boolean) as string[];

        return imgs.slice(0, 4);
    };

    const filteredItems = useMemo(() => {
        const getItemsForGroup = (groupId: string) =>
            allItems.filter(item => {
                const allIds = [
                    ...(item.itemGroupId ? [item.itemGroupId] : []),
                    ...(item.itemGroupIds || []),
                ];
                return allIds.includes(groupId);
            });
        if (!searchQuery.trim()) {
            return itemGroups
                .filter(group => {
                    if (!group.id) return false;
                    return getItemsForGroup(group.id).length > 0;
                })
                .sort((a, b) => {
                    const aPinned = pinnedIds.has(a.id!);
                    const bPinned = pinnedIds.has(b.id!);
                    if (aPinned !== bPinned) return aPinned ? -1 : 1;
                    return sortOrder === 'A-Z'
                        ? a.name.localeCompare(b.name)
                        : b.name.localeCompare(a.name);
                });
        }

        const lowerQuery = searchQuery.toLowerCase().trim();

        return itemGroups
            .filter((group: ItemGroup) => {
                if (!group.id) return false;
                const groupItems = getItemsForGroup(group.id);
                if (groupItems.length === 0) return false;
                const catalogueMatch = fuzzyMatch(group.name, lowerQuery);
                const itemMatch = groupItems.some((item: Item) =>
                    fuzzyMatch(item.name, lowerQuery)
                );
                return catalogueMatch || itemMatch;
            })
            .sort((a, b) => {
                const aPinned = pinnedIds.has(a.id!);
                const bPinned = pinnedIds.has(b.id!);
                if (aPinned !== bPinned) return aPinned ? -1 : 1;
                return sortOrder === 'A-Z'
                    ? a.name.localeCompare(b.name)
                    : b.name.localeCompare(a.name);
            });

    }, [itemGroups, allItems, searchQuery, sortOrder, pinnedIds]);
    const handlePersonalizationSubmit = async (item: Item, note: string) => {
        try {
            if (!effectiveCompanyId) return;

            const alreadyFilled = localStorage.getItem("leadSubmitted") === "true";
            if (!alreadyFilled) {
                setForceLeadOpen(false);
                setTimeout(() => setForceLeadOpen(true), 0);
                return;
            }

            const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");
            const name = leadData?.name || "Guest User";
            const number = (leadData?.number || "").replace(/\D/g, "").trim();

            if (!number) { setForceLeadOpen(true); return; }

            const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
            const { db } = await import('../lib/Firebase');

            const docKey = `${number}_${String(item.id ?? Date.now())}`;
            const ref = doc(db, "companies", effectiveCompanyId, "PersonalizationRequests", docKey);

            await setDoc(ref, {
                customerName: name || "Guest User",
                customerNumber: number,
                itemId: String(item.id ?? ""),
                itemName: String(item.name ?? "General Request"),
                itemImage: String(item.imageUrl ?? ""),
                note: note.trim(),
                status: "pending",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }, { merge: true });

            setPersonalizationItem(null);
            setPersonalizationText('');
            setShowPersonalizationSuccess(true);
        } catch (err) {
            console.error("Personalization error:", err);
        }
    };
    if (domainResolveError) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#E9F0F7] text-[#1A3B5D]">
                <h2 className="text-2xl font-black mb-2">Store Not Found</h2>
                <p className="text-gray-500 text-sm">This catalogue link is invalid or has expired.</p>
            </div>
        );
    }

    // Wait until the domain is fully resolved AND the data finishes loading
    if (!effectiveCompanyId || isLoading || nameLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#E9F0F7]">
                <Spinner /> <span className="ml-2 font-bold text-[#1A3B5D]">Loading Store...</span>
            </div>
        );
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
            <LeadPopUp
                companyId={effectiveCompanyId}
                companyName={companyName}
                autoPopup={false}
                detailsOnly={!catalogueSettings?.requireApproval}
                forceOpen={forceLeadOpen || (catalogueSettings?.requireApproval ? timedPopupOpen : false)}
                onLeadSubmit={() => {
                    setTimedPopupOpen(false);
                    setForceLeadOpen(false);
                    localStorage.setItem("leadJustSubmitted", "true");
                    setShowLeadSuccess(true);
                    setTimeout(() => setShowLeadSuccess(false), 4000);
                }}
            />
            {/* --- HEADER --- */}
            <header className="sticky top-0 z-[100] bg-white border-b border-gray-100 shadow-sm w-full">
                <div className="max-w-7xl mx-auto px-3 py-3 relative flex items-center justify-end">

                    {/* Center Section - Company Name */}
                    <h1 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-lg md:text-lg font-black text-[#1A3B5D] uppercase tracking-tighter text-center whitespace-nowrap">
                        {companyName}
                    </h1>

                    {/* Right Section - Query + Cart Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                const alreadyFilled = localStorage.getItem('leadSubmitted') === 'true';
                                if (!alreadyFilled) {
                                    setForceLeadOpen(false);
                                    setTimeout(() => setForceLeadOpen(true), 0);
                                    return;
                                }
                                setPersonalizationItem({} as Item);
                                setPersonalizationText('');
                            }}
                            className="flex items-center justify-center gap-1.5 bg-[#F97316] text-white py-2 px-3 md:px-4 rounded-sm font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all"
                            title="Send a Query"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation(); // Forces the browser to ONLY click this button
                                if (effectiveCompanyId) {
                                    navigate(subdomain ? '/checkout' : `/checkout/${effectiveCompanyId}`);
                                }
                            }}
                            className="hidden md:flex items-center justify-center gap-2 bg-[#F97316] text-white py-2 px-4 rounded-sm font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all relative cursor-pointer"
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

            <main className="p-1 md:p-6 space-y-4 flex-1 max-w-7xl mx-auto w-full pb-12 md:pb-20">
                {showLeadSuccess && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-sm text-center relative animate-fade-in">
                        ✅ Details submitted! You can now browse and add items to your cart.
                        <button
                            onClick={() => setShowLeadSuccess(false)}
                            className="absolute right-2 top-2 text-green-600 font-black"
                        >
                            ✕
                        </button>
                    </div>
                )}
                {showPersonalizationSuccess && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-sm text-center relative animate-fade-in">
                        ✅ Personalization request submitted! We'll get back to you soon.
                        <button
                            onClick={() => setShowPersonalizationSuccess(false)}
                            className="absolute right-2 top-2 text-green-600 font-black"
                        >
                            ✕
                        </button>
                    </div>
                )}
                <div className='flex items-center justify-center mt-1'>
                    <h1 className="text-lg md:text-xl font-extrabold text-[#F97316] uppercase tracking-tighter">Categories</h1>
                </div>

                <div
                    className={`flex justify-center transition-all duration-300 ${isSearchSticky ? "sticky top-[60px] z-50" : "relative"}`}>
                    <div className="relative group max-w-md mx-auto w-full">
                        <SearchBar
                            items={liveItems}
                            itemGroups={itemGroups}
                            hideUncategorized={true}
                            hideOutOfStock={catalogueSettings?.hideOutOfStock ?? false}
                            onItemSelected={(item: any) => {
                                setSearchQuery(item.name);
                                const group = itemGroups.find(g => g.id === item.itemGroupId);
                                const slug = group ? generateSlug(group.name) : item.itemGroupId;

                                navigate(
                                    subdomain ? `/${slug}` : `/${effectiveCompanyId}/${slug}`,
                                    { state: { highlightItemId: item.id } }
                                );
                            }}
                        />
                    </div>
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
                        const itemCount = allItems.filter(item => {
                            const allIds = [
                                ...(item.itemGroupId ? [item.itemGroupId] : []),
                                ...(item.itemGroupIds || []),
                            ];
                            return allIds.includes(group.id!);
                        }).length;
                        const collageImages = getGroupImages(group.id!);
                        return (
                            <div
                                key={group.id}
                                onClick={() => {
                                    const slug = generateSlug(group.name);
                                    navigate(subdomain ? `/${slug}` : `/${effectiveCompanyId}/${slug}`);
                                }}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border flex flex-col transition-all group cursor-pointer active:scale-95 ${pinnedIds.has(group.id!) ? 'ring-1 ring-[#F97316] shadow-lg border-[#F97316]' : 'border-gray-100'}`}
                            >
                                <div className="aspect-square bg-[#F8FAFC] relative overflow-hidden">
                                    {pinnedIds.has(group.id!) && (
                                        <div className="absolute top-1.5 right-1.5 z-10 bg-white text-[#F97316] rounded-sm px-1 py-1 flex items-center gap-0.5 shadow-md border border-[#F97316]">
                                            <Pin size={12} className="fill-[#F97316]" />
                                        </div>
                                    )}
                                    {collageImages.length > 0 ? (
                                        <div
                                            className={`w-full h-full gap-[2px] p-[2px] grid ${collageImages.length === 1
                                                ? 'grid-cols-1 grid-rows-1'
                                                : collageImages.length === 2
                                                    ? 'grid-cols-2 grid-rows-1'
                                                    : 'grid-cols-2 grid-rows-2'
                                                }`}
                                        >
                                            {collageImages.map((img, index) => (
                                                <div
                                                    key={index}
                                                    className={`w-full h-full overflow-hidden rounded-[2px] ${
                                                        // Special case: If 3 images, make the first one span two rows
                                                        collageImages.length === 3 && index === 0 ? 'row-span-2' : ''
                                                        }`}
                                                >
                                                    <img
                                                        src={img}
                                                        alt={`product-${index}`}
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                            <FiPackage className="h-10 w-10 text-gray-200" />
                                        </div>
                                    )}
                                </div>

                                <div className="p-3 flex flex-col flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="text-[14px] font-bold text-[#1A3B5D] truncate leading-tight">
                                            {group.name}
                                        </h3>
                                    </div>

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
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Forces the browser to ONLY click this button
                    if (effectiveCompanyId) {
                        navigate(subdomain ? '/checkout' : `/checkout/${effectiveCompanyId}`);
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
                            {!hidePriceEnabled && !catalogueSettings?.requireApproval && (
                                <span className="text-[15px] font-bold">
                                    ₹{cartTotal.toFixed(2)}
                                </span>
                            )}
                        </div>


                        <ShoppingCart size={20} />

                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2 font-black uppercase text-[12px]">
                        View Cart →
                    </div>

                </div>
            </div>
            {/* PERSONALIZATION POPUP */}
            {personalizationItem && (
                <div
                    className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={() => setPersonalizationItem(null)}
                >
                    <div
                        className="bg-white w-full md:max-w-md rounded-t-sm md:rounded-sm shadow-2xl p-5 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-black text-[#1A3B5D] uppercase tracking-tight">
                                    Send a Query
                                </h2>
                                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                                    Describe what you're looking for
                                </p>
                            </div>
                            <button
                                onClick={() => setPersonalizationItem(null)}
                                className="text-gray-400 hover:text-gray-700 font-black text-lg leading-none"
                            >✕</button>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">
                                Your Query
                            </label>
                            <textarea
                                rows={5}
                                value={personalizationText}
                                onChange={(e) => setPersonalizationText(e.target.value)}
                                placeholder="e.g. I need a blue hoodie in size L with 'Rahul' printed on it..."
                                className="w-full border border-gray-200 rounded-sm p-3 text-sm text-gray-700 outline-none focus:border-[#1A3B5D] resize-none"
                            />
                        </div>

                        <button
                            disabled={!personalizationText.trim()}
                            onClick={() => handlePersonalizationSubmit(personalizationItem, personalizationText)}
                            className={`w-full py-3 rounded-sm text-[12px] font-black uppercase tracking-widest transition-all ${personalizationText.trim()
                                ? 'bg-[#F97316] text-white active:scale-95'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            Submit Query
                        </button>
                    </div>
                </div>
            )}
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