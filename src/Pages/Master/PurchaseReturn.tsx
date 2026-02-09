import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  type DocumentData,
  orderBy,
  limit,
  type DocumentSnapshot,
  writeBatch,
  increment as firebaseIncrement,
  arrayUnion,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { useAuth, useDatabase } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import type { Item, PurchaseItem as OriginalPurchaseItem } from '../../constants/models';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { ReturnListItem } from '../../Components/ReturnListItem';
import { IconScanCircle } from '../../constants/Icons';
import { GenericCartList, type CartItem } from '../../Components/CartItem';

interface PurchaseData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  partyGstin?: string;
  items: OriginalPurchaseItem[];
  totalAmount: number;
  manualDiscount?: number;
  createdAt: any;
  isReturned?: boolean;
  paymentMethods?: { [key: string]: number };
}

interface TransactionItem {
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
}

interface ReturnCartItem extends CartItem {
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

// Unified Party Interface (Customers DB)
interface Party {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}

const PurchaseReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseId } = useParams();
  const { state } = useLocation();
  const location = useLocation();

  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierNumber, setSupplierNumber] = useState<string>('');
  const [supplierAddress, setSupplierAddress] = useState<string>('');
  const [supplierGstin, setSupplierGstin] = useState<string>('');

  const [modeOfReturn, setModeOfReturn] = useState<string>('Exchange');
  const [newItemsReceived, setNewItemsReceived] = useState<ReturnCartItem[]>([]);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const isActive = (path: string) => location.pathname === path;

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

  // 2. Party Name Dropdown (NEW)
  const [isNameDropdownOpen, setIsNameDropdownOpen] = useState<boolean>(false);
  const nameDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'purchase' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const itemsToReturn = useMemo(() =>
    originalPurchaseItems.filter(item => selectedReturnIds.has(item.id)),
    [originalPurchaseItems, selectedReturnIds]
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
        const purchasesQuery = query(
          collection(db, 'companies', currentUser.companyId, 'purchases'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );

        const partiesQuery = query(collection(db, 'companies', currentUser.companyId, 'customers'), limit(100));

        let specificPurchasePromise: Promise<DocumentSnapshot<DocumentData, DocumentData> | null> = Promise.resolve(null);

        if (purchaseId && !state?.invoiceData) {
          const specificRef = doc(db, 'companies', currentUser.companyId, 'purchases', purchaseId);
          specificPurchasePromise = getDoc(specificRef);
        }

        const [purchasesSnapshot, allItems, partiesSnap, specificPurchaseSnap] = await Promise.all([
          getDocs(purchasesQuery),
          dbOperations.syncItems(),
          getDocs(partiesQuery),
          specificPurchasePromise
        ]);

        const recentPurchases: PurchaseData[] = purchasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseData));
        const partiesData = partiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Party));

        if (state?.invoiceData) {
          handleSelectPurchase(state.invoiceData);
        }
        else if (specificPurchaseSnap && specificPurchaseSnap.exists()) {
          const specificData = { id: specificPurchaseSnap.id, ...specificPurchaseSnap.data() } as PurchaseData;
          if (!recentPurchases.find(p => p.id === specificData.id)) {
            recentPurchases.unshift(specificData);
          }
          handleSelectPurchase(specificData);
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

  // NEW: Filter based on NAME input
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

  const handleSelectPurchase = (purchase: PurchaseData) => {
    setSelectedPurchase(purchase);
    setSupplierName(purchase.partyName);
    setSupplierNumber(purchase.partyNumber || '');
    setSupplierAddress(purchase.partyAddress || '');
    setSupplierGstin(purchase.partyGstin || '');

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
        amount: unitPrice * quantity,
        mrp: itemData.mrp || 0,
        tax: itemData.tax || 0,
        hsnSac: itemData.hsnSac || '',
        barcode: itemData.barcode || '',
        unit: itemData.unit || '',
        stock: itemData.stock || 0
      };
    }));

    setSelectedReturnIds(new Set());
    setNewItemsReceived([]);
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
        const updatedItem = { ...item, [field]: value };
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

  // Helper to find Doc Ref by Barcode
  const getItemDocRef = async (barcode: string | undefined, fallbackId: string) => {
    const companyId = currentUser!.companyId;
    if (!barcode) return doc(db, 'companies', companyId, 'items', fallbackId);

    const barcodeAsIdRef = doc(db, 'companies', companyId, 'items', barcode);
    const barcodeAsIdSnap = await getDoc(barcodeAsIdRef);
    if (barcodeAsIdSnap.exists()) return barcodeAsIdRef;

    const q = query(collection(db, 'companies', companyId, 'items'), where('barcode', '==', barcode));
    const querySnap = await getDocs(q);

    if (!querySnap.empty) {
      return querySnap.docs[0].ref;
    }
    return doc(db, 'companies', companyId, 'items', fallbackId);
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

  // --- UI CALCULATIONS (With Discount) ---
  const { totalReturnValue, totalNewItemsValue, finalBalance, discountDeducted } = useMemo(() => {
    const totalReturnGross = itemsToReturn.reduce((sum, item) => sum + item.amount, 0);
    const totalNewItemsValue = newItemsReceived.reduce((sum, item) => sum + item.amount, 0);

    let discountDeducted = 0;

    if (selectedPurchase) {
      // Calculate Original Bill Gross (Sum of Items)
      const originalGross = selectedPurchase.items.reduce((sum, item) => {
        const price = item.purchasePrice ?? (item.quantity ? item.quantity : 0);
        return sum + (item.quantity * price);
      }, 0);

      const originalManualDiscount = Number(selectedPurchase.manualDiscount) || 0;

      // If there was a discount, calculate proportional deduction
      if (originalGross > 0 && originalManualDiscount > 0) {
        const ratio = totalReturnGross / originalGross;
        discountDeducted = originalManualDiscount * ratio;
        discountDeducted = Math.round(discountDeducted * 100) / 100;
      }
    }

    const netReturnValue = totalReturnGross - discountDeducted;
    const finalBalance = netReturnValue - totalNewItemsValue;

    return { totalReturnValue: netReturnValue, totalNewItemsValue, finalBalance, discountDeducted };
  }, [itemsToReturn, newItemsReceived, selectedPurchase]);


  // --- SAVE LOGIC ---
  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser || !currentUser.companyId || !selectedPurchase) return;

    const finalSupplierName = (completionData?.partyName || supplierName || selectedPurchase.partyName || '').trim();
    const finalSupplierNumber = (completionData?.partyNumber || supplierNumber || selectedPurchase.partyNumber || '').trim();

    if (modeOfReturn === 'Debit Note' && !finalSupplierNumber) {
      setModal({ type: State.ERROR, message: 'Cannot create Debit Note: Party Number is missing.' });
      return;
    }

    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const purchaseRef = doc(db, 'companies', companyId, 'purchases', selectedPurchase.id);

      const originalItemsMap = new Map(selectedPurchase.items.map(item => [item.id, { ...item }]));

      for (const returnItem of itemsToReturn) {
        const originalItem = originalItemsMap.get(returnItem.originalItemId);
        if (originalItem) {
          originalItem.quantity -= returnItem.quantity;
          if (originalItem.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
        }
        const itemDocRef = await getItemDocRef(returnItem.barcode, returnItem.originalItemId);
        batch.update(itemDocRef, { stock: firebaseIncrement(-returnItem.quantity), updatedAt: serverTimestamp() });
      }

      for (const newItem of newItemsReceived) {
        const originalItem = originalItemsMap.get(newItem.originalItemId);
        if (originalItem) {
          originalItem.quantity += newItem.quantity;
        } else {
          originalItemsMap.set(newItem.originalItemId, {
            id: newItem.originalItemId,
            name: newItem.name,
            quantity: newItem.quantity,
            purchasePrice: newItem.unitPrice,
            mrp: newItem.mrp || 0,
            tax: newItem.tax || 0,
            hsnSac: newItem.hsnSac || '',
            barcode: newItem.barcode || '',
            unit: newItem.unit || ''
          } as any);
        }
        const itemDocRef = await getItemDocRef(newItem.barcode, newItem.originalItemId);
        batch.update(itemDocRef, { stock: firebaseIncrement(newItem.quantity), updatedAt: serverTimestamp() });
      }

      const newItemsList = Array.from(originalItemsMap.values());
      const newGrossTotal = newItemsList.reduce((sum, item) => sum + (item.quantity * (item.purchasePrice || 0)), 0);

      const originalManualDiscount = Number(selectedPurchase.manualDiscount) || 0;
      const newManualDiscount = Math.max(0, originalManualDiscount - discountDeducted);
      const newTotalAmount = newGrossTotal - newManualDiscount;

      // --- FIX 2: Calculate Payment Due Correctly (Prevent False Due) ---
      let updatedPaymentMethods: any = { ...(selectedPurchase.paymentMethods || {}) };
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

      // If Return reduces bill total below what was paid, due is 0. 
      // Excess is tracked via supplier Debit Balance, not invoice due.
      updatedPaymentMethods.due = Math.max(0, newTotalAmount - totalPaidSoFar);

      const returnHistoryRecord = {
        id: crypto.randomUUID(),
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(({ id, ...item }) => item),
        newItemsReceived: newItemsReceived.map(({ id, ...item }) => item),
        finalBalance,
        discountDeducted,
        modeOfReturn,
        returnType: modeOfReturn,
        paymentDetails: completionData?.paymentDetails || null,
        invoiceNumber: selectedPurchase.invoiceNumber,
        partyName: finalSupplierName,
        partyNumber: finalSupplierNumber,
        // --- FIX 1: Save the Manual Discount from Payment Drawer ---
        transactionDiscount: completionData?.discount || 0
      };

      const updateData: any = {
        partyName: finalSupplierName,
        partyNumber: finalSupplierNumber,
        items: newItemsList,
        totalAmount: newTotalAmount,
        manualDiscount: newManualDiscount,
        returnHistory: arrayUnion(returnHistoryRecord),
        paymentMethods: updatedPaymentMethods,
        isReturned: true,
        lastUpdated: serverTimestamp()
      };

      batch.update(purchaseRef, updateData);

      if (finalSupplierNumber.length >= 3) {
        const supplierRef = doc(db, 'companies', companyId, 'customers', finalSupplierNumber);

        const supplierUpdateData: any = {
          name: finalSupplierName,
          number: finalSupplierNumber,
          address: completionData?.partyAddress || supplierAddress || selectedPurchase.partyAddress || '',
          gstin: completionData?.partyGST || supplierGstin || selectedPurchase.partyGstin || '',
          companyId: companyId,
          lastUpdatedAt: serverTimestamp()
        };

        if (modeOfReturn !== 'Cash Refund' && finalBalance > 0) {
          // Subtract the drawer discount from the debit balance if applicable
          // (User accepts less debit note value because of discount)
          const netDebitToAdd = finalBalance - (completionData?.discount || 0);
          if (netDebitToAdd > 0) {
            supplierUpdateData.debitBalance = firebaseIncrement(netDebitToAdd);
          }
        }

        batch.set(supplierRef, supplierUpdateData, { merge: true });
      }

      await batch.commit();
      setModal({ type: State.SUCCESS, message: 'Purchase Return processed successfully!' });
      handleClear();
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

  // --- FIX 3: STRICT QUANTITY CHECK ---
  const handleProcessReturn = () => {
    if (!currentUser || !selectedPurchase) return;
    if (itemsToReturn.length === 0 && newItemsReceived.length === 0) {
      return setModal({ type: State.ERROR, message: 'No items have been returned or received.' });
    }

    // Validate quantities before opening drawer or saving
    for (const returnItem of itemsToReturn) {
      const originalItem = selectedPurchase.items.find(i => i.id === returnItem.originalItemId);

      // Calculate how many of this item have ALREADY been returned in previous transactions
      // Note: This requires 'returnHistory' to be fully loaded or parsed. 
      // Since selectedPurchase is the live document, 'items' should ostensibly reflect current holdings? 
      // Yes, 'items' array in DB is decremented on return. 
      // So checking against 'originalItem.quantity' (Current Holding) is correct.

      if (!originalItem) {
        return setModal({ type: State.ERROR, message: `Item ${returnItem.name} not found in original bill.` });
      }

      if (returnItem.quantity > (originalItem.quantity || 0)) {
        return setModal({
          type: State.ERROR,
          message: `Cannot return ${returnItem.quantity} of ${returnItem.name}. Only ${originalItem.quantity} remaining in bill.`
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
    return 'Debit Note';
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-300 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">
      <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">
        Purchase Return
      </h1>
      <div className="flex justify-center gap-x-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE)} active={isActive(ROUTES.PURCHASE)}>Purchase</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE_RETURN)} active={isActive(ROUTES.PURCHASE_RETURN)}>Purchase Return</CustomButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      {/* HEADER */}
      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 relative">

          {/* Search */}
          <div className="bg-white p-4 rounded-sm shadow-md mb-4 border border-gray-200">
            <div className="relative" ref={dropdownRef}>
              <label htmlFor="search-purchase" className="block text-sm font-medium mb-1 text-gray-700">Search Original Purchase</label>
              <div className="flex gap-2">
                <input
                  type="text" id="search-purchase" value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder={selectedPurchase ? `${selectedPurchase.partyName} (${selectedPurchase.invoiceNumber})` : "Supplier or Invoice..."}
                  className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" autoComplete="off" readOnly={!!selectedPurchase}
                />
                {selectedPurchase && (
                  <button onClick={handleClear} className="py-2 px-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300">
                    Clear
                  </button>
                )}
              </div>
              {isDropdownOpen && !selectedPurchase && (
                <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredList.map(item => (
                    <div key={item.id} className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0" onClick={() => handleSelectPurchase(item)}>
                      <p className="font-semibold text-sm">{item.partyName} <span className="text-gray-500 font-normal">({item.invoiceNumber})</span></p>
                      <p className="text-xs text-gray-500">Amount: ₹{item.totalAmount.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {selectedPurchase && (
            <>
              {/* Purchase Details */}
              <div className="bg-white p-4 rounded-sm shadow-md mb-4 border border-gray-200">
                <div className="space-y-3 mb-4">
                  <div className='grid grid-cols-2 gap-4'>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>

                    {/* --- PARTY NAME DROPDOWN (NEW) --- */}
                    <div className="relative" ref={nameDropdownRef}>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Party Name</label>
                      <input
                        type="text"
                        value={supplierName}
                        onChange={(e) => {
                          setSupplierName(e.target.value);
                          setIsNameDropdownOpen(true);
                        }}
                        onFocus={() => setIsNameDropdownOpen(true)}
                        className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                        autoComplete="off"
                        placeholder="Search by name..."
                      />
                      {isNameDropdownOpen && filteredPartiesByName.length > 0 && (
                        <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filteredPartiesByName.map((party) => (
                            <div
                              key={party.id}
                              className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
                              onClick={() => handleSelectParty(party)}
                            >
                              <p className="font-semibold text-sm text-gray-800">{party.name}</p>
                              <p className="text-xs text-gray-500">{party.number}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* --- PARTY NUMBER DROPDOWN --- */}
                  <div className="relative" ref={partyDropdownRef}>
                    <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                    <input
                      type="text"
                      value={supplierNumber}
                      onChange={(e) => {
                        setSupplierNumber(e.target.value);
                        setSupplierName('');
                        setIsPartyDropdownOpen(true);
                      }}
                      onFocus={() => setIsPartyDropdownOpen(true)}
                      className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                      autoComplete="off"
                      placeholder="Search party by number or name..."
                    />
                    {isPartyDropdownOpen && filteredPartiesByNumber.length > 0 && (
                      <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredPartiesByNumber.map((party) => (
                          <div
                            key={party.id}
                            className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
                            onClick={() => handleSelectParty(party)}
                          >
                            <p className="font-semibold text-sm text-gray-800">{party.name}</p>
                            <p className="text-xs text-gray-500">{party.number}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                <div className="flex flex-col gap-2">
                  {originalPurchaseItems.map((item) => (
                    <ReturnListItem
                      key={item.id}
                      item={item}
                      isSelected={selectedReturnIds.has(item.id)}
                      onToggle={handleToggleReturnItem}
                      onQuantityChange={(id, val) => handleItemChange(setOriginalPurchaseItems, id, 'quantity', val)}
                      showMrp={false}
                    />
                  ))}
                </div>
              </div>

              {/* Exchange / New Items (Input + List) */}
              <div className="bg-white p-4 rounded-sm shadow-md mb-20 md:mb-0 border border-gray-200">
                {/* Mobile View: Mode Select Here */}
                <div className="md:hidden mb-4">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                    <option>Exchange</option>
                    <option>Debit Note</option>
                    <option>Cash Refund</option>
                  </select>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="mt-2">
                    <div className="flex items-end gap-2 mb-3">
                      <div className="flex-grow">
                        <SearchableItemInput
                          label="Add New Item Received"
                          placeholder="Search inventory..."
                          items={availableItems}
                          onItemSelected={handleNewItemSelected}
                          isLoading={isLoading}
                          error={error}
                        />
                      </div>
                      <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-md flex items-center justify-center">
                        <IconScanCircle width={24} height={24} />
                      </button>
                    </div>

                    {newItemsReceived.length > 0 && (
                      <div className="border rounded-md overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">Received Items</div>
                        <div className="max-h-60 overflow-y-auto p-2 bg-gray-50">
                          <GenericCartList<ReturnCartItem>
                            items={newItemsReceived}
                            availableItems={availableItems}
                            basePriceKey="mrp"
                            priceLabel="Cost"
                            settings={{
                              enableRounding: false,
                              roundingInterval: 1,
                              enableItemWiseDiscount: true, // Enable discount editing
                              lockDiscount: false,          // Unlock Discount
                              lockPrice: false              // Unlock Price
                            }}
                            applyRounding={(v) => v}
                            State={State}
                            setModal={setModal}
                            onOpenEditDrawer={() => { }}
                            onDeleteItem={handleRemoveNewItem}
                            onDiscountChange={handleNewItemDiscountChange}
                            onCustomPriceChange={handleNewItemPriceChange}
                            onCustomPriceBlur={handleNewItemPriceBlur}
                            onQuantityChange={handleNewItemQuantity}
                            onDiscountPressStart={() => { }}
                            onDiscountPressEnd={() => { }}
                            onDiscountClick={() => { }}
                            onPricePressStart={() => { }}
                            onPricePressEnd={() => { }}
                            onPriceClick={() => { }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Mobile Only: Inline Summary */}
              <div className="md:hidden bg-white p-4 rounded-sm shadow-md mt-2">
                <div className="flex justify-between items-center text-sm text-red-700">
                  <p>Return Value</p><p className="font-medium">₹{totalReturnValue.toFixed(2)}</p>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between items-center text-xs text-orange-600 mt-1">
                    <p>Less Bill Discount</p><p>- ₹{discountDeducted.toFixed(2)}</p>
                  </div>
                )}
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between items-center text-sm text-green-700 mt-1">
                    <p>New Items Value</p><p className="font-medium">₹{totalNewItemsValue.toFixed(2)}</p>
                  </div>
                )}
                <div className="border-t border-gray-200 my-2"></div>
                <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  <p>{getBalanceLabel()}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* --- RIGHT PANEL (Desktop Only: 35%) --- */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedPurchase ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>

              {/* Transaction Type */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
                <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none">
                  <option>Exchange</option>
                  <option>Debit Note</option>
                  <option>Cash Refund</option>
                </select>
              </div>

              {/* Financials */}
              <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100 flex-grow">
                <div className="flex justify-between">
                  <span>Gross Return Value</span>
                  <span className="font-medium">₹{totalReturnValue.toFixed(2)}</span>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Less: Proportional Discount</span>
                    <span>- ₹{discountDeducted.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
                  <span>Net Return Value</span>
                  <span className="text-red-600">₹{(totalReturnValue - discountDeducted).toFixed(2)}</span>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-green-600 mt-2">
                    <span>New Items Value</span>
                    <span>- ₹{totalNewItemsValue.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Final Total */}
              <div className="mt-auto border-t border-gray-100">
                <div className="flex justify-between items-end">
                  <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
                  <span className={`text-3xl font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
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
              <p>Select a purchase to begin return</p>
            </div>
          )}
        </div>

        {/* --- MOBILE FOOTER (Sticky) --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          {selectedPurchase && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md">Process Transaction</CustomButton>)}
        </div>

      </div>

      <PaymentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={supplierName}
        initialPartyNumber={supplierNumber}
      />
    </div>
  );
};

export default PurchaseReturnPage;