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
import { ItemEditDrawer } from '../../Components/ItemDrawer';

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
  taxType?: string;
}

interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
  maxReturnQuantity: number;
  unitMultiplier?: number;
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
  salesPrice?: number;
  customPrice?: number | string;
  unitMultiplier?: number;
  moq?: number;
}

interface Customer {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}

const toCurrency = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const SalesReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { state } = useLocation();
  const { invoiceId } = useParams();

  const { salesSettings } = useSalesSettings();

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [partyNumber, setPartyNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');

  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);
  const [exchangeBalanceAction, setExchangeBalanceAction] = useState<'Credit Note' | 'Cash Refund'>('Credit Note');
  const [salesList, setSalesList] = useState<SalesData[]>([]);
  const [selectedSale, setSelectedSale] = useState<SalesData | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');

  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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

        const customersQuery = query(collection(db, 'companies', currentUser.companyId, 'customers'), limit(100));

        let specificInvoicePromise: Promise<DocumentSnapshot<DocumentData, DocumentData> | null> = Promise.resolve(null);

        if (invoiceId && !state?.invoiceData) {
          const specificRef = doc(db, 'companies', currentUser.companyId, 'sales', invoiceId);
          specificInvoicePromise = getDoc(specificRef);
        }

        let allItems = availableItems;
        if (availableItems.length === 0) {
          allItems = await dbOperations.syncItems();
        }

        const [salesSnapshot, customersSnap, specificInvoiceSnap] = await Promise.all([
          getDocs(salesQuery),
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
        if (availableItems.length === 0) setAvailableItems(allItems);
        setAvailableCustomers(customersData);

      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, dbOperations, invoiceId, state]);

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

        // FIX SCRUM-966: Fetch effectiveUnitPrice (pre-tax) instead of dividing finalPrice
        const fallbackUnitPrice = quantity > 0 ? Number(itemData.finalPrice) / quantity : 0;
        const unitPrice = itemData.effectiveUnitPrice !== undefined ? Number(itemData.effectiveUnitPrice) : fallbackUnitPrice;

        // Amount is strictly pre-tax now
        const amount = unitPrice * quantity;

        return {
          id: crypto.randomUUID(),
          originalItemId: itemData.id || itemData.productId || 'UNKNOWN_ID',
          name: itemData.name,
          quantity: quantity,
          maxReturnQuantity: quantity,
          unitPrice: unitPrice,
          amount: amount,
          mrp: itemData.mrp || 0,
          unitMultiplier: itemData.unitMultiplier || 1,
          unit: itemData.unit || ''
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
        let updatedValue = value;

        if (field === 'quantity' && (item as any).maxReturnQuantity !== undefined) {
          const maxQty = (item as any).maxReturnQuantity;
          const newQty = Number(value);
          if (newQty > maxQty) {
            setModal({ message: `Cannot return ${newQty} items. Only ${maxQty} were purchased.`, type: State.ERROR });
            updatedValue = maxQty;
          } else if (newQty < 1) {
            updatedValue = 1;
          }
        }

        const updatedItem = { ...item, [field]: updatedValue };
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

        if (field === 'discount') {
          const discountValue = Number(updatedValue) || 0;
          // FIXED: Base price is MRP if it exists, otherwise Sales Price
          const basePrice = (updatedItem.mrp && updatedItem.mrp > 0) ? updatedItem.mrp : (updatedItem.salesPrice || 0);

          let newPrice = basePrice * (1 - discountValue / 100);
          newPrice = applyRounding(newPrice, isRoundingEnabled, roundingInterval);
          updatedItem.unitPrice = newPrice;
          updatedItem.customPrice = newPrice;
        }

        if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
          updatedItem.amount = toCurrency(Number(updatedItem.quantity) * Number(updatedItem.unitPrice));
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
    const cleanBarcode = barcode.trim();

    if (purpose === 'sale') {
      const foundSale = salesList.find(sale => sale.invoiceNumber === cleanBarcode);
      if (foundSale) handleSelectSale(foundSale);
      else setModal({ message: `Original sale not found for: "${cleanBarcode}"`, type: State.ERROR });
    } else if (purpose === 'item') {
      const itemToAdd = availableItems.find(item => item.barcode === cleanBarcode);
      if (itemToAdd) handleExchangeItemSelected(itemToAdd);
      else setModal({ message: `Item not found for barcode: "${cleanBarcode}"`, type: State.ERROR });
    }
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
    return exchangeItems.map(item => ({
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
  }, [exchangeItems]);

  // --- FIXED USEMEMO: Recalculates tax separately for return vs exchange items ---
  const { totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted } = useMemo(() => {
    let returnGross = 0;
    let returnExclusiveTax = 0;

    itemsToReturn.forEach(returnItem => {
      returnGross += returnItem.amount;
      const origItem = selectedSale?.items.find(i => (i.id || (i as any).productId) === returnItem.originalItemId);

      if (origItem) {
        // Cast to 'any' to bypass strict TypeScript interface checks
        const extendedItem = origItem as any;

        const taxType = extendedItem.taxType || 'none';
        const taxRate = Number(extendedItem.taxRate || extendedItem.tax || 0);

        if (taxType === 'exclusive' && taxRate > 0) {
          returnExclusiveTax += returnItem.amount * (taxRate / 100);
        }
      }
    });

    let exchangeGross = 0;
    let exchangeExclusiveTax = 0;

    const gstScheme = salesSettings?.gstScheme || 'none';
    const isTaxEnabled = salesSettings?.enableTax ?? true;
    const globalTaxType = salesSettings?.taxType ?? 'exclusive';
    const effectiveTaxMode = (gstScheme === 'regular' && isTaxEnabled) ? globalTaxType : 'none';

    exchangeItems.forEach(exchangeItem => {
      exchangeGross += exchangeItem.amount;
      const itemMaster = availableItems.find(i => i.id === exchangeItem.originalItemId);
      const itemTaxRate = (itemMaster?.tax !== undefined) ? Number(itemMaster.tax) : (salesSettings?.defaultTaxRate ?? 0);
      if (effectiveTaxMode === 'exclusive' && itemTaxRate > 0) {
        exchangeExclusiveTax += exchangeItem.amount * (itemTaxRate / 100);
      }
    });

    let discountDeducted = 0;
    if (selectedSale) {
      const originalInvoiceTotal = selectedSale.items.reduce((sum, item: any) => sum + (Number(item.finalPrice || 0)), 0);
      const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
      if (originalInvoiceTotal > 0 && originalManualDiscount > 0) {
        const ratio = (returnGross + returnExclusiveTax) / originalInvoiceTotal;
        discountDeducted = Math.round(originalManualDiscount * ratio * 100) / 100;
      }
    }

    const totalReturnValue = returnGross + returnExclusiveTax - discountDeducted;
    const totalExchangeVal = exchangeGross + exchangeExclusiveTax;
    const finalBalance = totalReturnValue - totalExchangeVal;

    return {
      totalReturnGross: returnGross,
      totalReturnValue,
      totalExchangeValue: totalExchangeVal,
      finalBalance: Math.round(finalBalance),
      discountDeducted
    };
  }, [itemsToReturn, exchangeItems, selectedSale, salesSettings, availableItems]);

  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser || !currentUser.companyId || !selectedSale) return;

    const finalPartyName = (completionData?.partyName || partyName || selectedSale.partyName || '').trim();
    const finalPartyNumber = (completionData?.partyNumber || partyNumber || selectedSale.partyNumber || '').trim();

    // --- SCRUM-973 FIX: Hard block at the transaction level ---
    const shouldAddCredit = finalBalance > 0 &&
      (modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note'));

    if (shouldAddCredit && finalPartyNumber.length < 3) {
      return setModal({ type: State.ERROR, message: 'A valid Customer Number is required to issue a Credit Note.' });
    }

    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'companies', companyId, 'sales', selectedSale.id);

      const originalItemsMap = new Map(selectedSale.items.map((item: any) => {
        const safeId = item.id || item.productId || 'UNKNOWN_ID';
        const oldQty = Number(item.quantity) || 1;

        let effectiveUnit = 0;
        if (item.effectiveUnitPrice !== undefined) {
          effectiveUnit = Number(item.effectiveUnitPrice);
        } else {
          const oldTotal = Number(item.finalPrice || item.amount || 0);
          effectiveUnit = oldQty > 0 ? (oldTotal / oldQty) : 0;
        }

        return [safeId, { ...item, _effectiveUnitPrice: effectiveUnit }];
      }));

      const originalInvoiceTotal = selectedSale.items.reduce((sum, item) => sum + (Number(item.finalPrice || 0)), 0);
      const validInventoryIds = new Set(availableItems.map(i => i.id));

      const gstScheme = salesSettings?.gstScheme || 'none';
      const isTaxEnabled = salesSettings?.enableTax ?? true;
      const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
      const taxType = salesSettings?.taxType ?? 'exclusive';

      let effectiveTaxMode = 'none';
      if (gstScheme === 'regular' && isTaxEnabled) {
        effectiveTaxMode = taxType;
      }

      // 2. HANDLE STOCK (RETURN)
      let returnedItemsGrossValue = 0;
      itemsToReturn.forEach(returnItem => {
        const originalItem = originalItemsMap.get(returnItem.originalItemId);
        if (originalItem) {
          originalItem.quantity = Number(originalItem.quantity) - Number(returnItem.quantity);
          returnedItemsGrossValue += (originalItem._effectiveUnitPrice * returnItem.quantity);
          if (originalItem.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
        }
        if (returnItem.originalItemId && validInventoryIds.has(returnItem.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', returnItem.originalItemId), {
            stock: firebaseIncrement(returnItem.quantity),
            updatedAt: serverTimestamp()
          });
        }
      });

      // 3. HANDLE STOCK (EXCHANGE)
      exchangeItems.forEach(exchangeItem => {
        const existingItem = Array.from(originalItemsMap.values()).find(i => i.id === exchangeItem.originalItemId);

        if (existingItem) {
          existingItem.quantity = Number(existingItem.quantity) + Number(exchangeItem.quantity);
        } else {
          const itemMaster = availableItems.find(i => i.id === exchangeItem.originalItemId);
          const unitPrice = exchangeItem.unitPrice;
          const lineTotal = unitPrice * exchangeItem.quantity;

          let lineBase = 0;
          let lineTax = 0;
          const itemTaxRate = (itemMaster?.tax !== undefined) ? Number(itemMaster.tax) : currentTaxRate;

          if (effectiveTaxMode !== 'none' && itemTaxRate > 0) {
            if (effectiveTaxMode === 'inclusive') {
              lineBase = toCurrency(lineTotal / (1 + (itemTaxRate / 100)));
              lineTax = toCurrency(lineTotal - lineBase);
            } else {
              lineBase = lineTotal;
              lineTax = toCurrency(lineTotal * (itemTaxRate / 100));
            }
          } else {
            lineBase = lineTotal;
            lineTax = 0;
          }

          originalItemsMap.set(exchangeItem.originalItemId, {
            id: exchangeItem.originalItemId,
            name: exchangeItem.name,
            mrp: exchangeItem.mrp,
            quantity: exchangeItem.quantity,
            discount: exchangeItem.discount || 0,
            discountPercentage: exchangeItem.discount || 0,
            finalPrice: effectiveTaxMode === 'exclusive' ? lineBase + lineTax : lineTotal,
            amount: lineTotal,
            unitPrice: unitPrice,
            purchasePrice: itemMaster?.purchasePrice || 0,
            tax: itemMaster?.tax || 0,
            taxRate: itemTaxRate,
            taxAmount: lineTax,
            taxableAmount: lineBase,
            taxType: effectiveTaxMode,
            itemGroupId: itemMaster?.itemGroupId || '',
            stock: 0,
            barcode: itemMaster?.barcode || '',
            restockQuantity: 0,
            isEditable: false,
            _effectiveUnitPrice: unitPrice,
            unitMultiplier: 1 // No multiplier math
          } as any);
        }

        if (exchangeItem.originalItemId && validInventoryIds.has(exchangeItem.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', exchangeItem.originalItemId), {
            stock: firebaseIncrement(-exchangeItem.quantity),
            updatedAt: serverTimestamp()
          });
        }
      });

      // 4. RECALCULATE BILL TOTALS (Fixed Tax Recalculation for returns)
      const newItemsList = Array.from(originalItemsMap.values()).map((item: any) => {
        const lineQty = Number(item.quantity);
        const lineUnit = Number(item._effectiveUnitPrice);
        const lineTotal = lineQty * lineUnit;

        const taxRate = Number(item.taxRate || item.tax || 0);
        const activeTaxType = item.taxType || effectiveTaxMode;

        let lineTaxableAmount = 0;
        let lineTaxAmount = 0;
        let lineFinalPrice = 0;

        if (activeTaxType === 'inclusive' && taxRate > 0) {
          lineFinalPrice = lineTotal;
          lineTaxableAmount = toCurrency(lineTotal / (1 + (taxRate / 100)));
          lineTaxAmount = toCurrency(lineTotal - lineTaxableAmount);
        } else if (activeTaxType === 'exclusive' && taxRate > 0) {
          lineTaxableAmount = lineTotal;
          lineTaxAmount = toCurrency(lineTotal * (taxRate / 100));
          lineFinalPrice = toCurrency(lineTaxableAmount + lineTaxAmount);
        } else {
          lineTaxableAmount = lineTotal;
          lineTaxAmount = 0;
          lineFinalPrice = lineTotal;
        }

        const { _effectiveUnitPrice, ...cleanItem } = item;

        cleanItem.effectiveUnitPrice = lineUnit;
        cleanItem.taxableAmount = lineTaxableAmount;
        cleanItem.taxAmount = lineTaxAmount;
        cleanItem.finalPrice = lineFinalPrice;

        return cleanItem;
      });

      const updatedTotals = newItemsList.reduce((acc, item) => {
        acc.subtotal += (Number(item.mrp) || 0) * (Number(item.quantity) || 0);
        acc.taxableAmount += (Number(item.taxableAmount) || 0);
        acc.taxAmount += (Number(item.taxAmount) || 0);
        acc.finalTotal += (Number(item.finalPrice) || 0);
        return acc;
      }, { subtotal: 0, taxableAmount: 0, taxAmount: 0, finalTotal: 0 });

      let discountDeductionAmount = 0;
      const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
      if (originalManualDiscount > 0 && originalInvoiceTotal > 0 && returnedItemsGrossValue > 0) {
        const ratio = returnedItemsGrossValue / originalInvoiceTotal;
        discountDeductionAmount = originalManualDiscount * ratio;
      }
      discountDeductionAmount = Math.round(discountDeductionAmount * 100) / 100;

      const newDrawerDiscount = Number(completionData?.discount) || 0;
      const newManualDiscount = Math.max(0, originalManualDiscount - discountDeductionAmount + newDrawerDiscount);

      const updatedFinalAmount = updatedTotals.finalTotal - newManualDiscount;
      const totalItemDiscount = updatedTotals.subtotal - updatedTotals.finalTotal;

      // 5. MERGE PAYMENTS & Deduct Cash Refund
      let updatedPaymentMethods: any = { ...(selectedSale.paymentMethods || {}) };
      if (completionData?.paymentDetails) {
        Object.entries(completionData.paymentDetails).forEach(([mode, amount]) => {
          if (mode !== 'due') updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
        });
      } else if (modeOfReturn === 'Cash Refund' && finalBalance > 0) {
        // If cash refund is processed without opening drawer, deduct it from cash.
        updatedPaymentMethods['cash'] = (updatedPaymentMethods['cash'] || 0) - finalBalance;
      }

      const totalPaidSoFar = Object.entries(updatedPaymentMethods)
        .filter(([k]) => k !== 'due')
        .reduce((sum, [_, val]) => sum + Number(val), 0);

      let dueAmount = updatedFinalAmount - totalPaidSoFar;
      if (dueAmount < 0.5) dueAmount = 0;
      updatedPaymentMethods.due = dueAmount;

      // 6. HISTORY & DB UPDATE
      const actualReturnMode = modeOfReturn === 'Exchange' && finalBalance > 0
        ? `Exchange & ${exchangeBalanceAction}`
        : modeOfReturn;

      const returnHistoryRecord = {
        id: crypto.randomUUID(),
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(i => ({ originalItemId: i.originalItemId, name: i.name, quantity: i.quantity, amount: i.amount })),
        exchangeItems: exchangeItems.map(i => ({ originalItemId: i.originalItemId, name: i.name, quantity: i.quantity, amount: i.amount })),
        finalBalance,
        discountDeducted: discountDeductionAmount,
        newDiscountApplied: newDrawerDiscount,
        modeOfReturn: actualReturnMode,
        partyName: finalPartyName
      };

      const updateData: any = {
        partyName: finalPartyName,
        partyNumber: finalPartyNumber,
        items: newItemsList,
        returnedItemsSnapshot: arrayUnion(...itemsToReturn.map(i => ({
          id: i.originalItemId,
          name: i.name,
          quantity: i.quantity,
          finalPrice: i.amount,
          mrp: i.mrp,
        }))),
        subtotal: updatedTotals.subtotal,
        taxableAmount: updatedTotals.taxableAmount,
        taxAmount: updatedTotals.taxAmount,
        discount: totalItemDiscount + newManualDiscount,
        manualDiscount: newManualDiscount,
        totalAmount: updatedFinalAmount,
        returnHistory: arrayUnion(returnHistoryRecord),
        paymentMethods: updatedPaymentMethods,
        isReturned: true,
        lastUpdated: serverTimestamp()
      };

      batch.update(saleRef, updateData);

      if (finalPartyNumber.length >= 3) {
        const customerRef = doc(db, 'companies', companyId, 'customers', finalPartyNumber);
        const customerUpdateData: any = { name: finalPartyName, number: finalPartyNumber, companyId, lastUpdatedAt: serverTimestamp() };

        if (shouldAddCredit) {
          customerUpdateData.creditBalance = firebaseIncrement(finalBalance);
        }
        batch.set(customerRef, customerUpdateData, { merge: true });
      }

      await batch.commit();
      setModal({ type: State.SUCCESS, message: 'Return processed successfully!' });
      setTimeout(() => navigate(ROUTES.JOURNAL), 1500);
    } catch (err: any) {
      console.error(err);
      setModal({ type: State.ERROR, message: `Failed: ${err.message}` });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  const isDueSale = (selectedSale?.paymentMethods?.due ?? 0) > 0;
  useEffect(() => {
    if (isDueSale) {
      setModeOfReturn('Exchange');
    }
  }, [isDueSale]);

  const handleProcessReturn = () => {
    if (modeOfReturn === 'Exchange' && exchangeItems.length == 0) return setModal({ type: State.ERROR, message: 'No exchange items selected.' });
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) return setModal({ type: State.ERROR, message: 'No items selected.' });

    // --- SCRUM-973 FIX: Block at the UI level ---
    const isCreditNote = modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note');
    if (isCreditNote && finalBalance > 0 && partyNumber.trim().length < 3) {
      return setModal({ type: State.ERROR, message: 'A valid Customer Number is required to issue a Credit Note.' });
    }

    if (modeOfReturn === 'Cash Refund' && finalBalance > 0) saveReturnTransaction();
    else if (finalBalance >= 0) saveReturnTransaction();
    else setIsDrawerOpen(true);
  };

  const getBalanceLabel = () => {
    if (finalBalance < 0) return 'Payment Due';
    if (modeOfReturn === 'Cash Refund') return 'Refund Amount';
    if (modeOfReturn === 'Exchange' && finalBalance > 0 && exchangeBalanceAction === 'Cash Refund') return 'Refund Amount';
    return 'Credit Due';
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-300 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">
      <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">Sales Return</h1>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />
      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* --- LEFT PANEL --- */}
        {/* REVERTED: Whole left panel scrolls naturally (overflow-y-auto) */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto relative">

          {/* ADDED: pb-32 to allow scrolling past the floating footer button */}
          <div className="p-2 md:p-2 pb-32 md:pb-2">

            {/* Search Section */}
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
                {/* Sale Details */}
                <div className="bg-white p-3 rounded-sm shadow-md mb-4 border border-gray-200">
                  <div className="space-y-3 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                      <div><label className="block text-xs font-bold text-gray-500 uppercase">Party</label><input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                    </div>
                    <div className="relative" ref={customerDropdownRef}>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                      <input
                        type="text"
                        value={partyNumber}
                        maxLength={10}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setPartyNumber(val);
                          setPartyName('');
                          setIsCustomerDropdownOpen(true);
                        }}
                        onFocus={() => setIsCustomerDropdownOpen(true)}
                        className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                        autoComplete="off"
                        placeholder="Search customer by number or name..."
                      />
                      {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                        <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filteredCustomers.map((customer) => (
                            <div key={customer.id} className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0" onClick={() => handleSelectCustomer(customer)}>
                              <p className="font-semibold text-sm text-gray-800">{customer.name}</p>
                              <p className="text-xs text-gray-500">{customer.number}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>

                  {/* Normal list, scroll controlled by main panel */}
                  <div className="flex flex-col gap-2">
                    {originalSaleItems.map((item) => (
                      <ReturnListItem key={item.id} item={item} isSelected={selectedReturnIds.has(item.id)} onToggle={handleToggleReturnItem} onQuantityChange={(id, val) => handleListChange(setOriginalSaleItems, id, 'quantity', val)} showMrp={true} />
                    ))}
                  </div>
                </div>

                {/* Exchange Section */}
                <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                  <div className="md:hidden mb-4">
                    <label className="block font-medium text-sm mb-1">Transaction Type</label>
                    <select value={modeOfReturn} onChange={(e) => {
                      const value = e.target.value;
                      setModeOfReturn(value)
                      if (value !== 'Exchange')
                        setExchangeItems([])
                    }}
                      className="w-full p-2 border rounded bg-white">
                      <option disabled={isDueSale}>Credit Note</option>
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
                      <div className="flex gap-2 text-xs text-red-500 mb-2">
                        {discountInfo && <span>{discountInfo}</span>}
                        {priceInfo && <span>{priceInfo}</span>}
                      </div>
                      {exchangeItems.length > 0 && (
                        <div className="overflow-hidden">
                          <div className=" px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase mb-2">Exchange Cart</div>

                          {/* Normal container, scroll controlled by main panel */}
                          <div className="">
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
                              onOpenEditDrawer={handleOpenEditDrawer}
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
                            <ItemEditDrawer
                              item={selectedItemForEdit}
                              isOpen={isItemDrawerOpen}
                              onClose={handleCloseEditDrawer}
                              onSaveSuccess={handleSaveSuccess}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Mobile Summary */}
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
                    {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                      <select
                        value={exchangeBalanceAction}
                        onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
                        className="bg-transparent border border-gray-300  rounded-sm hover:border-gray-400 focus:border-blue-500 outline-none cursor-pointer py-1 pr-2 text-gray-700 transition-colors"
                      >
                        <option value="Credit Note">Credit Due</option>
                        <option value="Cash Refund">Cash Refund</option>
                      </select>
                    ) : (
                      <p>{getBalanceLabel()}</p>
                    )}
                    <p>₹{Math.abs(finalBalance).toFixed(2)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* --- RIGHT PANEL --- */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedSale ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
                <select value={modeOfReturn} onChange={(e) => {
                  const value = e.target.value;
                  setModeOfReturn(value)
                  if (value !== 'Exchange')
                    setExchangeItems([])
                }} className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none">
                  <option disabled={isDueSale} >Credit Note</option>
                  <option>Exchange</option>
                  <option>Cash Refund</option>
                </select>
              </div>
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
                  <span>₹{totalReturnValue.toFixed(2)}</span>
                </div>
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-blue-600 mt-2">
                    <span>Less: New Items Value</span>
                    <span>- ₹{totalExchangeValue.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="mt-auto pt-4 border-t border-gray-100">
                <div className="flex justify-between items-end mb-4">
                  {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                    <select
                      value={exchangeBalanceAction}
                      onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
                      className="text-gray-500 font-medium bg-transparent border border-gray-200 rounded-sm hover:border-gray-400 focus:border-blue-500 outline-none cursor-pointer pb-1 pr-2 transition-colors"
                    >
                      <option value="Credit Note">Credit Due</option>
                      <option value="Cash Refund">Cash Refund</option>
                    </select>
                  ) : (
                    <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
                  )}
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

        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18 pointer-events-none">
          {selectedSale && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md pointer-events-auto">Process Transaction</CustomButton>)}
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

      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isItemDrawerOpen}
        onClose={handleCloseEditDrawer}
        onSaveSuccess={handleSaveSuccess}
      />

    </div>
  );
};

export default SalesReturnPage;