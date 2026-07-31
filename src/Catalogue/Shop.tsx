import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import {
    Trash2,
    X,
    Send,
    Pin,
    Download,
    Loader2,
    Package,
    ChevronDown,
    ArrowUpDown,
    Store,
    Link2,
    FolderOpen,
    Check,
} from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import { Button } from '../Components/ui/button';
import { Badge } from '../Components/ui/badge';
import { EmptyState } from '../Components/ui/empty-state';
import { cn } from '../lib/utils';
import { db } from '../lib/Firebase';
import { addDoc, collection, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { useNavigate } from 'react-router';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SubdomainClaimModal from '../Components/SubDomainModal';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
    // --- Fetch Data ---
    useEffect(() => {
        if (authLoading || !currentUser || !dbOperations) {
            setPageIsLoading(authLoading || !dbOperations);
            return;
        }

        const fetchData = async () => {
            if (!companyId) return;
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

    if (pageIsLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-muted">
                <Spinner className="text-primary" />
            </div>
        );
    }

    return (
        <div className="aurora relative flex min-h-screen w-full flex-col bg-muted">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* --- UPDATED ONBOARDING MODAL --- */}
            {companyId && (
                <SubdomainClaimModal
                    companyId={companyId}
                    forceOpen={isSubdomainModalOpen}
                    onClose={() => setIsSubdomainModalOpen(false)}
                />
            )}

            <header className="glass sticky top-0 z-[100] mx-3 mt-3 flex flex-shrink-0 items-center justify-between gap-3 rounded-2xl p-3 shadow-sm">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/25">
                        <Store className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate text-sm font-bold tracking-tight text-foreground sm:text-lg">
                            {companyName}
                        </h1>
                        <p className="hidden text-xs text-muted-foreground sm:block">Catalogue categories &amp; storefront</p>
                    </div>
                </div>

                {/* Store Link Button */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSubdomainModalOpen(true)}
                    className="shrink-0 gap-1.5"
                >
                    <Link2 className="size-3.5" />
                    <span className="hidden sm:inline">Store Link</span>
                </Button>
            </header>
            <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 p-3 pb-20 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                        <span className="text-gradient">Categories</span>
                    </h1>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadFullCatalogPDF}
                        disabled={items.length === 0 || isGeneratingPDF}
                        className="gap-1.5"
                        title="Download Master PDF"
                    >
                        {isGeneratingPDF ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                        <span className="hidden sm:inline">{isGeneratingPDF ? 'Generating...' : 'Download PDF'}</span>
                    </Button>
                </div>

                {/* --- STICKY SEARCH BAR --- */}
                <div className="sticky top-[76px] z-50 flex justify-center">
                    <div className="group relative mx-auto w-full max-w-md">
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
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Total Categories
                        </span>
                        <Badge variant="info">{filteredItems.length}</Badge>
                    </div>

                    <div className="relative">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsSortOpen(!isSortOpen)}
                            className="gap-1.5"
                        >
                            <ArrowUpDown className="size-3.5" />
                            {sortOrder}
                            <ChevronDown className={cn('size-3.5 transition-transform duration-200', isSortOpen && 'rotate-180')} />
                        </Button>

                        {isSortOpen && (
                            <div className="glass absolute right-0 z-[70] mt-2 w-32 overflow-hidden rounded-xl shadow-lg">
                                <button
                                    onClick={() => { setSortOrder('A-Z'); setIsSortOpen(false); }}
                                    className={cn(
                                        'flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent',
                                        sortOrder === 'A-Z' && 'text-primary',
                                    )}
                                >
                                    A to Z
                                    {sortOrder === 'A-Z' && <Check className="size-3.5" />}
                                </button>
                                <button
                                    onClick={() => { setSortOrder('Z-A'); setIsSortOpen(false); }}
                                    className={cn(
                                        'flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent',
                                        sortOrder === 'Z-A' && 'text-primary',
                                    )}
                                >
                                    Z to A
                                    {sortOrder === 'Z-A' && <Check className="size-3.5" />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- GLOBAL LIVE TOGGLE (ALL CATEGORIES) --- */}
                <ShowWrapper requiredPermission={Cata_Permissions.ViewEditButton}>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xs">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Live Entire Catalogue</p>
                            <p className="text-xs text-muted-foreground">Toggle visibility for every category at once</p>
                        </div>

                        <button
                            onClick={handleToggleAllCatalogueLive}
                            disabled={isTogglingCatalogue || items.length === 0}
                            className={cn(
                                'flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition-all duration-300 disabled:opacity-50',
                                isAllCatalogueLive ? 'bg-gradient-brand' : 'bg-muted',
                            )}
                        >
                            <div
                                className={cn(
                                    'size-4 rounded-full bg-white shadow-md transition-transform duration-300',
                                    isAllCatalogueLive ? 'translate-x-5' : 'translate-x-0',
                                )}
                            />
                        </button>
                    </div>
                </ShowWrapper>

                {/* --- PRODUCT GRID --- */}
                {filteredItems.length === 0 ? (
                    <EmptyState
                        icon={<FolderOpen />}
                        title="No categories found"
                        description={searchQuery ? 'No categories match your search.' : 'Create a category from your item groups to see it here.'}
                    />
                ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
                        const isPinned = pinnedIds.has(group.id!);

                        return (
                            <div
                                id={group.id}
                                key={group.id}
                                onClick={() => navigate(`/catalogue-home/my-shop/${group.id}`)}
                                className={cn(
                                    'group flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]',
                                    highlightedId === group.id
                                        ? 'border-primary ring-1 ring-primary shadow-lg scale-[1.02]'
                                        : isPinned
                                            ? 'border-primary/40 ring-1 ring-primary/40 shadow-lg'
                                            : 'border-border hover:border-primary/40',
                                    isVirtual && 'border-dashed',
                                )}
                            >
                                {/* --- IMAGE SECTION WITH TOP BADGE --- */}
                                <div className="relative aspect-square overflow-hidden bg-muted">
                                    {isPinned && (
                                        <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-full border border-primary/30 bg-card p-1 text-primary shadow-md">
                                            <Pin className="size-3 fill-primary" />
                                        </div>
                                    )}
                                    {collageImages.length > 0 ? (
                                        <div
                                            className={cn(
                                                'grid h-full w-full gap-[2px] p-[2px]',
                                                collageImages.length === 1
                                                    ? 'grid-cols-1 grid-rows-1'
                                                    : 'grid-cols-2 grid-rows-2',
                                            )}
                                        >
                                            {collageImages.map((img, index) => {
                                                const isThreeImagesLayout = collageImages.length === 3;
                                                const isLastImage = index === 2;

                                                return (
                                                    <div
                                                        key={index}
                                                        className={cn(
                                                            'h-full w-full overflow-hidden rounded-[3px]',
                                                            isThreeImagesLayout && isLastImage && 'col-span-2',
                                                        )}
                                                    >
                                                        <img
                                                            src={img}
                                                            alt={`product-${index}`}
                                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <Package className="size-10 text-muted-foreground/40" />
                                        </div>
                                    )}
                                </div>

                                {/* --- CONTENT SECTION --- */}
                                <div className="flex flex-1 flex-col p-3">
                                    {editingId === group.id ? (
                                        <div className="space-y-2 py-1" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                autoFocus
                                                type="text"
                                                value={tempName}
                                                onChange={(e) => setTempName(e.target.value)}
                                                className="w-full rounded-lg border border-border bg-muted px-2 py-1 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                                            />
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleSaveEdit(group.id!); }}
                                                    className="flex-1 rounded-lg bg-gradient-brand py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90"
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
                                                    className="rounded-lg bg-destructive/10 p-3 text-destructive transition-colors hover:bg-destructive/20"
                                                >
                                                    <Trash2 className="size-3" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                                                    className="rounded-lg bg-muted p-3 text-muted-foreground transition-colors hover:bg-accent"
                                                >
                                                    <X className="size-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="mb-1.5 flex items-center justify-between gap-1">
                                                <h3 className="max-h-[2.5em] overflow-hidden break-words text-sm font-bold leading-tight text-foreground">
                                                    {isVirtual
                                                        ? <i className="text-muted-foreground">{group.name}</i>
                                                        : group.name
                                                    }
                                                </h3>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    {/* Pin button — always visible for all non-virtual groups */}
                                                    {!isVirtual && (
                                                        <button
                                                            onClick={(e) => handleTogglePin(e, group.id!)}
                                                            className={cn(
                                                                'rounded-lg p-1.5 transition-all',
                                                                isPinned
                                                                    ? 'bg-primary/10 text-primary'
                                                                    : 'bg-muted text-muted-foreground hover:bg-primary hover:text-white',
                                                            )}
                                                            title={isPinned ? 'Unpin' : 'Pin to top'}
                                                        >
                                                            <Pin className={cn('size-3', isPinned && 'fill-primary')} />
                                                        </button>
                                                    )}

                                                    {/* Share button */}
                                                    {!isVirtual && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleShareCategory(group);
                                                            }}
                                                            className="rounded-lg bg-primary/10 p-1.5 text-primary transition-all hover:bg-primary hover:text-white"
                                                            title="Share Category"
                                                        >
                                                            <Send className="size-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Centered Item Count Badge UI */}
                                            <div className="mx-auto mb-2">
                                                <Badge variant="info">
                                                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                                                </Badge>
                                            </div>

                                            {/* Actions Logic */}
                                            {!isVirtual ? (
                                                <Button
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEdit(group);
                                                    }}
                                                    className="mt-auto w-full gap-1 bg-gradient-brand text-white hover:opacity-90"
                                                >
                                                    Edit Group
                                                </Button>
                                            ) : (
                                                <div className="mt-auto w-full cursor-not-allowed rounded-lg bg-muted py-1.5 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
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
                )}
            </main>

            {showCatalogueConfirmPopup && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div
                        className="absolute inset-0"
                        onClick={() => setShowCatalogueConfirmPopup(false)}
                    />
                    <div className="relative z-10 w-full max-w-sm animate-in zoom-in fade-in rounded-2xl border border-border bg-card p-5 shadow-2xl duration-200">
                        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-foreground">
                            Confirmation
                        </h2>
                        <p className="mb-4 text-sm font-medium text-muted-foreground">
                            Do you want to make the ENTIRE catalogue {pendingCatalogueLiveState ? "LIVE" : "UNLIVE"}? This affects all categories.
                        </p>
                        <div className="flex gap-2">
                            <Button
                                onClick={confirmToggleAllCatalogueLive}
                                className="flex-1 bg-gradient-brand text-white hover:opacity-90"
                            >
                                Yes
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => setShowCatalogueConfirmPopup(false)}
                                className="flex-1"
                            >
                                No
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {isCustomerModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
                    <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
                        <button onClick={() => setIsCustomerModalOpen(false)} className="absolute right-6 top-6 text-muted-foreground transition-colors hover:text-foreground"><X className="size-5" /></button>
                        <h3 className="mb-6 text-sm font-bold uppercase tracking-wide text-foreground">Customer Details</h3>
                        <div className="space-y-4">
                            <input type="text" placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full rounded-xl border border-border bg-muted p-4 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                            <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full rounded-xl border border-border bg-muted p-4 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <Button disabled={isPlacingOrder} onClick={handleConfirmAndSaveOrder} className="mt-6 w-full gap-1.5 bg-gradient-brand text-white shadow-lg hover:opacity-90">
                            {isPlacingOrder ? 'Placing Order...' : 'Confirm Order'}
                        </Button>
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