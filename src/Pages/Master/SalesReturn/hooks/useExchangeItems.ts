import { useState, useRef, useMemo } from 'react';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import { applyRounding, type SalesItem } from '../../Sales';
import type { ExchangeItem } from '../salesReturn.types';

interface UseExchangeItemsParams {
    salesSettings: any;
    availableItems: Item[];
    setAvailableItems: React.Dispatch<React.SetStateAction<Item[]>>;
    setModal: (modal: { message: string; type: State } | null) => void;
    handleListChange: (
        setter: React.Dispatch<React.SetStateAction<any[]>>,
        id: string,
        field: any,
        value: string | number
    ) => void;
    handleRemoveFromList: (setter: any, id: string) => void;
}

// Owns the exchange-item cart (adding new items to exchange for the
// returned ones, discount/price editing, and the item-edit-drawer flow) —
// moved verbatim from SalesReturn.tsx: exchangeItems/exchangeBalanceAction
// state, addExchangeItem, handleExchangeItemSelected, discount/price
// lock+edit handlers, handleDiscountChange/handleQuantityChange/
// handleCustomPriceChange/handleCustomPriceBlur, mappedExchangeItems, and
// the item-edit-drawer (selectedItemForEdit/isItemDrawerOpen/
// handleOpenEditDrawer/handleCloseEditDrawer/handleSaveSuccess).
// `handleListChange` is threaded in from useSalesReturnLookup rather than
// duplicated (same single definition originally served both the return-item
// list and this exchange-item list).
export const useExchangeItems = ({
    salesSettings,
    availableItems,
    setAvailableItems,
    setModal,
    handleListChange,
    handleRemoveFromList,
}: UseExchangeItemsParams) => {
    const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);
    const [exchangeBalanceAction, setExchangeBalanceAction] = useState<'Credit Note' | 'Cash Refund'>('Credit Note');
    const [exchangeSearchQuery, setExchangeSearchQuery] = useState<string>('');

    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

    const [isDiscountLocked, setIsDiscountLocked] = useState(true);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);
    const [isPriceLocked, setIsPriceLocked] = useState(true);
    const [priceInfo, setPriceInfo] = useState<string | null>(null);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const handleOpenEditDrawer = (item: Item) => {
        // item.id here is the cart UUID, so find the real item from availableItems
        const realItem = availableItems.find(
            (a) => a.id === (item as any).originalItemId || a.id === (item as any).productId || a.id === item.id
        );
        if (!realItem) {
            setModal({ message: 'Original item not found in inventory.', type: State.ERROR });
            return;
        }
        setSelectedItemForEdit(realItem);
        setIsItemDrawerOpen(true);
    };

    const handleCloseEditDrawer = () => {
        setIsItemDrawerOpen(false);
        setTimeout(() => setSelectedItemForEdit(null), 300);
    };

    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
        // Update availableItems
        setAvailableItems(prev =>
            prev.map(item =>
                item.id === selectedItemForEdit?.id
                    ? { ...item, ...updatedItemData, id: item.id } as Item
                    : item
            )
        );
        // Also update exchangeItems if the edited item is in the exchange cart
        setExchangeItems(prev =>
            prev.map(item =>
                item.originalItemId === selectedItemForEdit?.id
                    ? { ...item, name: updatedItemData.name ?? item.name, mrp: updatedItemData.mrp ?? item.mrp }
                    : item
            )
        );
    };

    const addExchangeItem = (itemToAdd: Item) => {
        const mrp = Number(itemToAdd.mrp || 0);
        const salesPrice = Number(itemToAdd.salesPrice || 0);
        const presetDiscount = Number(itemToAdd.discount || 0);
        const initialMoq = Number((itemToAdd as any).moq || 1);

        let finalExchangePrice = 0;
        let calculatedDiscount = 0;

        // --- NEW 3-TIER LOGIC ---
        if (mrp > 0 && salesPrice > 0) {
            finalExchangePrice = salesPrice;
            calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
        } else if (salesPrice > 0) {
            calculatedDiscount = presetDiscount;
            finalExchangePrice = salesPrice * (1 - (presetDiscount / 100));
        } else if (mrp > 0) {
            calculatedDiscount = presetDiscount;
            finalExchangePrice = mrp * (1 - (presetDiscount / 100));
        }

        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
        finalExchangePrice = applyRounding(finalExchangePrice, isRoundingEnabled, roundingInterval);

        setExchangeItems(prev => [...prev, {
            id: crypto.randomUUID(),
            originalItemId: itemToAdd.id!,
            name: itemToAdd.name,
            quantity: Math.max(1, initialMoq),
            unitMultiplier: 1, // Kill multiplier math
            moq: initialMoq,
            unitPrice: finalExchangePrice,
            amount: finalExchangePrice,
            mrp: mrp,
            salesPrice: salesPrice,
            discount: parseFloat(calculatedDiscount.toFixed(2)),
            customPrice: finalExchangePrice
        }]);
    };

    const handleExchangeItemSelected = (item: Item) => {
        if (item) addExchangeItem(item);
    };

    const handleDiscountPressStart = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500); };
    const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleDiscountClick = () => { if (isDiscountLocked) { setDiscountInfo("Cannot edit discount"); setTimeout(() => setDiscountInfo(null), 3000); } };
    const handlePricePressStart = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 200); };
    const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handlePriceClick = () => { if (isPriceLocked) { setPriceInfo("Cannot edit price"); setTimeout(() => setPriceInfo(null), 1000); } };

    const handleDiscountChange = (id: string, discountValue: number | string) => {
        const val = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
        handleListChange(setExchangeItems, id, 'discount', val);
    };

    const handleQuantityChange = (id: string, newQuantity: number) => {
        const item = exchangeItems.find(i => i.id === id);
        const moq = item?.moq || 1;
        // Enforce MOQ
        handleListChange(setExchangeItems, id, 'quantity', Math.max(moq, newQuantity));
    };

    const handleCustomPriceChange = (id: string, value: string) => {
        if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
            setExchangeItems(prev => prev.map(item => item.id === id ? { ...item, customPrice: value } : item));
        }
    };

    const handleCustomPriceBlur = (id: string) => {
        setExchangeItems(prev => prev.map(item => {
            if (item.id === id && item.customPrice !== undefined) {
                const num = parseFloat(String(item.customPrice));
                if (!isNaN(num)) {
                    let d = 0;
                    // FIXED: Base price is MRP if it exists, otherwise Sales Price
                    const basePrice = (item.mrp && item.mrp > 0) ? item.mrp : (item.salesPrice || 0);
                    if (basePrice > 0) d = ((basePrice - num) / basePrice) * 100;

                    const newAmount = num * item.quantity;
                    return { ...item, unitPrice: num, amount: newAmount, customPrice: undefined, discount: parseFloat(d.toFixed(2)) };
                }
                return { ...item, customPrice: undefined };
            }
            return item;
        }));
    };

    const mappedExchangeItems: SalesItem[] = useMemo(() => {
        const mapped = exchangeItems.map(item => ({
            id: item.id,
            productId: item.originalItemId,
            name: item.name,
            mrp: item.mrp,
            salesPrice: item.salesPrice || 0,
            moq: item.moq,
            quantity: item.quantity,
            discount: item.discount,
            isEditable: true,
            purchasePrice: 0,
            tax: 0,
            itemGroupId: '',
            stock: 100,
            amount: item.amount,
            barcode: '',
            restockQuantity: 0,
            customPrice: item.customPrice ?? item.unitPrice,
            unitMultiplier: 1, // Kill multiplier math
        } as SalesItem));
        const q = exchangeSearchQuery.trim().toLowerCase();
        if (!q) return mapped;

        // 👈 NEW: same "search bumps result to top" behavior as the Orders page search
        return [...mapped].sort((a, b) => {
            const aMatch = (a.name || '').toLowerCase().includes(q);
            const bMatch = (b.name || '').toLowerCase().includes(q);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0; // keep original relative order otherwise
        });
    }, [exchangeItems, exchangeSearchQuery]);

    return {
        exchangeItems, setExchangeItems,
        exchangeBalanceAction, setExchangeBalanceAction,
        exchangeSearchQuery, setExchangeSearchQuery,
        selectedItemForEdit, isItemDrawerOpen,
        handleOpenEditDrawer, handleCloseEditDrawer, handleSaveSuccess,
        isDiscountLocked, discountInfo, isPriceLocked, priceInfo,
        addExchangeItem, handleExchangeItemSelected,
        handleDiscountPressStart, handleDiscountPressEnd, handleDiscountClick,
        handlePricePressStart, handlePricePressEnd, handlePriceClick,
        handleDiscountChange, handleQuantityChange,
        handleCustomPriceChange, handleCustomPriceBlur,
        mappedExchangeItems,
        handleRemoveFromExchange: (id: string) => handleRemoveFromList(setExchangeItems, id),
    };
};
