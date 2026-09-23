import { useState, useEffect, useMemo, useRef } from 'react';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import { applyPurchaseRounding } from '../purchase.calculations';
import type { PurchaseItem } from '../purchase.types';

interface UsePurchaseCartParams {
    isEditMode: boolean;
    purchaseSettings: any;
    items: PurchaseItem[];
    setItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
    availableItems: Item[];
    setAvailableItems: React.Dispatch<React.SetStateAction<Item[]>>;
    setModal: (modal: { message: string; type: State } | null) => void;
     companyId?: string;
}

// Owns item/cart management — moved verbatim from Purchase.tsx: the
// localStorage draft-save effect, cartItemsAdapter, addItemToCart (the
// base-price resolution here prefers masterPurchasePrice first then mrp —
// see the divergence note at the top of purchase.calculations.ts, preserved
// exactly), the price/discount/discount2/blur handlers (which call
// applyPurchaseRounding from ../purchase.calculations), quantity/delete
// handlers, clear-cart confirm, the duplicate-item-prompt flow, the
// item-edit-drawer flow, and the grid category/sort/search state — all kept
// in this single hook rather than split out, mirroring useSalesCart's
// grouping rationale (the grid state and cart-mutation handlers both
// read/write `items`).
//
// NOTE ON `items`/`setItems`: unlike useSalesCart, this hook does NOT create
// the `items` useState itself — it's lifted to Purchase.tsx and threaded in
// as a param instead. Reason: Purchase.tsx's single combined data-fetch
// effect (in usePurchaseCatalogueAndSettings) needs `setItems` to hydrate the
// cart when editing an existing purchase, while THIS hook's grid memos
// (categories/sortedGridItems) and handleSaveSuccess need
// `availableItems`/`setAvailableItems` FROM that same catalogue hook. That's
// a genuine two-way value dependency (not just a setter each way) — catalogue
// needs cart's setItems, cart needs catalogue's availableItems VALUE — so
// neither hook can be called strictly before the other while each owns its
// half. Lifting the one shared piece of state (`items`) to the component
// (which calls catalogue first, then this hook) breaks the cycle: catalogue
// gets `setItems` as a plain param (no ordering issue, it's just a setter),
// and this hook gets both `items` and catalogue's `availableItems` as
// ordinary params. Behavior is unchanged from the original single-component
// version — only which file declares the `useState` call for `items`.
export const usePurchaseCart = ({
    isEditMode,
    purchaseSettings,
    items,
    setItems,
    availableItems,
    setAvailableItems,
    setModal,
    companyId,
}: UsePurchaseCartParams) => {
    const cartListRef = useRef<HTMLDivElement>(null);

    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [gridSearchQuery, setGridSearchQuery] = useState<string>('');
    const [cartSearchQuery, setCartSearchQuery] = useState<string>('');
    const [sortOrder, setSortOrder] = useState<'az' | 'za' | 'price_asc' | 'price_desc'>('az');

    const [duplicateItemPrompt, setDuplicateItemPrompt] = useState<{ item: Item; existingCount: number } | null>(null);

    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

    const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

    useEffect(() => {
       if (!isEditMode && companyId) {
        localStorage.setItem(`purchase_cart_draft_${companyId}`, JSON.stringify(items));
    }
}, [items, isEditMode, companyId]);

    const cartItemsAdapter = useMemo(() => {
        const mapped = items.map(item => ({
            ...item,
            purchasePrice: Number(item.purchasePrice || 0),
            customPrice: item.purchasePrice,
            // GenericCartList will display this as "Discount"
            discount: item.purchasediscount ?? item.discount ?? 0,
            discount2: item.purchasediscount2 ?? 0,
            isEditable: item.isEditable ?? true
        }));
        const q = cartSearchQuery.trim().toLowerCase();
        if (!q) return mapped;

        // 👈 NEW: same "search bumps result to top" behavior as the Orders page search
        return [...mapped].sort((a, b) => {
            const aMatch = (a.name || '').toLowerCase().includes(q);
            const bMatch = (b.name || '').toLowerCase().includes(q);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0; // keep original relative order otherwise
        });
    }, [items, cartSearchQuery]);

    // --- LOGIC 1: ADD ITEM ---
    const addItemToCart = (itemToAdd: Item) => {
        if (!itemToAdd || !itemToAdd.id) {
            setModal({ message: "Cannot add invalid item.", type: State.ERROR });
            return;
        }

        const resolvedTax = itemToAdd.tax ?? itemToAdd.taxRate ?? 0;

        // 1. Extract Values
        const mrp = Number(itemToAdd.mrp || 0);
        const masterPurchasePrice = Number(itemToAdd.purchasePrice || 0);

        // FIX: Look ONLY for 'purchasediscount'. Ignore 'discount' (Sale Discount).
        const masterPurchaseDiscount = (itemToAdd as any).purchasediscount || 0;
        const globalDefaultDiscount = purchaseSettings?.defaultDiscount ?? 0;

        let finalNetPrice = 0;
        let calculatedDiscount = 0;

        // 2. Logic Implementation
        if (masterPurchasePrice > 0) {
            // Priority 1: Master Purchase Price exists
            finalNetPrice = masterPurchasePrice;
            if (mrp > 0) {
                calculatedDiscount = ((mrp - masterPurchasePrice) / mrp) * 100;
            }
        } else if (mrp > 0) {
            finalNetPrice = mrp;
            calculatedDiscount = 0;
            if (masterPurchaseDiscount > 0) {
                // Priority 2: Master Purchase Discount exists
                calculatedDiscount = masterPurchaseDiscount;
                finalNetPrice = mrp * (1 - (masterPurchaseDiscount / 100));
            } else if (globalDefaultDiscount > 0) {
                // Priority 3: Global Default Discount exists
                calculatedDiscount = globalDefaultDiscount;
                finalNetPrice = mrp * (1 - (globalDefaultDiscount / 100));
            }
        }
        else {
            // No MRP, no purchase price — fall back to salesPrice as base
            const salesPriceBase = Number((itemToAdd as any).salesPrice || 0);
            if (masterPurchaseDiscount > 0 && salesPriceBase > 0) {
                calculatedDiscount = masterPurchaseDiscount;
                finalNetPrice = salesPriceBase * (1 - (masterPurchaseDiscount / 100));
            } else if (globalDefaultDiscount > 0 && salesPriceBase > 0) {
                calculatedDiscount = globalDefaultDiscount;
                finalNetPrice = salesPriceBase * (1 - (globalDefaultDiscount / 100));
            } else {
                // Truly no data — default to salesPrice as-is or 0
                calculatedDiscount = 0;
                finalNetPrice = salesPriceBase;
            }
        }

        const newItemToInsert = {
            id: crypto.randomUUID(),
            productId: itemToAdd.id!,
            name: itemToAdd.name || 'Unnamed Item',
            unit: itemToAdd.unit || '',
            purchasePrice: finalNetPrice,
            originalPurchasePrice: masterPurchasePrice,
            mrp: mrp,
            barcode: itemToAdd.barcode || '',
            quantity: 1,
            unitMultiplier: 1,
            discount: parseFloat(calculatedDiscount.toFixed(2)),
            purchasediscount: parseFloat(calculatedDiscount.toFixed(2)),
            purchasediscount2: 0,
            taxRate: resolvedTax,
            stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
            isEditable: true,
            addedAt: Date.now(),
        };

        setItems((prevItems) => {
            // Check the setting, default to 'top' if undefined
            const order = purchaseSettings?.cartInsertionOrder || 'top';
            const newList = order === 'bottom'
                ? [...prevItems, newItemToInsert]
                : [newItemToInsert, ...prevItems];

            // Auto-scroll after state update
            setTimeout(() => {
                if (cartListRef.current) {
                    if (order === 'bottom') {
                        cartListRef.current.scrollTo({ top: cartListRef.current.scrollHeight, behavior: 'smooth' });
                    } else {
                        cartListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }
            }, 50);

            return newList;
        });
    };

    // --- LOGIC 2: HANDLE PRICE CHANGE (Typing) ---
    const handlePriceChange = (id: string, val: string) => {
        if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
            setItems(prev => prev.map(item =>
                item.id === id ? { ...item, purchasePrice: val } : item
            ));
        }
    };

    // --- LOGIC 3: HANDLE DISCOUNT CHANGE (Calc Price from MRP) ---
    const handleDiscountChange = (id: string, v: number | string) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        const safeDiscount = isNaN(n) ? 0 : n;

        setItems(prev => prev.map(i => {
            if (i.id === id) {
                const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.originalPurchasePrice || 0);
                const safeDiscount2 = i.purchasediscount2 || 0;

                let newPrice = basePrice * (1 - safeDiscount / 100) * (1 - safeDiscount2 / 100);

                const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;
                newPrice = applyPurchaseRounding(newPrice, isRoundingEnabled);

                return {
                    ...i,
                    discount: safeDiscount,
                    purchasediscount: safeDiscount,
                    purchasePrice: newPrice
                };
            }
            return i;
        }));
    };
    // --- LOGIC 3B: HANDLE SECOND DISCOUNT CHANGE (Compound on top of first discount) ---
    const handleDiscount2Change = (id: string, v: number | string) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        const safeDiscount2 = isNaN(n) ? 0 : n;

        setItems(prev => prev.map(i => {
            if (i.id === id) {
                const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.originalPurchasePrice || 0);
                const safeDiscount = i.discount || i.purchasediscount || 0;

                let newPrice = basePrice * (1 - safeDiscount / 100) * (1 - safeDiscount2 / 100);

                const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;
                newPrice = applyPurchaseRounding(newPrice, isRoundingEnabled);

                return {
                    ...i,
                    purchasediscount2: safeDiscount2,
                    purchasePrice: newPrice
                };
            }
            return i;
        }));
    };

    // --- LOGIC 4: HANDLE PRICE BLUR (Calc Discount from MRP) ---
    const handlePriceBlur = (id: string) => {
        setItems(prev => prev.map(i => {
            if (i.id === id) {
                const currentPriceVal = parseFloat(String(i.purchasePrice));

                if (i.purchasePrice === '' || isNaN(currentPriceVal)) {
                    return { ...i, purchasePrice: 0 };
                }

                let d = 0;
                const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.originalPurchasePrice || 0);

                if (basePrice > 0) {
                    d = ((basePrice - currentPriceVal) / basePrice) * 100;
                }

                const finalDiscount = parseFloat(d.toFixed(2));

                // purchasediscount2 left as-is intentionally; only discount1 is recalculated from manual price
                return {
                    ...i,
                    purchasePrice: currentPriceVal,
                    discount: finalDiscount,
                    purchasediscount: finalDiscount
                };
            }
            return i;
        }));
    };

    const categories = useMemo(() => {
        const groups = new Set(availableItems.map(i => i.itemGroupId || 'uncategorized'));
        return ['All', ...Array.from(groups).sort()];
    }, [availableItems]);
    const sortedGridItems = useMemo(() => {
        const filtered = availableItems.filter(item => {
            const itemGroupId = item.itemGroupId || 'uncategorized';
            const matchesCategory = selectedCategory === 'All' || itemGroupId === selectedCategory;
            const matchesSearch = gridSearchQuery === '' ||
                item.name.toLowerCase().includes(gridSearchQuery.toLowerCase()) ||
                item.barcode?.includes(gridSearchQuery);
            return matchesCategory && matchesSearch;
        });

        const sortFn = (a: Item, b: Item) => {
            switch (sortOrder) {
                case 'az': return a.name.localeCompare(b.name);
                case 'za': return b.name.localeCompare(a.name);
                case 'price_asc': return (a.purchasePrice || a.mrp || 0) - (b.purchasePrice || b.mrp || 0);
                case 'price_desc': return (b.purchasePrice || b.mrp || 0) - (a.purchasePrice || a.mrp || 0);
                default: return 0;
            }
        };
        return [...filtered].sort(sortFn);
    }, [availableItems, selectedCategory, gridSearchQuery, items, sortOrder]);

    const handleQuantityChange = (id: string, newQuantity: number) => {
        setItems((prevItems) =>
            prevItems.map((item) =>
                item.id === id ? { ...item, quantity: Math.max(1, newQuantity) } : item
            )
        );
    };

    const handleDeleteItem = (id: string) => {
        setItems((prevItems) => prevItems.filter((item) => item.id !== id));
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

    const handleItemSelected = (item: Item | null) => {
        if (!item) return;

        const existingMatches = items.filter(i => i.productId === item.id);

        if (existingMatches.length > 0) {
            setDuplicateItemPrompt({ item, existingCount: existingMatches.length });
            return;
        }

        addItemToCart(item);
    };

    // User chose "Increase Quantity"
    const handleIncreaseExistingQuantity = () => {
        if (!duplicateItemPrompt) return;
        const targetProductId = duplicateItemPrompt.item.id;

        setItems(prev => {
            const matches = prev.filter(i => i.productId === targetProductId);
            if (matches.length === 0) return prev;

            const lastAdded = matches.reduce((latest, current) =>
                (current.addedAt || 0) > (latest.addedAt || 0) ? current : latest
            );

            return prev.map(i =>
                i.id === lastAdded.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i
            );
        });

        setDuplicateItemPrompt(null);
    };

    // User chose "Add as New Item"
    const handleAddAsNewLine = () => {
        if (!duplicateItemPrompt) return;
        addItemToCart(duplicateItemPrompt.item);
        setDuplicateItemPrompt(null);
    };

    const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
    const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
        // 1. Update the master available items list
        setAvailableItems(prevItems => prevItems.map(item =>
            item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item
        ));

        // 2. Re-run addItemToCart pricing logic for cart items linked to this product
        const editedProductId = selectedItemForEdit?.id;
        if (!editedProductId) return;

        setItems(prevCartItems => prevCartItems.map(cartItem => {
            if (cartItem.productId !== editedProductId) return cartItem;

            // Build a merged "master item" with the freshly saved fields
            const mergedMaster = {
                ...selectedItemForEdit,
                ...updatedItemData,
                id: editedProductId,
            } as Item;

            const resolvedTax = mergedMaster.tax ?? mergedMaster.taxRate ?? 0;
            const mrp = Number(mergedMaster.mrp || 0);
            const masterPurchasePrice = Number(mergedMaster.purchasePrice || 0);
            const masterPurchaseDiscount = (mergedMaster as any).purchasediscount || 0;
            const globalDefaultDiscount = purchaseSettings?.defaultDiscount ?? 0;

            let finalNetPrice = 0;
            let calculatedDiscount = 0;

            if (masterPurchasePrice > 0) {
                finalNetPrice = masterPurchasePrice;
                if (mrp > 0) {
                    calculatedDiscount = ((mrp - masterPurchasePrice) / mrp) * 100;
                }
            } else if (mrp > 0) {
                finalNetPrice = mrp;
                calculatedDiscount = 0;
                if (masterPurchaseDiscount > 0) {
                    calculatedDiscount = masterPurchaseDiscount;
                    finalNetPrice = mrp * (1 - (masterPurchaseDiscount / 100));
                } else if (globalDefaultDiscount > 0) {
                    calculatedDiscount = globalDefaultDiscount;
                    finalNetPrice = mrp * (1 - (globalDefaultDiscount / 100));
                }
            } else if (masterPurchaseDiscount > 0) {
                calculatedDiscount = masterPurchaseDiscount;
                finalNetPrice = 0;
            }
            // Apply second discount on top, compounded
            const existingDiscount2 = cartItem.purchasediscount2 || 0;
            finalNetPrice = finalNetPrice * (1 - (existingDiscount2 / 100));
            const stock = (updatedItemData as any).stock ?? (updatedItemData as any).Stock ?? cartItem.stock;

            return {
                ...cartItem,
                name: mergedMaster.name || cartItem.name,
                mrp,
                purchasePrice: parseFloat(finalNetPrice.toFixed(2)),
                originalPurchasePrice: masterPurchasePrice,
                discount: parseFloat(calculatedDiscount.toFixed(2)),
                purchasediscount: parseFloat(calculatedDiscount.toFixed(2)),
                taxRate: resolvedTax,
                barcode: mergedMaster.barcode || cartItem.barcode,
                stock,
                // preserve cart-specific fields
                id: cartItem.id,
                productId: cartItem.productId,
                quantity: cartItem.quantity,
                unitMultiplier: cartItem.unitMultiplier,
                isEditable: cartItem.isEditable,
            };
        }));
    };

    return {
        items, setItems,
        cartListRef,
        selectedCategory, setSelectedCategory,
        gridSearchQuery, setGridSearchQuery,
        cartSearchQuery, setCartSearchQuery,
        sortOrder, setSortOrder,
        duplicateItemPrompt, setDuplicateItemPrompt,
        selectedItemForEdit, setSelectedItemForEdit,
        isItemDrawerOpen, setIsItemDrawerOpen,
        showClearCartConfirm, setShowClearCartConfirm,
        cartItemsAdapter,
        categories,
        sortedGridItems,
        addItemToCart,
        handlePriceChange,
        handleDiscountChange,
        handleDiscount2Change,
        handlePriceBlur,
        handleQuantityChange,
        handleDeleteItem,
        handleClearCart,
        handleConfirmClearCart,
        handleItemSelected,
        handleIncreaseExistingQuantity,
        handleAddAsNewLine,
        handleOpenEditDrawer,
        handleCloseEditDrawer,
        handleSaveSuccess,
    };
};
