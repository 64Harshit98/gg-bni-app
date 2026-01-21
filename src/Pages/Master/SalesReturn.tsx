import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  orderBy, limit, getDoc,
  collection,
  query,
  getDocs,
  doc,
  DocumentSnapshot,
  type DocumentData,
  writeBatch,
  increment as firebaseIncrement,
  arrayUnion,
  serverTimestamp,
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
import { applyRounding, type SalesItem } from './Sales';

interface SalesData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber: string;
  items: OriginalSalesItem[];
  totalAmount: number;
  subtotal: number;
  discount: number;
  manualDiscount?: number;
  createdAt: any;
  isReturned?: boolean;
  paymentMethods?: { [key: string]: number };
}
interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}
interface ExchangeItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
  discount: number;
  customPrice?: number | string;
}

// Interface for Customer
interface Customer {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}

const SalesReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { state } = useLocation();
  const { invoiceId } = useParams();
  const location = useLocation();

  const { salesSettings } = useSalesSettings();

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [partyNumber, setPartyNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');

  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);

  const [salesList, setSalesList] = useState<SalesData[]>([]);
  const [selectedSale, setSelectedSale] = useState<SalesData | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');

  // Dropdown States
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  // Customer Dropdown States
  const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const [isDiscountLocked, setIsDiscountLocked] = useState(true);
  const [discountInfo, setDiscountInfo] = useState<string | null>(null);
  const [isPriceLocked, setIsPriceLocked] = useState(true);
  const [priceInfo, setPriceInfo] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (salesSettings) {
      setIsDiscountLocked(salesSettings.lockDiscountEntry ?? false);
      setIsPriceLocked(salesSettings.lockSalePriceEntry ?? false);
    }
  }, [salesSettings]);

  const itemsToReturn = useMemo(() =>
    originalSaleItems.filter(item => selectedReturnIds.has(item.id)),
    [originalSaleItems, selectedReturnIds]
  );

  useEffect(() => {
    if (!currentUser || !currentUser.companyId || !dbOperations) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const salesQuery = query(
          collection(db, 'companies', currentUser.companyId, 'sales'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );

        // Fetch Customers for Dropdown
        const customersQuery = query(collection(db, 'companies', currentUser.companyId, 'customers'), limit(100));

        let specificInvoicePromise: Promise<DocumentSnapshot<DocumentData, DocumentData> | null> = Promise.resolve(null);

        if (invoiceId && !state?.invoiceData) {
          const specificRef = doc(db, 'companies', currentUser.companyId, 'sales', invoiceId);
          specificInvoicePromise = getDoc(specificRef);
        }

        const [salesSnapshot, allItems, customersSnap, specificInvoiceSnap] = await Promise.all([
          getDocs(salesQuery),
          dbOperations.syncItems(),
          getDocs(customersQuery),
          specificInvoicePromise
        ]);

        const recentSales: SalesData[] = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalesData));
        const customersData = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));

        if (state?.invoiceData) {
          handleSelectSale(state.invoiceData);
        }
        else if (specificInvoiceSnap && specificInvoiceSnap.exists()) {
          const specificData = { id: specificInvoiceSnap.id, ...specificInvoiceSnap.data() } as SalesData;
          if (!recentSales.find(s => s.id === specificData.id)) {
            recentSales.unshift(specificData);
          }
          handleSelectSale(specificData);
        }
        else if (invoiceId) {
          const pre = recentSales.find(sale => sale.id === invoiceId);
          if (pre) handleSelectSale(pre);
        }

        setSalesList(recentSales);
        setAvailableItems(allItems);
        setAvailableCustomers(customersData);

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load initial data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser, dbOperations, invoiceId, state]);

  // Click Outside Handler for both Dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (salesDropdownRef.current && !salesDropdownRef.current.contains(event.target as Node)) {
        setIsSalesDropdownOpen(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSales = useMemo(() => salesList
    .filter(sale => !sale.isReturned)
    .filter(sale =>
      (sale.partyName && sale.partyName.toLowerCase().includes(searchSaleQuery.toLowerCase())) ||
      (sale.invoiceNumber && sale.invoiceNumber.toLowerCase().includes(searchSaleQuery.toLowerCase()))
    )
    .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
    [salesList, searchSaleQuery]
  );

  const filteredCustomers = useMemo(() => {
    if (!partyNumber) return [];

    const searchParam = String(partyNumber).trim().toLowerCase();
    if (!searchParam) return [];

    return availableCustomers.filter(c => {
      const customerNumber = String(c.number ?? '').toLowerCase();
      const customerName = String(c.name ?? '').toLowerCase();

      return customerNumber.includes(searchParam) || customerName.includes(searchParam);
    });
  }, [availableCustomers, partyNumber]);

  const handleSelectCustomer = (customer: Customer) => {
    setPartyNumber(customer.number);
    setPartyName(customer.name);
    setIsCustomerDropdownOpen(false);
  };

  const handleSelectSale = (sale: SalesData) => {
    setSelectedSale(sale);
    setPartyName(sale.partyName || 'N/A');
    setPartyNumber(sale.partyNumber || '');
    setOriginalSaleItems(
      sale.items.map((item: any) => {
        const itemData = item.data || item;
        const quantity = Number(itemData.quantity) || 1;
        const finalPrice = Number(itemData.finalPrice) || 0;
        const unitPrice = quantity > 0 ? finalPrice / quantity : 0;
        const safeId = itemData.id || itemData.productId || 'UNKNOWN_ID';

        return {
          id: crypto.randomUUID(),
          originalItemId: safeId,
          name: itemData.name,
          quantity: quantity,
          unitPrice: unitPrice,
          amount: finalPrice,
          mrp: itemData.mrp || 0,
        };
      })
    );
    setSelectedReturnIds(new Set());
    setExchangeItems([]);
    setSearchSaleQuery(sale.invoiceNumber || sale.partyName);
    setIsSalesDropdownOpen(false);
  };

  const handleToggleReturnItem = (itemId: string) => {
    setSelectedReturnIds(prevIds => {
      const newIds = new Set(prevIds);
      if (newIds.has(itemId)) newIds.delete(itemId); else newIds.add(itemId);
      return newIds;
    });
  };

  const handleListChange = (
    setter: React.Dispatch<React.SetStateAction<any[]>>,
    id: string,
    field: keyof TransactionItem | keyof ExchangeItem,
    value: string | number
  ) => {
    setter(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };

        if (field === 'discount') {
          const discountValue = Number(value) || 0;
          let newPrice = updatedItem.mrp * (1 - discountValue / 100);

          if (discountValue > 0) {
            if (newPrice < 100) {
              newPrice = Math.ceil(newPrice / 5) * 5;
            } else {
              newPrice = Math.ceil(newPrice / 10) * 10;
            }
          }
          updatedItem.unitPrice = newPrice;
        }

        if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
          updatedItem.amount = Number(updatedItem.quantity) * Number(updatedItem.unitPrice);
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const handleRemoveFromList = (setter: any, id: string) => {
    setter((prev: any[]) => prev.filter((item: any) => item.id !== id));
  };

  const handleClear = () => {
    setSelectedSale(null);
    setPartyName('');
    setPartyNumber('');
    setOriginalSaleItems([]);
    setSelectedReturnIds(new Set());
    setExchangeItems([]);
    setSearchSaleQuery('');
    navigate(ROUTES.SALES_RETURN);
  };

  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);
    if (purpose === 'sale') {
      const foundSale = salesList.find(sale => sale.invoiceNumber === barcode);
      if (foundSale) {
        handleSelectSale(foundSale);
      } else {
        setModal({ message: 'Original sale not found for this invoice.', type: State.ERROR });
      }
    } else if (purpose === 'item') {
      const itemToAdd = availableItems.find(item => item.barcode === barcode);
      if (itemToAdd) {
        handleExchangeItemSelected(itemToAdd);
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    }
  };

  const handleDiscountPressStart = () => { if (!salesSettings?.lockDiscountEntry) longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500); };
  const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handleDiscountClick = () => { if (isDiscountLocked) { setDiscountInfo("Cannot edit discount"); setTimeout(() => setDiscountInfo(null), 3000); } };

  const handlePricePressStart = () => { if (!salesSettings?.lockSalePriceEntry) longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 200); };
  const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handlePriceClick = () => { if (isPriceLocked) { setPriceInfo("Cannot edit price"); setTimeout(() => setPriceInfo(null), 1000); } };

  const handleDiscountChange = (id: string, discountValue: number | string) => {
    const val = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
    handleListChange(setExchangeItems, id, 'discount', val);
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    handleListChange(setExchangeItems, id, 'quantity', Math.max(1, newQuantity));
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
          const newAmount = num * item.quantity;
          return { ...item, unitPrice: num, amount: newAmount, customPrice: undefined };
        }
        return { ...item, customPrice: undefined };
      }
      return item;
    }));
  };

  const addExchangeItem = (itemToAdd: Item) => {
    const discount = itemToAdd.discount || 0;
    let finalExchangePrice = itemToAdd.mrp * (1 - (discount / 100));

    if (discount > 0) {
      if (finalExchangePrice < 100) {
        finalExchangePrice = Math.ceil(finalExchangePrice / 5) * 5;
      } else {
        finalExchangePrice = Math.ceil(finalExchangePrice / 10) * 10;
      }
    }

    setExchangeItems(prev => [...prev, {
      id: crypto.randomUUID(),
      originalItemId: itemToAdd.id!,
      name: itemToAdd.name,
      quantity: 1,
      unitPrice: finalExchangePrice,
      amount: finalExchangePrice,
      mrp: itemToAdd.mrp,
      discount: discount,
    }]);
  };

  const handleExchangeItemSelected = (item: Item) => {
    if (item) addExchangeItem(item);
  };

  const mappedExchangeItems: SalesItem[] = useMemo(() => {
    return exchangeItems.map(item => ({
      id: item.id,
      name: item.name,
      mrp: item.mrp,
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
    } as SalesItem));
  }, [exchangeItems]);


  // --- CALCULATION LOGIC (UI) ---
  const { totalReturnGross, totalExchangeValue, finalBalance, discountDeducted } = useMemo(() => {
    const totalReturnGross = itemsToReturn.reduce((sum, item) => sum + item.amount, 0);
    const totalExchangeValue = exchangeItems.reduce((sum, item) => sum + item.amount, 0);

    let discountDeducted = 0;

    if (selectedSale) {
      const originalInvoiceTotal = selectedSale.items.reduce((sum, item) => {
        return sum + (item.finalPrice || 0);
      }, 0);

      const originalManualDiscount = selectedSale.manualDiscount || 0;

      if (originalInvoiceTotal > 0 && originalManualDiscount > 0) {
        const ratio = totalReturnGross / originalInvoiceTotal;
        discountDeducted = originalManualDiscount * ratio;
        discountDeducted = Math.round(discountDeducted * 100) / 100;
      }
    }

    const totalReturnValue = totalReturnGross - discountDeducted;
    const finalBalance = totalReturnValue - totalExchangeValue;

    return { totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted };
  }, [itemsToReturn, exchangeItems, selectedSale]);


  // --- SAVE LOGIC ---
  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser || !currentUser.companyId || !selectedSale) return;
    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'companies', companyId, 'sales', selectedSale.id);

      // --- 0. DETERMINE FINAL PARTY DETAILS ---
      const finalPartyName = (completionData?.partyName || partyName || selectedSale.partyName || '').trim();
      const finalPartyNumber = (completionData?.partyNumber || partyNumber || selectedSale.partyNumber || '').trim();

      // --- 1. PREPARE DATA & CALCULATE EFFECTIVE PRICES ---
      // FIX: Use the exact same ID logic as handleSelectSale to ensure we match the correct rows
      const originalItemsMap = new Map(selectedSale.items.map((item: any) => {
        const safeId = item.id || item.productId || 'UNKNOWN_ID'; // Match UI logic

        const oldQty = Number(item.quantity) || 1;
        const oldTotal = Number(item.finalPrice || item.amount || 0);
        // Calculate the true price paid per unit (handling previous manual edits/discounts)
        const effectiveUnit = oldQty > 0 ? (oldTotal / oldQty) : 0;

        return [safeId, { ...item, _effectiveUnitPrice: effectiveUnit }];
      }));

      // Calculate the TRUE sum of the original bill (Selling Price Basis)
      const originalInvoiceTotal = selectedSale.items.reduce((sum, item) => {
        return sum + (Number(item.finalPrice || 0));
      }, 0);

      const validInventoryIds = new Set(availableItems.map(i => i.id));

      // --- 2. HANDLE STOCK (RETURN) ---
      let returnedItemsGrossValue = 0;

      itemsToReturn.forEach(returnItem => {
        const originalItem = originalItemsMap.get(returnItem.originalItemId);

        if (originalItem) {
          // Reduce quantity from the Original Bill Item
          originalItem.quantity = Number(originalItem.quantity) - Number(returnItem.quantity);

          // Accumulate the value of items being returned for discount calculation
          returnedItemsGrossValue += (originalItem._effectiveUnitPrice * returnItem.quantity);

          // If item quantity becomes 0 or less, remove it from the bill completely
          if (originalItem.quantity <= 0) {
            originalItemsMap.delete(returnItem.originalItemId);
          }
        }

        // Return Stock back to Inventory
        if (returnItem.originalItemId && validInventoryIds.has(returnItem.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', returnItem.originalItemId), {
            stock: firebaseIncrement(returnItem.quantity),
            updatedAt: serverTimestamp()
          });
        }
      });

      // --- 3. HANDLE STOCK (EXCHANGE) ---
      exchangeItems.forEach(exchangeItem => {
        // Try to find if this item already exists in the bill to merge quantities
        const existingItem = Array.from(originalItemsMap.values()).find(i => i.id === exchangeItem.originalItemId);

        if (existingItem) {
          existingItem.quantity = Number(existingItem.quantity) + Number(exchangeItem.quantity);
        } else {
          // Logic for adding a completely NEW item to the bill
          const itemMaster = availableItems.find(i => i.id === exchangeItem.originalItemId);
          const mrp = itemMaster?.mrp || exchangeItem.mrp || 0;
          const discount = exchangeItem.discount || 0;
          const calculatedPrice = mrp * (1 - (discount / 100));
          const finalExchangePrice = exchangeItem.amount > 0 ? (exchangeItem.amount / exchangeItem.quantity) : calculatedPrice;

          // Use originalItemId as key to prevent collisions
          originalItemsMap.set(exchangeItem.originalItemId, {
            id: exchangeItem.originalItemId,
            name: exchangeItem.name,
            mrp: exchangeItem.mrp,
            quantity: exchangeItem.quantity,
            discount: exchangeItem.discount || 0,
            discountPercentage: exchangeItem.discount || 0,
            finalPrice: exchangeItem.amount,
            amount: exchangeItem.amount,
            unitPrice: finalExchangePrice, // Explicitly set unitPrice
            purchasePrice: itemMaster?.purchasePrice || 0,
            tax: itemMaster?.tax || 0,
            itemGroupId: itemMaster?.itemGroupId || '',
            stock: 0,
            barcode: itemMaster?.barcode || '',
            restockQuantity: 0,
            isEditable: false,
            _effectiveUnitPrice: finalExchangePrice
          } as any);
        }

        // Deduct Stock for Exchange Items
        if (exchangeItem.originalItemId && validInventoryIds.has(exchangeItem.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', exchangeItem.originalItemId), {
            stock: firebaseIncrement(-exchangeItem.quantity),
            updatedAt: serverTimestamp()
          });
        }
      });

      // --- 4. RECALCULATE BILL TOTALS ---
      const newItemsList = Array.from(originalItemsMap.values()).map((item: any) => {
        // FIX: Ensure simple math determines the new line total: Unit Price * Quantity
        const lineTotal = item._effectiveUnitPrice * item.quantity;

        const { _effectiveUnitPrice, ...cleanItem } = item;

        return {
          ...cleanItem,
          finalPrice: lineTotal,
          amount: lineTotal,
          // FIX: Explicitly save unitPrice to prevent future "breakage"
          unitPrice: item._effectiveUnitPrice
        };
      });

      const updatedTotals = newItemsList.reduce((acc, item) => {
        const itemGross = (Number(item.mrp) || 0) * (Number(item.quantity) || 0);
        const itemFinal = Number(item.finalPrice) || 0;
        const itemDiscount = itemGross - itemFinal;
        acc.subtotal += itemGross;
        acc.totalItemDiscount += itemDiscount;
        return acc;
      }, { subtotal: 0, totalItemDiscount: 0 });

      // Manual Discount Calculation
      let discountDeductionAmount = 0;
      const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;

      if (originalManualDiscount > 0 && originalInvoiceTotal > 0 && returnedItemsGrossValue > 0) {
        const ratio = returnedItemsGrossValue / originalInvoiceTotal;
        discountDeductionAmount = originalManualDiscount * ratio;
      }

      discountDeductionAmount = Math.round(discountDeductionAmount * 100) / 100;
      const newManualDiscount = Math.max(0, originalManualDiscount - discountDeductionAmount);
      const updatedFinalAmount = updatedTotals.subtotal - updatedTotals.totalItemDiscount - newManualDiscount;

      // --- 5. MERGE PAYMENTS ---
      let updatedPaymentMethods: any = { ...(selectedSale.paymentMethods || {}) };
      if (completionData?.paymentDetails) {
        Object.entries(completionData.paymentDetails).forEach(([mode, amount]) => {
          if (mode !== 'due') {
            updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
          }
        });
      }

      const totalPaidSoFar = Object.entries(updatedPaymentMethods)
        .filter(([k]) => k !== 'due')
        .reduce((sum, [_, val]) => sum + Number(val), 0);

      updatedPaymentMethods.due = Math.max(0, updatedFinalAmount - totalPaidSoFar);

      // --- 6. HISTORY RECORD ---
      const returnHistoryRecord = {
        id: crypto.randomUUID(),
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(i => ({
          originalItemId: i.originalItemId, name: i.name, quantity: i.quantity, amount: i.amount
        })),
        exchangeItems: exchangeItems.map(i => ({
          originalItemId: i.originalItemId, name: i.name, quantity: i.quantity, amount: i.amount
        })),
        finalBalance,
        discountDeducted: discountDeductionAmount,
        modeOfReturn,
        returnType: modeOfReturn,
        paymentDetails: completionData?.paymentDetails || null,
        partyName: finalPartyName,
        partyNumber: finalPartyNumber
      };

      // --- 7. DB UPDATES ---
      const updateData: any = {
        partyName: finalPartyName,
        partyNumber: finalPartyNumber,
        items: newItemsList,
        subtotal: updatedTotals.subtotal,
        discount: updatedTotals.totalItemDiscount + newManualDiscount,
        manualDiscount: newManualDiscount,
        totalAmount: updatedFinalAmount,
        returnHistory: arrayUnion(returnHistoryRecord),
        paymentMethods: updatedPaymentMethods,
        isReturned: true,
        lastUpdated: serverTimestamp()
      };

      batch.update(saleRef, updateData);

      // --- 8. UPDATE LEDGER ---
      if (finalPartyNumber.length >= 3) {
        const customerRef = doc(db, 'companies', companyId, 'customers', finalPartyNumber);
        const customerUpdateData: any = {
          name: finalPartyName,
          number: finalPartyNumber,
          companyId,
          lastUpdatedAt: serverTimestamp()
        };
        if (modeOfReturn !== 'Cash Refund' && finalBalance > 0) {
          customerUpdateData.creditBalance = firebaseIncrement(finalBalance);
        }
        batch.set(customerRef, customerUpdateData, { merge: true });
      }

      await batch.commit();
      setModal({ type: State.SUCCESS, message: 'Return processed successfully!' });
      setTimeout(() => navigate(ROUTES.SALES), 1500);
    } catch (err: any) {
      console.error(err);
      setModal({ type: State.ERROR, message: `Failed: ${err.message}` });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  const handleProcessReturn = () => {
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) return setModal({ type: State.ERROR, message: 'No items selected.' });

    if (modeOfReturn === 'Cash Refund' && finalBalance > 0) {
      saveReturnTransaction();
    }
    else if (finalBalance >= 0) {
      saveReturnTransaction();
    } else {
      setIsDrawerOpen(true);
    }
  };

  const getBalanceLabel = () => {
    if (finalBalance < 0) return 'Payment Due';
    if (modeOfReturn === 'Cash Refund') return 'Refund Amount';
    return 'Credit Due';
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  // --- RENDER HEADER ---
  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-300 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">
      <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">
        Sales Return
      </h1>
      <div className="flex items-center justify-center gap-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES)} active={isActive(ROUTES.SALES)}>Sales</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES_RETURN)} active={isActive(ROUTES.SALES_RETURN)}>Sales Return</CustomButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      {/* HEADER */}
      {renderHeader()}

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* --- LEFT PANEL (Desktop: 65%, Search + Lists) --- */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-2 md:p-2 pb-24 md:pb-2 relative">

          {/* Search */}
          <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
            <div className="relative" ref={salesDropdownRef}>
              <label htmlFor="search-sale" className="block text-sm font-medium mb-1 text-gray-700">Search Original Sale</label>
              <div className="flex gap-2">
                <input id="search-sale" type="text" value={searchSaleQuery} onChange={(e) => { setSearchSaleQuery(e.target.value); setIsSalesDropdownOpen(true); }} onFocus={() => setIsSalesDropdownOpen(true)} placeholder={selectedSale ? `${selectedSale.partyName} (${selectedSale.invoiceNumber})` : "Invoice or Name..."} className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" autoComplete="off" readOnly={!!selectedSale} />
                {selectedSale && (<button onClick={handleClear} className=" px-3 bg-gray-200 text-gray-700 font-semibold rounded-lg whitespace-nowrap hover:bg-gray-300">Clear</button>)}
              </div>
              {isSalesDropdownOpen && !selectedSale && (
                <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredSales.map((sale) => (
                    <div key={sale.id} className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0" onClick={() => handleSelectSale(sale)}>
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
              {/* Sale Details & Items To Return */}
              <div className="bg-white p-3 rounded-sm shadow-md mb-4 border border-gray-200">
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Party</label><input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                  </div>

                  {/* --- NEW DROPDOWN FOR PARTY NUMBER --- */}
                  <div className="relative" ref={customerDropdownRef}>
                    <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                    <input
                      type="text"
                      value={partyNumber}
                      onChange={(e) => { setPartyNumber(e.target.value); setPartyName(''); setIsCustomerDropdownOpen(true); }}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                      autoComplete="off"
                      placeholder="Search customer by number or name..."
                    />
                    {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                      <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredCustomers.map((customer) => (
                          <div
                            key={customer.id}
                            className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
                            onClick={() => handleSelectCustomer(customer)}
                          >
                            <p className="font-semibold text-sm text-gray-800">{customer.name}</p>
                            <p className="text-xs text-gray-500">{customer.number}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                <div className="flex flex-col gap-2">
                  {originalSaleItems.map((item) => (
                    <ReturnListItem
                      key={item.id}
                      item={item}
                      isSelected={selectedReturnIds.has(item.id)}
                      onToggle={handleToggleReturnItem}
                      onQuantityChange={(id, val) => handleListChange(setOriginalSaleItems, id, 'quantity', val)}
                      showMrp={true}
                    />
                  ))}
                </div>
              </div>

              {/* Exchange Section (Input + List) */}
              <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                {/* Mobile View: Select Mode Here. Desktop: Mode is in Right Panel, but show Content if Exchange is selected */}
                <div className="md:hidden mb-4">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                    <option>Credit Note</option>
                    <option>Exchange</option>
                    <option>Refund</option>
                  </select>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <>
                    <div className="flex items-end gap-1 mb-3">
                      <div className="flex-grow"><SearchableItemInput label="Add Exchange Item" placeholder="Search inventory..." items={availableItems} onItemSelected={handleExchangeItemSelected} isLoading={isLoading} error={error} /></div>
                      <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-md"><IconScanCircle width={20} height={20} /></button>
                    </div>

                    {/* --- DISPLAY ERROR MESSAGES FOR LOCKS --- */}
                    <div className="flex gap-2 text-xs text-red-500 mb-2">
                      {discountInfo && <span>{discountInfo}</span>}
                      {priceInfo && <span>{priceInfo}</span>}
                    </div>

                    {exchangeItems.length > 0 && (
                      <div className="border rounded-sm overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">Exchange Cart</div>
                        <div className="max-h-60 overflow-y-auto bg-gray-50">
                          <GenericCartList<SalesItem>
                            items={mappedExchangeItems}
                            availableItems={availableItems}
                            basePriceKey="mrp"
                            priceLabel="MRP"
                            settings={{
                              enableRounding: salesSettings?.enableRounding ?? true,
                              roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
                              enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
                              lockDiscount: isDiscountLocked,
                              lockPrice: isPriceLocked
                            }}
                            applyRounding={applyRounding}
                            State={State}
                            setModal={setModal}
                            onOpenEditDrawer={() => { }}
                            onDeleteItem={(id) => handleRemoveFromList(setExchangeItems, id)}
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
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Mobile Only: Inline Summary (Above Footer) */}
              <div className="md:hidden bg-white p-2 rounded-sm shadow-md">
                <div className="flex justify-between items-center text-sm text-blue-700">
                  <p>Return Value</p><p className="font-medium">₹{totalReturnGross.toFixed(2)}</p>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between items-center text-xs text-red-600 mt-1">
                    <p>Less Bill Discount</p><p>- ₹{discountDeducted.toFixed(2)}</p>
                  </div>
                )}
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between items-center text-sm text-blue-700 mt-1">
                    <p>Exchange Value</p><p className="font-medium">₹{totalExchangeValue.toFixed(2)}</p>
                  </div>
                )}
                <div className="border-t border-gray-200 my-2"></div>
                <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <p>{getBalanceLabel()}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* --- RIGHT PANEL (Desktop Only: 35%) --- */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedSale ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>

              {/* Transaction Type */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
                <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none">
                  <option>Credit Note</option>
                  <option>Exchange</option>
                  <option>Cash Refund</option>
                </select>
              </div>

              {/* Financials */}
              <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100 flex-grow">
                <div className="flex justify-between">
                  <span>Return Sale Amount</span>
                  <span className="font-medium">₹{totalReturnGross.toFixed(2)}</span>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Less: Proportional Discount</span>
                    <span>- ₹{discountDeducted.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
                  <span>Net Return Value</span>
                  <span>₹{(totalReturnGross - discountDeducted).toFixed(2)}</span>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-blue-600 mt-2">
                    <span>Less: New Items Value</span>
                    <span>- ₹{totalExchangeValue.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Final Total */}
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

        {/* --- MOBILE FOOTER (Sticky) --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          {selectedSale && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md">Process Transaction</CustomButton>)}
        </div>

      </div>

      <PaymentDrawer
        mode='sale'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={partyName}
        initialPartyNumber={partyNumber}
      />
    </div>
  );
};

export default SalesReturnPage;