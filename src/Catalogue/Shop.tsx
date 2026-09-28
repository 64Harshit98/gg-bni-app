import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, useDatabase } from '../context/auth-context';
import { useCatalogueData } from '../context/CatalogueDataContext';
import type { Item, ItemGroup } from '../constants/models';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { FiX, FiPackage, FiPlus } from 'react-icons/fi';
import { Trash2, X, Send, Pin, Download, Loader2 } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import { db } from '../lib/Firebase';
import { addDoc, collection, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { useNavigate } from 'react-router';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SubdomainClaimModal from '../Components/SubDomainModal';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from './enum/cata_permissions.enum';


// 1. Updated normalizer: Converts ANY image format (WebP, AVIF, PNG) into a jsPDF-safe JPEG
const blobToNormalizedBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.crossOrigin = 'Anonymous';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.8)); // 0.8 compression keeps PDF file size down
            } else {
                reject(new Error("Canvas context failed"));
            }
            URL.revokeObjectURL(url);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image load error"));
        };
        img.src = url;
    });
};

// 2. Your existing fetch logic, routing the blob through the new Canvas normalizer
const convertImageUrlToBase64 = async (url: string, itemName: string): Promise<string> => {
    if (!url) {
        console.warn(`⚠️ [${itemName}] No Image URL provided in the database.`);
        return "";
    }

    try {
        const cacheBuster = url + (url.includes('?') ? '&' : '?') + 'cb=' + new Date().getTime();
        const response = await fetch(cacheBuster, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();

        // Pass through the new normalizer
        return await blobToNormalizedBase64(blob);

    } catch (err) {
        console.warn(`⚠️ [${itemName}] Direct fetch blocked. Trying Proxy...`);
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const proxyResponse = await fetch(proxyUrl);
            if (!proxyResponse.ok) throw new Error(`Proxy HTTP ${proxyResponse.status}`);
            const blob = await proxyResponse.blob();

            // Pass through the new normalizer
            return await blobToNormalizedBase64(blob);

        } catch (proxyErr) {
            console.error(`❌ [${itemName}] Both direct and proxy fetch failed.`);
            return "";
        }
    }
};
// Helper to calculate effective prices consistently
const getEffectivePriceInfo = (item: Item) => {
    const mrp = Number(item.mrp || 0);
    const itemSalesPrice = Number(item.salesPrice || 0);
    const presetDiscount = Number(item.discount || 0);

    let salePrice = 0;
    if (mrp > 0 && itemSalesPrice > 0) {
        salePrice = itemSalesPrice;
    } else if (itemSalesPrice > 0) {
        salePrice = itemSalesPrice * (1 - (presetDiscount / 100));
    } else if (mrp > 0) {
        salePrice = mrp * (1 - (presetDiscount / 100));
    }
    salePrice = Math.round((salePrice + Number.EPSILON) * 100) / 100;

    return {
        mrp,
        salePrice,
        hasBothPrices: mrp > 0 && salePrice > 0 && salePrice < mrp
    };
};

const OrderingPage: React.FC = () => {
    // --- States ---
    const navigate = useNavigate()
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const { businessName: companyName, loading: _nameLoading } = useBusinessName(companyId);
    const dbOperations = useDatabase();
    const { items: catalogueItems, itemsLoading, itemGroups: catalogueItemGroups, itemGroupsLoading } = useCatalogueData();
    // Local mirrors (not direct context reads) — this page optimistically
    // mutates both after live-toggling items and renaming/deleting groups,
    // ahead of the shared listener echoing those writes back.
    const [items, setItems] = useState<Item[]>(catalogueItems);
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>(catalogueItemGroups);
    useEffect(() => { setItems(catalogueItems); }, [catalogueItems]);
    useEffect(() => { setItemGroups(catalogueItemGroups); }, [catalogueItemGroups]);
    const [searchQuery, _setSearchQuery] = useState('');
    const pageIsLoading = authLoading || !dbOperations || itemsLoading || itemGroupsLoading;
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
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    // --- YOUR NEW STATES ---
    const [editingId, setEditingId] = useState<string | null>(null);
    const [tempName, setTempName] = useState('');
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
    const [isSubdomainModalOpen, setIsSubdomainModalOpen] = useState(false); // <-- NEW STATE

    // --- GLOBAL "LIVE ENTIRE CATALOGUE" STATES ---
    const [isAllCatalogueLive, setIsAllCatalogueLive] = useState(false);
    const [showCatalogueConfirmPopup, setShowCatalogueConfirmPopup] = useState(false);
    const [pendingCatalogueLiveState, setPendingCatalogueLiveState] = useState<boolean | null>(null);
    const [isTogglingCatalogue, setIsTogglingCatalogue] = useState(false);

    useEffect(() => {
        if (!items || items.length === 0) {
            setIsAllCatalogueLive(false);
            return;
        }
        setIsAllCatalogueLive(items.every(item => item.isListed === true));
    }, [items]);

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
    // --- Fetch business info (page-specific; items/itemGroups come from
    // CatalogueDataContext, mirrored into local state above) ---
    useEffect(() => {
        if (!companyId) return;

        const fetchBusinessInfo = async () => {
            try {
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
                console.error("Error fetching business info:", err);
            }
        };
        fetchBusinessInfo();
    }, [companyId]);

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
    const handleToggleAllCatalogueLive = () => {
        setPendingCatalogueLiveState(!isAllCatalogueLive);
        setShowCatalogueConfirmPopup(true);
    };

    const confirmToggleAllCatalogueLive = async () => {
        if (!dbOperations || pendingCatalogueLiveState === null) return;
        const newState = pendingCatalogueLiveState;
        setShowCatalogueConfirmPopup(false);
        setIsTogglingCatalogue(true);

        try {
            const updates = items.map(item =>
                dbOperations.updateItem(item.id!, { isListed: newState })
            );
            await Promise.all(updates);

            setItems(prev => prev.map(item => ({ ...item, isListed: newState })));
            setIsAllCatalogueLive(newState);
            setModal({ message: `Entire catalogue is now ${newState ? 'LIVE' : 'UNLIVE'}`, type: State.SUCCESS });
        } catch (err) {
            console.error("Bulk catalogue toggle failed:", err);
            setModal({ message: 'Failed to update catalogue status', type: State.ERROR });
        } finally {
            setIsTogglingCatalogue(false);
            setPendingCatalogueLiveState(null);
        }
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

    const itemGroupMap = useMemo(() => {
        return itemGroups.reduce((acc, group) => {
            if (group.id) {
                acc[group.id] = group.name;
            }
            return acc;
        }, {} as Record<string, string>);
    }, [itemGroups]);

    const handleDownloadFullCatalogPDF = async () => {
        // 1. STRICT filter for live items only
        const liveItems = items.filter(item => item.isListed === true);

        if (liveItems.length === 0) {
            setModal({ message: 'No live items available to download.', type: State.ERROR });
            return;
        }

        setIsGeneratingPDF(true);

        try {
            // Deferred to keep jsPDF/jspdf-autotable out of the storefront's
            // initial bundle — only fetched when a customer actually clicks
            // "Download Catalogue PDF".
            const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable'),
            ]);

            const doc = new jsPDF();

            // --- Document Header ---
            doc.setFontSize(18);
            doc.text(`${companyName} - Catalogue`, 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated by SELLAR.IN: ${new Date().toLocaleDateString()}`, 14, 26);

            const tableBody: any[] = [];
            const tableImages: string[] = [];

            // 2. Sort ONLY the strictly filtered live items
            const sortedItems = [...liveItems].sort((a, b) => {
                const catA = a.itemGroupId ? itemGroupMap[a.itemGroupId] || 'Uncategorized' : 'Uncategorized';
                const catB = b.itemGroupId ? itemGroupMap[b.itemGroupId] || 'Uncategorized' : 'Uncategorized';

                if (catA === catB) {
                    return (a.name || '').localeCompare(b.name || '');
                }
                return catA.localeCompare(catB);
            });

            // --- Prepare Data (Throttled to prevent 429 errors) ---
            for (const item of sortedItems) {
                const { salePrice, mrp, hasBothPrices } = getEffectivePriceInfo(item);
                let base64Img = '';

                if (item.imageUrl) {
                    // Make sure your convertImageUrlToBase64 function in THIS file 
                    // has been updated to use the Canvas normalizer!
                    base64Img = await convertImageUrlToBase64(
                        item.imageUrl,
                        item.name || 'Unknown Product'
                    );

                    // Tiny 50ms artificial delay between fetches to keep Google servers happy
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                const catName = item.itemGroupId ? itemGroupMap[item.itemGroupId] || 'Uncategorized' : 'Uncategorized';
                const mrpText = hasBothPrices ? `Rs. ${mrp}` : '-';
                const salePriceText = `Rs. ${salePrice}`;

                tableBody.push([
                    '', // Image placeholder
                    item.name?.toUpperCase() || 'UNNAMED PRODUCT',
                    catName,
                    mrpText,
                    salePriceText
                ]);

                tableImages.push(base64Img);
            }

            // --- Generate AutoTable ---
            autoTable(doc, {
                startY: 32,
                margin: { bottom: 25 }, // CRITICAL: Adds space at the bottom so the table doesn't hit the footer
                head: [['Image', 'Product Details', 'Category', 'MRP', 'Sale Price']],
                body: tableBody,
                headStyles: { fillColor: [249, 115, 22] }, // Orange
                bodyStyles: { minCellHeight: 25, valign: 'middle' },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 'auto', fontStyle: 'bold', textColor: [26, 59, 93] },
                    2: { cellWidth: 35, textColor: [100, 100, 100] },
                    3: { cellWidth: 20, halign: 'center', textColor: [156, 163, 175] },
                    4: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: [249, 115, 22] }
                },
                didDrawCell: (data) => {
                    // Inject images into the first column
                    if (data.column.index === 0 && data.cell.section === 'body') {
                        const base64Img = tableImages[data.row.index];
                        if (base64Img) {
                            // Because we used the Canvas normalizer, this is now a guaranteed clean JPEG
                            doc.addImage(base64Img, 'JPEG', data.cell.x + 2, data.cell.y + 2, 21, 21);
                        }
                    }
                },
                didDrawPage: () => {
                    // --- Footer Branding Injection ---
                    const pageSize = doc.internal.pageSize;
                    const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
                    const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                    const footerY = pageHeight - 12; // Base Y position near the bottom

                    doc.setFontSize(10);

                    // -- Line 1: Powered by SELLAR.IN --
                    doc.setFont('helvetica', 'bold');
                    const text1a = "Powered by ";
                    const text1b = "SELLAR.IN";
                    const w1a = doc.getTextWidth(text1a);
                    const w1b = doc.getTextWidth(text1b);
                    const startX1 = (pageWidth - (w1a + w1b)) / 2; // Centers the combined text

                    doc.setTextColor(0, 0, 0); // Black
                    doc.text(text1a, startX1, footerY - 5);

                    doc.setTextColor(37, 99, 235); // Blue
                    doc.text(text1b, startX1 + w1a, footerY - 5);

                    // Draw underline for SELLAR.IN
                    doc.setLineWidth(0.3);
                    doc.setDrawColor(37, 99, 235);
                    doc.line(startX1 + w1a, footerY - 4, startX1 + w1a + w1b, footerY - 4);

                    // -- Line 2: Made with Love in India --
                    doc.setFont('helvetica', 'normal');
                    const text2a = "Made with ";
                    const text2b = "Love";
                    const text2c = " in India";
                    const w2a = doc.getTextWidth(text2a);
                    const w2b = doc.getTextWidth(text2b);
                    const w2c = doc.getTextWidth(text2c);
                    const startX2 = (pageWidth - (w2a + w2b + w2c)) / 2;

                    doc.setTextColor(0, 0, 128); // Dark Navy/Blackish for start
                    doc.text(text2a, startX2, footerY);

                    doc.setTextColor(239, 68, 68); // Red
                    doc.text(text2b, startX2 + w2a, footerY);

                    doc.setTextColor(0, 0, 128); // Dark Navy for end
                    doc.text(text2c, startX2 + w2a + w2b, footerY);
                }
            });

            // --- Save the PDF ---
            const safeCompanyName = (companyName || 'Company').replace(/\s+/g, '_');
            doc.save(`${safeCompanyName}_Full_Master_Catalogue.pdf`);

        } catch (error) {
            console.error("Error generating full PDF:", error);
            setModal({ message: 'Failed to generate PDF.', type: State.ERROR });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

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
                    const allIds = [
                        ...(item.itemGroupId ? [item.itemGroupId] : []),
                        ...(item.itemGroupIds || []),
                    ];
                    return allIds.length === 0 || allIds.every(id => !validGroupIds.has(id));
                }
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
                <div className="max-w-7xl mx-auto px-4 py-4 relative flex items-center justify-between h-16">

                    {/* Left Spacer (matches width of right button to help balance if you ever switch from absolute positioning) */}
                    <div className="w-[88px] hidden sm:block"></div>

                    {/* Company Name - Now perfectly centered on all devices */}
                    <h1 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm sm:text-lg md:text-lg font-black text-[#1A3B5D] uppercase tracking-tighter text-center leading-tight whitespace-nowrap truncate max-w-[55%] sm:max-w-[70%]">
                        {companyName}
                    </h1>

                    {/* Store Link Button */}
                    <button
                        onClick={() => setIsSubdomainModalOpen(true)}
                        className="bg-blue-50 text-blue-600 px-3 py-2 rounded-sm text-[10px] font-black uppercase tracking-wider border border-blue-100 hover:bg-blue-100 transition-colors z-10 shrink-0 ml-auto"
                    >
                        Store Link
                    </button>
                </div>
            </header>
            <main className="p-4 space-y-4 flex-1 max-w-7xl mx-auto w-full pb-20">
                <div className='relative flex items-center justify-center w-full py-2'>
                    <h1 className="text-sm md:text-xl font-extrabold text-[#F97316] uppercase tracking-tighter">
                        Categories
                    </h1>
                    <button
                        onClick={handleDownloadFullCatalogPDF}
                        disabled={items.length === 0 || isGeneratingPDF}
                        className="absolute right-0 flex items-center gap-1.5 bg-white border border-gray-100 px-3 py-1.5 rounded-sm shadow-sm active:scale-95 transition-all text-[#1A3B5D] hover:text-[#F97316] disabled:opacity-50"
                        title="Download Master PDF"
                    >
                        {isGeneratingPDF ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        <span className="text-[10px] font-black uppercase hidden sm:inline">
                            {isGeneratingPDF ? 'Generating...' : 'PDF'}
                        </span>
                    </button>
                </div>

                {/* --- STICKY SEARCH BAR --- */}
                <div className="sticky top-[68px] z-50 flex justify-center">
                    <div className="relative group max-w-md mx-auto w-full">
                        <SearchableItemInput
                            items={items}
                            placeholder="Search products..."
                            itemGroupMap={itemGroupMap}
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

                {/* --- GLOBAL LIVE TOGGLE (ALL CATEGORIES) --- */}
                <div>
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewEditButton}>
                        <div>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                Live Entire Catalogue
                            </span>

                            <button
                                onClick={handleToggleAllCatalogueLive}
                                disabled={isTogglingCatalogue || items.length === 0}
                                className={`w-11 h-4 flex items-center rounded-sm p-1 transition-all duration-300 disabled:opacity-50 ${isAllCatalogueLive ? 'bg-[#F97316]' : 'bg-gray-300'}`}
                            >
                                <div
                                    className={`bg-white w-3 h-3 rounded-sm shadow-md transform transition-all duration-300 ${isAllCatalogueLive ? 'translate-x-6' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>
                    </ShowWrapper>
                </div>

                {/* --- PRODUCT GRID --- */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                    {filteredItems.map(group => {
                        const validGroupIds = new Set(itemGroups.map(g => g.id));
                        const isVirtual = group.id === 'uncategorized';
                        const itemCount = items.filter(item => {
                            const allIds = [
                                ...(item.itemGroupId ? [item.itemGroupId] : []),
                                ...(item.itemGroupIds || []),
                            ];
                            if (isVirtual) {
                                return allIds.length === 0 || allIds.every(id => !validGroupIds.has(id));
                            }
                            return allIds.includes(group.id!);
                        }).length;
                        const collageImages = getGroupImages(group.id!);

                        return (
                            <div
                                id={group.id}
                                key={group.id}
                                onClick={() => navigate(`/catalogue-home/my-shop/${group.id}`)}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border flex flex-col transition-all group cursor-pointer active:scale-95 ${highlightedId === group.id ? 'ring-1 ring-[#F97316] shadow-lg scale-[1.02]' : pinnedIds.has(group.id!) ? 'ring-1 ring-[#F97316] shadow-lg border-[#F97316]' : 'border-gray-100'
                                    } ${isVirtual ? 'border-dashed border-gray-300' : ''}`}
                            >
                                {/* --- IMAGE SECTION WITH TOP BADGE --- */}
                                <div className="aspect-square bg-[#F8FAFC] relative overflow-hidden">
                                    {pinnedIds.has(group.id!) && (
                                        <div className="absolute top-1.5 right-1.5 z-10 bg-white text-[#F97316] rounded-sm px-1 py-1 flex items-center gap-0.5 shadow-md border border-[#F97316]">
                                            <Pin size={12} className="fill-[#F97316]" />
                                        </div>
                                    )}
                                    {collageImages.length > 0 ? (
                                        <div
                                            className={`w-full h-full gap-[2px] p-[2px] ${collageImages.length === 1
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
                                                        className={`w-full h-full overflow-hidden rounded-[2px] ${isThreeImagesLayout && isLastImage
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
                                                            <Pin size={12} className={pinnedIds.has(group.id!) ? 'fill-[#F97316]' : ''} />
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

            {showCatalogueConfirmPopup && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setShowCatalogueConfirmPopup(false)}
                    />
                    <div className="relative bg-white w-[90%] max-w-sm rounded-lg shadow-xl p-5 z-10 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-sm font-black text-[#1A3B5D] uppercase mb-2">
                            Confirmation
                        </h2>
                        <p className="text-lg font-bold text-gray-600 mb-4">
                            Do you want to make the ENTIRE catalogue {pendingCatalogueLiveState ? "LIVE" : "UNLIVE"}? This affects all categories.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={confirmToggleAllCatalogueLive}
                                className="flex-1 bg-green-500 text-white py-2 rounded-sm text-xs font-black uppercase"
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => setShowCatalogueConfirmPopup(false)}
                                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-sm text-xs font-black uppercase"
                            >
                                No
                            </button>
                        </div>
                    </div>
                </div>
            )}

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