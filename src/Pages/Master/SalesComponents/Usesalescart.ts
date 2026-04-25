import { useState, useEffect, useRef } from 'react';
import { applyRounding } from '../SalesComponents/Salescalculations';
import type { SalesItem } from '../SalesComponents/Salestypes';
import type { Item } from '../../../constants/models';

interface UseSalesCartOptions {
    isEditMode?: boolean;
    invoiceToEdit?: any;
    salesSettings: any;
    availableItems: Item[];
    isDiscountLocked?: boolean;
    isPriceLocked?: boolean;
    setDiscountInfo?: (info: string | null) => void;
    setPriceInfo?: (info: string | null) => void;
    setIsDiscountLocked?: (v: boolean) => void;
    setIsPriceLocked?: (v: boolean) => void;
}

export const useSalesCart = ({
    isEditMode = false,
    invoiceToEdit,
    salesSettings,
    isDiscountLocked = false,
    isPriceLocked = false,
    setDiscountInfo,
    setPriceInfo,
}: UseSalesCartOptions) => {

    const [items, setItems] = useState<SalesItem[]>(() => {
        if (isEditMode) return [];
        try {
            const savedDraft = localStorage.getItem('sales_cart_draft');
            return savedDraft ? JSON.parse(savedDraft) : [];
        } catch {
            return [];
        }
    });

    // Long-press timers for discount / price unlock
    const discountPressTimer = useRef<NodeJS.Timeout | null>(null);
    const pricePressTimer = useRef<NodeJS.Timeout | null>(null);

    // ── Edit mode: populate cart from invoice ─────────────────────────────────
    useEffect(() => {
        if (!isEditMode || !invoiceToEdit?.items) return;

        const mapped: SalesItem[] = invoiceToEdit.items.map((item: any) => ({
            ...item,
            id: crypto.randomUUID(),
            productId: item.id,
            isEditable: true,
            customPrice: item.effectiveUnitPrice,
            quantity: item.quantity || 1,
            mrp: item.mrp || 0,
            discount: item.discount || 0,
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
            unit: item.unit || '',
            unitMultiplier: item.unitMultiplier || 1,
            packetSize: item.packetSize || null,
        }));

        setItems(mapped);
    }, [isEditMode, invoiceToEdit]);

    // ── Persist draft to localStorage ─────────────────────────────────────────
    useEffect(() => {
        if (!isEditMode) {
            localStorage.setItem('sales_cart_draft', JSON.stringify(items));
        }
    }, [items, isEditMode]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = salesSettings?.roundingInterval ?? 1;
    const insertionOrder = salesSettings?.cartInsertionOrder || 'top';

    const insertItem = (newItem: SalesItem) =>
        setItems(prev =>
            insertionOrder === 'top' ? [newItem, ...prev] : [...prev, newItem]
        );

    // ── Add item to cart ──────────────────────────────────────────────────────
    const addItemToCart = (itemToAdd: Item) => {
        if (!itemToAdd?.id) return;

        const itemTax = Number(
            itemToAdd.tax ?? (itemToAdd as any).taxRate ?? salesSettings?.defaultTaxRate ?? 0
        );
        const mrp = Number(itemToAdd.mrp || 0);
        const salesPrice = Number(itemToAdd.salesPrice || 0);
        const presetDiscount = Number(itemToAdd.discount || 0);

        let finalNetPrice = mrp;
        let calculatedDiscount = 0;

        if (salesPrice > 0) {
            finalNetPrice = salesPrice;
            if (mrp > 0) calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
        } else if (presetDiscount > 0) {
            calculatedDiscount = presetDiscount;
            finalNetPrice = mrp * (1 - presetDiscount / 100);
        }

        finalNetPrice = applyRounding(finalNetPrice, isRoundingEnabled, roundingInterval);

        const newSalesItem: SalesItem = {
            ...itemToAdd,
            id: crypto.randomUUID(),
            productId: itemToAdd.id!,
            quantity: (itemToAdd as any).unitMultiplier || 1,
            discount: parseFloat(calculatedDiscount.toFixed(2)),
            customPrice: finalNetPrice,
            isEditable: true,
            purchasePrice: itemToAdd.purchasePrice || 0,
            tax: itemTax,
            itemGroupId: itemToAdd.itemGroupId || '',
            stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
            amount: itemToAdd.amount || 0,
            barcode: itemToAdd.barcode || '',
            restockQuantity: itemToAdd.restockQuantity || 0,
            unit: (itemToAdd as any).unit || '',
            unitMultiplier: (itemToAdd as any).unitMultiplier || 1,
            packetSize: (itemToAdd as any).packetSize || null,
        };

        insertItem(newSalesItem);
    };

    // ── Quantity ──────────────────────────────────────────────────────────────
    const handleQuantityChange = (id: string, newQuantity: number) =>
        setItems(prev =>
            prev.map(item =>
                item.id === id ? { ...item, quantity: Math.max(0, newQuantity) } : item
            )
        );

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDeleteItem = (id: string) =>
        setItems(prev => prev.filter(item => item.id !== id));

    const handleClearCart = () => setItems([]);

    // ── Discount ──────────────────────────────────────────────────────────────
    const handleDiscountChange = (id: string, v: number | string) => {
        if (isDiscountLocked) return;
        const n = typeof v === 'string' ? parseFloat(v) : v;
        const safeDiscount = isNaN(n) ? 0 : n;

        setItems(prev =>
            prev.map(i => {
                if (i.id !== id) return i;
                const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.salesPrice || 0);
                const newPrice = applyRounding(
                    basePrice * (1 - safeDiscount / 100),
                    isRoundingEnabled,
                    roundingInterval
                );
                return { ...i, discount: safeDiscount, customPrice: newPrice, salesPrice: newPrice };
            })
        );
    };

    // ── Custom price ──────────────────────────────────────────────────────────
    const handleCustomPriceChange = (id: string, v: string | number) => {
        if (isPriceLocked) return;
        const strV = String(v);
        if (strV === '' || /^[0-9]*\.?[0-9]*$/.test(strV)) {
            setItems(prev => prev.map(i => i.id === id ? { ...i, customPrice: v } : i));
        }
    };

    const handleCustomPriceBlur = (id: string) => {
        setItems(prev =>
            prev.map(i => {
                if (i.id !== id || typeof i.customPrice !== 'string') return i;
                const n = parseFloat(i.customPrice);
                if (i.customPrice === '' || isNaN(n)) return { ...i, customPrice: undefined };
                const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.salesPrice || 0);
                const d = basePrice > 0 ? ((basePrice - n) / basePrice) * 100 : 0;
                return { ...i, customPrice: n, salesPrice: n, discount: parseFloat(d.toFixed(2)) };
            })
        );
    };

    // ── Lock/unlock handlers (long-press to unlock) ───────────────────────────

    const discountHandlers = {
        onPressStart: () => {
            if (!isDiscountLocked) return;
            discountPressTimer.current = setTimeout(() => {
                setDiscountInfo?.('Discount unlocked temporarily');
                discountPressTimer.current = null;
            }, 1000);
        },
        onPressEnd: () => {
            if (discountPressTimer.current) {
                clearTimeout(discountPressTimer.current);
                discountPressTimer.current = null;
            }
        },
        onClick: () => {
            if (isDiscountLocked) {
                setDiscountInfo?.('Discount entry is locked. Hold to unlock.');
            }
        },
    };

    const priceHandlers = {
        onPressStart: () => {
            if (!isPriceLocked) return;
            pricePressTimer.current = setTimeout(() => {
                setPriceInfo?.('Price unlocked temporarily');
                pricePressTimer.current = null;
            }, 1000);
        },
        onPressEnd: () => {
            if (pricePressTimer.current) {
                clearTimeout(pricePressTimer.current);
                pricePressTimer.current = null;
            }
        },
        onClick: () => {
            if (isPriceLocked) {
                setPriceInfo?.('Price entry is locked. Hold to unlock.');
            }
        },
    };

    return {
        items,
        setItems,
        addItemToCart,
        handleQuantityChange,
        handleDeleteItem,
        handleClearCart,
        handleDiscountChange,
        handleCustomPriceChange,
        handleCustomPriceBlur,
        discountHandlers,
        priceHandlers,
    };
};