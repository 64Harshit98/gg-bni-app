import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, useDatabase } from '../context/auth-context';
import { useCatalogueData } from '../context/CatalogueDataContext';
import type { Item, ItemGroup } from '../constants/models';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { Trash2, Send, Pin, Download, Loader2, Copy, Share2, Plus, Pencil, ChevronDown, Link2 } from 'lucide-react';
import { db } from '../lib/Firebase';
import { addDoc, collection, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { useNavigate } from 'react-router';
import { useBusinessName } from './hooks/BusinessName';
import SubdomainClaimModal from '../Components/SubDomainModal';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from './enum/cata_permissions.enum';
import { ROUTES } from '../constants/routes.constants';
import { Photo, Sheet, Tag, btnClass, toneClass } from './storefront/StoreUI';
import { initialsOf } from './storefront/storefront.utils';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');


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
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    // --- YOUR NEW STATES ---
    const [editingId, setEditingId] = useState<string | null>(null);
    const [tempName, setTempName] = useState('');
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
    const [isSubdomainModalOpen, setIsSubdomainModalOpen] = useState(false); // <-- NEW STATE
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

    // Same steps the old inline "Delete product group" did: move its items out, then delete the group
    const handleDeleteGroup = async (groupId: string) => {
        if (!dbOperations) return;
        try {
            const itemsToUpdate = items.filter(item => item.itemGroupId === groupId);
            await Promise.all(itemsToUpdate.map(item => dbOperations.updateItem(item.id!, { itemGroupId: "" })));
            await dbOperations.deleteItemGroup(groupId);
            setItemGroups(prev => prev.filter(p => p.id !== groupId));
            setEditingId(null);
            setConfirmDeleteId(null);
            setModal({ message: 'Deleted successfully', type: State.SUCCESS });
        } catch (err) {
            console.error(err);
            setModal({ message: 'Delete failed', type: State.ERROR });
        }
    };

    const handleCopyStoreLink = async () => {
        if (!companyId) return;
        let url = `${window.location.origin}/catalogue/${companyId}`;
        try {
            const snap = await getDoc(doc(db, 'companies', companyId));
            if (snap.exists() && snap.data().subdomain) url = `https://${snap.data().subdomain}.sellar.in`;
            await navigator.clipboard.writeText(url);
            setModal({ message: 'Store link copied to clipboard!', type: State.SUCCESS });
        } catch (err) {
            console.error('Copy store link failed:', err);
            setIsSubdomainModalOpen(true);
        }
    };

    // Opens the same Share card as the sidebar's Share action
    const handleShareCatalogue = () => window.dispatchEvent(new CustomEvent('open-catalogue-share'));

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

    if (pageIsLoading) {
        return (
            <div className="min-h-full bg-sf-canvas px-4 py-5 md:px-6" aria-busy="true" aria-label="Loading your catalogue">
                <div className="h-8 w-48 animate-pulse rounded-sm bg-white motion-reduce:animate-none" />
                <div className="mt-5 h-20 animate-pulse rounded-sm bg-white motion-reduce:animate-none" />
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5 xl:grid-cols-5">
                    {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-sm bg-white motion-reduce:animate-none" />)}
                </div>
            </div>
        );
    }

    const validGroupIds = new Set(itemGroups.map(g => g.id));
    const groupItemsOf = (groupId: string) => items.filter(item => {
        const allIds = [
            ...(item.itemGroupId ? [item.itemGroupId] : []),
            ...(item.itemGroupIds || []),
        ];
        if (groupId === 'uncategorized') return allIds.length === 0 || allIds.every(id => !validGroupIds.has(id));
        return allIds.includes(groupId);
    });
    const liveTotal = items.filter(i => i.isListed === true).length;
    const realCategoryCount = filteredItems.filter(g => g.id !== 'uncategorized').length;
    const editingGroup = itemGroups.find(g => g.id === editingId) || null;

    return (
        <div className="min-h-full bg-sf-canvas pb-10 font-sans text-slate-900">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {companyId && (
                <SubdomainClaimModal
                    companyId={companyId}
                    forceOpen={isSubdomainModalOpen}
                    onClose={() => setIsSubdomainModalOpen(false)}
                />
            )}

            {/* --- Page header --- */}
            <header className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-5 md:gap-4 md:px-6">
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Edit catalogue</h1>
                    <p className="truncate text-[13px] text-slate-600">What customers see when they open {companyName ? `${companyName}'s` : 'your'} store link</p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={handleDownloadFullCatalogPDF} disabled={items.length === 0 || isGeneratingPDF}
                        aria-label="Download catalogue PDF" className={cx(btnClass('secondary'), 'w-10 px-0! md:w-auto md:px-4!')}>
                        {isGeneratingPDF ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                        <span className="hidden md:inline">{isGeneratingPDF ? 'Making PDF…' : 'PDF'}</span>
                    </button>
                    <button type="button" onClick={() => setIsSubdomainModalOpen(true)} aria-label="Store link"
                        className={cx(btnClass('secondary'), 'w-10 px-0! md:w-auto md:px-4!')}>
                        <Link2 className="size-4" /><span className="hidden md:inline">Store link</span>
                    </button>
                    <button type="button" onClick={handleCopyStoreLink} className={cx(btnClass('secondary'), 'max-lg:hidden')}>
                        <Copy className="size-4" />Copy store link
                    </button>
                    <button type="button" onClick={handleShareCatalogue} className={btnClass('primary')}>
                        <Share2 className="size-4" />Share<span className="hidden md:inline"> catalogue</span>
                    </button>
                </div>
            </header>

            <div className="grid gap-4 px-4 md:px-6">
                {/* --- Live entire catalogue --- */}
                <ShowWrapper requiredPermission={Cata_Permissions.ViewEditButton}>
                    <div className="flex items-center gap-3 rounded-sm border border-sf-line bg-white p-4 shadow-sf-card md:gap-4 md:px-5">
                        <span className={cx('size-2.5 shrink-0 rounded-full', isAllCatalogueLive ? 'bg-green-600' : 'bg-slate-400')} aria-hidden />
                        <div className="min-w-0 flex-1">
                            <b className="block text-[15px] font-semibold">{isAllCatalogueLive ? 'Catalogue is live' : liveTotal > 0 ? 'Part of the catalogue is live' : 'Catalogue is hidden'}</b>
                            <p className="text-xs leading-[18px] text-slate-500">
                                {isAllCatalogueLive
                                    ? 'Customers can browse and order everything from your store link. Turn off to hide all products.'
                                    : `${liveTotal} of ${items.length} products are live. Turn on to show every product.`}
                            </p>
                        </div>
                        <span className="hidden text-xs text-slate-600 sm:inline">{realCategoryCount} categor{realCategoryCount === 1 ? 'y' : 'ies'}</span>
                        <button type="button" role="switch" aria-checked={isAllCatalogueLive} aria-label="Live entire catalogue"
                            onClick={handleToggleAllCatalogueLive} disabled={isTogglingCatalogue || items.length === 0}
                            className={cx('relative h-6 w-11 shrink-0 rounded-sm transition-colors disabled:opacity-45', isAllCatalogueLive ? 'bg-sf-primary' : 'bg-sf-control')}>
                            {isTogglingCatalogue
                                ? <Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-white" />
                                : <span className={cx('absolute top-[3px] size-[18px] rounded-[2px] bg-white shadow-sm transition-transform', isAllCatalogueLive ? 'left-[23px]' : 'left-[3px]')} />}
                        </button>
                    </div>
                </ShowWrapper>

                {/* --- Search, sort, new category --- */}
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <div className="w-full sm:max-w-[460px] sm:flex-1">
                        <SearchableItemInput
                            items={items}
                            placeholder="Search products"
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
                    <span className="hidden flex-1 sm:block" />
                    <div className="relative">
                        <button type="button" onClick={() => setIsSortOpen(!isSortOpen)} aria-expanded={isSortOpen}
                            className="inline-flex h-9 items-center gap-2 rounded-sm border border-sf-control bg-white px-3 text-[13px] font-medium">
                            Sort: {sortOrder === 'A-Z' ? 'A–Z' : 'Z–A'}<ChevronDown className="size-4 text-slate-500" />
                        </button>
                        {isSortOpen && (
                            <div className="absolute right-0 z-30 mt-1 w-36 overflow-hidden rounded-sm border border-sf-line bg-white py-1 shadow-sf-float">
                                {(['A-Z', 'Z-A'] as const).map(opt => (
                                    <button key={opt} type="button" onClick={() => { setSortOrder(opt); setIsSortOpen(false); }}
                                        className={cx('block w-full px-3 py-2 text-left text-sm hover:bg-sf-sunken', sortOrder === opt && 'font-medium text-sf-primary')}>
                                        {opt === 'A-Z' ? 'Name A–Z' : 'Name Z–A'}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <ShowWrapper requiredPermission={Cata_Permissions.ManageItems}>
                        <button type="button" onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`)} className={btnClass('secondary', 'md')}>
                            <Plus className="size-4" />New category
                        </button>
                    </ShowWrapper>
                </div>

                <p className="text-xs text-slate-500">
                    {filteredItems.length} categor{filteredItems.length === 1 ? 'y' : 'ies'} · pinned ones show first, here and on your store
                </p>

                {/* --- Category grid --- */}
                {filteredItems.length === 0 ? (
                    <div className="grid place-items-center gap-2 rounded-sm border border-sf-line bg-white px-4 py-14 text-center text-[13px] text-slate-500">
                        <b className="text-[15px] font-semibold text-slate-900">No categories yet</b>
                        Add a category, then add products to it so customers can browse them.
                        <button type="button" onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`)} className={cx(btnClass('secondary', 'sm'), 'mt-2')}>
                            <Plus className="size-4" />New category
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5">
                        {filteredItems.map((group, gi) => {
                            const isVirtual = group.id === 'uncategorized';
                            const groupItems = groupItemsOf(group.id!);
                            const itemCount = groupItems.length;
                            const liveCount = groupItems.filter(i => i.isListed === true).length;
                            const collageImages = getGroupImages(group.id!);
                            const pinned = pinnedIds.has(group.id!);
                            const liveText = itemCount === 0 ? 'No products yet' : liveCount === itemCount ? 'all live' : liveCount === 0 ? 'none live' : `${liveCount} live`;

                            return (
                                <article
                                    id={group.id}
                                    key={group.id}
                                    onClick={() => navigate(`/catalogue-home/my-shop/${group.id}`)}
                                    className={cx('group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border bg-white shadow-sf-card transition-shadow hover:shadow-sf-float',
                                        highlightedId === group.id ? 'border-sf-primary outline-2 outline-offset-2 outline-sf-primary' : pinned ? 'border-sf-primary' : 'border-sf-line',
                                        isVirtual && 'border-dashed border-sf-control shadow-none')}
                                >
                                    {/* Photo: the category's products as a collage, or its first letter */}
                                    <div className="relative aspect-[4/3] overflow-hidden bg-sf-sunken">
                                        {collageImages.length > 0 ? (
                                            <div className={cx('grid h-full w-full gap-0.5',
                                                collageImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                                                collageImages.length > 2 && 'grid-rows-2')}>
                                                {collageImages.map((img, index) => (
                                                    <Photo key={index} src={img} alt="" fit="contain"
                                                        className={cx('h-full rounded-none', collageImages.length === 3 && index === 2 && 'col-span-2')} />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className={cx('grid h-full w-full place-items-center text-3xl font-semibold text-slate-500/70', toneClass(gi))}>
                                                {isVirtual ? '?' : initialsOf(group.name).slice(0, 1) || '?'}
                                            </div>
                                        )}
                                        {pinned && <span className="absolute left-2 top-2"><Tag tone="soft"><Pin className="size-3 fill-current" />Pinned</Tag></span>}
                                    </div>

                                    <div className="flex flex-1 flex-col gap-1 p-3 md:p-4">
                                        <div className="flex items-start gap-1.5">
                                            <h3 className={cx('line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-[21px]', isVirtual && 'italic text-slate-500')}>{group.name}</h3>
                                            {!isVirtual && (
                                                <span className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <button type="button" onClick={(e) => handleTogglePin(e, group.id!)} aria-label={pinned ? `Unpin ${group.name}` : `Pin ${group.name} to the top`}
                                                        title={pinned ? 'Unpin' : 'Pin to top'}
                                                        className={cx('grid size-8 place-items-center rounded-sm transition-colors',
                                                            pinned
                                                                ? 'bg-sf-soft text-sf-primary hover:brightness-95'
                                                                : 'bg-sf-sunken text-slate-600 hover:bg-sf-line hover:text-slate-900')}>
                                                        <Pin className={cx('size-4', pinned && 'fill-current')} />
                                                    </button>
                                                    <button type="button" onClick={() => handleShareCategory(group)} aria-label={`Share ${group.name}`} title="Share category"
                                                        className="grid size-8 place-items-center rounded-sm bg-sf-sunken text-slate-600 transition-colors hover:bg-sf-line hover:text-slate-900">
                                                        <Send className="size-4" />
                                                    </button>
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            {itemCount} item{itemCount === 1 ? '' : 's'}{itemCount > 0 && <> · <span className={liveCount === itemCount ? 'text-green-700' : liveCount === 0 ? 'text-slate-500' : 'text-yellow-800'}>{liveText}</span></>}
                                        </p>
                                        <div className="mt-auto pt-2.5">
                                            {isVirtual ? (
                                                <p className="text-xs leading-[18px] text-slate-500">Products without a category. Give them one so customers can find them.</p>
                                            ) : (
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleEdit(group); setConfirmDeleteId(null); }}
                                                    className={btnClass('secondary', 'sm', true)}>
                                                    <Pencil className="size-4" />Edit category
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* --- Edit category: rename or delete --- */}
            <Sheet open={!!editingGroup} title={confirmDeleteId ? 'Delete this category?' : 'Edit category'} onClose={() => { setEditingId(null); setConfirmDeleteId(null); }}
                footer={confirmDeleteId ? (
                    <>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className={btnClass('ghost')}>Cancel</button>
                        <button type="button" onClick={() => handleDeleteGroup(confirmDeleteId)}
                            className="inline-flex h-10 items-center gap-2 rounded-sm bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800">
                            <Trash2 className="size-4" />Delete category
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" onClick={() => editingGroup && setConfirmDeleteId(editingGroup.id!)} className={cx(btnClass('danger'), 'mr-auto')}>
                            <Trash2 className="size-4" />Delete
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className={btnClass('ghost')}>Cancel</button>
                        <button type="button" disabled={!tempName.trim() || tempName.trim() === editingGroup?.name} onClick={() => editingGroup && handleSaveEdit(editingGroup.id!)}
                            className={btnClass('primary')}>Save</button>
                    </>
                )}>
                {editingGroup && (confirmDeleteId ? (
                    <p className="text-sm text-slate-600">
                        <b className="font-semibold text-slate-900">{editingGroup.name}</b> will be removed. Its {groupItemsOf(editingGroup.id!).length} product{groupItemsOf(editingGroup.id!).length === 1 ? '' : 's'} stay in your catalogue without a category.
                    </p>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); if (tempName.trim() && tempName.trim() !== editingGroup.name) handleSaveEdit(editingGroup.id!); }}>
                        <label htmlFor="cat-name" className="mb-1.5 block text-[13px] font-medium">Category name</label>
                        <input id="cat-name" autoFocus value={tempName} maxLength={60} onChange={(e) => setTempName(e.target.value)}
                            className="h-10 w-full rounded-sm border border-sf-control px-3 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-sf-primary" />
                        <p className="mt-1.5 text-xs text-slate-500">Customers see this name on your store. Changing it also changes the category's link.</p>
                    </form>
                ))}
            </Sheet>

            {/* --- Live entire catalogue: confirm --- */}
            <Sheet open={showCatalogueConfirmPopup} title={pendingCatalogueLiveState ? 'Make the whole catalogue live?' : 'Hide the whole catalogue?'}
                onClose={() => setShowCatalogueConfirmPopup(false)}
                footer={<>
                    <button type="button" onClick={() => setShowCatalogueConfirmPopup(false)} className={btnClass('ghost')}>Cancel</button>
                    <button type="button" onClick={confirmToggleAllCatalogueLive} className={btnClass('primary')}>
                        {pendingCatalogueLiveState ? 'Make all live' : 'Hide all'}
                    </button>
                </>}>
                <p className="text-sm text-slate-600">
                    {pendingCatalogueLiveState
                        ? `All ${items.length} products in every category will show on your store link.`
                        : `All ${items.length} products in every category will be hidden from your store link. Customers won't be able to order until you turn it back on.`}
                </p>
            </Sheet>

            {/* --- Customer details (manual order) --- */}
            <Sheet open={isCustomerModalOpen} title="Customer details" onClose={() => setIsCustomerModalOpen(false)}
                footer={<button type="button" disabled={isPlacingOrder} onClick={handleConfirmAndSaveOrder} className={btnClass('primary', 'md', true)}>
                    {isPlacingOrder ? 'Placing order…' : 'Confirm order'}
                </button>}>
                <div className="grid gap-4">
                    <div>
                        <label htmlFor="cust-name" className="mb-1.5 block text-[13px] font-medium">Customer name</label>
                        <input id="cust-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-10 w-full rounded-sm border border-sf-control px-3 text-sm focus:outline-2 focus:outline-sf-primary" />
                    </div>
                    <div>
                        <label htmlFor="cust-phone" className="mb-1.5 block text-[13px] font-medium">Phone number</label>
                        <input id="cust-phone" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-10 w-full rounded-sm border border-sf-control px-3 text-sm focus:outline-2 focus:outline-sf-primary" />
                    </div>
                </div>
            </Sheet>
        </div>
    );
};

export default OrderingPage;
