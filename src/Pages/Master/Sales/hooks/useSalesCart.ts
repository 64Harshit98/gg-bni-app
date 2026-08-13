import { useState, useEffect, useMemo, useRef } from 'react';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import { applyRounding } from '../sales.calculations';
import type { SalesItem } from '../sales.types';

interface UseSalesCartParams {
    salesSettings: any;
    loadingSettings: boolean;
    isEditMode: boolean;
    invoiceToEdit: any;
    pageIsLoading: boolean;
    availableItems: Item[];
    setAvailableItems: React.Dispatch<React.SetStateAction<Item[]>>;
    dbOperations: any;
    setModal: (modal: { message: string; type: State } | null) => void;
}

// Owns item/cart management — moved verbatim from Sales.tsx: the `items`
// state and its initial sessionStorage-restore, the edit-mode item hydration
// effect and the cart-items sessionStorage draft-save effect (both mutate
// `items`, so they live here rather than in useSalesCatalogueAndSettings —
// see the note in that hook), addItemToCart and its duplicate-item-prompt
// flow, barcode linking/scanning, quantity/delete handlers, discount/price
// lock+edit handlers, the item-edit-drawer flow, clear-cart confirm, and the
// grid category/sort/search state (kept in this single hook rather than
// split out, since the grid state and cart-mutation handlers both read/write
// `items` and splitting them would mean threading `items`/`setItems` between
// two hooks for no real gain in clarity).
export const useSalesCart = ({
    salesSettings,
    loadingSettings,
    isEditMode,
    invoiceToEdit,
    pageIsLoading,
    availableItems,
    setAvailableItems,
    dbOperations,
    setModal,
}: UseSalesCartParams) => {
    const [items, setItems] = useState<SalesItem[]>(() => {
        if (isEditMode) return [];
        try {
            const savedDraft = sessionStorage.getItem('sales_cart_draft');
            const parsedDraft = savedDraft ? JSON.parse(savedDraft) : [];
            return parsedDraft;
        } catch (e) {
            return [];
        }
    });

    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const cartListRef = useRef<HTMLDivElement>(null);

    const [isDiscountLocked, setIsDiscountLocked] = useState(true);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);
    const [isPriceLocked, setIsPriceLocked] = useState(true);
    const [priceInfo, setPriceInfo] = useState<string | null>(null);

    const [duplicateItemPrompt, setDuplicateItemPrompt] = useState<{ item: Item; existingCount: number } | null>(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const [barcodeToLink, setBarcodeToLink] = useState<string | null>(null);
    const [isBarcodeLinkModalOpen, setIsBarcodeLinkModalOpen] = useState(false);
    const [isLinkingBarcode, setIsLinkingBarcode] = useState(false);

    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [listSelectedCategory] = useState<string>('All');
    const [gridSearchQuery, setGridSearchQuery] = useState<string>('');
    const [cartSearchQuery, setCartSearchQuery] = useState<string>('');
    const [sortOrder, setSortOrder] = useState<'az' | 'za' | 'price_asc' | 'price_desc'>('az');

    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

    const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

    useEffect(() => {
        if (!loadingSettings && salesSettings) {
            setIsDiscountLocked(salesSettings.lockDiscountEntry ?? false);
            setIsPriceLocked(salesSettings.lockSalePriceEntry ?? false);
        }
    }, [loadingSettings, salesSettings?.lockDiscountEntry, salesSettings?.lockSalePriceEntry]);

    // ... (Edit Mode Init - Unchanged) ...
    useEffect(() => {
        if (isEditMode && invoiceToEdit?.items) {
            const nonEditableItems = invoiceToEdit.items.map((item: any) => ({
                ...item,
                id: crypto.randomUUID(),
                productId: item.id,
                isEditable: true,
                customPrice: item.effectiveUnitPrice,
                quantity: item.quantity || 1,
                mrp: item.mrp || 0,
                discount: item.discount || 0,
                discount2: item.discount2 || 0,
                taxableAmount: item.taxableAmount,
                taxAmount: item.taxAmount,
                taxRate: item.taxRate,
                taxType: item.taxType,
                finalPrice: item.finalPrice,
                effectiveUnitPrice: item.effectiveUnitPrice,
                discountPercentage: item.discountPercentage,
                purchasePrice: item.purchasePrice || 0,
                tax: Number(item.tax ?? item.taxRate ?? 0),
                itemGroupId: item.itemGroupId || '',
                stock: item.stock ?? item.Stock ?? 0,
                amount: item.amount || 0,
                barcode: item.barcode || '',
                restockQuantity: item.restockQuantity || 0,
                unit: item.unit || '',                     // ADDED
                unitMultiplier: 1,  // ADDED
                packetSize: item.packetSize || null,
            }));
            setItems(nonEditableItems);
        }
    }, [isEditMode, invoiceToEdit]);

    useEffect(() => {
        if (!isEditMode && !pageIsLoading) {
            sessionStorage.setItem('sales_cart_draft', JSON.stringify(items));
        }
    }, [items, isEditMode, pageIsLoading]);

    const categories = useMemo(() => {
        const groups = new Set(availableItems.map(i => i.itemGroupId || 'uncategorized'));
        return ['All', ...Array.from(groups).sort()];
    }, [availableItems]);

    const sortedGridItems = useMemo(() => {
        const filtered = availableItems.filter(item => {
            const itemGroupId = item.itemGroupId || 'uncategorized';
            const matchesCategory = selectedCategory === 'All' || itemGroupId === selectedCategory;
            const matchesSearch = gridSearchQuery === '' || item.name.toLowerCase().includes(gridSearchQuery.toLowerCase()) || item.barcode?.includes(gridSearchQuery);
            return matchesCategory && matchesSearch;
        });

        const sortFn = (a: Item, b: Item) => {
            switch (sortOrder) {
                case 'az': return a.name.localeCompare(b.name);
                case 'za': return b.name.localeCompare(a.name);
                case 'price_asc': return (a.salesPrice || a.mrp || 0) - (b.salesPrice || b.mrp || 0);
                case 'price_desc': return (b.salesPrice || b.mrp || 0) - (a.salesPrice || a.mrp || 0);
                default: return 0;
            }
        };

        return [...filtered].sort(sortFn);

    }, [availableItems, selectedCategory, gridSearchQuery, items, sortOrder]);

    const addItemToCart = (itemToAdd: Item) => {
        if (!itemToAdd || !itemToAdd.id) {
            setModal({ message: "Cannot add invalid item.", type: State.ERROR });
            return;
        }

        const itemTaxExtracted = Number(itemToAdd.tax ?? (itemToAdd as any).taxRate ?? salesSettings?.defaultTaxRate ?? 0);

        const mrp = Number(itemToAdd.mrp || 0);
        const salesPrice = Number(itemToAdd.salesPrice || 0);
        const presetDiscount = Number(itemToAdd.discount || 0);
        const initialMoq = Number((itemToAdd as any).moq || 1);

        let finalNetPrice = 0;
        let calculatedDiscount = 0;

        // --- NEW 3-TIER LOGIC ---
        if (mrp > 0 && salesPrice > 0) {
            // Case 1: Both exist. Ignore DB discount. Calculate diff.
            finalNetPrice = salesPrice;
            calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
        } else if (salesPrice > 0) {
            // Case 2: Only Sales Price exists. Apply DB discount.
            calculatedDiscount = presetDiscount;
            finalNetPrice = salesPrice * (1 - (presetDiscount / 100));
        } else if (mrp > 0) {
            // Case 3: Only MRP exists. Apply DB discount.
            calculatedDiscount = presetDiscount;
            finalNetPrice = mrp * (1 - (presetDiscount / 100));
        }

        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
        finalNetPrice = applyRounding(finalNetPrice, isRoundingEnabled, roundingInterval);

        const newSalesItem: SalesItem = {
            ...itemToAdd,
            id: crypto.randomUUID(),
            productId: itemToAdd.id!,
            quantity: Math.max(1, initialMoq),
            discount: calculatedDiscount,
            discount2: 0,
            customPrice: finalNetPrice,
            isEditable: true,
            purchasePrice: itemToAdd.purchasePrice || 0,
            tax: itemTaxExtracted,
            itemGroupId: itemToAdd.itemGroupId || '',
            stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
            amount: itemToAdd.amount || 0,
            barcode: itemToAdd.barcode || '',
            restockQuantity: itemToAdd.restockQuantity || 0,
            unit: (itemToAdd as any).unit || '',
            unitMultiplier: 1,
            packetSize: (itemToAdd as any).packetSize || null,
            addedAt: Date.now(),
        };

        setItems(prev => {
            const insertionOrder = salesSettings?.cartInsertionOrder || 'top';
            const newList = insertionOrder === 'top' ? [newSalesItem, ...prev] : [...prev, newSalesItem];

            setTimeout(() => {
                if (cartListRef.current) {
                    if (insertionOrder === 'bottom') {
                        cartListRef.current.scrollTo({ top: cartListRef.current.scrollHeight, behavior: 'smooth' });
                    } else {
                        cartListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }
            }, 50);

            return newList;
        });
    };

    const handleClearCart = () => {
        if (items.length > 0) {
            setModal({
                message: 'Are you sure you want to remove all items from the cart?',
                type: State.ERROR,
            });
            setShowClearCartConfirm(true);
        }
    };
    const handleConfirmClearCart = () => {
        setItems([]);
        setCartSearchQuery('');
        setShowClearCartConfirm(false);
    };
    const handleItemSelected = (selectedItem: Item | null) => {
        if (!selectedItem) return;

        // Cart mein ye item pehle se hai kya (ek ya zyada baar)?
        const existingMatches = items.filter(i => i.productId === selectedItem.id);

        if (existingMatches.length > 0) {
            // Direct add mat karo — pehle user se poocho
            setDuplicateItemPrompt({ item: selectedItem, existingCount: existingMatches.length });
            setGridSearchQuery('');
            return;
        }

        addItemToCart(selectedItem);
        setGridSearchQuery('');
    };

    // User ne "Quantity Badhao" choose kiya
    const handleIncreaseExistingQuantity = () => {
        if (!duplicateItemPrompt) return;
        const targetProductId = duplicateItemPrompt.item.id;

        setItems(prev => {
            const matches = prev.filter(i => i.productId === targetProductId);
            if (matches.length === 0) return prev;

            // Sabse "last added" (sabse recent) wala line dhoondo
            const lastAdded = matches.reduce((latest, current) =>
                (current.addedAt || 0) > (latest.addedAt || 0) ? current : latest
            );

            return prev.map(i =>
                i.id === lastAdded.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i
            );
        });

        setDuplicateItemPrompt(null);
    };

    // User ne "Naya Item Add Karo" choose kiya
    const handleAddAsNewLine = () => {
        if (!duplicateItemPrompt) return;
        addItemToCart(duplicateItemPrompt.item);
        setDuplicateItemPrompt(null);
    };
    const closeBarcodeLinkModal = () => {
        setIsBarcodeLinkModalOpen(false);
        setBarcodeToLink(null);
    };

    const handleLinkScannedBarcode = async (selectedItem: Item) => {
        if (!barcodeToLink || !dbOperations) return;
        if (!selectedItem.id) {
            setModal({ message: 'Selected item is invalid. Please try another item.', type: State.ERROR });
            return;
        }
        setIsLinkingBarcode(true);
        try {
            await dbOperations.updateItem(selectedItem.id, { barcode: barcodeToLink });
            const updatedItem: Item = { ...selectedItem, barcode: barcodeToLink };
            setAvailableItems(prev => {
                const exists = prev.some(item => item.id === selectedItem.id);
                if (!exists) return [...prev, updatedItem];
                return prev.map(item => item.id === selectedItem.id ? { ...item, barcode: barcodeToLink } : item);
            });
            addItemToCart(updatedItem);
            closeBarcodeLinkModal();
            setModal({ message: `Barcode linked to "${selectedItem.name}".`, type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to link barcode:', err);
            setModal({ message: 'Failed to link barcode. Please try again.', type: State.ERROR });
        } finally {
            setIsLinkingBarcode(false);
        }
    };
    const handleBarcodeScanned = async (barcode: string) => {
        setIsScannerOpen(false);
        if (!dbOperations) return;

        const cleanBarcode = barcode.trim();

        try {
            // Explicitly type the variable to accept Item, undefined (from .find), or null (from DB)
            let itemToAdd: Item | null | undefined = availableItems.find(item => item.barcode === cleanBarcode);

            // Fallback to the database if it's not in local state
            if (!itemToAdd) {
                itemToAdd = await dbOperations.getItemByBarcode(cleanBarcode);
            }

            if (itemToAdd) {
                addItemToCart(itemToAdd);

                // Only add to availableItems if it came from the DB fallback
                setAvailableItems(prev => {
                    const exists = prev.find(p => p.id === itemToAdd!.id);
                    return exists ? prev : [...prev, itemToAdd!];
                });
            } else {
                const hasAnyItemWithoutBarcode = availableItems.some(item => !(item.barcode || '').trim());
                if (!hasAnyItemWithoutBarcode) {
                    setModal({
                        message: `Item not found for barcode: "${cleanBarcode}"`,
                        type: State.ERROR
                    });
                    return;
                }
                setBarcodeToLink(cleanBarcode);
                setIsBarcodeLinkModalOpen(true);
            }
        } catch (e) {
            console.error(e);
            setModal({ message: 'Scan error occurred.', type: State.ERROR });
        }
    };
    const handleQuantityChange = (id: string, newQuantity: number) => { setItems(prev => prev.map(item => item.id === id ? { ...item, quantity: Math.max(0, newQuantity) } : item)); };
    const handleDeleteItem = (id: string) => { setItems(prev => prev.filter(item => item.id !== id)); };
    const handleDiscountPressStart = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500); };
    const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleDiscountClick = () => { if (salesSettings?.lockDiscountEntry || isDiscountLocked) { setDiscountInfo("Cannot edit discount"); setTimeout(() => setDiscountInfo(null), 3000); } };
    const handlePricePressStart = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 500); };
    const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handlePriceClick = () => { if (salesSettings?.lockSalePriceEntry || isPriceLocked) { setPriceInfo("Cannot edit sale price"); setTimeout(() => setPriceInfo(null), 1000); } };
    const handleDiscountChange = (id: string, v: number | string) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        const safeDiscount = isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
        setItems(prev => prev.map(i => {
            if (i.id === id) {
                // FIXED: Base price is MRP if it exists, otherwise Sales Price
                const basePrice = (i.mrp > 0) ? i.mrp : (i.salesPrice || 0);
                const safeDiscount2 = i.discount2 || 0;
                const priceAfterFirstDiscount = basePrice * (1 - safeDiscount / 100);
                let newPrice = priceAfterFirstDiscount * (1 - safeDiscount2 / 100);
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                newPrice = applyRounding(newPrice, isRoundingEnabled, roundingInterval);
                return { ...i, discount: safeDiscount, customPrice: newPrice };
            }
            return i;
        }));
    };
    const handleDiscount2Change = (id: string, v: number | string) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        const safeDiscount2 = isNaN(n) ? 0 : n;
        setItems(prev => prev.map(i => {
            if (i.id === id) {
                const basePrice = (i.mrp > 0) ? i.mrp : (i.salesPrice || 0);
                const safeDiscount1 = i.discount || 0;
                const priceAfterFirstDiscount = basePrice * (1 - safeDiscount1 / 100);
                let newPrice = priceAfterFirstDiscount * (1 - safeDiscount2 / 100);
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                newPrice = applyRounding(newPrice, isRoundingEnabled, roundingInterval);
                return { ...i, discount2: safeDiscount2, customPrice: newPrice };
            }
            return i;
        }));
    };
    const handleCustomPriceChange = (id: string, v: string) => { if (v === '' || /^[0-9]*\.?[0-9]*$/.test(v)) setItems(prev => prev.map(i => i.id === id ? { ...i, customPrice: v } : i)); };
    const handleCustomPriceBlur = (id: string) => {
        setItems(prev => prev.map(i => {
            if (i.id === id && typeof i.customPrice === 'string') {
                const n = parseFloat(i.customPrice);
                if (i.customPrice === '' || isNaN(n)) return { ...i, customPrice: undefined };
                let d = 0;

                // FIXED: Base price is MRP if it exists, otherwise Sales Price
                const basePrice = (i.mrp > 0) ? i.mrp : (i.salesPrice || 0);

                if (basePrice > 0) d = ((basePrice - n) / basePrice) * 100;
                return { ...i, customPrice: n, discount: parseFloat(d.toFixed(2)) };
            }
            return i;
        }));
    };
    const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
    const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
        setAvailableItems(prevItems => prevItems.map(item =>
            item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item
        ));

        const updateForCart: Partial<SalesItem> = { ...updatedItemData };
        if ((updateForCart as any).Stock !== undefined) {
            updateForCart.stock = (updateForCart as any).Stock;
            delete (updateForCart as any).Stock;
        }

        Object.keys(updateForCart).forEach(key => {
            if (updateForCart[key as keyof typeof updateForCart] === undefined) {
                delete updateForCart[key as keyof typeof updateForCart];
            }
        });

        setItems(prevCartItems => prevCartItems.map(cartItem => {
            if (cartItem.productId === selectedItemForEdit?.id || cartItem.id === selectedItemForEdit?.id) {
                const mergedItem = { ...cartItem, ...updateForCart } as SalesItem;

                const mrp = Number(mergedItem.mrp || 0);
                const salesPrice = Number(mergedItem.salesPrice || 0);
                const presetDiscount = Number(mergedItem.discount || 0);
                const existingDiscount2 = Number(mergedItem.discount2 || 0);

                let finalNetPrice = 0;
                let calculatedDiscount = 0;

                // --- NEW 3-TIER LOGIC ---
                if (mrp > 0 && salesPrice > 0) {
                    finalNetPrice = salesPrice;
                    calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
                } else if (salesPrice > 0) {
                    calculatedDiscount = presetDiscount;
                    finalNetPrice = salesPrice * (1 - (presetDiscount / 100));
                } else if (mrp > 0) {
                    calculatedDiscount = presetDiscount;
                    finalNetPrice = mrp * (1 - (presetDiscount / 100));
                }
                // Apply existing discount2 on top, compounding it
                finalNetPrice = finalNetPrice * (1 - (existingDiscount2 / 100));
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                finalNetPrice = applyRounding(finalNetPrice, isRoundingEnabled, roundingInterval);

                mergedItem.customPrice = finalNetPrice;
                mergedItem.discount = parseFloat(calculatedDiscount.toFixed(2)); // Make sure discount updates!
                mergedItem.discount2 = existingDiscount2;
                return mergedItem;
            }
            return cartItem;
        }));
    };
    const displayItems = useMemo(() => {
        const base = listSelectedCategory === 'All'
            ? items
            : items.filter(item => (item.itemGroupId || 'Others') === listSelectedCategory);

        const q = cartSearchQuery.trim().toLowerCase();
        if (!q) return base;

        // 👈 NEW: same "search bumps result to top" behavior as the Orders page search
        return [...base].sort((a, b) => {
            const aMatch = (a.name || '').toLowerCase().includes(q);
            const bMatch = (b.name || '').toLowerCase().includes(q);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0; // keep original relative order otherwise
        });
    }, [items, listSelectedCategory, cartSearchQuery]);

    return {
        items, setItems,
        longPressTimer,
        cartListRef,
        isDiscountLocked, setIsDiscountLocked,
        discountInfo, setDiscountInfo,
        isPriceLocked, setIsPriceLocked,
        priceInfo, setPriceInfo,
        duplicateItemPrompt, setDuplicateItemPrompt,
        isScannerOpen, setIsScannerOpen,
        barcodeToLink, setBarcodeToLink,
        isBarcodeLinkModalOpen, setIsBarcodeLinkModalOpen,
        isLinkingBarcode, setIsLinkingBarcode,
        selectedCategory, setSelectedCategory,
        listSelectedCategory,
        gridSearchQuery, setGridSearchQuery,
        cartSearchQuery, setCartSearchQuery,
        sortOrder, setSortOrder,
        selectedItemForEdit, setSelectedItemForEdit,
        isItemDrawerOpen, setIsItemDrawerOpen,
        showClearCartConfirm, setShowClearCartConfirm,
        categories,
        sortedGridItems,
        displayItems,
        addItemToCart,
        handleClearCart,
        handleConfirmClearCart,
        handleItemSelected,
        handleIncreaseExistingQuantity,
        handleAddAsNewLine,
        closeBarcodeLinkModal,
        handleLinkScannedBarcode,
        handleBarcodeScanned,
        handleQuantityChange,
        handleDeleteItem,
        handleDiscountPressStart,
        handleDiscountPressEnd,
        handleDiscountClick,
        handlePricePressStart,
        handlePricePressEnd,
        handlePriceClick,
        handleDiscountChange,
        handleDiscount2Change,
        handleCustomPriceChange,
        handleCustomPriceBlur,
        handleOpenEditDrawer,
        handleCloseEditDrawer,
        handleSaveSuccess,
    };
};
