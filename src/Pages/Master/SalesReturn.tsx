import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  orderBy, limit, getDoc, collection, query, getDocs, doc,
  DocumentSnapshot, type DocumentData, writeBatch,
  increment as firebaseIncrement, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { useAuth, useDatabase } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import type { Item, SalesItem as OriginalSalesItem } from '../../constants/models';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { IconScanCircle } from '../../constants/Icons';
import { useSalesSettings } from '../../context/SettingsContext';
import { ReturnListItem } from '../../Components/ReturnListItem';
import { GenericCartList } from '../../Components/CartItem';
import { applyRounding, toCurrency } from './SalesComponents/Salescalculations';
import type { SalesItem } from './SalesComponents/Salestypes';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import SalesHeader from './SalesComponents/Salesheader';

// ── Types ────────────────────────────────────────────────────────────────────

interface SalesData {
  id: string; invoiceNumber: string; partyName: string; partyNumber: string;
  items: OriginalSalesItem[]; totalAmount: number; subtotal: number;
  discount: number; manualDiscount?: number; createdAt: any;
  isReturned?: boolean; paymentMethods?: { [key: string]: number }; taxType?: string;
}
interface TransactionItem {
  id: string; originalItemId: string; name: string; mrp: number;
  quantity: number; unitPrice: number; amount: number;
  maxReturnQuantity: number; unitMultiplier?: number;
}
interface ExchangeItem {
  id: string; originalItemId: string; name: string; mrp: number;
  quantity: number; unitPrice: number; amount: number; discount: number;
  salesPrice?: number; customPrice?: number | string; unitMultiplier?: number;
}
interface Customer { id?: string; name: string; number: string; [key: string]: any; }

// ── Helpers ──────────────────────────────────────────────────────────────────

const useLongPress = (onUnlock: () => void, delay = 500) => {
  const timer = useRef<NodeJS.Timeout | null>(null);
  return {
    onPressStart: () => { timer.current = setTimeout(onUnlock, delay); },
    onPressEnd: () => { if (timer.current) clearTimeout(timer.current); },
  };
};

// ── Component ─────────────────────────────────────────────────────────────────

const SalesReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { state } = useLocation();
  const { invoiceId } = useParams();
  const { salesSettings } = useSalesSettings();

  // ── State ──────────────────────────────────────────────────────────────────

  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState('');
  const [partyNumber, setPartyNumber] = useState('');
  const [modeOfReturn, setModeOfReturn] = useState('Credit Note');

  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);

  const [salesList, setSalesList] = useState<SalesData[]>([]);
  const [selectedSale, setSelectedSale] = useState<SalesData | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState('');
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, _setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

  const [isDiscountLocked, setIsDiscountLocked] = useState(true);
  const [isPriceLocked, setIsPriceLocked] = useState(true);
  const [discountInfo, setDiscountInfo] = useState<string | null>(null);
  const [priceInfo, setPriceInfo] = useState<string | null>(null);

  // ── Sync settings ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (salesSettings) {
      setIsDiscountLocked(salesSettings.lockDiscountEntry ?? false);
      setIsPriceLocked(salesSettings.lockSalePriceEntry ?? false);
    }
  }, [salesSettings]);

  const isDueSale = (selectedSale?.paymentMethods?.due ?? 0) > 0;
  useEffect(() => { if (isDueSale) setModeOfReturn('Exchange'); }, [isDueSale]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser?.companyId || !dbOperations) { setIsLoading(false); return; }
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const companyPath = `companies/${currentUser.companyId}`;
        const [salesSnap, customersSnap, specificSnap] = await Promise.all([
          getDocs(query(collection(db, companyPath, 'sales'), orderBy('createdAt', 'desc'), limit(50))),
          getDocs(query(collection(db, companyPath, 'customers'), limit(100))),
          invoiceId && !state?.invoiceData
            ? getDoc(doc(db, companyPath, 'sales', invoiceId))
            : Promise.resolve(null) as Promise<DocumentSnapshot<DocumentData> | null>,
        ]);

        let allItems = availableItems.length ? availableItems : await dbOperations.syncItems();
        const recentSales: SalesData[] = salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as SalesData));
        const customers: Customer[] = customersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));

        if (state?.invoiceData) handleSelectSale(state.invoiceData);
        else if (specificSnap?.exists()) {
          const data = { id: specificSnap.id, ...specificSnap.data() } as SalesData;
          if (!recentSales.find(s => s.id === data.id)) recentSales.unshift(data);
          handleSelectSale(data);
        } else if (invoiceId) {
          const pre = recentSales.find(s => s.id === invoiceId);
          if (pre) handleSelectSale(pre);
        }

        setSalesList(recentSales);
        if (!availableItems.length) setAvailableItems(allItems);
        setAvailableCustomers(customers);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, dbOperations, invoiceId, state]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!salesDropdownRef.current?.contains(e.target as Node)) setIsSalesDropdownOpen(false);
      if (!customerDropdownRef.current?.contains(e.target as Node)) setIsCustomerDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────

  const itemsToReturn = useMemo(
    () => originalSaleItems.filter(i => selectedReturnIds.has(i.id)),
    [originalSaleItems, selectedReturnIds]
  );

  const filteredSales = useMemo(() =>
    salesList
      .filter(s => !s.isReturned)
      .filter(s =>
        s.partyName?.toLowerCase().includes(searchSaleQuery.toLowerCase()) ||
        s.invoiceNumber?.toLowerCase().includes(searchSaleQuery.toLowerCase())
      )
      .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
    [salesList, searchSaleQuery]
  );

  const filteredCustomers = useMemo(() => {
    const q = partyNumber.trim().toLowerCase();
    if (!q) return [];
    return availableCustomers.filter(c =>
      String(c.number ?? '').toLowerCase().includes(q) ||
      String(c.name ?? '').toLowerCase().includes(q)
    );
  }, [availableCustomers, partyNumber]);

  const mappedExchangeItems: SalesItem[] = useMemo(() =>
    exchangeItems.map(item => ({
      id: item.id, productId: item.originalItemId, name: item.name, mrp: item.mrp,
      quantity: item.quantity, discount: item.discount, isEditable: true,
      purchasePrice: 0, tax: 0, itemGroupId: '', stock: 100, amount: item.amount,
      barcode: '', restockQuantity: 0, customPrice: item.customPrice ?? item.unitPrice,
      unitMultiplier: item.unitMultiplier || 1,
    } as SalesItem)),
    [exchangeItems]
  );

  const { totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted } = useMemo(() => {
    const totalReturnGross = itemsToReturn.reduce((s, i) => s + i.amount, 0);
    const totalExchangeValue = exchangeItems.reduce((s, i) => s + i.amount, 0);
    let discountDeducted = 0;
    let returnTax = 0;

    if (selectedSale) {
      const origTotal = selectedSale.items.reduce((s, i) => s + (i.finalPrice || 0), 0);
      const origDiscount = selectedSale.manualDiscount || 0;
      if (origTotal > 0 && origDiscount > 0) {
        discountDeducted = Math.round((origDiscount * (totalReturnGross / origTotal)) * 100) / 100;
      }
      returnTax = selectedSale.items.reduce((s, item: any) => {
        const rate = Number(item.taxRate || item.tax || 0);
        return item.taxType === 'inclusive' && rate > 0
          ? s + Number(item.finalPrice || 0) * (rate / 100)
          : s;
      }, 0);
      if (returnTax > 0 && origTotal > 0) {
        returnTax = Math.round(returnTax * (totalReturnGross / origTotal) * 100) / 100;
      }
    }

    const totalReturnValue = totalReturnGross - discountDeducted + returnTax;
    return {
      totalReturnGross, totalReturnValue, totalExchangeValue,
      finalBalance: Math.round(totalReturnValue - totalExchangeValue),
      discountDeducted,
    };
  }, [itemsToReturn, exchangeItems, selectedSale]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleReturnItem = (itemId: string) => {
    setSelectedReturnIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const handleSelectSale = (sale: SalesData) => {
    setSelectedSale(sale);
    setPartyName(sale.partyName || 'N/A');
    setPartyNumber(sale.partyNumber || '');
    setOriginalSaleItems(sale.items.map((item: any) => {
      const d = item.data || item;
      const qty = Number(d.quantity) || 1;
      const finalPrice = Number(d.finalPrice) || 0;
      return {
        id: crypto.randomUUID(),
        originalItemId: d.id || d.productId || 'UNKNOWN_ID',
        name: d.name, quantity: qty, maxReturnQuantity: qty,
        unitPrice: qty > 0 ? finalPrice / qty : 0,
        amount: finalPrice, mrp: d.mrp || 0, unitMultiplier: d.unitMultiplier || 1,
      };
    }));
    setSelectedReturnIds(new Set());
    setExchangeItems([]);
    setSearchSaleQuery(sale.invoiceNumber || sale.partyName);
    setIsSalesDropdownOpen(false);
  };

  const handleClear = () => {
    setSelectedSale(null); setPartyName(''); setPartyNumber('');
    setOriginalSaleItems([]); setSelectedReturnIds(new Set());
    setExchangeItems([]); setSearchSaleQuery('');
    navigate(ROUTES.SALES_RETURN);
  };

  const handleListChange = (
    setter: React.Dispatch<React.SetStateAction<any[]>>,
    id: string, field: string, value: string | number
  ) => {
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

    setter(prev => prev.map(item => {
      if (item.id !== id) return item;
      let val = value;
      if (field === 'quantity' && item.maxReturnQuantity !== undefined) {
        const max = item.maxReturnQuantity;
        val = Number(val) > max ? (setModal({ message: `Cannot return more than ${max} purchased.`, type: State.ERROR }), max) : Math.max(1, Number(val));
      }
      const updated = { ...item, [field]: val };
      if (field === 'discount') {
        const base = updated.mrp > 0 ? updated.mrp : (updated.salesPrice || 0);
        updated.unitPrice = applyRounding(base * (1 - Number(val) / 100), isRoundingEnabled, roundingInterval);
      }
      if (['quantity', 'unitPrice', 'discount'].includes(field)) {
        updated.amount = toCurrency(Number(updated.quantity) * Number(updated.unitPrice));
      }
      return updated;
    }));
  };

  const addExchangeItem = (itemToAdd: Item) => {
    const mrp = Number(itemToAdd.mrp || 0);
    const salesPrice = Number(itemToAdd.salesPrice || 0);
    const presetDiscount = Number(itemToAdd.discount || 0);
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

    let finalPrice = mrp, discount = 0;
    if (salesPrice > 0) {
      finalPrice = salesPrice;
      discount = mrp > 0 ? ((mrp - salesPrice) / mrp) * 100 : 0;
    } else if (presetDiscount > 0) {
      discount = presetDiscount;
      finalPrice = mrp * (1 - presetDiscount / 100);
    }
    finalPrice = applyRounding(finalPrice, isRoundingEnabled, roundingInterval);

    setExchangeItems(prev => [...prev, {
      id: crypto.randomUUID(), originalItemId: itemToAdd.id!,
      name: itemToAdd.name, quantity: (itemToAdd as any).unitMultiplier || 1,
      unitMultiplier: (itemToAdd as any).unitMultiplier || 1,
      unitPrice: finalPrice, amount: finalPrice, mrp,
      salesPrice, discount: parseFloat(discount.toFixed(2)),
    }]);
  };

  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);
    const code = barcode.trim();
    if (purpose === 'sale') {
      const found = salesList.find(s => s.invoiceNumber === code);
      found ? handleSelectSale(found) : setModal({ message: `Sale not found: "${code}"`, type: State.ERROR });
    } else if (purpose === 'item') {
      const found = availableItems.find(i => i.barcode === code);
      found ? addExchangeItem(found) : setModal({ message: `Item not found: "${code}"`, type: State.ERROR });
    }
  };

  // Item edit drawer
  const handleOpenEditDrawer = (item: Item) => {
    const real = availableItems.find(a =>
      a.id === (item as any).originalItemId || a.id === (item as any).productId || a.id === item.id
    );
    if (!real) return setModal({ message: 'Original item not found.', type: State.ERROR });
    setSelectedItemForEdit(real);
    setIsItemDrawerOpen(true);
  };
  const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
  const handleSaveSuccess = (updated: Partial<Item>) => {
    setAvailableItems(prev => prev.map(i => i.id === selectedItemForEdit?.id ? { ...i, ...updated, id: i.id } as Item : i));
    setExchangeItems(prev => prev.map(i =>
      i.originalItemId === selectedItemForEdit?.id
        ? { ...i, name: updated.name ?? i.name, mrp: updated.mrp ?? i.mrp }
        : i
    ));
  };

  // Lock/unlock handlers via long press
  const discountPress = useLongPress(() => setIsDiscountLocked(false));
  const pricePress = useLongPress(() => setIsPriceLocked(false), 200);
  const showToast = (setter: typeof setDiscountInfo, msg: string) => { setter(msg); setTimeout(() => setter(null), 2000); };

  // Exchange item field changes
  const handleDiscountChange = (id: string, v: number | string) =>
    handleListChange(setExchangeItems, id, 'discount', typeof v === 'string' ? parseFloat(v) : v);
  const handleQuantityChange = (id: string, qty: number) =>
    handleListChange(setExchangeItems, id, 'quantity', Math.max(1, qty));
  const handleCustomPriceChange = (id: string, value: string) => {
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value))
      setExchangeItems(prev => prev.map(i => i.id === id ? { ...i, customPrice: value } : i));
  };
  const handleCustomPriceBlur = (id: string) =>
    setExchangeItems(prev => prev.map(i => {
      if (i.id !== id || i.customPrice === undefined) return i;
      const num = parseFloat(String(i.customPrice));
      return isNaN(num) ? { ...i, customPrice: undefined }
        : { ...i, unitPrice: num, amount: num * i.quantity, customPrice: undefined };
    }));

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser?.companyId || !selectedSale) return;
    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'companies', companyId, 'sales', selectedSale.id);
      const finalPartyName = (completionData?.partyName || partyName || selectedSale.partyName || '').trim();
      const finalPartyNumber = (completionData?.partyNumber || partyNumber || selectedSale.partyNumber || '').trim();

      const originalItemsMap = new Map(selectedSale.items.map((item: any) => {
        const id = item.id || item.productId || 'UNKNOWN_ID';
        const qty = Number(item.quantity) || 1;
        const total = Number(item.finalPrice || item.amount || 0);
        return [id, { ...item, _effectiveUnitPrice: qty > 0 ? total / qty : 0 }];
      }));

      const origInvoiceTotal = selectedSale.items.reduce((s, i) => s + Number(i.finalPrice || 0), 0);
      const validInventoryIds = new Set(availableItems.map(i => i.id));
      const gstScheme = salesSettings?.gstScheme || 'none';
      const isTaxEnabled = salesSettings?.enableTax ?? true;
      const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
      const taxType = salesSettings?.taxType ?? 'exclusive';
      const effectiveTaxMode = gstScheme === 'regular' && isTaxEnabled ? taxType : 'none';

      // Return: restore stock
      let returnedGrossValue = 0;
      itemsToReturn.forEach(r => {
        const orig = originalItemsMap.get(r.originalItemId);
        if (orig) {
          orig.quantity = Number(orig.quantity) - Number(r.quantity);
          returnedGrossValue += orig._effectiveUnitPrice * r.quantity;
          if (orig.quantity <= 0) originalItemsMap.delete(r.originalItemId);
        }
        if (r.originalItemId && validInventoryIds.has(r.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', r.originalItemId), {
            stock: firebaseIncrement(r.quantity), updatedAt: serverTimestamp(),
          });
        }
      });

      // Exchange: deduct stock
      exchangeItems.forEach(ex => {
        const existing = Array.from(originalItemsMap.values()).find(i => i.id === ex.originalItemId);
        if (existing) {
          existing.quantity = Number(existing.quantity) + Number(ex.quantity);
        } else {
          const master = availableItems.find(i => i.id === ex.originalItemId);
          const itemTaxRate = master?.tax !== undefined ? Number(master.tax) : currentTaxRate;
          const lineTotal = ex.unitPrice * ex.quantity;
          let lineBase = lineTotal, lineTax = 0;
          if (effectiveTaxMode !== 'none' && itemTaxRate > 0) {
            lineBase = effectiveTaxMode === 'inclusive'
              ? toCurrency(lineTotal / (1 + itemTaxRate / 100))
              : lineTotal;
            lineTax = toCurrency(effectiveTaxMode === 'inclusive' ? lineTotal - lineBase : lineTotal * (itemTaxRate / 100));
          }
          originalItemsMap.set(ex.originalItemId, {
            id: ex.originalItemId, name: ex.name, mrp: ex.mrp, quantity: ex.quantity,
            discount: ex.discount || 0, discountPercentage: ex.discount || 0,
            finalPrice: effectiveTaxMode === 'exclusive' ? lineBase + lineTax : lineTotal,
            amount: lineTotal, unitPrice: ex.unitPrice, purchasePrice: master?.purchasePrice || 0,
            tax: master?.tax || 0, taxRate: itemTaxRate, taxAmount: lineTax, taxableAmount: lineBase,
            taxType: effectiveTaxMode, itemGroupId: master?.itemGroupId || '',
            stock: 0, barcode: master?.barcode || '', restockQuantity: 0, isEditable: false,
            _effectiveUnitPrice: ex.unitPrice, unitMultiplier: ex.unitMultiplier || 1,
          } as any);
        }
        if (ex.originalItemId && validInventoryIds.has(ex.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', ex.originalItemId), {
            stock: firebaseIncrement(-ex.quantity), updatedAt: serverTimestamp(),
          });
        }
      });

      // Recalculate bill totals
      const newItemsList = Array.from(originalItemsMap.values()).map((item: any) => {
        const { _effectiveUnitPrice, ...clean } = item;
        const lineTotal = Number(item.quantity) * Number(_effectiveUnitPrice);
        clean.finalPrice = clean.taxType === 'exclusive' && clean.taxableAmount !== undefined
          ? clean.taxableAmount + clean.taxAmount
          : lineTotal;
        clean.effectiveUnitPrice = _effectiveUnitPrice;
        return clean;
      });

      const totals = newItemsList.reduce((acc, i) => ({
        subtotal: acc.subtotal + (Number(i.mrp) || 0) * (Number(i.quantity) || 0),
        taxableAmount: acc.taxableAmount + (Number(i.taxableAmount) || 0),
        taxAmount: acc.taxAmount + (Number(i.taxAmount) || 0),
        finalTotal: acc.finalTotal + (Number(i.finalPrice) || 0),
      }), { subtotal: 0, taxableAmount: 0, taxAmount: 0, finalTotal: 0 });

      const origManualDiscount = Number(selectedSale.manualDiscount) || 0;
      const discountDeductionAmount = origManualDiscount > 0 && origInvoiceTotal > 0 && returnedGrossValue > 0
        ? Math.round(origManualDiscount * (returnedGrossValue / origInvoiceTotal) * 100) / 100
        : 0;
      const newManualDiscount = Math.max(0, origManualDiscount - discountDeductionAmount + (Number(completionData?.discount) || 0));
      const updatedFinalAmount = totals.finalTotal - newManualDiscount;

      let updatedPaymentMethods: any = { ...(selectedSale.paymentMethods || {}) };
      if (completionData?.paymentDetails) {
        Object.entries(completionData.paymentDetails).forEach(([mode, amount]) => {
          if (mode !== 'due') updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
        });
      }
      const totalPaid = Object.entries(updatedPaymentMethods)
        .filter(([k]) => k !== 'due').reduce((s, [, v]) => s + Number(v), 0);
      updatedPaymentMethods.due = Math.max(0, updatedFinalAmount - totalPaid < 0.5 ? 0 : updatedFinalAmount - totalPaid);

      batch.update(saleRef, {
        partyName: finalPartyName, partyNumber: finalPartyNumber, items: newItemsList,
        subtotal: totals.subtotal, taxableAmount: totals.taxableAmount, taxAmount: totals.taxAmount,
        discount: (totals.subtotal - totals.finalTotal) + newManualDiscount,
        manualDiscount: newManualDiscount, totalAmount: updatedFinalAmount,
        returnHistory: arrayUnion({
          id: crypto.randomUUID(), returnedAt: new Date(), modeOfReturn, partyName: finalPartyName,
          discountDeducted: discountDeductionAmount, newDiscountApplied: Number(completionData?.discount) || 0,
          finalBalance,
          returnedItems: itemsToReturn.map(i => ({ originalItemId: i.originalItemId, name: i.name, quantity: i.quantity, amount: i.amount })),
          exchangeItems: exchangeItems.map(i => ({ originalItemId: i.originalItemId, name: i.name, quantity: i.quantity, amount: i.amount })),
        }),
        paymentMethods: updatedPaymentMethods, isReturned: true, lastUpdated: serverTimestamp(),
      });

      if (finalPartyNumber.length >= 3) {
        const customerUpdate: any = { name: finalPartyName, number: finalPartyNumber, companyId, lastUpdatedAt: serverTimestamp() };
        if (modeOfReturn !== 'Cash Refund' && finalBalance > 0) customerUpdate.creditBalance = firebaseIncrement(finalBalance);
        batch.set(doc(db, 'companies', companyId, 'customers', finalPartyNumber), customerUpdate, { merge: true });
      }

      await batch.commit();
      setModal({ type: State.SUCCESS, message: 'Return processed successfully!' });
      setTimeout(() => navigate(ROUTES.SALES), 1500);
    } catch (err: any) {
      setModal({ type: State.ERROR, message: `Failed: ${err.message}` });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  const handleProcessReturn = () => {
    if (modeOfReturn === 'Exchange' && exchangeItems.length === 0)
      return setModal({ type: State.ERROR, message: 'No exchange items selected.' });
    if (itemsToReturn.length === 0 && exchangeItems.length === 0)
      return setModal({ type: State.ERROR, message: 'No items selected.' });
    if (modeOfReturn === 'Cash Refund' && finalBalance > 0 || finalBalance >= 0)
      saveReturnTransaction();
    else
      setIsDrawerOpen(true);
  };

  const getBalanceLabel = () =>
    finalBalance < 0 ? 'Payment Due' : modeOfReturn === 'Cash Refund' ? 'Refund Amount' : 'Credit Due';

  // ── Shared cart settings object ────────────────────────────────────────────

  const cartSettings = {
    enableRounding: salesSettings?.enableRounding ?? true,
    roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
    enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
    lockDiscount: isDiscountLocked,
    lockPrice: isPriceLocked,
  };

  // ── Mode of return selector (shared between panels) ───────────────────────

  const ModeSelect = ({ className = '' }) => (
    <select
      value={modeOfReturn}
      onChange={e => { setModeOfReturn(e.target.value); if (e.target.value !== 'Exchange') setExchangeItems([]); }}
      className={`p-2 border rounded bg-white ${className}`}
    >
      <option disabled={isDueSale}>Credit Note</option>
      <option>Exchange</option>
      <option>Cash Refund</option>
    </select>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />
      <SalesHeader title="Sales Return" />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* LEFT PANEL */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto relative">
          <div className="p-2 pb-32 md:pb-2">

            {/* Sale Search */}
            <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
              <div className="relative" ref={salesDropdownRef}>
                <label className="block text-sm font-medium mb-1 text-gray-700">Search Original Sale</label>
                <div className="flex gap-2">
                  <input
                    type="text" value={searchSaleQuery}
                    onChange={e => { setSearchSaleQuery(e.target.value); setIsSalesDropdownOpen(true); }}
                    onFocus={() => setIsSalesDropdownOpen(true)}
                    placeholder={selectedSale ? `${selectedSale.partyName} (${selectedSale.invoiceNumber})` : 'Invoice or Name...'}
                    className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    autoComplete="off" readOnly={!!selectedSale}
                  />
                  {selectedSale && (
                    <button onClick={handleClear} className="px-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300">Clear</button>
                  )}
                </div>
                {isSalesDropdownOpen && !selectedSale && (
                  <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredSales.map(sale => (
                      <div key={sale.id} className="p-3 cursor-pointer hover:bg-gray-100 border-b last:border-0" onClick={() => handleSelectSale(sale)}>
                        <p className="font-semibold text-sm">{sale.partyName} <span className="text-gray-500 font-normal">({sale.invoiceNumber || 'N/A'})</span></p>
                        <p className="text-xs text-gray-500">Amount: ₹{sale.totalAmount.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedSale && (
              <>
                {/* Sale Details */}
                <div className="bg-white p-3 rounded-sm shadow-md mb-4 border border-gray-200">
                  <div className="space-y-3 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Date</label>
                        <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Party</label>
                        <input type="text" value={partyName} onChange={e => setPartyName(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" />
                      </div>
                    </div>
                    <div className="relative" ref={customerDropdownRef}>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                      <input
                        type="text" value={partyNumber} maxLength={10}
                        onChange={e => { setPartyNumber(e.target.value.replace(/\D/g, '').slice(0, 10)); setPartyName(''); setIsCustomerDropdownOpen(true); }}
                        onFocus={() => setIsCustomerDropdownOpen(true)}
                        className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                        autoComplete="off" placeholder="Search by number or name..."
                      />
                      {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                        <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filteredCustomers.map(c => (
                            <div key={c.id} className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
                              onClick={() => { setPartyNumber(c.number); setPartyName(c.name); setIsCustomerDropdownOpen(false); }}>
                              <p className="font-semibold text-sm">{c.name}</p>
                              <p className="text-xs text-gray-500">{c.number}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                  <div className="flex flex-col gap-2">
                    {originalSaleItems.map(item => (
                      <ReturnListItem key={item.id} item={item} isSelected={selectedReturnIds.has(item.id)}
                        onToggle={handleToggleReturnItem}
                        onQuantityChange={(id, val) => handleListChange(setOriginalSaleItems, id, 'quantity', val)}
                        showMrp />
                    ))}
                  </div>
                </div>

                {/* Exchange Section */}
                <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                  <div className="md:hidden mb-4">
                    <label className="block font-medium text-sm mb-1">Transaction Type</label>
                    <ModeSelect className="w-full" />
                  </div>
                  {modeOfReturn === 'Exchange' && (
                    <>
                      <div className="flex items-end gap-1 mb-3">
                        <div className="flex-grow">
                          <SearchableItemInput label="Add Exchange Item" placeholder="Search inventory..." items={availableItems}
                            onItemSelected={item => item && addExchangeItem(item)} isLoading={isLoading} error={error} />
                        </div>
                        <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-md">
                          <IconScanCircle width={20} height={20} />
                        </button>
                      </div>
                      <div className="flex gap-2 text-xs text-red-500 mb-2">
                        {discountInfo && <span>{discountInfo}</span>}
                        {priceInfo && <span>{priceInfo}</span>}
                      </div>
                      {exchangeItems.length > 0 && (
                        <div className="overflow-hidden">
                          <div className="px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase mb-2">Exchange Cart</div>
                          <GenericCartList<SalesItem>
                            items={mappedExchangeItems}
                            availableItems={availableItems}
                            basePriceKey="mrp"
                            priceLabel="MRP"
                            settings={cartSettings}
                            applyRounding={applyRounding}
                            State={State}
                            setModal={setModal}
                            onOpenEditDrawer={handleOpenEditDrawer}
                            onDeleteItem={id => setExchangeItems(prev => prev.filter(i => i.id !== id))}
                            onDiscountChange={handleDiscountChange}
                            onCustomPriceChange={handleCustomPriceChange}
                            onCustomPriceBlur={handleCustomPriceBlur}
                            onQuantityChange={handleQuantityChange}
                            onDiscountPressStart={discountPress.onPressStart}
                            onDiscountPressEnd={discountPress.onPressEnd}
                            onDiscountClick={() => isDiscountLocked && showToast(setDiscountInfo, 'Cannot edit discount')}
                            onPricePressStart={pricePress.onPressStart}
                            onPricePressEnd={pricePress.onPressEnd}
                            onPriceClick={() => isPriceLocked && showToast(setPriceInfo, 'Cannot edit price')}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Mobile Summary */}
                <div className="md:hidden bg-white p-2 rounded-sm shadow-md">
                  {[
                    { label: 'Return Value', value: `₹${totalReturnGross.toFixed(2)}`, color: 'text-blue-700' },
                    ...(discountDeducted > 0 ? [{ label: 'Less Bill Discount', value: `- ₹${discountDeducted.toFixed(2)}`, color: 'text-red-600 text-xs' }] : []),
                    ...(modeOfReturn === 'Exchange' ? [{ label: 'Exchange Value', value: `₹${totalExchangeValue.toFixed(2)}`, color: 'text-blue-700' }] : []),
                  ].map(({ label, value, color }) => (
                    <div key={label} className={`flex justify-between items-center text-sm mt-1 ${color}`}>
                      <p>{label}</p><p className="font-medium">{value}</p>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 my-2" />
                  <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    <p>{getBalanceLabel()}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedSale ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
                <ModeSelect className="w-full p-3 border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100 flex-grow">
                <div className="flex justify-between"><span>Return Sale Amount</span><span className="font-medium">₹{totalReturnGross.toFixed(2)}</span></div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between text-red-500"><span>Less: Proportional Discount</span><span>- ₹{discountDeducted.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-2"><span>Net Return Value</span><span>₹{totalReturnValue.toFixed(2)}</span></div>
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-blue-600"><span>Less: New Items Value</span><span>- ₹{totalExchangeValue.toFixed(2)}</span></div>
                )}
              </div>
              <div className="mt-auto pt-4 border-t border-gray-100">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
                  <span className={`text-3xl font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{Math.abs(finalBalance).toFixed(2)}
                  </span>
                </div>
                <button onClick={handleProcessReturn} className="w-full bg-blue-600 text-white py-4 px-4 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98] text-lg font-bold hover:bg-blue-700">
                  Process Transaction
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p>Select a sale to begin return</p>
            </div>
          )}
        </div>

        {/* Mobile sticky CTA */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18 pointer-events-none">
          {selectedSale && (
            <CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md pointer-events-auto">
              Process Transaction
            </CustomButton>
          )}
        </div>
      </div>

      <PaymentDrawer
        mode="sale" isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)} billTotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={partyName} initialPartyNumber={partyNumber}
      />

      <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />
    </div>
  );
};

export default SalesReturnPage;