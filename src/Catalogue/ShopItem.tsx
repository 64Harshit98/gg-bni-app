import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Minus, Plus, Trash2, Send, Pin, Download, Loader2, ArrowLeft, ChevronDown, Pencil } from 'lucide-react';
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting';
import { ROUTES } from '../constants/routes.constants';
import { useAuth, useDatabase } from '../context/auth-context';
import { useCatalogueData } from '../context/CatalogueDataContext';
import type { Item, ItemGroup } from '../constants/models';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useBusinessName } from './hooks/BusinessName';
import { syncNotifyStock } from "../../src/Catalogue/utils/syncNotifyStock";
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { db } from '../lib/Firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from './enum/cata_permissions.enum';
import { Photo, Sheet, Tag, btnClass } from './storefront/StoreUI';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Stock as words: green when plenty, amber when low (10 or fewer), red when out (shows how far below zero). Shorter on phones. */
const StockIndicator: React.FC<{ stock: number }> = ({ stock }) => {
    const unit = <><span className="max-sm:hidden">in stock</span><span className="sm:hidden">left</span></>;
    if (stock <= 0) return <Tag tone="inverse">{stock < 0 ? `Out of stock (${stock})` : 'Out of stock'}</Tag>;
    if (stock <= 10) return <Tag tone="warning">Low · {stock} {unit}</Tag>;
    return <Tag tone="success">{stock} {unit}</Tag>;
};

interface QuickListedToggleProps {
    itemId: string;
    isListed: boolean;
    onToggle: (itemId: string, newState: boolean) => Promise<void>;
    disabled?: boolean;
}

const QuickListedToggle: React.FC<QuickListedToggleProps> = ({ itemId, isListed, onToggle, disabled }) => {
    const [isLoading, setIsLoading] = useState(false);
    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (disabled || isLoading) return;
        setIsLoading(true);
        try {
            await onToggle(itemId, !isListed);
        } catch (error) {
            console.error("Error toggling listed status:", error);
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <button
            type="button"
            role="switch"
            aria-checked={isListed}
            aria-label={isListed ? 'Live on your store. Tap to hide' : 'Hidden from your store. Tap to make live'}
            onClick={handleClick}
            disabled={disabled || isLoading}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-sm px-1 text-[13px] font-medium text-slate-700 disabled:opacity-60"
        >
            <span className={cx('relative h-5 w-9 rounded-sm transition-colors', isListed ? 'bg-green-600' : 'bg-sf-control')}>
                {isLoading
                    ? <Loader2 className="absolute inset-0 m-auto size-3.5 animate-spin text-white" />
                    : <span className={cx('absolute top-[3px] size-3.5 rounded-[2px] bg-white transition-transform', isListed ? 'left-[19px]' : 'left-[3px]')} />}
            </span>
            <span className="max-sm:sr-only">{isListed ? 'Live' : 'Hidden'}</span>
        </button>
    );
};

const ITEMS_PER_BATCH_RENDER = 24;
// --- NEW 3-TIER LOGIC HELPER ---
const getEffectivePriceInfo = (item: Item) => {
    const mrp = Number(item.mrp || 0);
    const itemSalesPrice = Number(item.salesPrice || 0);
    const presetDiscount = Number(item.discount || 0);

    let salePrice = 0;
    let calculatedDiscount = 0;

    if (mrp > 0 && itemSalesPrice > 0) {
        // Case 1: Both exist. Ignore DB discount. Calculate diff.
        salePrice = itemSalesPrice;
        calculatedDiscount = ((mrp - itemSalesPrice) / mrp) * 100;
    } else if (itemSalesPrice > 0) {
        // Case 2: Only Sales Price exists. Apply DB discount.
        calculatedDiscount = presetDiscount;
        salePrice = itemSalesPrice * (1 - (presetDiscount / 100));
    } else if (mrp > 0) {
        // Case 3: Only MRP exists. Apply DB discount.
        calculatedDiscount = presetDiscount;
        salePrice = mrp * (1 - (presetDiscount / 100));
    }

    // Round to 2 decimal places to ensure clean UI numbers
    salePrice = Math.round((salePrice + Number.EPSILON) * 100) / 100;

    return {
        mrp,
        salePrice,
        discountPercent: Math.round(calculatedDiscount),
        hasDiscount: calculatedDiscount > 0,
        hasBothPrices: mrp > 0 && salePrice > 0 && salePrice < mrp
    };
};
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
const MyShop: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const highlightItemId = location.state?.highlightItemId;
    const highlightTrigger = location.state?.trigger;
    const { groupId } = useParams<{ groupId: string }>();
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const { businessName: companyName, loading: _nameLoading } = useBusinessName(companyId);
    const dbOperations = useDatabase();
    const { items: catalogueItems, itemsLoading: catalogueItemsLoading, itemGroups: catalogueItemGroups } = useCatalogueData();

    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    // Local mirror of the shared catalogue items — this page optimistically
    // toggles `isListed`/edits items ahead of the shared listener echoing
    // those writes back (see setAllItems calls further down).
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(groupId || 'All');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [_error, setError] = useState<string | null>(null);
    const [itemsToRenderCount, setItemsToRenderCount] = useState(ITEMS_PER_BATCH_RENDER);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [selectedItemForDetails, setSelectedItemForDetails] = useState<Item | null>(null);
    const [variantGroupIds, setVariantGroupIds] = useState<string[]>([]);
    const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSalesSettings | null>(null);

    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A' | 'Price: Low-High' | 'Price: High-Low'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const isViewMode = false;
    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);
    const [isAllLive, setIsAllLive] = useState(false);
    const [showConfirmPopup, setShowConfirmPopup] = useState(false);
    const [pendingLiveState, setPendingLiveState] = useState<boolean | null>(null);
    const [showUncategorizedWarning, setShowUncategorizedWarning] = useState(false);
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        if (!companyId) return;

        const loadPins = async () => {
            try {
                const ref = doc(db, 'companies', companyId, 'settings', 'pinned_items');
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    const ids: string[] = snap.data().ids || [];
                    setPinnedIds(new Set(ids));
                    localStorage.setItem(`pinned_items_${companyId}`, JSON.stringify(ids));
                } else {
                    const saved = localStorage.getItem(`pinned_items_${companyId}`);
                    if (saved) setPinnedIds(new Set(JSON.parse(saved)));
                }
            } catch (err) {
                console.error("Failed to load pinned items:", err);
                const saved = localStorage.getItem(`pinned_items_${companyId}`);
                if (saved) setPinnedIds(new Set(JSON.parse(saved)));
            }
        };

        loadPins();
    }, [companyId]);

    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
    };

    const resolvedGroupId = useMemo(() => {
        if (!groupId || allItemGroups.length === 0) return groupId;
        const matchedGroup = allItemGroups.find(
            (group) => generateSlug(group.name) === groupId
        );
        return matchedGroup?.id || groupId;
    }, [groupId, allItemGroups]);

    const isUncategorized = (resolvedGroupId || selectedCategory) === 'uncategorized';

    useEffect(() => {
        if (resolvedGroupId) {
            setSelectedCategory(resolvedGroupId);
        }
    }, [resolvedGroupId]);

    useEffect(() => {
        setSearchQuery("");
    }, [groupId]);

    const addToCart = (item: Item, quantity: number = 1, isFromDrawer: boolean = false) => {
        setCart(prev => {
            const existing = prev.find(i => i.item.id === item.id);
            if (existing) {
                const newQuantity = isFromDrawer ? quantity : existing.quantity + 1;
                return prev.map(i => i.item.id === item.id ? { ...i, quantity: newQuantity } : i);
            }
            return [...prev, { item, quantity }];
        });
    };

    const removeFromCart = (itemId: string) => {
        setCart(prev => prev.filter(i => i.item.id !== itemId));
    };

    const handleShareItem = async (item: Item) => {
        if (!companyId || !item?.itemGroupId || !item?.id) return;

        const group = allItemGroups.find((g) => g.id === item.itemGroupId);
        const categorySlug = group ? generateSlug(group.name) : item.itemGroupId;
        const itemSlug = generateSlug(item.name || "product");

        // ADDED &cId=${companyId} to the base URL
        let shareUrl = `${window.location.origin}/${companyId}/${categorySlug}?product=${itemSlug}&itemId=${item.id}&cId=${companyId}`;

        try {
            const docRef = doc(db, 'companies', companyId);
            const snap = await getDoc(docRef);

            if (snap.exists() && snap.data().subdomain) {
                // ADDED &cId=${companyId} to the subdomain URL
                shareUrl = `https://${snap.data().subdomain}.sellar.in/${categorySlug}?product=${itemSlug}&itemId=${item.id}&cId=${companyId}`;
            }
        } catch (error) {
            console.error("Error fetching subdomain for sharing:", error);
        }

        try {
            const shareText = `Check out ${item.name} from ${companyName}`;

            if (navigator.share) {
                await navigator.share({
                    title: item.name,
                    text: shareText,
                    url: shareUrl,
                });
            } else {
                await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                alert("Product link copied to clipboard!");
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
            console.error("Error sharing item:", error);
        }
    };
    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => prev.map(i => {
            if (i.item.id === itemId) {
                const allowZero = catalogueSettings?.allowQuantityDecreaseToZero;
                const newQty = allowZero
                    ? Math.max(0, i.quantity + delta)
                    : Math.max(1, i.quantity + delta);
                return { ...i, quantity: newQty };
            }
            return i;
        }).filter(i => i.quantity > 0));
    };

    const cartTotal = useMemo(() =>
        cart.reduce((acc, curr) => {
            const { salePrice } = getEffectivePriceInfo(curr.item);
            return acc + salePrice * curr.quantity;
        }, 0),
        [cart]
    );

    const cartCount = useMemo(() => cart.reduce((acc, curr) => acc + curr.quantity, 0), [cart]);

    const handleDownloadPDF = async () => {
        // 1. Filter out unlisted items immediately
        const liveItemsToPrint = filteredItems.filter(item => item.isListed === true);

        // 2. Prevent empty PDF generation
        if (liveItemsToPrint.length === 0) {
            alert("There are no LIVE items in this category to generate a PDF.");
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
            doc.text(`${companyName} - ${currentCategoryName}`, 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated by SELLAR.IN: ${new Date().toLocaleDateString()}`, 14, 26);

            const tableBody: any[] = [];
            const tableImages: string[] = [];

            // --- Prepare Data (Using the new filtered array & throttling) ---
            for (const item of liveItemsToPrint) {
                const { salePrice, mrp, hasBothPrices } = getEffectivePriceInfo(item);
                let base64Img = '';

                if (item.imageUrl) {
                    // Fetch sequentially using the Canvas normalizer
                    base64Img = await convertImageUrlToBase64(
                        item.imageUrl,
                        item.name || 'Unknown Product'
                    );

                    // Tiny delay to prevent Google Cloud rate limits (429 errors)
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                const mrpText = hasBothPrices ? `Rs. ${mrp}` : '-';
                const salePriceText = `Rs. ${salePrice}`;

                tableBody.push([
                    '', // Leaves the cell blank for the image
                    item.name?.toUpperCase() || 'UNNAMED PRODUCT',
                    mrpText,
                    salePriceText
                ]);

                tableImages.push(base64Img);
            }

            // --- Generate AutoTable ---
            autoTable(doc, {
                startY: 32,
                margin: { bottom: 25 }, // CRITICAL: Prevents table from drawing over the footer
                head: [['Image', 'Product Details', 'MRP', 'Sale Price']],
                body: tableBody,
                headStyles: { fillColor: [249, 115, 22], halign: 'center' }, // #F97316
                bodyStyles: { minCellHeight: 25, valign: 'middle' },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 'auto', fontStyle: 'bold', halign: 'center', textColor: [26, 59, 93] },
                    2: { cellWidth: 25, halign: 'center', textColor: [156, 163, 175] },
                    3: { cellWidth: 35, halign: 'center', fontStyle: 'bold', textColor: [249, 115, 22] }
                },
                didDrawCell: (data) => {
                    // Manually draw the image inside the first column's cell
                    if (data.column.index === 0 && data.cell.section === 'body') {
                        const base64Img = tableImages[data.row.index];
                        if (base64Img) {
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
            const safeCategoryName = currentCategoryName === 'All Products'
                ? 'Full_Catalogue'
                : currentCategoryName.replace(/\s+/g, '_');

            doc.save(`${safeCompanyName}_${safeCategoryName}.pdf`);

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF. Check console for details.");
        } finally {
            setIsGeneratingPDF(false);
        }
    };
    const handleToggleAllLive = () => {
        if (isUncategorized) {
            setShowUncategorizedWarning(true);
            return;
        }
        setPendingLiveState(!isAllLive);
        setShowConfirmPopup(true);
    };

    const confirmToggleAllLive = async () => {
        if (!dbOperations || pendingLiveState === null) return;
        const newState = pendingLiveState;
        setShowConfirmPopup(false);
        setIsAllLive(newState);

        try {
            const activeCat = resolvedGroupId || selectedCategory;
            const itemsToUpdate = allItems.filter(item => {
                if (activeCat === 'All') return true;
                const allIds = [
                    ...(item.itemGroupId ? [item.itemGroupId] : []),
                    ...(item.itemGroupIds || []),
                ];
                return allIds.includes(activeCat);
            });

            const updates = itemsToUpdate.map(item =>
                dbOperations.updateItem(item.id!, { isListed: newState })
            );

            await Promise.all(updates);

            setAllItems(prev =>
                prev.map(item => {
                    if (activeCat === 'All') return { ...item, isListed: newState };
                    const allIds = [
                        ...(item.itemGroupId ? [item.itemGroupId] : []),
                        ...(item.itemGroupIds || []),
                    ];
                    return allIds.includes(activeCat) ? { ...item, isListed: newState } : item;
                })
            );
        } catch (err) {
            console.error("Bulk toggle failed:", err);
        } finally {
            setPendingLiveState(null);
        }
    };

    const currentCategoryName = useMemo(() => {
        if (resolvedGroupId === 'uncategorized') return 'Uncategorized';
        if (resolvedGroupId === 'All' || !resolvedGroupId) return 'All Products';

        const group = allItemGroups.find(g => g.id === resolvedGroupId);
        return group ? group.name : 'Catalogue';
    }, [allItemGroups, resolvedGroupId]);

    useEffect(() => {
        if (!Array.isArray(allItems) || allItems.length === 0) {
            setIsAllLive(false);
            return;
        }

        const activeCat = resolvedGroupId || selectedCategory;
        const filtered = allItems.filter(item => {
            if (activeCat === 'All') return true;
            const allIds = [
                ...(item.itemGroupId ? [item.itemGroupId] : []),
                ...(item.itemGroupIds || []),
            ];
            return allIds.includes(activeCat);
        });

        const allLive = filtered.length > 0 && filtered.every(item => item.isListed === true);
        setIsAllLive(allLive);
    }, [allItems, resolvedGroupId, selectedCategory]);

    // items/itemGroups now come from the shared CatalogueDataContext instead
    // of this page fetching/listening to them itself — mirrored into local
    // state (with the same stock/isListed normalization the old listener
    // callback applied) so the optimistic mutations below still work.
    useEffect(() => {
        if (authLoading || !currentUser) {
            if (!authLoading && !currentUser) setPageIsLoading(false);
            return;
        }

        setPageIsLoading(catalogueItemsLoading);

        const liveItemsList: Item[] = catalogueItems.map((data) => ({
            ...data,
            stock: data.stock !== undefined && data.stock !== null ? Number(data.stock) : 0,
            isListed: (data as any).isListed ?? false,
        } as Item));

        setAllItems(liveItemsList);
        if (liveItemsList.length > 0) {
            setIsAllLive(liveItemsList.every(item => item.isListed === true));
        }
    }, [authLoading, currentUser, catalogueItems, catalogueItemsLoading]);

    useEffect(() => {
        setAllItemGroups(catalogueItemGroups);
    }, [catalogueItemGroups]);

    // Business info + catalogue-sales-settings — page-specific, unrelated to
    // the shared catalogue data above.
    useEffect(() => {
        if (!companyId) return;

        const fetchPageInfo = async () => {
            try {
                const settingsRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) setCatalogueSettings(settingsSnap.data() as CatalogueSalesSettings);
            } catch (err: any) {
                setError(err.message || "Failed to load initial data.");
            }
        };

        fetchPageInfo();
    }, [companyId]);

    const itemGroupMap = useMemo(() => {
        return allItemGroups.reduce((acc, group) => {
            if (group.id) {
                acc[group.id] = group.name;
            }
            return acc;
        }, {} as Record<string, string>);
    }, [allItemGroups]);

    const filteredItems = useMemo(() => {
        const activeCat = resolvedGroupId || selectedCategory;
        const validGroupIds = new Set(allItemGroups.map(g => g.id));

        const result = allItems.filter(item => {
            if (!item) return false;

            const isSearching = searchQuery.trim().length > 0;

            if (isViewMode && !item.isListed && !isSearching) {
                return false;
            }

            let matchesCategory = false;

            if (isSearching) {
                matchesCategory = true;
            } else if (activeCat === 'All') {
                matchesCategory = true;
            } else if (activeCat === 'uncategorized') {
                const allIds = [
                    ...(item.itemGroupId ? [item.itemGroupId] : []),
                    ...(item.itemGroupIds || []),
                ];
                matchesCategory = allIds.length === 0 || allIds.every(id => !validGroupIds.has(id));
            } else {
                const allIds = [
                    ...(item.itemGroupId ? [item.itemGroupId] : []),
                    ...(item.itemGroupIds || []),
                ];
                matchesCategory = allIds.includes(activeCat);
            }

            const itemName = item.name?.toLowerCase() || "";
            const matchesSearch = !isSearching ||
                itemName.includes(searchQuery.toLowerCase()) ||
                (item.barcode && item.barcode.includes(searchQuery));

            return matchesCategory && matchesSearch;
        });

        return [...result].sort((a, b) => {
            const aPinned = pinnedIds.has(a.id!);
            const bPinned = pinnedIds.has(b.id!);
            if (aPinned !== bPinned) return aPinned ? -1 : 1;
            const nameA = a.name || "";
            const nameB = b.name || "";
            if (sortOrder === 'A-Z') return nameA.localeCompare(nameB);
            if (sortOrder === 'Z-A') return nameB.localeCompare(nameA);
            if (sortOrder === 'Price: Low-High') return (a.salesPrice || a.mrp || 0) - (b.salesPrice || b.mrp || 0);
            if (sortOrder === 'Price: High-Low') return (b.salesPrice || b.mrp || 0) - (a.salesPrice || a.mrp || 0);

            return 0;
        });
    }, [
        allItems,
        selectedCategory,
        searchQuery,
        isViewMode,
        sortOrder,
        resolvedGroupId,
        allItemGroups,
        pinnedIds
    ]);

    useEffect(() => {
        if (!highlightItemId || filteredItems.length === 0) return;

        const itemIndex = filteredItems.findIndex(
            (item) => String(item.id) === String(highlightItemId)
        );

        if (itemIndex !== -1) {
            setItemsToRenderCount((prev) => Math.max(prev, itemIndex + 1));
        }

        const timer = setTimeout(() => {
            setHighlightedId(highlightItemId);

            const element = document.getElementById(highlightItemId);
            element?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });

            setTimeout(() => {
                setHighlightedId(null);
            }, 3000);

            navigate(location.pathname, { replace: true, state: {} });
        }, 300);

        return () => clearTimeout(timer);
    }, [
        highlightItemId,
        highlightTrigger,
        filteredItems,
        navigate,
        location.pathname
    ]);

    const itemsToDisplay = useMemo(() => filteredItems.slice(0, itemsToRenderCount), [filteredItems, itemsToRenderCount]);
    const hasMoreItems = useMemo(() => itemsToRenderCount < filteredItems.length, [itemsToRenderCount, filteredItems.length]);

    const loadMoreItems = useCallback(() => {
        if (!hasMoreItems) return;
        setItemsToRenderCount(prev => prev + ITEMS_PER_BATCH_RENDER);
    }, [hasMoreItems]);

    useEffect(() => {
        if (!loadMoreRef.current) return;
        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMoreItems) loadMoreItems();
        }, { threshold: 0.1 });
        observerRef.current.observe(loadMoreRef.current);
        return () => observerRef.current?.disconnect();
    }, [hasMoreItems, loadMoreItems]);

    const resolveVariantGroup = (item: Item): string[] => {
        const itemId = String(item.id!);

        // Walk the WHOLE connected component (forward + reverse edges, since
        // variant links can be one-way) and collect every member — not just
        // the "best" root's own declared variants array.
        const visited = new Set<string>();
        const queue = [itemId];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            const currentItem = allItems.find(i => String(i.id) === currentId);
            if (!currentItem) continue;

            const currentVariants: string[] = ((currentItem as any).variants || []).map(String);
            currentVariants.forEach(vid => { if (!visited.has(vid)) queue.push(vid); });

            allItems.forEach(i => {
                const iVariants: string[] = ((i as any).variants || []).map(String);
                if (iVariants.includes(currentId) && !visited.has(String(i.id))) {
                    queue.push(String(i.id));
                }
            });
        }

        if (visited.size <= 1) return [itemId];

        // Stable order: always follow the catalogue's own item order, so the
        // variant chips never reshuffle depending on which variant is open.
        return allItems
            .filter(i => visited.has(String(i.id)))
            .map(i => String(i.id));
    };

    const handleOpenEditDrawer = (item: Item) => {
        setSelectedItemForEdit(item);
        setIsDrawerOpen(true);
    };

    const handleOpenDetailDrawer = (item: Item) => {
        setSelectedItemForDetails(item);
        setVariantGroupIds(resolveVariantGroup(item));
        setIsDetailDrawerOpen(true);
    };

    const handleTogglePin = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!companyId) return;
        setPinnedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            localStorage.setItem(`pinned_items_${companyId}`, JSON.stringify([...next]));

            const settingsRef = doc(db, 'companies', companyId, 'settings', 'pinned_items');
            setDoc(settingsRef, { ids: [...next] }, { merge: true });
            return next;
        });
    };

    const handleToggleListed = async (itemId: string, newState: boolean) => {
        if (!dbOperations) return;
        try {
            await dbOperations.updateItem(itemId, { isListed: newState });
            const updatedItem = allItems.find(i => i.id === itemId);

            if (updatedItem && companyId) {
                const isNowInStock = (updatedItem.stock || 0) > 0;
                await syncNotifyStock(companyId, updatedItem.id!, isNowInStock);
            }
            setAllItems(prev => prev.map(item => item.id === itemId ? { ...item, isListed: newState } as Item : item));
        } catch (err) {
            console.error("Failed to update listed status:", err);
        }
    };

    if (authLoading || (pageIsLoading && allItems.length === 0)) {
        return (
            <div className="min-h-full bg-sf-canvas px-4 py-5 md:px-6" aria-busy="true" aria-label="Loading products">
                <div className="h-8 w-48 animate-pulse rounded-sm bg-white motion-reduce:animate-none" />
                <div className="mt-5 h-20 animate-pulse rounded-sm bg-white motion-reduce:animate-none" />
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5 xl:grid-cols-5">
                    {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-sm bg-white motion-reduce:animate-none" />)}
                </div>
            </div>
        );
    }

    const isSearching = searchQuery.trim().length > 0;
    const liveCount = filteredItems.filter(i => i.isListed === true).length;
    const SORT_LABELS: Record<typeof sortOrder, string> = {
        'A-Z': 'Name A–Z', 'Z-A': 'Name Z–A', 'Price: Low-High': 'Price: low to high', 'Price: High-Low': 'Price: high to low',
    };

    return (
        <div className="min-h-full bg-sf-canvas pb-10 font-sans text-slate-900">
            {/* --- Page header --- */}
            <header className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-5 md:gap-4 md:px-6">
                <button type="button" onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER}`)} aria-label="Back to Edit catalogue"
                    className="-ml-2 grid size-10 shrink-0 place-items-center rounded-sm text-slate-600 hover:bg-white">
                    <ArrowLeft className="size-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
                        <button type="button" onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER}`)} className="font-medium text-sf-primary hover:underline">Edit catalogue</button>
                        <span aria-hidden> / </span>
                    </nav>
                    <h1 className={cx('truncate text-xl font-semibold tracking-tight md:text-2xl', isUncategorized && 'italic')}>{currentCategoryName}</h1>
                </div>
                <button type="button" onClick={handleDownloadPDF} disabled={filteredItems.length === 0 || isGeneratingPDF} aria-label="Download PDF of this category"
                    className={cx(btnClass('secondary'), 'w-10 px-0! md:w-auto md:px-4!')}>
                    {isGeneratingPDF ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    <span className="hidden md:inline">{isGeneratingPDF ? 'Making PDF…' : 'PDF'}</span>
                </button>
                <ShowWrapper requiredPermission={Cata_Permissions.ManageItems}>
                    <button type="button" onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`)} className={btnClass('primary')}>
                        <Plus className="size-4" />Add<span className="hidden md:inline"> product</span>
                    </button>
                </ShowWrapper>
            </header>

            <div className="grid gap-4 px-4 md:px-6">
                {/* --- Live all products in this category --- */}
                <ShowWrapper requiredPermission={Cata_Permissions.ViewEditButton}>
                    <div className="flex items-center gap-3 rounded-sm border border-sf-line bg-white p-4 shadow-sf-card md:gap-4 md:px-5">
                        <span className={cx('size-2.5 shrink-0 rounded-full', isAllLive ? 'bg-green-600' : 'bg-slate-400')} aria-hidden />
                        <div className="min-w-0 flex-1">
                            <b className="block text-[15px] font-semibold">
                                {isUncategorized ? 'Not on your store' : isAllLive ? 'Every product here is live' : liveCount > 0 ? `${liveCount} of ${filteredItems.length} products are live` : 'No product here is live'}
                            </b>
                            <p className="text-xs leading-[18px] text-slate-500">
                                {isUncategorized
                                    ? 'Products without a category can’t go live. Edit a product and give it a category first.'
                                    : isAllLive ? 'Customers can see and order all of them. Turn off to hide this whole category.' : 'Turn on to show every product in this category on your store.'}
                            </p>
                        </div>
                        <button type="button" role="switch" aria-checked={isAllLive} aria-label="Live all products in this category" onClick={handleToggleAllLive}
                            className={cx('relative h-6 w-11 shrink-0 rounded-sm transition-colors', isAllLive ? 'bg-sf-primary' : 'bg-sf-control', isUncategorized && 'opacity-45')}>
                            <span className={cx('absolute top-[3px] size-[18px] rounded-[2px] bg-white shadow-sm transition-transform', isAllLive ? 'left-[23px]' : 'left-[3px]')} />
                        </button>
                    </div>
                </ShowWrapper>

                {/* --- Search + sort --- */}
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <div className="w-full sm:max-w-[460px] sm:flex-1">
                        <SearchableItemInput
                            items={allItems}
                            placeholder="Search products"
                            itemGroupMap={itemGroupMap}
                            onItemSelected={(item) => {
                                if (!item.id) return;
                                const group = allItemGroups.find(g => g.id === item.itemGroupId);
                                const uncategorizedGroup = allItemGroups.find(g => g.name.toLowerCase().trim() === "uncategorized");
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
                            Sort: {SORT_LABELS[sortOrder]}<ChevronDown className="size-4 text-slate-500" />
                        </button>
                        {isSortOpen && (
                            <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-sm border border-sf-line bg-white py-1 shadow-sf-float">
                                {(['A-Z', 'Z-A', 'Price: Low-High', 'Price: High-Low'] as const).map(opt => (
                                    <button key={opt} type="button" onClick={() => { setSortOrder(opt); setIsSortOpen(false); }}
                                        className={cx('block w-full px-3 py-2 text-left text-sm hover:bg-sf-sunken', sortOrder === opt && 'font-medium text-sf-primary')}>
                                        {SORT_LABELS[opt]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <p className="text-xs text-slate-500">
                    {filteredItems.length} product{filteredItems.length === 1 ? '' : 's'}{isSearching ? ` match "${searchQuery}"` : ''} · pinned ones show first, here and on your store
                </p>

                {/* --- Product grid --- */}
                {filteredItems.length === 0 ? (
                    <div className="grid place-items-center gap-2 rounded-sm border border-sf-line bg-white px-4 py-14 text-center text-[13px] text-slate-500">
                        <b className="text-[15px] font-semibold text-slate-900">No products in {currentCategoryName} yet</b>
                        Add a product and choose this category so customers can see it here.
                        <ShowWrapper requiredPermission={Cata_Permissions.ManageItems}>
                            <button type="button" onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`)} className={cx(btnClass('secondary', 'sm'), 'mt-2')}>
                                <Plus className="size-4" />Add product
                            </button>
                        </ShowWrapper>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5">
                        {itemsToDisplay.map((item, idx) => {
                            const { mrp, salePrice, discountPercent, hasDiscount, hasBothPrices } = getEffectivePriceInfo(item);
                            const multiplier = item.unitMultiplier || 1;
                            const showDiscountBadge = catalogueSettings?.showDiscountBadge && hasDiscount;
                            const pinned = pinnedIds.has(item.id!);
                            const stock = Number(item.stock || 0);

                            return (
                                <article
                                    id={item.id}
                                    key={item.id}
                                    onClick={() => handleOpenDetailDrawer(item)}
                                    className={cx('group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border bg-white shadow-sf-card transition-shadow hover:shadow-sf-float',
                                        highlightedId === item.id ? 'border-sf-primary outline-2 outline-offset-2 outline-sf-primary' : pinned ? 'border-sf-primary' : 'border-sf-line')}
                                >
                                    <div className={cx('relative aspect-square overflow-hidden', !item.isListed && 'opacity-60')}>
                                        <Photo src={item.imageUrl} alt={item.name} fit="contain" tone={idx} className="h-full rounded-none" />
                                        {/* One wrapping row so the badges never overlap on narrow cards */}
                                        <span className="absolute inset-x-2 top-2 flex flex-wrap items-start gap-1">
                                            <StockIndicator stock={stock} />
                                            <span className="ml-auto flex flex-wrap justify-end gap-1">
                                                {showDiscountBadge && <Tag tone="success">{discountPercent}% off</Tag>}
                                                {pinned && <Tag tone="soft"><Pin className="size-3 fill-current" />Pinned</Tag>}
                                            </span>
                                        </span>
                                    </div>

                                    <div className="flex flex-1 flex-col gap-1 p-3 md:p-4">
                                        <div className="flex items-start gap-1.5">
                                            <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-5">{item.name}</h3>
                                            {!isUncategorized && (
                                                <span className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <button type="button" onClick={(e) => handleTogglePin(e, item.id!)} aria-label={pinned ? `Unpin ${item.name}` : `Pin ${item.name} to the top`}
                                                        title={pinned ? 'Unpin' : 'Pin to top'}
                                                        className={cx('grid size-8 place-items-center rounded-sm transition-colors',
                                                            pinned
                                                                ? 'bg-sf-soft text-sf-primary hover:brightness-95'
                                                                : 'bg-sf-sunken text-slate-600 hover:bg-sf-line hover:text-slate-900')}>
                                                        <Pin className={cx('size-4', pinned && 'fill-current')} />
                                                    </button>
                                                    <button type="button" onClick={() => handleShareItem(item)} aria-label={`Share ${item.name}`} title="Share product"
                                                        className="grid size-8 place-items-center rounded-sm bg-sf-sunken text-slate-600 transition-colors hover:bg-sf-line hover:text-slate-900">
                                                        <Send className="size-4" />
                                                    </button>
                                                </span>
                                            )}
                                        </div>
                                        <p className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
                                            <span className="text-base font-semibold">₹{salePrice.toLocaleString('en-IN')}</span>
                                            {hasBothPrices && <s className="text-xs text-slate-500">₹{mrp.toLocaleString('en-IN')}</s>}
                                            {multiplier > 1 && <span className="text-xs text-slate-500">{multiplier} pcs</span>}
                                        </p>

                                        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2.5" onClick={(e) => e.stopPropagation()}>
                                            <ShowWrapper requiredPermission={Cata_Permissions.ViewEditButton}>
                                                <button type="button" onClick={() => handleOpenEditDrawer(item)} aria-label={`Edit ${item.name}`} className={cx(btnClass('secondary', 'sm'), 'min-w-0 flex-1')}>
                                                    <Pencil className="size-4" /><span className="max-sm:sr-only">Edit</span>
                                                </button>
                                                {!isUncategorized && (
                                                    <QuickListedToggle
                                                        itemId={item.id!}
                                                        isListed={item.isListed ?? false}
                                                        onToggle={async (itemId, newState) => {
                                                            if (isUncategorized && newState === true) {
                                                                setShowUncategorizedWarning(true);
                                                                return;
                                                            }
                                                            await handleToggleListed(itemId, newState);
                                                        }}
                                                    />
                                                )}
                                            </ShowWrapper>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}

                {hasMoreItems && (
                    <div ref={loadMoreRef} className="flex h-16 items-center justify-center text-xs text-slate-500">
                        <Loader2 className="mr-2 size-4 animate-spin" />Loading more products…
                    </div>
                )}
            </div>

            {/* Cart preview from the product detail drawer (owner trying the storefront flow) */}
            <Sheet open={isCartOpen} title={`Cart (${cartCount})`} onClose={() => setIsCartOpen(false)}>
                {cart.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">The cart is empty.</p>
                ) : (
                    <div className="grid gap-3">
                        {cart.map(({ item, quantity }) => (
                            <div key={item.id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-sm border border-sf-line p-2.5">
                                <Photo src={item.imageUrl} alt={item.name} fit="contain" className="aspect-square" />
                                <div className="min-w-0">
                                    <b className="block truncate text-sm font-medium">{item.name}</b>
                                    <span className="text-xs tabular-nums text-slate-500">₹{getEffectivePriceInfo(item).salePrice.toLocaleString('en-IN')} each</span>
                                    <div className="mt-1.5 flex items-center gap-1">
                                        <button type="button" aria-label="Remove one" onClick={() => updateQuantity(item.id!, -1)} className="grid size-7 place-items-center rounded-sm border border-sf-control"><Minus className="size-3.5" /></button>
                                        <span className="w-7 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                                        <button type="button" aria-label="Add one" onClick={() => updateQuantity(item.id!, 1)} className="grid size-7 place-items-center rounded-sm border border-sf-control"><Plus className="size-3.5" /></button>
                                    </div>
                                </div>
                                <button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeFromCart(item.id!)} className="grid size-8 place-items-center rounded-sm text-red-700 hover:bg-red-50"><Trash2 className="size-4" /></button>
                            </div>
                        ))}
                        <div className="flex justify-between border-t border-sf-line pt-3 text-base font-semibold"><span>Subtotal</span><span className="tabular-nums">₹{cartTotal.toLocaleString('en-IN')}</span></div>
                    </div>
                )}
            </Sheet>

            <ItemEditDrawer
                item={selectedItemForEdit}
                isOpen={isDrawerOpen}
                onClose={() => {
                    setIsDrawerOpen(false);
                    setSelectedItemForEdit(null);
                }}
                onSaveSuccess={async (updated) => {
                    setAllItems(prev =>
                        prev.map(i =>
                            i.id === selectedItemForEdit?.id
                                ? {
                                    ...i,
                                    ...updated,
                                    stock: updated.stock !== undefined ? Number(updated.stock) : i.stock,
                                    moq: updated.moq ?? i.moq ?? 1
                                }
                                : i
                        )
                    );

                    if (companyId && selectedItemForEdit) {
                        const newStock = updated.stock !== undefined ? Number(updated.stock) : (selectedItemForEdit.stock ?? 0);
                        const isNowInStock = newStock > 0;
                        await syncNotifyStock(companyId, selectedItemForEdit.id!, isNowInStock);
                    }
                }}
                itemGroupRoute={`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`}
            />

            <Sheet open={showUncategorizedWarning} title="Give it a category first" onClose={() => setShowUncategorizedWarning(false)}
                footer={<button type="button" onClick={() => setShowUncategorizedWarning(false)} className={btnClass('primary')}>OK</button>}>
                <p className="text-sm text-slate-600">Products without a category can’t go live. Tap Edit on the product, choose a category, and then make it live.</p>
            </Sheet>

            <Sheet open={showConfirmPopup} title={pendingLiveState ? 'Make every product here live?' : 'Hide every product here?'} onClose={() => setShowConfirmPopup(false)}
                footer={<>
                    <button type="button" onClick={() => setShowConfirmPopup(false)} className={btnClass('ghost')}>Cancel</button>
                    <button type="button" onClick={confirmToggleAllLive} className={btnClass('primary')}>{pendingLiveState ? 'Make all live' : 'Hide all'}</button>
                </>}>
                <p className="text-sm text-slate-600">
                    {pendingLiveState
                        ? `All ${filteredItems.length} products in ${currentCategoryName} will show on your store link.`
                        : `All ${filteredItems.length} products in ${currentCategoryName} will be hidden from your store link.`}
                </p>
            </Sheet>

            <ItemDetailDrawer
                catalogueSettings={catalogueSettings}
                item={selectedItemForDetails}
                isOpen={isDetailDrawerOpen}
                onClose={() => { setIsDetailDrawerOpen(false); setSelectedItemForDetails(null); }}
                onAddToCart={(item) => addToCart(item)}
                initialQuantity={cart.find(i => i.item.id === selectedItemForDetails?.id)?.quantity || 0}
                onUpdateQuantity={updateQuantity}
                companyId={companyId}
                variantGroupIds={variantGroupIds}
                onVariantSelect={(variantItem) => {
                    setSelectedItemForDetails(variantItem as Item);
                    setVariantGroupIds(resolveVariantGroup(variantItem as Item));
                }}
            />
        </div>
    );
};

export default MyShop;
