import { useState, useMemo } from 'react';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import {
    calculateNewItemDiscountOnAdd,
    calculateNewItemPriceBlur,
    calculateNewItemDiscountChange,
} from '../purchaseReturn.calculations';
import type { ReturnCartItem } from '../purchaseReturn.types';

interface UseNewItemsReceivedParams {
    availableItems: Item[];
    setAvailableItems: React.Dispatch<React.SetStateAction<Item[]>>;
    setModal: (modal: { message: string; type: State } | null) => void;
}

// Owns the "new items received" cart for an Exchange-mode return — moved
// verbatim from PurchaseReturn.tsx: newItemsReceived/exchangeBalanceAction/
// newItemsSearchQuery state, displayedNewItemsReceived, handleNewItemSelected
// (LOGIC 1: purchase-price-priority add), handleNewItemPriceBlur (LOGIC 2),
// handleNewItemDiscountChange (LOGIC 3), handleRemoveNewItem,
// handleNewItemQuantity, handleNewItemPriceChange, and the item-edit-drawer
// flow (selectedItemForEdit/isItemDrawerOpen/handleOpenEditDrawer/
// handleCloseEditDrawer/handleSaveSuccess).
export const useNewItemsReceived = ({
    availableItems,
    setAvailableItems,
    setModal,
}: UseNewItemsReceivedParams) => {
    const [newItemsReceived, setNewItemsReceived] = useState<ReturnCartItem[]>([]);
    const [exchangeBalanceAction, setExchangeBalanceAction] = useState<'Debit Note' | 'Cash Refund'>('Debit Note');
    const [newItemsSearchQuery, setNewItemsSearchQuery] = useState<string>('');

    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

    const handleOpenEditDrawer = (item: Item) => {
        // We must find the actual inventory item using the originalItemId
        const realItem = availableItems.find(a => a.id === (item as any).originalItemId || a.id === item.id);
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
        setAvailableItems(prev => prev.map(item =>
            item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item
        ));
        setNewItemsReceived(prev => prev.map(item =>
            item.originalItemId === selectedItemForEdit?.id
                ? { ...item, name: updatedItemData.name ?? item.name, mrp: updatedItemData.mrp ?? item.mrp }
                : item
        ));
    };

    const displayedNewItemsReceived = useMemo(() => {
        const q = newItemsSearchQuery.trim().toLowerCase();
        if (!q) return newItemsReceived;

        return [...newItemsReceived].sort((a, b) => {
            const aMatch = (a.name || '').toLowerCase().includes(q);
            const bMatch = (b.name || '').toLowerCase().includes(q);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0; // keep original relative order otherwise
        });
    }, [newItemsReceived, newItemsSearchQuery]);

    // --- LOGIC 1: ADD NEW ITEM (Purchase Price Priority) ---
    const handleNewItemSelected = (item: Item) => {
        if (!item) return;

        const mrp = Number(item.mrp || 0);
        const { finalNetPrice, calculatedDiscount } = calculateNewItemDiscountOnAdd(item);

        setNewItemsReceived(prev => [...prev, {
            id: crypto.randomUUID(),
            originalItemId: item.id!,
            name: item.name,
            quantity: 1,
            unitMultiplier: 1,
            unitPrice: finalNetPrice,
            amount: finalNetPrice,
            isEditable: true,
            customPrice: finalNetPrice,
            discount: parseFloat(calculatedDiscount.toFixed(2)),
            productId: item.id,
            mrp: mrp,
            tax: item.tax || 0,
            hsnSac: item.hsnSac || '',
            barcode: item.barcode || '',
            unit: item.unit || '',
            stock: item.stock || (item as any).Stock || 0
        }]);
    };

    // --- LOGIC 2: NEW ITEM PRICE CHANGE (Updates Discount) ---
    const handleNewItemPriceBlur = (id: string) => {
        setNewItemsReceived(prev => prev.map(item =>
            item.id === id ? { ...item, ...calculateNewItemPriceBlur(item) } : item
        ));
    };

    // --- LOGIC 3: NEW ITEM DISCOUNT CHANGE (Updates Price) ---
    const handleNewItemDiscountChange = (id: string, val: string | number) => {
        const newDiscount = parseFloat(String(val)) || 0;

        setNewItemsReceived(prev => prev.map(item =>
            item.id === id ? { ...item, ...calculateNewItemDiscountChange(item, newDiscount) } : item
        ));
    };

    const handleRemoveNewItem = (id: string) => {
        setNewItemsReceived(prev => prev.filter(item => item.id !== id));
    };

    const handleNewItemQuantity = (id: string, newQty: number) => {
        setNewItemsReceived(prev => prev.map(item => {
            if (item.id === id) {
                const qty = Math.max(1, newQty);
                return {
                    ...item,
                    quantity: qty,
                    amount: qty * item.unitPrice
                };
            }
            return item;
        }));
    };

    const handleNewItemPriceChange = (id: string, val: string) => {
        setNewItemsReceived(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, customPrice: val };
            }
            return item;
        }));
    };

    return {
        newItemsReceived, setNewItemsReceived,
        exchangeBalanceAction, setExchangeBalanceAction,
        newItemsSearchQuery, setNewItemsSearchQuery,
        selectedItemForEdit, isItemDrawerOpen,
        handleOpenEditDrawer, handleCloseEditDrawer, handleSaveSuccess,
        displayedNewItemsReceived,
        handleNewItemSelected, handleNewItemPriceBlur, handleNewItemDiscountChange,
        handleRemoveNewItem, handleNewItemQuantity, handleNewItemPriceChange,
    };
};
