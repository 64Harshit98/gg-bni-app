import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { FiX, FiPackage, FiPlus } from 'react-icons/fi';
import { Trash2, X, Send, Pin } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import { db } from '../lib/Firebase';
import { addDoc, collection, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { useNavigate } from 'react-router';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SubdomainClaimModal from '../Components/SubDomainModal';
import SearchableItemInput from '../UseComponents/SearchIteminput';

const OrderingPage: React.FC = () => {
    // --- States ---
    const navigate = useNavigate()
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const { businessName: companyName, loading: _nameLoading } = useBusinessName(companyId);
    const dbOperations = useDatabase();
    const [items, setItems] = useState<Item[]>([]);
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [searchQuery, _setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [cart, setCart] = useState<any[]>([]);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [_selectedItem, _setSelectedItem] = useState<Item | null>(null);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [highlightedId, _setHighlightedId] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [socialLinks, setSocialLinks] = useState<any>({});

    // --- YOUR NEW STATES ---
    const [editingId, setEditingId] = useState<string | null>(null);
    const [tempName, setTempName] = useState('');
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
    const [isSubdomainModalOpen, setIsSubdomainModalOpen] = useState(false); // <-- NEW STATE

    useEffect(() => {
        if (!companyId) return;
        const loadPins = async () => {
            try {
                const ref = doc(db, 'companies', companyId, 'settings', 'pinned_categories');
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    const ids: string[] = snap.data().ids || [];
                    setPinnedIds(new Set(ids));
                    localStorage.setItem(`pinned_${companyId}`, JSON.stringify(ids));
                } else {
                    const saved = localStorage.getItem(`pinned_${companyId}`);
                    if (saved) setPinnedIds(new Set(JSON.parse(saved)));
                }
            } catch {
                const saved = localStorage.getItem(`pinned_${companyId}`);
                if (saved) setPinnedIds(new Set(JSON.parse(saved)));
            }
        };
        loadPins();
    }, [companyId]);
    // --- Fetch Data ---
    useEffect(() => {
        if (authLoading || !currentUser || !dbOperations) {
            setPageIsLoading(authLoading || !dbOperations);
            return;
        }

        const fetchData = async () => {
            if (!companyId) return;
            console.log("COMPANY ID:", companyId);
            try {
                setPageIsLoading(true);

                const [fetchedItems, fetchedItemGroups] = await Promise.all([
                    dbOperations.syncItems(),
                    dbOperations.getItemGroups()
                ]);

                let updatedGroups = [...fetchedItemGroups];

                setItems(fetchedItems);

                const groupMap = new Map<string, ItemGroup>();

                updatedGroups.forEach(group => {
                    if (!group.id) return;

                    if (!groupMap.has(group.id)) {
                        groupMap.set(group.id, group);
                    }
                });

                setItemGroups(
                    Array.from(groupMap.values()).sort((a, b) =>
                        a.name.localeCompare(b.name)
                    )
                );

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

            } catch (err) {
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

    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")       // Replace spaces with hyphens
            .replace(/[^a-z0-9-]/g, ""); // Remove special characters
    };

    const handleShareCategory = async (group: ItemGroup) => {
        if (!companyId || !group?.id) return;

        const categorySlug = generateSlug(group.name);

        // 1. Safe fallback just in case
        let shareUrl = `${window.location.origin}/${companyId}/${categorySlug}`;

        try {
            // 2. Fetch their official subdomain instantly on click
            const docRef = doc(db, 'companies', companyId);
            const snap = await getDoc(docRef);

            if (snap.exists() && snap.data().subdomain) {
                // 3. Overwrite with the beautiful public URL!
                shareUrl = `https://${snap.data().subdomain}.sellar.in/${categorySlug}`;
            }
        } catch (error) {
            console.error("Error fetching subdomain for sharing:", error);
        }

        try {
            if (navigator.share) {
                await navigator.share({
                    title: `${companyName} - ${group.name}`,
                    text: `Check out this category from ${companyName}`,
                    url: shareUrl,
                });
            } else {
                // Fallback for desktop browsers
                await navigator.clipboard.writeText(shareUrl);

                // Using your existing modal state instead of a native alert for a cleaner UI!
                setModal({ message: "Category link copied to clipboard!", type: State.SUCCESS });
            }
        } catch (error) {
            console.log("Share cancelled:", error);
        }
    };
    const handleTogglePin = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setPinnedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            if (companyId) {
                localStorage.setItem(`pinned_${companyId}`, JSON.stringify([...next]));
                const ref = doc(db, 'companies', companyId, 'settings', 'pinned_categories');
                setDoc(ref, { ids: [...next] }, { merge: true });
            }
            return next;
        });
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
        const validGroupIds = new Set(itemGroups.map(g => g.id));
        const uncategorizedItems = items.filter(item =>
            !item.itemGroupId || !validGroupIds.has(item.itemGroupId)
        );

        let displayedGroups = [...itemGroups];
        if (uncategorizedItems.length > 0) {
            displayedGroups.push({
                id: 'uncategorized',
                name: 'Uncategorized',
                description: 'System default category'
            } as ItemGroup);
        }

        const query = searchQuery.toLowerCase().trim();
        if (query) {
            displayedGroups = displayedGroups.filter(group => {
                const groupItems = group.id === 'uncategorized'
                    ? uncategorizedItems
                    : items.filter(i => i.itemGroupId === group.id);

                const matchesGroupName = group.name.toLowerCase().includes(query);
                const matchesInnerItems = groupItems.some(item =>
                    item.name.toLowerCase().includes(query)
                );

                return matchesGroupName || matchesInnerItems;
            });
        }

        return displayedGroups.sort((a, b) => {
            const aPinned = pinnedIds.has(a.id!);
            const bPinned = pinnedIds.has(b.id!);
            if (aPinned !== bPinned) return aPinned ? -1 : 1;
            if (sortOrder === 'A-Z') return a.name.localeCompare(b.name);
            return b.name.localeCompare(a.name);
        });
    }, [itemGroups, items, searchQuery, sortOrder, pinnedIds]);

    const getGroupImages = (groupId: string): string[] => {
        const validGroupIds = new Set(itemGroups.map(g => g.id));

        const imgs = items
            .filter(item => {
                if (groupId === 'uncategorized') {
                    return !item.itemGroupId || !validGroupIds.has(item.itemGroupId);
                }
                return item.itemGroupId === groupId;
            })
            .map(item => item.imageUrl)
            .filter(Boolean) as string[];

        return imgs.slice(0, 4); // max 4 images
    };

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

            {/* --- UPDATED ONBOARDING MODAL --- */}
            {companyId && (
                <SubdomainClaimModal
                    companyId={companyId}
                    forceOpen={isSubdomainModalOpen}
                    onClose={() => setIsSubdomainModalOpen(false)}
                />
            )}

            <header className="sticky top-0 z-[100] bg-white border-b border-gray-100 shadow-sm w-full">
                {/* Changed py-8 to py-4 to make the header a normal height */}
                <div className="max-w-7xl mx-auto px-4 py-4 relative flex items-center justify-between h-16">

                    {/* Company Name */}
                    <h1 className="absolute left-4 right-28 top-1/2 -translate-y-1/2 text-sm sm:text-lg md:text-lg font-black text-[#1A3B5D] uppercase tracking-tighter text-center leading-tight sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:whitespace-nowrap">
                        {companyName}
                    </h1>

                    {/* Left Spacer */}
                    <div className="w-24"></div>

                    {/* Store Link Button */}
                    <button
                        onClick={() => setIsSubdomainModalOpen(true)}
                        className="bg-blue-50 text-blue-600 px-3 py-2 rounded-sm text-[10px] font-black uppercase tracking-wider border border-blue-100 hover:bg-blue-100 transition-colors z-10 shrink-0"
                    >
                        Store Link
                    </button>
                </div>
            </header>
            <main className="p-4 space-y-4 flex-1 max-w-7xl mx-auto w-full pb-20">
                <div className='flex items-center justify-center'>
                    <h1 className="text-sm md:text-xl font-extrabold text-[#F97316] uppercase tracking-tighter">Categories</h1>
                </div>

                {/* --- STICKY SEARCH BAR --- */}
                <div className="sticky top-[68px] z-50 flex justify-center">
                    <div className="relative group max-w-md mx-auto w-full">
                        <SearchableItemInput
                            items={items}
                            placeholder="Search products..."
                            onItemSelected={(item) => {
                                if (!item.id) return;
                                const group = itemGroups.find(g => g.id === item.itemGroupId);
                                const uncategorizedGroup = itemGroups.find(g => g.name.toLowerCase().trim() === "uncategorized");
                                const slug = group
                                    ? generateSlug(group.name)
                                    : uncategorizedGroup
                                        ? generateSlug(uncategorizedGroup.name)
                                        : "uncategorized";
                                navigate(`/catalogue-home/my-shop/${slug}`, {
                                    state: { highlightItemId: item.id, isUnlisted: !item.isListed }
                                });
                            }}
                        />
                    </div>
                </div>
                {/* --- CATALOGUE COUNT & FILTER --- */}
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
                            className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-sm shadow-sm active:scale-95 transition-all"
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

                {/* --- PRODUCT GRID --- */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                    {filteredItems.map(group => {
                        const validGroupIds = new Set(itemGroups.map(g => g.id));
                        const isVirtual = group.id === 'uncategorized';
                        const itemCount = items.filter(item =>
                            isVirtual
                                ? (!item.itemGroupId || !validGroupIds.has(item.itemGroupId))
                                : (item.itemGroupId === group.id)
                        ).length;
                        const collageImages = getGroupImages(group.id!);

                        return (
                            <div
                                id={group.id}
                                key={group.id}
                                onClick={() => navigate(`/catalogue-home/my-shop/${group.id}`)}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border flex flex-col transition-all group cursor-pointer active:scale-95 ${highlightedId === group.id ? 'ring-2 ring-[#F97316] shadow-lg scale-[1.02]' : 'border-gray-100'
                                    } ${isVirtual ? 'border-dashed border-gray-300' : ''}`}
                            >
                                {/* --- IMAGE SECTION WITH TOP BADGE --- */}
                                <div className="aspect-square bg-[#F8FAFC] relative overflow-hidden">
                                    {pinnedIds.has(group.id!) && (
                                        <div className="absolute top-1.5 right-1.5 z-10 bg-white text-[#F97316] rounded-sm px-1 py-1 flex items-center gap-0.5 shadow-md">
                                            <Pin size={12} className="fill-[#F97316]" />
                                        </div>
                                    )}
                                    {collageImages.length > 0 ? (
                                        <div
                                            className={`w-full h-full gap-[2px] p-[2px] ${
                                                collageImages.length === 1
                                                    ? 'grid grid-cols-1 grid-rows-1'
                                                    : collageImages.length === 2
                                                        ? 'grid grid-cols-2 grid-rows-1'
                                                        : collageImages.length === 3
                                                            ? 'grid grid-cols-2 grid-rows-2'
                                                            : 'grid grid-cols-2 grid-rows-2'
                                            }`}
                                        >
                                            {collageImages.map((img, index) => {
                                                const isThreeImagesLayout = collageImages.length === 3;
                                                const isLastImage = index === 2;

                                                return (
                                                    <div
                                                        key={index}
                                                        className={`w-full h-full overflow-hidden rounded-[2px] ${
                                                            isThreeImagesLayout && isLastImage
                                                                ? 'col-span-2'
                                                                : ''
                                                        }`}
                                                    >
                                                        <img
                                                            src={img}
                                                            alt={`product-${index}`}
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <FiPackage className="h-10 w-10 text-gray-200" />
                                        </div>
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
                                                className="w-full bg-gray-50 border border-gray-100 rounded-sm py-1 px-2 text-[14px] font-bold outline-none focus:ring-1 focus:ring-[#F97316]"
                                            />
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleSaveEdit(group.id!); }}
                                                    className="flex-1 bg-[#F97316] text-white py-1.5 rounded-sm text-[12px] font-black uppercase hover:bg-[#ea580c] transition-colors"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();

                                                        if (window.confirm("Delete product group?") && dbOperations) {
                                                            try {
                                                                const itemsToUpdate = items.filter(
                                                                    item => item.itemGroupId === group.id
                                                                );

                                                                await Promise.all(
                                                                    itemsToUpdate.map(item =>
                                                                        dbOperations.updateItem(item.id!, {
                                                                            itemGroupId: ""
                                                                        })
                                                                    )
                                                                );

                                                                await dbOperations.deleteItemGroup(group.id!);

                                                                setItemGroups(itemGroups.filter(p => p.id !== group.id));
                                                                setModal({ message: 'Deleted successfully', type: State.SUCCESS });
                                                            } catch (err) {
                                                                console.error(err);
                                                                setModal({ message: 'Delete failed', type: State.ERROR });
                                                            }
                                                        }
                                                    }}
                                                    className="p-3 bg-red-100 text-red-700 rounded-sm hover:bg-red-200 transition-colors"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                                                    className="p-3 bg-gray-200 text-gray-500 rounded-sm hover:bg-gray-300 transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <h3 className="text-[14px] font-bold text-[#1A3B5D] uppercase leading-tight break-words overflow-hidden max-h-[2.5em]">
                                                    {isVirtual
                                                        ? <i className="text-gray-500">{group.name}</i>
                                                        : group.name
                                                    }
                                                </h3>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {/* Pin button — always visible for all non-virtual groups */}
                                                    {!isVirtual && (
                                                        <button
                                                            onClick={(e) => handleTogglePin(e, group.id!)}
                                                            className={`p-1.5 rounded-sm transition-all ${pinnedIds.has(group.id!)
                                                                ? 'bg-[#F97316]/10 text-[#F97316]'
                                                                : 'bg-gray-100 text-gray-400 hover:bg-[#F97316] hover:text-white'
                                                                }`}
                                                            title={pinnedIds.has(group.id!) ? 'Unpin' : 'Pin to top'}
                                                        >
                                                            <Pin size={12} className={pinnedIds.has(group.id!) ? 'fill-white' : ''} />
                                                        </button>
                                                    )}

                                                    {/* Share button */}
                                                    {!isVirtual && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleShareCategory(group);
                                                            }}
                                                            className="p-1.5 rounded-sm bg-[#F97316]/10 text-[#F97316] hover:bg-[#F97316] hover:text-white transition-all"
                                                            title="Share Category"
                                                        >
                                                            <Send size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Centered Item Count Badge UI */}
                                            <div className="flex items-center justify-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-sm border border-blue-100 w-fit mx-auto mb-2">
                                                <span className="text-[12px] font-black text-[#F97316] leading-none">
                                                    {itemCount}
                                                </span>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-[#1A3B5D]/60 leading-none">
                                                    Items
                                                </span>
                                            </div>

                                            {/* Actions Logic */}
                                            {!isVirtual ? (
                                                <div
                                                    className="mt-auto w-full py-1.5 rounded-sm text-[12px] font-black uppercase text-center tracking-wider transition-all bg-[#F97316] text-white hover:bg-[#ea580c]"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEdit(group);
                                                    }}
                                                >
                                                    Edit Group
                                                </div>
                                            ) : (
                                                <div className="mt-auto w-full py-1.5 rounded-sm text-[12px] font-black uppercase text-center tracking-wider bg-gray-100 text-gray-400 cursor-not-allowed">
                                                    Default
                                                </div>
                                            )}
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
                            <input type="text" placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full bg-gray-50 border-none rounded-sm p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-[#F97316]/20" />
                            <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full bg-gray-50 border-none rounded-sm p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-[#F97316]/20" />
                        </div>
                        <button disabled={isPlacingOrder} onClick={handleConfirmAndSaveOrder} className="w-full mt-6 bg-[#F97316] text-white py-4 rounded-sm font-black text-[10px] uppercase shadow-lg tracking-widest active:scale-95 disabled:opacity-50 transition-all">
                            {isPlacingOrder ? 'Placing Order...' : 'Confirm Order'}
                        </button>
                    </div>
                </div>
            )}
            <div className="w-full m-0 p-0">
                <Footer
                    companyName={companyName}
                    instagram={socialLinks.instagram}
                    facebook={socialLinks.facebook}
                    twitter={socialLinks.twitter}
                    gmail={socialLinks.gmail}
                />
            </div>
        </div>
    );
};

export default OrderingPage;