import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth, useDatabase } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import type { Item } from '../../constants/models';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { Button } from '../../Components/ui/button';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import type { CartItem } from '../../Components/CartItem';
import { usePurchaseSettings } from '../../context/SettingsContext';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { Spinner } from '../../Components/ui/spinner';
import { formatCurrency } from '../../utils/formatters';
import {
  fetchPurchaseReturnInitialData,
  saveReturnTransaction as saveReturnTransactionApi,
  type PurchaseData,
  type Party,
} from '../../services/purchase/purchaseReturn.service';
import { PurchaseReturnHeader } from './components/PurchaseReturnHeader';
import { PurchaseReturnVendorSection } from './components/PurchaseReturnVendorSection';
import { PurchaseReturnItemsPanel } from './components/PurchaseReturnItemsPanel';
import { PurchaseReturnExchangePanel } from './components/PurchaseReturnExchangePanel';
import { PurchaseReturnSummaryCard } from './components/PurchaseReturnSummaryCard';

export type { PurchaseData };

export interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  mrp: number;
  tax?: number;
  hsnSac?: string;
  barcode?: string;
  unit?: string;
  stock?: number;
  maxReturnQuantity?: number;
  unitMultiplier?: number;
}

export interface ReturnCartItem extends CartItem {
  originalItemId: string;
  unitPrice: number;
  amount: number;
  mrp: number;
  tax?: number;
  hsnSac?: string;
  barcode?: string;
  unit?: string;
  stock?: number;
}

const PurchaseReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseId } = useParams();
  const { state } = useLocation();

  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierNumber, setSupplierNumber] = useState<string>('');
  const [supplierAddress, setSupplierAddress] = useState<string>('');
  const [supplierGstin, setSupplierGstin] = useState<string>('');

  const [modeOfReturn, setModeOfReturn] = useState<string>('Exchange');
  const [exchangeBalanceAction, setExchangeBalanceAction] = useState<'Debit Note' | 'Cash Refund'>('Debit Note');
  const [newItemsReceived, setNewItemsReceived] = useState<ReturnCartItem[]>([]);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [originalPurchaseItems, setOriginalPurchaseItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [purchaseList, setPurchaseList] = useState<PurchaseData[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseData | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Purchase Search Dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Party (Customer) Search Dropdown States
  const [availableParties, setAvailableParties] = useState<Party[]>([]);

  // 1. Party Number Dropdown
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState<boolean>(false);
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  // 2. Party Name Dropdown
  const [isNameDropdownOpen, setIsNameDropdownOpen] = useState<boolean>(false);
  const nameDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'purchase' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const [newItemsSearchQuery, setNewItemsSearchQuery] = useState<string>('');
  const [returnItemSearchQuery, setReturnItemSearchQuery] = useState<string>('');

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
  const { purchaseSettings } = usePurchaseSettings();
  const [activeTaxMode, setActiveTaxMode] = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');

  const itemsToReturn = useMemo(() =>
    originalPurchaseItems.filter(item => selectedReturnIds.has(item.id)),
    [originalPurchaseItems, selectedReturnIds]
  );
  const isPurchaseUnpaid = useMemo(() => {
    if (!selectedPurchase) return true;
    const totalPaid = Object.entries(selectedPurchase.paymentMethods || {})
      .filter(([mode]) => mode !== 'due')
      .reduce((sum, [, val]) => sum + Number(val || 0), 0);
    return totalPaid <= 0;
  }, [selectedPurchase]);
  const filteredReturnItems = useMemo(() => {
    const q = returnItemSearchQuery.trim().toLowerCase();
    if (!q) return originalPurchaseItems;

    return [...originalPurchaseItems].sort((a, b) => {
      const aMatch = (a.name || '').toLowerCase().includes(q);
      const bMatch = (b.name || '').toLowerCase().includes(q);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }, [originalPurchaseItems, returnItemSearchQuery]);
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

  useEffect(() => {
    if (!currentUser || !currentUser.companyId || !dbOperations) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const {
          recentPurchases,
          availableItems: allItems,
          availableParties: partiesData,
          specificPurchase,
        } = await fetchPurchaseReturnInitialData(
          currentUser.companyId,
          () => dbOperations.syncItems(),
          purchaseId,
          !!state?.invoiceData,
        );

        if (state?.invoiceData) {
          handleSelectPurchase(state.invoiceData);
        }
        else if (specificPurchase) {
          if (!recentPurchases.find(p => p.id === specificPurchase.id)) {
            recentPurchases.unshift(specificPurchase);
          }
          handleSelectPurchase(specificPurchase);
        }
        else if (purchaseId) {
          const preselected = recentPurchases.find(p => p.id === purchaseId);
          if (preselected) {
            handleSelectPurchase(preselected);
          }
        }

        setPurchaseList(recentPurchases);
        setAvailableItems(allItems);
        setAvailableParties(partiesData);

      } catch (err) {
        setError('Failed to load initial data.');
        console.error("Error fetching data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser, dbOperations, purchaseId, state]);
  useEffect(() => {
    if (isPurchaseUnpaid && modeOfReturn === 'Debit Note') {
      setModeOfReturn('Exchange');
    }
  }, [isPurchaseUnpaid, modeOfReturn]);
  // Click Outside Handler (Modified to close both dropdowns)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
        setIsPartyDropdownOpen(false);
      }
      if (nameDropdownRef.current && !nameDropdownRef.current.contains(event.target as Node)) {
        setIsNameDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredList = useMemo(() => purchaseList
    .filter(p => !p.isReturned)
    .filter(p =>
      p.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
    [purchaseList, searchQuery]
  );

  // Filter based on NUMBER input
  const filteredPartiesByNumber = useMemo(() => {
    if (!supplierNumber) return [];
    const searchParam = String(supplierNumber).trim().toLowerCase();
    if (!searchParam) return [];

    return availableParties.filter(c => {
      const pNumber = String(c.number ?? '').toLowerCase();
      const pName = String(c.name ?? '').toLowerCase();
      return pNumber.includes(searchParam) || pName.includes(searchParam);
    });
  }, [availableParties, supplierNumber]);

  // Filter based on NAME input
  const filteredPartiesByName = useMemo(() => {
    if (!supplierName) return [];
    const searchParam = String(supplierName).trim().toLowerCase();
    if (!searchParam) return [];

    return availableParties.filter(c => {
      const pName = String(c.name ?? '').toLowerCase();
      const pNumber = String(c.number ?? '').toLowerCase();
      return pName.includes(searchParam) || pNumber.includes(searchParam);
    });
  }, [availableParties, supplierName]);

  const handleSelectParty = (party: Party) => {
    setSupplierNumber(party.number);
    setSupplierName(party.name);
    // Close both
    setIsPartyDropdownOpen(false);
    setIsNameDropdownOpen(false);
  };

  const handleSupplierNumberInputChange = (rawValue: string) => {
    const val = rawValue.replace(/\D/g, '').slice(0, 10);
    setSupplierNumber(val);
    setSupplierName('');
  };

  const handleSelectPurchase = (purchase: PurchaseData) => {
    setSelectedPurchase(purchase);
    setSupplierName(purchase.partyName);
    setSupplierNumber(purchase.partyNumber || '');
    setSupplierAddress(purchase.partyAddress || '');
    setSupplierGstin(purchase.partyGstin || '');

    // STRICTLY INHERIT FROM THE ORIGINAL BILL
    if (purchase.taxType) {
      setActiveTaxMode((purchase.taxType === 'exempt' ? 'none' : purchase.taxType) as any);
    } else {
      setActiveTaxMode('exclusive'); // Fallback for old bills
    }

    setOriginalPurchaseItems(purchase.items.map((item: any) => {
      const itemData = item.data || item;
      const quantity = itemData.quantity || 1;
      const unitPrice = itemData.purchasePrice ?? itemData.finalPrice ?? 0;

      return {
        id: crypto.randomUUID(),
        originalItemId: itemData.id,
        name: itemData.name,
        quantity: quantity,
        unitPrice: unitPrice,
        maxReturnQuantity: quantity,
        amount: unitPrice * quantity,
        mrp: itemData.mrp || 0,
        tax: itemData.tax || 0,
        hsnSac: itemData.hsnSac || '',
        barcode: itemData.barcode || '',
        unit: itemData.unit || '',
        stock: itemData.stock || 0,
        unitMultiplier: itemData.unitMultiplier || 1
      };
    }));

    setSelectedReturnIds(new Set());
    setNewItemsReceived([]);
    setNewItemsSearchQuery('');
    setReturnItemSearchQuery('');
    setSearchQuery(purchase.invoiceNumber || purchase.partyName);
    setIsDropdownOpen(false);
  };

  const handleToggleReturnItem = (itemId: string) => {
    setSelectedReturnIds(prevIds => {
      const newIds = new Set(prevIds);
      if (newIds.has(itemId)) {
        newIds.delete(itemId);
      } else {
        newIds.add(itemId);
      }
      return newIds;
    });
  };

  const handleClear = () => {
    setSelectedPurchase(null);
    setSupplierName('');
    setSupplierNumber('');
    setSupplierAddress('');
    setSupplierGstin('');
    setSelectedReturnIds(new Set());
    setNewItemsReceived([]);
    setSearchQuery('');
    setNewItemsSearchQuery('');
    setReturnItemSearchQuery('');
    navigate(ROUTES.PURCHASE_RETURN);
  };

  const handleItemChange = (
    listSetter: React.Dispatch<React.SetStateAction<TransactionItem[]>>,
    id: string,
    field: keyof TransactionItem,
    value: string | number
  ) => {
    listSetter(prev => prev.map(item => {
      if (item.id === id) {
        let updatedValue = value;

        // --- VALIDATION LOGIC ---
        if (field === 'quantity') {
          const maxQty = item.maxReturnQuantity || 0;
          const newQty = Number(value);

          if (newQty > maxQty) {
            setModal({
              message: `Cannot return ${newQty} items. Only ${maxQty} were purchased.`,
              type: State.ERROR
            });
            updatedValue = maxQty;
          } else if (newQty < 1) {
            updatedValue = 1;
          }
        }

        const updatedItem = { ...item, [field]: updatedValue };

        // Recalculate Amount
        if (field === 'quantity' || field === 'unitPrice') {
          updatedItem.amount = Number(updatedItem.quantity) * Number(updatedItem.unitPrice);
        }

        return updatedItem;
      }
      return item;
    }));
  };

  // --- LOGIC 1: ADD NEW ITEM (Purchase Price Priority) ---
  const handleNewItemSelected = (item: Item) => {
    if (!item) return;

    const mrp = Number(item.mrp || 0);
    const masterPurchasePrice = Number(item.purchasePrice || 0);

    let finalNetPrice = 0;
    let calculatedDiscount = 0;

    if (masterPurchasePrice > 0) {
      finalNetPrice = masterPurchasePrice;
      if (mrp > 0) {
        calculatedDiscount = ((mrp - masterPurchasePrice) / mrp) * 100;
      }
    } else {
      finalNetPrice = 0;
      calculatedDiscount = 0;
    }

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
    setNewItemsReceived(prev => prev.map(item => {
      if (item.id === id) {
        const rawVal = item.customPrice;
        const currentPriceVal = parseFloat(String(rawVal));

        if (item.customPrice === '' || isNaN(currentPriceVal)) {
          return { ...item, unitPrice: 0, amount: 0, customPrice: 0 };
        }

        let d = item.discount || 0;
        const mrp = item.mrp || 0;

        if (mrp > 0) {
          d = Math.max(0, ((mrp - currentPriceVal) / mrp) * 100);
        }

        return {
          ...item,
          unitPrice: currentPriceVal,
          amount: currentPriceVal * item.quantity,
          customPrice: currentPriceVal,
          discount: parseFloat(d.toFixed(2))
        };
      }
      return item;
    }));
  };

  // --- LOGIC 3: NEW ITEM DISCOUNT CHANGE (Updates Price) ---
  const handleNewItemDiscountChange = (id: string, val: string | number) => {
    const newDiscount = parseFloat(String(val)) || 0;

    setNewItemsReceived(prev => prev.map(item => {
      if (item.id === id) {
        const mrp = item.mrp || 0;
        let newNetPrice = item.unitPrice;

        if (mrp > 0) {
          newNetPrice = Math.max(0, mrp * (1 - newDiscount / 100));
        }

        newNetPrice = Math.round((newNetPrice + Number.EPSILON) * 100) / 100;

        return {
          ...item,
          discount: newDiscount,
          unitPrice: newNetPrice,
          customPrice: newNetPrice,
          amount: newNetPrice * item.quantity
        };
      }
      return item;
    }));
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

  const handleBarcodeScanned = (decodedText: string) => {
    const currentPurpose = scannerPurpose;
    setScannerPurpose(null);

    if (currentPurpose === 'purchase') {
      const foundPurchase = purchaseList.find(p => (p.id === decodedText || p.invoiceNumber === decodedText) && !p.isReturned);
      if (foundPurchase) {
        handleSelectPurchase(foundPurchase);
      } else {
        setModal({ message: 'No active purchase found.', type: State.ERROR });
      }
    } else if (currentPurpose === 'item') {
      const itemToAdd = availableItems.find(item => item.barcode === decodedText);
      if (itemToAdd) {
        handleNewItemSelected(itemToAdd);
        setModal({ message: `Added: ${itemToAdd.name}`, type: State.SUCCESS });
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    }
  };

  // --- UI CALCULATIONS (With Discount, Tax, and MRP) ---
  const { totalReturnValue, totalNewItemsValue, finalBalance, discountDeducted, totalTax, totalMrp } = useMemo(() => {
    let returnGross = 0;
    let returnExclusiveTax = 0;
    let returnTaxAmount = 0;
    let returnMrpTotal = 0;

    itemsToReturn.forEach(returnItem => {
      returnGross += returnItem.amount;

      const baseReturnPrice = returnItem.mrp > 0 ? returnItem.mrp : returnItem.unitPrice;
      returnMrpTotal += baseReturnPrice * returnItem.quantity;

      const origItem = selectedPurchase?.items.find(i => (i.id || (i as any).productId) === returnItem.originalItemId);
      if (origItem) {
        const taxType = origItem.taxType === 'exempt' ? 'exempt' : (origItem.taxType || 'exempt');
        const taxRate = Number(origItem.taxRate || origItem.tax || 0);

        if (taxType === 'inclusive' && taxRate > 0) {
          const base = returnItem.amount / (1 + (taxRate / 100));
          returnTaxAmount += (returnItem.amount - base);
        } else if (taxType === 'exclusive' && taxRate > 0) {
          const tax = returnItem.amount * (taxRate / 100);
          returnTaxAmount += tax;
          returnExclusiveTax += tax;
        }
      }
    });

    let newItemsGross = 0;
    let newItemsExclusiveTax = 0;
    let newItemsTaxAmount = 0;
    let newItemsMrpTotal = 0;

    const effectiveTaxMode = activeTaxMode; // Simply use what the original bill dictated

    newItemsReceived.forEach(newItem => {
      newItemsGross += newItem.amount;

      const baseExchangePrice = newItem.mrp > 0 ? newItem.mrp : (newItem.unitPrice || 0);
      newItemsMrpTotal += baseExchangePrice * newItem.quantity;

      const itemMaster = availableItems.find(i => i.id === newItem.originalItemId);
      const itemTaxRate = (itemMaster?.tax !== undefined) ? Number(itemMaster.tax) : 0;

      if (effectiveTaxMode === 'inclusive' && itemTaxRate > 0) {
        const base = newItem.amount / (1 + (itemTaxRate / 100));
        newItemsTaxAmount += (newItem.amount - base);
      } else if (effectiveTaxMode === 'exclusive' && itemTaxRate > 0) {
        const tax = newItem.amount * (itemTaxRate / 100);
        newItemsTaxAmount += tax;
        newItemsExclusiveTax += tax;
      }
    });

    let discountDeducted = 0;
    if (selectedPurchase) {
      const originalGross = selectedPurchase.items.reduce((sum, item: any) => sum + (Number(item.finalPrice || 0)), 0);
      const originalManualDiscount = Number(selectedPurchase.manualDiscount) || 0;

      if (originalGross > 0 && originalManualDiscount > 0) {
        const ratio = (returnGross + returnExclusiveTax) / originalGross;
        discountDeducted = Math.round(originalManualDiscount * ratio * 100) / 100;
      }
    }

    const netReturnVal = returnGross + returnExclusiveTax - discountDeducted;
    const netNewItemsVal = newItemsGross + newItemsExclusiveTax;
    let finalBalance = netReturnVal - netNewItemsVal;

    const paidAmountOnPurchase = Object.entries(selectedPurchase?.paymentMethods || {})
      .filter(([mode]) => mode !== 'due')
      .reduce((sum, [, val]) => sum + Number(val || 0), 0);

    finalBalance = finalBalance > 0
      ? Math.min(finalBalance, paidAmountOnPurchase)
      : finalBalance;

    return {
      totalReturnValue: netReturnVal,
      totalNewItemsValue: netNewItemsVal,
      finalBalance: Math.round(finalBalance),
      discountDeducted,
      totalTax: Math.abs(newItemsTaxAmount - returnTaxAmount),
      totalMrp: Math.abs(newItemsMrpTotal - returnMrpTotal)
    };
  }, [itemsToReturn, newItemsReceived, selectedPurchase, purchaseSettings, availableItems, activeTaxMode]);


  // --- SAVE LOGIC ---
  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser || !currentUser.companyId || !selectedPurchase) return;

    const finalSupplierName = (completionData?.partyName || supplierName || selectedPurchase.partyName || '').trim();
    const finalSupplierNumber = (completionData?.partyNumber || supplierNumber || selectedPurchase.partyNumber || '').trim();

    // --- Validates both Name and Number for Debit Notes ---
    const isCreatingDebitNote = modeOfReturn === 'Debit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Debit Note' && finalBalance > 0);

    if (isCreatingDebitNote && (!finalSupplierName || !finalSupplierNumber)) {
      setModal({ type: State.ERROR, message: 'Cannot create Debit Note: Both Party Name and Party Number are required.' });
      return;
    }

    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      await saveReturnTransactionApi({
        companyId,
        selectedPurchase,
        itemsToReturn,
        newItemsReceived,
        availableItems,
        activeTaxMode,
        discountDeducted,
        finalBalance,
        modeOfReturn,
        exchangeBalanceAction,
        finalSupplierName,
        finalSupplierNumber,
        supplierAddress,
        supplierGstin,
        completionDiscount: completionData?.discount || 0,
        completionPaymentDetails: completionData?.paymentDetails ?? null,
        completionPartyAddress: completionData?.partyAddress,
        completionPartyGST: completionData?.partyGST,
      });

      setModal({ type: State.SUCCESS, message: 'Purchase Return processed successfully!' });
      setTimeout(() => navigate(ROUTES.JOURNAL), 1500);
    } catch (error: any) {
      console.error('Error processing return:', error);
      if (error.code === 'not-found') {
        setModal({ type: State.ERROR, message: 'Stock update failed: Item Barcode/ID not found.' });
      } else {
        setModal({ type: State.ERROR, message: `Failed to process return: ${error.message}` });
      }
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  // --- STRICT QUANTITY CHECK ---
  const handleProcessReturn = () => {
    if (!currentUser || !selectedPurchase) return;

    if (itemsToReturn.length === 0 && newItemsReceived.length === 0) {
      return setModal({ type: State.ERROR, message: 'No items have been returned or received.' });
    }
    if (modeOfReturn === 'Exchange' && newItemsReceived.length === 0) {
      return setModal({
        type: State.ERROR,
        message: 'Please add at least one new item to complete the exchange.'
      });
    }

    for (const returnItem of itemsToReturn) {
      const originalItem = selectedPurchase.items.find(i => i.id === returnItem.originalItemId);

      if (!originalItem) {
        return setModal({ type: State.ERROR, message: `Item "${returnItem.name}" not found in original bill.` });
      }

      const currentBillQty = originalItem.quantity || 0;

      if (returnItem.quantity > currentBillQty) {
        return setModal({
          type: State.ERROR,
          message: `Error: You are trying to return ${returnItem.quantity} of "${returnItem.name}", but only ${currentBillQty} remain in this bill.`
        });
      }
    }

    if (modeOfReturn === 'Cash Refund' && finalBalance > 0) {
      saveReturnTransaction();
    }
    else if (finalBalance >= 0) {
      saveReturnTransaction();
    }
    else {
      setIsDrawerOpen(true);
    }
  };
  const getBalanceLabel = () => {
    if (finalBalance < 0) return 'Payment Due';
    if (modeOfReturn === 'Cash Refund') return 'Refund Received';
    if (modeOfReturn === 'Exchange' && finalBalance > 0 && exchangeBalanceAction === 'Cash Refund') return 'Refund Received';
    return 'Debit Note';
  };

  if (isLoading) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <Spinner size="xl" />
      <p className="text-sm font-medium">Loading...</p>
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-muted">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      <PurchaseReturnHeader />

      <div className="relative flex flex-1 flex-col overflow-hidden md:flex-row">

        <div className="relative w-full flex-1 overflow-y-auto p-1 pb-24 md:w-[65%] md:border-r md:border-border md:p-2 md:pb-6">

          <PurchaseReturnVendorSection
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            isDropdownOpen={isDropdownOpen}
            onDropdownOpenChange={setIsDropdownOpen}
            dropdownRef={dropdownRef}
            filteredList={filteredList}
            selectedPurchase={selectedPurchase}
            onSelectPurchase={handleSelectPurchase}
            onClear={handleClear}
            returnDate={returnDate}
            onReturnDateChange={setReturnDate}
            supplierName={supplierName}
            onSupplierNameChange={setSupplierName}
            isNameDropdownOpen={isNameDropdownOpen}
            onNameDropdownOpenChange={setIsNameDropdownOpen}
            nameDropdownRef={nameDropdownRef}
            filteredPartiesByName={filteredPartiesByName}
            supplierNumber={supplierNumber}
            onSupplierNumberChange={handleSupplierNumberInputChange}
            isPartyDropdownOpen={isPartyDropdownOpen}
            onPartyDropdownOpenChange={setIsPartyDropdownOpen}
            partyDropdownRef={partyDropdownRef}
            filteredPartiesByNumber={filteredPartiesByNumber}
            onSelectParty={handleSelectParty}
          />

          {selectedPurchase && (
            <>
              <PurchaseReturnItemsPanel
                searchQuery={returnItemSearchQuery}
                onSearchQueryChange={setReturnItemSearchQuery}
                onScanItem={() => setScannerPurpose('item')}
                originalPurchaseItemsCount={originalPurchaseItems.length}
                filteredReturnItems={filteredReturnItems}
                selectedReturnIds={selectedReturnIds}
                onToggleReturnItem={handleToggleReturnItem}
                onQuantityChange={(id, val) => handleItemChange(setOriginalPurchaseItems, id, 'quantity', val)}
              />

              <PurchaseReturnExchangePanel
                modeOfReturn={modeOfReturn}
                onModeOfReturnChange={setModeOfReturn}
                isPurchaseUnpaid={isPurchaseUnpaid}
                availableItems={availableItems}
                onNewItemSelected={handleNewItemSelected}
                isLoading={isLoading}
                error={error}
                onNewItemSearchChange={setNewItemsSearchQuery}
                onScanItem={() => setScannerPurpose('item')}
                displayedNewItemsReceived={displayedNewItemsReceived}
                setModal={setModal}
                onOpenEditDrawer={handleOpenEditDrawer}
                onRemoveNewItem={handleRemoveNewItem}
                onDiscountChange={handleNewItemDiscountChange}
                onCustomPriceChange={handleNewItemPriceChange}
                onCustomPriceBlur={handleNewItemPriceBlur}
                onQuantityChange={handleNewItemQuantity}
              />

              {/* Mobile Only: Inline Summary */}
              <div className="mt-2 rounded-xl border border-border bg-card p-2 shadow-sm md:hidden">
                <div className="flex items-center justify-between text-sm text-destructive">
                  <p>Return Value</p><p className="font-medium">{formatCurrency(totalReturnValue)}</p>
                </div>
                {discountDeducted > 0 && (
                  <div className="mt-1 flex items-center justify-between text-xs text-warning">
                    <p>Less Bill Discount</p><p>- {formatCurrency(discountDeducted)}</p>
                  </div>
                )}
                {modeOfReturn === 'Exchange' && (
                  <div className="mt-1 flex items-center justify-between text-sm text-success">
                    <p>New Items Value</p><p className="font-medium">{formatCurrency(totalNewItemsValue)}</p>
                  </div>
                )}
                <div className="my-2 border-t border-border"></div>
                <div className={`flex items-center justify-between text-lg font-bold ${finalBalance >= 0 ? 'text-success' : 'text-warning'}`}>
                  {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                    <select
                      value={exchangeBalanceAction}
                      onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
                      className="cursor-pointer border-b-2 border-border bg-transparent py-1 pr-2 text-foreground outline-none transition-colors hover:border-muted-foreground focus:border-primary"
                    >
                      <option value="Debit Note">Debit Note</option>
                      <option value="Cash Refund">Cash Refund</option>
                    </select>
                  ) : (
                    <p>{getBalanceLabel()}</p>
                  )}
                  <p>{formatCurrency(Math.abs(finalBalance))}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* --- RIGHT PANEL (Desktop Only: 35%) --- */}
        <PurchaseReturnSummaryCard
          hasSelectedPurchase={!!selectedPurchase}
          modeOfReturn={modeOfReturn}
          onModeOfReturnChange={setModeOfReturn}
          isPurchaseUnpaid={isPurchaseUnpaid}
          totalReturnValue={totalReturnValue}
          discountDeducted={discountDeducted}
          totalNewItemsValue={totalNewItemsValue}
          finalBalance={finalBalance}
          exchangeBalanceAction={exchangeBalanceAction}
          onExchangeBalanceActionChange={setExchangeBalanceAction}
          balanceLabel={getBalanceLabel()}
          onProcessReturn={handleProcessReturn}
        />

        {/* --- MOBILE FOOTER (Sticky) --- */}
        <div className="fixed bottom-0 left-0 right-0 flex justify-center bg-transparent p-2 pb-18 md:hidden">
          {selectedPurchase && (
            <Button onClick={handleProcessReturn} className="w-full py-3 text-lg font-semibold shadow-md">
              Process Transaction
            </Button>
          )}
        </div>

      </div>

      <PaymentDrawer
        mode='purchase'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}

        totalTax={totalTax}
        taxMode={activeTaxMode}
        onTaxModeChange={setActiveTaxMode}
        isTaxToggleLocked={true} // Locked because it inherits the original invoice's tax mode
        totalMrp={totalMrp}

        allowDueBilling={true}

        onPaymentComplete={saveReturnTransaction}
        initialPartyName={supplierName}
        initialPartyNumber={supplierNumber}
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

export default PurchaseReturnPage;
