// Components/EditOrderModal.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, SalesItem as OriginalSalesItem } from '../constants/models';
import { ROUTES } from '../constants/routes.constants';
import { db } from '../lib/Firebase';
import {
  collection, serverTimestamp, doc,
  increment as firebaseIncrement, runTransaction,
  getDocs
} from 'firebase/firestore';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import BarcodeScanner from '../UseComponents/BarcodeScanner';
import PaymentDrawer, { type PaymentCompletionData } from '../Components/PaymentDrawer';
import { Modal } from '../constants/Modal';
import { ROLES, State } from '../enums';
import { Spinner } from '../constants/Spinner';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { GenericCartList } from '../Components/CartItem';
import { FiTrash2, FiX } from 'react-icons/fi';
import { GenericBillFooter } from '../Components/Footer';
import { IconScanCircle } from '../constants/Icons';
import { useSalesSettings } from '../context/SettingsContext';
import { applyRounding } from '../Pages/Master/Sales'; // re-export this from Sales or duplicate

// ── Types ────────────────────────────────────────────────────────────────────

export interface SalesItem extends OriginalSalesItem {
  isEditable: boolean;
  customPrice?: number | string;
  taxableAmount?: number;
  taxAmount?: number;
  taxRate?: number;
  taxType?: 'inclusive' | 'exclusive' | 'none';
  purchasePrice: number;
  tax: number;
  itemGroupId: string;
  salesPrice: number;
  stock: number;
  amount: number;
  barcode: string;
  restockQuantity: number;
  productId: string;
  unit?: string;
  unitMultiplier?: number;
  packetSize?: number | undefined;
  isCustomAmount?: boolean;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  type: 'Credit' | 'Debit';
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  partyGstin?: string;
  items?: any[];
  paymentMethods?: any;
  manualDiscount?: number;
  taxType?: string;
  gstScheme?: string;
  salesmanId?: string | null;
  salesmanName?: string;
  shippingName?: string;
  shippingNumber?: string;
  shippingAddress?: string;
  shippingGST?: string;
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  createdAt: Date;
}

interface EditOrderModalProps {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const toCurrency = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Component ─────────────────────────────────────────────────────────────────

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
  invoice,
  isOpen,
  onClose,
  onSaved,
}) => {
  const navigate = useNavigate();
const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { salesSettings, loadingSettings } = useSalesSettings();

  // ── State ──────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<SalesItem[]>([]);
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [pageIsLoading, setPageIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  const [activeTaxMode, setActiveTaxMode] = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');

  const [isDiscountLocked, setIsDiscountLocked] = useState(true);
  const [isPriceLocked, setIsPriceLocked] = useState(true);
  const [discountInfo, setDiscountInfo] = useState<string | null>(null);
  const [priceInfo, setPriceInfo] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const userRole = currentUser?.role || '';
  const hideMrp = (salesSettings as any)?.hideMrp ?? false;
  const showTaxRow = activeTaxMode !== 'exempt';

  // ── Init: populate cart from invoice ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    if (invoice.taxType) {
      const t = invoice.taxType;
      setActiveTaxMode(t === 'none' ? 'exempt' : t === 'inclusive' ? 'inclusive' : 'exclusive');
    } else if (salesSettings) {
      setActiveTaxMode(
        salesSettings.gstScheme === 'none' || salesSettings.gstScheme === 'composition'
          ? 'exempt'
          : (salesSettings.taxType as any) || 'exclusive'
      );
    }

    if (invoice.items) {
      setItems(
        invoice.items.map((item: any) => ({
          ...item,
          id: crypto.randomUUID(),
          productId: item.id || item.productId,
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
        }))
      );
    }
  }, [isOpen, invoice]);

  // ── Fetch available items & groups ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !currentUser?.companyId || !dbOperations) return;
    setPageIsLoading(true);

    (async () => {
      try {
        const [fetchedItems, groupsSnap] = await Promise.all([
          dbOperations.syncItems(),
          getDocs(collection(db, 'companies', currentUser.companyId, 'itemGroups')),
        ]);
        setAvailableItems(fetchedItems);

        const groupMap: Record<string, string> = {};
        groupsSnap.docs.forEach(d => {
          const data = d.data();
          groupMap[d.id] = data.name || data.groupName || 'Unknown Group';
        });
        setItemGroupMap(groupMap);
      } catch (e) {
        console.error(e);
      } finally {
        setPageIsLoading(false);
      }
    })();
  }, [isOpen, currentUser?.companyId, dbOperations]);

  // ── Lock settings sync ────────────────────────────────────────────────────
  useEffect(() => {
    if (!loadingSettings && salesSettings) {
      setIsDiscountLocked(salesSettings.lockDiscountEntry ?? false);
      setIsPriceLocked(salesSettings.lockSalePriceEntry ?? false);
    }
  }, [loadingSettings, salesSettings?.lockDiscountEntry, salesSettings?.lockSalePriceEntry]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const { subtotal, totalDiscount, roundOff, taxableAmount, taxAmount, finalAmount, totalQuantity } = useMemo(() => {
    let accSubtotal = 0, accTaxable = 0, accTax = 0, accQty = 0;

    const taxRate = salesSettings?.defaultTaxRate ?? 0;
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
    const gstScheme = salesSettings?.gstScheme;

    const effectiveTaxMode =
      gstScheme?.toLowerCase() === 'regular'
        ? activeTaxMode === 'exempt' ? 'none' : activeTaxMode
        : 'none';

    items.forEach(cartItem => {
      const qty = cartItem.quantity || 1;
      accQty += qty;

      const itemTaxRate = cartItem.tax !== undefined ? Number(cartItem.tax) : taxRate;
      let baseForSubtotal = cartItem.mrp > 0 ? cartItem.mrp : (cartItem.salesPrice || 0);
      if (effectiveTaxMode === 'inclusive' && itemTaxRate > 0)
        baseForSubtotal = baseForSubtotal / (1 + itemTaxRate / 100);
      accSubtotal += baseForSubtotal * qty;

      const basePrice = cartItem.mrp > 0 ? cartItem.mrp : (cartItem.salesPrice || 0);
      let effectiveUnitPrice =
        cartItem.customPrice !== undefined && cartItem.customPrice !== null && cartItem.customPrice !== ''
          ? parseFloat(String(cartItem.customPrice))
          : basePrice * (1 - (cartItem.discount || 0) / 100);
      effectiveUnitPrice = applyRounding(effectiveUnitPrice, isRoundingEnabled, roundingInterval);

      const lineTotal = toCurrency(effectiveUnitPrice * qty);
      let lineBase = 0, lineTax = 0;

      if (effectiveTaxMode !== 'none' && itemTaxRate > 0) {
        if (effectiveTaxMode === 'inclusive') {
          lineBase = toCurrency(lineTotal / (1 + itemTaxRate / 100));
          lineTax = toCurrency(lineTotal - lineBase);
        } else {
          lineBase = lineTotal;
          lineTax = toCurrency(lineTotal * (itemTaxRate / 100));
        }
      } else {
        lineBase = lineTotal;
      }

      accTaxable += lineBase;
      accTax += lineTax;
    });

    const finalTaxable = toCurrency(accTaxable);
    const finalTax = toCurrency(accTax);
    const rawFinal = toCurrency(finalTaxable + finalTax);
    const totalDisc = toCurrency(
      effectiveTaxMode === 'none' ? accSubtotal - rawFinal : accSubtotal - finalTaxable
    );
    const finalPayable = Math.round(rawFinal);
    const roundOff = toCurrency(finalPayable - rawFinal);

    return {
      subtotal: accSubtotal,
      totalDiscount: totalDisc > 0 ? totalDisc : 0,
      roundOff,
      taxableAmount: finalTaxable,
      taxAmount: finalTax,
      finalAmount: finalPayable,
      totalQuantity: accQty,
    };
  }, [items, salesSettings, activeTaxMode]);

  // ── Cart handlers ─────────────────────────────────────────────────────────
  const addItemToCart = (itemToAdd: Item) => {
    if (!itemToAdd?.id) return;
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
    const mrp = Number(itemToAdd.mrp || 0);
    const salesPrice = Number(itemToAdd.salesPrice || 0);
    const presetDiscount = Number(itemToAdd.discount || 0);
    let finalNetPrice = mrp, calculatedDiscount = 0;

    if (salesPrice > 0) {
      finalNetPrice = salesPrice;
      if (mrp > 0) calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
    } else if (presetDiscount > 0) {
      calculatedDiscount = presetDiscount;
      finalNetPrice = mrp * (1 - presetDiscount / 100);
    }
    finalNetPrice = applyRounding(finalNetPrice, isRoundingEnabled, roundingInterval);

    const newItem: SalesItem = {
      ...itemToAdd,
      id: crypto.randomUUID(),
      productId: itemToAdd.id!,
      quantity: (itemToAdd as any).unitMultiplier || 1,
      discount: parseFloat(calculatedDiscount.toFixed(2)),
      customPrice: finalNetPrice,
      isEditable: true,
      purchasePrice: itemToAdd.purchasePrice || 0,
      tax: Number(itemToAdd.tax ?? (salesSettings?.defaultTaxRate ?? 0)),
      itemGroupId: itemToAdd.itemGroupId || '',
      stock: itemToAdd.stock || 0,
      amount: itemToAdd.amount || 0,
      barcode: itemToAdd.barcode || '',
      restockQuantity: itemToAdd.restockQuantity || 0,
      unit: (itemToAdd as any).unit || '',
      unitMultiplier: (itemToAdd as any).unitMultiplier || 1,
      packetSize: (itemToAdd as any).packetSize || null,
    };

    setItems(prev =>
      (salesSettings?.cartInsertionOrder || 'top') === 'top'
        ? [newItem, ...prev]
        : [...prev, newItem]
    );
  };

  const handleItemSelected = (item: Item | null) => { if (item) addItemToCart(item); };
  const handleQuantityChange = (id: string, qty: number) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(0, qty) } : i));
  const handleDeleteItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const handleClearCart = () => {
    if (window.confirm('Remove all items from this order?')) setItems([]);
  };

  const handleBarcodeScanned = async (barcode: string) => {
    setIsScannerOpen(false);
    if (!dbOperations) return;
    let item: Item | null | undefined = availableItems.find(i => i.barcode === barcode.trim());
    if (!item) item = await dbOperations.getItemByBarcode(barcode.trim());
    if (item) {
      addItemToCart(item);
      setAvailableItems(prev => prev.find(p => p.id === item!.id) ? prev : [...prev, item!]);
    } else {
      setModal({ message: `Item not found for barcode: "${barcode}"`, type: State.ERROR });
    }
  };

  // Discount / price handlers
  const handleDiscountPressStart = () => {
    longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500);
  };
  const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handleDiscountClick = () => {
    if (isDiscountLocked) { setDiscountInfo('Cannot edit discount'); setTimeout(() => setDiscountInfo(null), 2000); }
  };
  const handlePricePressStart = () => {
    longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 500);
  };
  const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handlePriceClick = () => {
    if (isPriceLocked) { setPriceInfo('Cannot edit sale price'); setTimeout(() => setPriceInfo(null), 1000); }
  };

  const handleDiscountChange = (id: string, v: number | string) => {
    const safeDiscount = isNaN(parseFloat(String(v))) ? 0 : parseFloat(String(v));
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const base = i.mrp > 0 ? i.mrp : (i.salesPrice || 0);
      const newPrice = applyRounding(base * (1 - safeDiscount / 100), isRoundingEnabled, roundingInterval);
      return { ...i, discount: safeDiscount, customPrice: newPrice };
    }));
  };

  const handleCustomPriceChange = (id: string, v: string) => {
    if (v === '' || /^[0-9]*\.?[0-9]*$/.test(v))
      setItems(prev => prev.map(i => i.id === id ? { ...i, customPrice: v } : i));
  };

  const handleCustomPriceBlur = (id: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id || typeof i.customPrice !== 'string') return i;
      const n = parseFloat(i.customPrice);
      if (!i.customPrice || isNaN(n)) return { ...i, customPrice: undefined };
      const base = i.mrp > 0 ? i.mrp : (i.salesPrice || 0);
      const d = base > 0 ? ((base - n) / base) * 100 : 0;
      return { ...i, customPrice: n, discount: parseFloat(d.toFixed(2)) };
    }));
  };

  const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
  const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
  const handleSaveItemSuccess = (updatedItemData: Partial<Item>) => {
    setAvailableItems(prev =>
      prev.map(i => i.id === selectedItemForEdit?.id ? { ...i, ...updatedItemData, id: i.id } as Item : i)
    );
    setItems(prev => prev.map(ci => {
      if (ci.productId === selectedItemForEdit?.id || ci.id === selectedItemForEdit?.id)
        return { ...ci, ...updatedItemData } as SalesItem;
      return ci;
    }));
  };

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSavePayment = async (completionData: PaymentCompletionData) => {
    if (isSaving || !currentUser?.companyId) return;
    setIsSaving(true);

    const companyId = currentUser.companyId;
    const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
    const finalTaxType = activeTaxMode === 'exempt' ? 'none' : activeTaxMode;
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
    const isTaxEnabled = salesSettings?.enableTax ?? true;
    const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
    const finalGstScheme = salesSettings?.gstScheme || 'none';

    const formatItemsForDB = (itemsToFormat: SalesItem[]) =>
      itemsToFormat.map(({ isEditable, customPrice, ...item }) => {
        const qty = item.quantity || 1;
        const disc = item.discount || 0;
        let euPrice =
          customPrice !== undefined && customPrice !== null && customPrice !== ''
            ? parseFloat(String(customPrice))
            : (item.mrp > 0 ? item.mrp : (item.salesPrice || 0)) * (1 - disc / 100);
        euPrice = applyRounding(toCurrency(euPrice), isRoundingEnabled, roundingInterval);

        const lineTotal = toCurrency(euPrice * qty);
        const itemTaxRate = item.tax !== undefined ? Number(item.tax) : currentTaxRate;
        let taxableBase = lineTotal, taxAmt = 0, itemFinalPrice = lineTotal;

        if (finalGstScheme === 'regular' && itemTaxRate > 0 && isTaxEnabled) {
          if (finalTaxType === 'inclusive') {
            taxableBase = toCurrency(lineTotal / (1 + itemTaxRate / 100));
            taxAmt = toCurrency(lineTotal - taxableBase);
            itemFinalPrice = lineTotal;
          } else {
            taxableBase = lineTotal;
            taxAmt = toCurrency(lineTotal * (itemTaxRate / 100));
            itemFinalPrice = toCurrency(taxableBase + taxAmt);
          }
        }

        return {
          ...item,
          id: item.productId,
          quantity: qty, discount: disc, effectiveUnitPrice: euPrice,
          finalPrice: itemFinalPrice, taxableAmount: taxableBase,
          taxAmount: taxAmt, taxRate: isTaxEnabled ? itemTaxRate : 0,
          taxType: finalTaxType, discountPercentage: disc,
          unit: item.unit || '', unitMultiplier: item.unitMultiplier || 1,
          packetSize: item.packetSize || null,
        };
      });

    try {
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, 'companies', companyId, collectionName, invoice.id);

        // Stock delta
        const oldQuantities = new Map<string, number>();
        (invoice.items || []).forEach((oldItem: any) => {
          const pid = oldItem.productId || oldItem.id;
          const qty = (oldItem.quantity || 1) * (oldItem.unitMultiplier || 1);
          oldQuantities.set(pid, (oldQuantities.get(pid) || 0) + qty);
        });

        const newQuantities = new Map<string, number>();
        items.forEach(i => {
          const pid = i.productId || i.id;
          if (pid) {
            const qty = (i.quantity || 1) * (i.unitMultiplier || 1);
            newQuantities.set(pid, (newQuantities.get(pid) || 0) + qty);
          }
        });

        const allPids = new Set([...oldQuantities.keys(), ...newQuantities.keys()]);
        allPids.forEach(pid => {
          const diff = (newQuantities.get(pid) || 0) - (oldQuantities.get(pid) || 0);
          if (diff !== 0) {
            transaction.update(doc(db, 'companies', companyId, 'items', pid), {
              stock: firebaseIncrement(-diff),
              updatedAt: serverTimestamp(),
            });
          }
        });

        const finalInvoiceTotal = finalAmount - (completionData.discount || 0) + (completionData.extraExpenseAmount || 0);

        transaction.update(invoiceRef, {
          items: formatItemsForDB(items),
          subtotal,
          discount: totalDiscount + (completionData.discount || 0),
          manualDiscount: completionData.discount || 0,
          roundOff,
          taxableAmount,
          taxAmount,
          taxType: finalTaxType,
          gstScheme: finalGstScheme,
          totalAmount: finalInvoiceTotal,
          paymentMethods: completionData.paymentDetails,
          partyName: completionData.partyName,
          partyNumber: completionData.partyNumber,
          partyAddress: completionData.partyAddress || '',
          partyGstin: completionData.partyGST || '',
          shippingName: completionData.shippingName || '',
          shippingNumber: completionData.shippingNumber || '',
          shippingAddress: completionData.shippingAddress || '',
          shippingGST: completionData.shippingGST || '',
          extraExpenseName: completionData.extraExpenseName || '',
          extraExpenseAmount: completionData.extraExpenseAmount || 0,
          narration: completionData.narration || '',
          updatedAt: serverTimestamp(),
        });
      });

      setModal({ message: 'Invoice updated successfully!', type: State.SUCCESS });
      setTimeout(() => {
        setModal(null);
        setIsPaymentDrawerOpen(false);
        onSaved();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error(err);
      setModal({ message: `Failed to update: ${err.message || 'Unknown error'}`, type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Early returns ─────────────────────────────────────────────────────────
  if (!isOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="
          bg-gray-100 w-full h-[92dvh] md:h-[90vh] md:max-w-4xl
          rounded-t-2xl md:rounded-xl overflow-hidden flex flex-col
          shadow-2xl
        ">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Edit Order</h2>
              <p className="text-xs text-gray-500">
                {invoice.invoiceNumber} · {invoice.partyName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          {pageIsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

              {/* LEFT: search + cart */}
              <div className="flex flex-col w-full md:w-3/4 h-full min-w-0 relative overflow-hidden">

                {/* Search bar */}
                <div className="flex-shrink-0 p-2 bg-white border-b border-gray-200 rounded-sm">
                  <div className="flex gap-2 items-end">
                    <div className="flex-grow">
                      <SearchableItemInput
                        label="Add Item"
                        placeholder="Search by name or barcode..."
                        items={availableItems}
                        onItemSelected={handleItemSelected}
                        isLoading={false}
                        error={null}
                        onAddItem={(q) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: q } })}
                        categories={['All', ...Array.from(new Set(availableItems.map(i => i.itemGroupId || 'Others'))).sort()]}
                        itemGroupMap={itemGroupMap}
                      />
                    </div>
                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="bg-transparent text-gray-700 p-3 border border-gray-700 rounded-sm hover:bg-gray-800 hover:text-white transition"
                      title="Scan Barcode"
                    >
                      <IconScanCircle width={20} height={20} />
                    </button>
                  </div>
                </div>

                {/* Cart */}
                <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden border-r border-gray-200">
                  <div className="pt-2 flex-shrink-0 flex items-center justify-between border-b pb-2 px-3">
                    <h3 className="text-gray-700 font-medium">Cart</h3>
                    {items.length > 0 && (
                      <button
                        onClick={handleClearCart}
                        className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1"
                      >
                        <FiTrash2 size={12} /> Clear
                      </button>
                    )}
                  </div>

                  {(discountInfo || priceInfo) && (
                    <div className="px-3 py-1 flex gap-4">
                      {discountInfo && <p className="text-xs text-red-500">{discountInfo}</p>}
                      {priceInfo && <p className="text-xs text-red-500">{priceInfo}</p>}
                    </div>
                  )}

                  <GenericCartList
                    items={items}
                    availableItems={availableItems}
                    basePriceKey="mrp"
                    priceLabel="MRP"
                    settings={{
                      enableRounding: salesSettings?.enableRounding ?? true,
                      roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
                      enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
                      lockDiscount: isDiscountLocked,
                      lockPrice: isPriceLocked,
                      hideMrp,
                    }}
                    applyRounding={applyRounding}
                    State={State}
                    setModal={setModal}
                    onOpenEditDrawer={handleOpenEditDrawer}
                    onDeleteItem={handleDeleteItem}
                    onDiscountChange={handleDiscountChange}
                    onCustomPriceChange={handleCustomPriceChange}
                    onCustomPriceBlur={handleCustomPriceBlur}
                    onQuantityChange={handleQuantityChange}
                    onDiscountPressStart={handleDiscountPressStart}
                    onDiscountPressEnd={handleDiscountPressEnd}
                    onDiscountClick={handleDiscountClick}
                    onPricePressStart={handlePricePressStart}
                    onPricePressEnd={handlePricePressEnd}
                    onPriceClick={handlePriceClick}
                  />

                  {/* Mobile footer */}
                  <div className="md:hidden">
                    <GenericBillFooter
                      isExpanded={isFooterExpanded}
                      onToggleExpand={() => setIsFooterExpanded(v => !v)}
                      totalQuantity={totalQuantity}
                      subtotal={subtotal}
                      totalDiscount={totalDiscount}
                      taxAmount={taxAmount}
                      finalAmount={finalAmount}
                      showTaxRow={showTaxRow}
                      taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                      actionLabel={isSaving ? 'Saving…' : 'Update Invoice'}
                      onActionClick={() => setIsPaymentDrawerOpen(true)}
                      disableAction={items.length === 0 || isSaving}
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT: bill summary — desktop only */}
              <div className="hidden md:flex w-1/4 flex-col bg-white h-full border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
                <div className="flex-1 p-6 flex flex-col justify-end">
                  <div className="mb-4 border-b pb-2 flex items-end justify-between">
                    <h3 className="text-lg font-bold text-gray-800">Bill Summary</h3>
                    <span className="text-xs text-indigo-500 font-semibold">{items.length} items</span>
                  </div>
                  <GenericBillFooter
                    isExpanded={true}
                    onToggleExpand={() => {}}
                    totalQuantity={totalQuantity}
                    subtotal={subtotal}
                    totalDiscount={totalDiscount}
                    taxAmount={taxAmount}
                    finalAmount={finalAmount}
                    showTaxRow={showTaxRow}
                    taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                    actionLabel={isSaving ? 'Saving…' : 'Update Invoice'}
                    onActionClick={() => setIsPaymentDrawerOpen(true)}
                    disableAction={items.length === 0 || isSaving}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sub-modals & drawers ─────────────────────────────────────────── */}
      {modal && (
        <Modal
          message={modal.message}
          type={modal.type}
          onClose={() => setModal(null)}
        />
      )}

      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleBarcodeScanned}
      />

      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isItemDrawerOpen}
        onClose={handleCloseEditDrawer}
        onSaveSuccess={handleSaveItemSuccess}
      />

      <PaymentDrawer
        mode="sale"
        isOpen={isPaymentDrawerOpen}
        onClose={() => setIsPaymentDrawerOpen(false)}
        subtotal={subtotal}
        billTotal={finalAmount}
        totalTax={taxAmount}
        onPaymentComplete={handleSavePayment}
        isPartyNameEditable={true}
        initialPartyName={invoice.partyName}
        initialPartyNumber={invoice.partyNumber}
        initialPaymentMethods={invoice.paymentMethods}
        initialDiscount={invoice.manualDiscount}
        totalItemDiscount={totalDiscount}
        totalQuantity={totalQuantity}
        allowDueBilling={salesSettings?.allowDueBilling}
        requireCustomerName={salesSettings?.requireCustomerName}
        requireCustomerMobile={salesSettings?.requireCustomerMobile}
        initialShippingName={invoice.shippingName}
        initialShippingNumber={invoice.shippingNumber}
        initialShippingAddress={invoice.shippingAddress}
        initialShippingGST={invoice.shippingGST}
        initialExpenseName={invoice.extraExpenseName}
        initialExpenseAmount={invoice.extraExpenseAmount}
        initialNarration={invoice.narration}
        enableShippingDetails={salesSettings?.enableShippingDetails}
        enableExtraExpense={salesSettings?.enableExtraExpense}
        enableNarration={salesSettings?.enableNarration}
      />
    </>
  );
};