import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {collection, query, getDocs, doc, getDoc, type DocumentData,orderBy, limit, type DocumentSnapshot, writeBatch,increment as firebaseIncrement, arrayUnion, serverTimestamp, where,} from 'firebase/firestore';
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
import PurchaseHeader from './PurchaseComponents/Purchaseheader';

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
  maxReturnQuantity?: number;
  unitMultiplier?: number;
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

interface Party {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}

interface SearchableDropdownProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  onFocus: () => void;
  isOpen: boolean;
  results: Party[];
  onSelect: (party: Party) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  placeholder?: string;
  readOnly?: boolean;
  inputType?: string;
  maxLength?: number;
}

const PartyDropdown: React.FC<SearchableDropdownProps> = ({
  label, value, onChange, onFocus, isOpen, results, onSelect,
  dropdownRef, placeholder, readOnly, inputType = 'text', maxLength,
}) => (
  <div className="relative" ref={dropdownRef}>
    <label className="block text-xs font-bold text-gray-500 uppercase">{label}</label>
    <input
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
      autoComplete="off"
      placeholder={placeholder}
      readOnly={readOnly}
      maxLength={maxLength}
    />
    {isOpen && results.length > 0 && (
      <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
        {results.map((party) => (
          <div
            key={party.id}
            className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
            onClick={() => onSelect(party)}
          >
            <p className="font-semibold text-sm text-gray-800">{party.name}</p>
            <p className="text-xs text-gray-500">{party.number}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

interface FinancialRowProps {
  label: string;
  value: string;
  className?: string;
}

const FinancialRow: React.FC<FinancialRowProps> = ({ label, value, className = '' }) => (
  <div className={`flex justify-between items-center text-sm ${className}`}>
    <p>{label}</p>
    <p className="font-medium">{value}</p>
  </div>
);

const PurchaseReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseId } = useParams();
  const { state } = useLocation();

  const [supplierName, setSupplierName] = useState('');
  const [supplierNumber, setSupplierNumber] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');

  const [modeOfReturn, setModeOfReturn] = useState('Exchange');
  const [newItemsReceived, setNewItemsReceived] = useState<ReturnCartItem[]>([]);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [originalPurchaseItems, setOriginalPurchaseItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());

  const [purchaseList, setPurchaseList] = useState<PurchaseData[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [availableParties, setAvailableParties] = useState<Party[]>([]);
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState(false);
  const [isNameDropdownOpen, setIsNameDropdownOpen] = useState(false);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const nameDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'purchase' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const itemsToReturn = useMemo(
    () => originalPurchaseItems.filter(item => selectedReturnIds.has(item.id)),
    [originalPurchaseItems, selectedReturnIds]
  );

  const filteredList = useMemo(() =>
    purchaseList
      .filter(p => !p.isReturned)
      .filter(p =>
        p.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
    [purchaseList, searchQuery]
  );

  const filteredPartiesByNumber = useMemo(() => {
    const s = String(supplierNumber).trim().toLowerCase();
    if (!s) return [];
    return availableParties.filter(c =>
      String(c.number ?? '').toLowerCase().includes(s) ||
      String(c.name ?? '').toLowerCase().includes(s)
    );
  }, [availableParties, supplierNumber]);

  const filteredPartiesByName = useMemo(() => {
    const s = String(supplierName).trim().toLowerCase();
    if (!s) return [];
    return availableParties.filter(c =>
      String(c.name ?? '').toLowerCase().includes(s) ||
      String(c.number ?? '').toLowerCase().includes(s)
    );
  }, [availableParties, supplierName]);

  const { totalReturnValue, totalNewItemsValue, finalBalance, discountDeducted } = useMemo(() => {
    const totalReturnGross = itemsToReturn.reduce((sum, item) => sum + item.amount, 0);

    let returnTax = 0;
    if (selectedPurchase) {
      returnTax = selectedPurchase.items.reduce((sum: number, item: any) => {
        const itemFinalPrice = Number(item.purchasePrice || item.finalPrice || 0);
        const taxRate = Number(item.taxRate || item.tax || 0);
        if (item.taxType === 'inclusive' && taxRate > 0) {
          return sum + itemFinalPrice * (taxRate / 100);
        }
        return sum;
      }, 0);

      const originalGross = selectedPurchase.items.reduce((sum, item) => {
        const price = item.purchasePrice ?? (item.quantity ? item.quantity : 0);
        return sum + item.quantity * price;
      }, 0);

      if (originalGross > 0 && returnTax > 0) {
        returnTax = Math.round((returnTax * (totalReturnGross / originalGross)) * 100) / 100;
      }
    }
    const totalNewItemsValue = newItemsReceived.reduce((sum, item) => sum + item.amount, 0);

    let discountDeducted = 0;
    if (selectedPurchase) {
      const originalGross = selectedPurchase.items.reduce((sum, item) => {
        const price = item.purchasePrice ?? (item.quantity ? item.quantity : 0);
        return sum + item.quantity * price;
      }, 0);
      const originalManualDiscount = Number(selectedPurchase.manualDiscount) || 0;
      if (originalGross > 0 && originalManualDiscount > 0) {
        discountDeducted = Math.round((originalManualDiscount * (totalReturnGross / originalGross)) * 100) / 100;
      }
    }

    const netReturnValue = totalReturnGross - discountDeducted + returnTax;
    return {
      totalReturnValue: netReturnValue,
      totalNewItemsValue,
      finalBalance: Math.round(netReturnValue - totalNewItemsValue),
      discountDeducted,
    };
  }, [itemsToReturn, newItemsReceived, selectedPurchase]);

  useEffect(() => {
    if (!currentUser?.companyId || !dbOperations) { setIsLoading(false); return; }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const purchasesQuery = query(
          collection(db, 'companies', currentUser.companyId, 'purchases'),
          orderBy('createdAt', 'desc'), limit(50)
        );
        const partiesQuery = query(
          collection(db, 'companies', currentUser.companyId, 'suppliers'), limit(100)
        );
        let specificPurchasePromise: Promise<DocumentSnapshot<DocumentData, DocumentData> | null> = Promise.resolve(null);
        if (purchaseId && !state?.invoiceData) {
          specificPurchasePromise = getDoc(doc(db, 'companies', currentUser.companyId, 'purchases', purchaseId));
        }

        const [purchasesSnapshot, allItems, partiesSnap, specificPurchaseSnap] = await Promise.all([
          getDocs(purchasesQuery), dbOperations.syncItems(), getDocs(partiesQuery), specificPurchasePromise,
        ]);

        const recentPurchases: PurchaseData[] = purchasesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseData));
        const partiesData: Party[] = partiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Party));

        if (state?.invoiceData) {
          handleSelectPurchase(state.invoiceData);
        } else if (specificPurchaseSnap?.exists()) {
          const specificData = { id: specificPurchaseSnap.id, ...specificPurchaseSnap.data() } as PurchaseData;
          if (!recentPurchases.find(p => p.id === specificData.id)) recentPurchases.unshift(specificData);
          handleSelectPurchase(specificData);
        } else if (purchaseId) {
          const preselected = recentPurchases.find(p => p.id === purchaseId);
          if (preselected) handleSelectPurchase(preselected);
        }

        setPurchaseList(recentPurchases);
        setAvailableItems(allItems);
        setAvailableParties(partiesData);
      } catch (err) {
        setError('Failed to load initial data.');
        console.error('Error fetching data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser, dbOperations, purchaseId, state]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsDropdownOpen(false);
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) setIsPartyDropdownOpen(false);
      if (nameDropdownRef.current && !nameDropdownRef.current.contains(event.target as Node)) setIsNameDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSelectPurchase = (purchase: PurchaseData) => {
    setSelectedPurchase(purchase);
    setSupplierName(purchase.partyName);
    setSupplierNumber(purchase.partyNumber || '');
    setSupplierAddress(purchase.partyAddress || '');
    setSupplierGstin(purchase.partyGstin || '');
    setOriginalPurchaseItems(purchase.items.map((item: any) => {
      const d = item.data || item;
      const quantity = d.quantity || 1;
      const unitPrice = d.purchasePrice ?? d.finalPrice ?? 0;
      return {
        id: crypto.randomUUID(),
        originalItemId: d.id,
        name: d.name,
        quantity,
        unitPrice,
        maxReturnQuantity: quantity,
        amount: unitPrice * quantity,
        mrp: d.mrp || 0,
        tax: d.tax || 0,
        hsnSac: d.hsnSac || '',
        barcode: d.barcode || '',
        unit: d.unit || '',
        stock: d.stock || 0,
        unitMultiplier: d.unitMultiplier || 1,
      };
    }));
    setSelectedReturnIds(new Set());
    setNewItemsReceived([]);
    setSearchQuery(purchase.invoiceNumber || purchase.partyName);
    setIsDropdownOpen(false);
  };

  const handleSelectParty = (party: Party) => {
    setSupplierNumber(party.number);
    setSupplierName(party.name);
    setIsPartyDropdownOpen(false);
    setIsNameDropdownOpen(false);
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

  const handleToggleReturnItem = (itemId: string) => {
    setSelectedReturnIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const handleItemChange = (
    listSetter: React.Dispatch<React.SetStateAction<TransactionItem[]>>,
    id: string,
    field: keyof TransactionItem,
    value: string | number
  ) => {
    listSetter(prev => prev.map(item => {
      if (item.id !== id) return item;
      let updatedValue = value;
      if (field === 'quantity') {
        const maxQty = item.maxReturnQuantity || 0;
        const newQty = Number(value);
        if (newQty > maxQty) {
          setModal({ message: `Cannot return ${newQty} items. Only ${maxQty} were purchased.`, type: State.ERROR });
          updatedValue = maxQty;
        } else if (newQty < 1) {
          updatedValue = 1;
        }
      }
      const updated = { ...item, [field]: updatedValue };
      if (field === 'quantity' || field === 'unitPrice') {
        updated.amount = Number(updated.quantity) * Number(updated.unitPrice);
      }
      return updated;
    }));
  };

  const handleNewItemSelected = (item: Item) => {
    if (!item) return;
    const mrp = Number(item.mrp || 0);
    const masterPurchasePrice = Number(item.purchasePrice || 0);
    const finalNetPrice = masterPurchasePrice > 0 ? masterPurchasePrice : 0;
    const calculatedDiscount = masterPurchasePrice > 0 && mrp > 0
      ? ((mrp - masterPurchasePrice) / mrp) * 100
      : 0;

    setNewItemsReceived(prev => [...prev, {
      id: crypto.randomUUID(),
      originalItemId: item.id!,
      name: item.name,
      quantity: (item as any).unitMultiplier || 1,
      unitMultiplier: (item as any).unitMultiplier || 1,
      unitPrice: finalNetPrice,
      amount: finalNetPrice,
      isEditable: true,
      customPrice: finalNetPrice,
      discount: parseFloat(calculatedDiscount.toFixed(2)),
      productId: item.id,
      mrp,
      tax: item.tax || 0,
      hsnSac: item.hsnSac || '',
      barcode: item.barcode || '',
      unit: item.unit || '',
      stock: item.stock || (item as any).Stock || 0,
    }]);
  };

  const handleNewItemPriceBlur = (id: string) => {
    setNewItemsReceived(prev => prev.map(item => {
      if (item.id !== id) return item;
      const currentPriceVal = parseFloat(String(item.customPrice));
      if (item.customPrice === '' || isNaN(currentPriceVal)) {
        return { ...item, unitPrice: 0, amount: 0, customPrice: 0 };
      }
      const mrp = item.mrp || 0;
      const d = mrp > 0 ? Math.max(0, ((mrp - currentPriceVal) / mrp) * 100) : item.discount || 0;
      return {
        ...item,
        unitPrice: currentPriceVal,
        amount: currentPriceVal * item.quantity,
        customPrice: currentPriceVal,
        discount: parseFloat(d.toFixed(2)),
      };
    }));
  };

  const handleNewItemDiscountChange = (id: string, val: string | number) => {
    const newDiscount = parseFloat(String(val)) || 0;
    setNewItemsReceived(prev => prev.map(item => {
      if (item.id !== id) return item;
      const mrp = item.mrp || 0;
      const newNetPrice = mrp > 0
        ? Math.round((Math.max(0, mrp * (1 - newDiscount / 100)) + Number.EPSILON) * 100) / 100
        : item.unitPrice;
      return { ...item, discount: newDiscount, unitPrice: newNetPrice, customPrice: newNetPrice, amount: newNetPrice * item.quantity };
    }));
  };

  const handleNewItemPriceChange = (id: string, val: string) => {
    setNewItemsReceived(prev => prev.map(item => item.id === id ? { ...item, customPrice: val } : item));
  };

  const handleNewItemQuantity = (id: string, newQty: number) => {
    setNewItemsReceived(prev => prev.map(item => {
      if (item.id !== id) return item;
      const qty = Math.max(1, newQty);
      return { ...item, quantity: qty, amount: qty * item.unitPrice };
    }));
  };

  const handleRemoveNewItem = (id: string) => {
    setNewItemsReceived(prev => prev.filter(item => item.id !== id));
  };

  const getItemDocRef = async (barcode: string | undefined, fallbackId: string) => {
    const companyId = currentUser!.companyId;
    if (!barcode) return doc(db, 'companies', companyId, 'items', fallbackId);
    const barcodeAsIdRef = doc(db, 'companies', companyId, 'items', barcode);
    if ((await getDoc(barcodeAsIdRef)).exists()) return barcodeAsIdRef;
    const q = query(collection(db, 'companies', companyId, 'items'), where('barcode', '==', barcode));
    const snap = await getDocs(q);
    return snap.empty ? doc(db, 'companies', companyId, 'items', fallbackId) : snap.docs[0].ref;
  };

  const handleBarcodeScanned = (decodedText: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);
    if (purpose === 'purchase') {
      const found = purchaseList.find(p => (p.id === decodedText || p.invoiceNumber === decodedText) && !p.isReturned);
      found
        ? handleSelectPurchase(found)
        : setModal({ message: 'No active purchase found.', type: State.ERROR });
    } else if (purpose === 'item') {
      const item = availableItems.find(i => i.barcode === decodedText);
      item
        ? (handleNewItemSelected(item), setModal({ message: `Added: ${item.name}`, type: State.SUCCESS }))
        : setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
    }
  };

  const getBalanceLabel = () => {
    if (finalBalance < 0) return 'Payment Due';
    if (modeOfReturn === 'Cash Refund') return 'Refund Received';
    return 'Debit Note';
  };

  const handleProcessReturn = () => {
    if (!currentUser || !selectedPurchase) return;
    if (itemsToReturn.length === 0 && newItemsReceived.length === 0) {
      return setModal({ type: State.ERROR, message: 'No items have been returned or received.' });
    }
    if (modeOfReturn === 'Exchange' && newItemsReceived.length === 0) {
      return setModal({ type: State.ERROR, message: 'Please add at least one new item to complete the exchange.' });
    }
    for (const returnItem of itemsToReturn) {
      const original = selectedPurchase.items.find(i => i.id === returnItem.originalItemId);
      if (!original) {
        return setModal({ type: State.ERROR, message: `Item "${returnItem.name}" not found in original bill.` });
      }
      if (returnItem.quantity > (original.quantity || 0)) {
        return setModal({
          type: State.ERROR,
          message: `Error: You are trying to return ${returnItem.quantity} of "${returnItem.name}", but only ${original.quantity} remain in this bill.`,
        });
      }
    }
    if (modeOfReturn === 'Cash Refund' && finalBalance > 0) {
      saveReturnTransaction();
    } else if (finalBalance >= 0) {
      saveReturnTransaction();
    } else {
      setIsDrawerOpen(true);
    }
  };

  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser?.companyId || !selectedPurchase) return;

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
        const orig = originalItemsMap.get(returnItem.originalItemId);
        if (orig) {
          orig.quantity -= returnItem.quantity;
          if (orig.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
        }
        const ref = await getItemDocRef(returnItem.barcode, returnItem.originalItemId);
        batch.update(ref, { stock: firebaseIncrement(-returnItem.quantity), updatedAt: serverTimestamp() });
      }

      for (const newItem of newItemsReceived) {
        const orig = originalItemsMap.get(newItem.originalItemId);
        if (orig) {
          orig.quantity += newItem.quantity;
        } else {
          originalItemsMap.set(newItem.originalItemId, {
            id: newItem.originalItemId, name: newItem.name, quantity: newItem.quantity,
            purchasePrice: newItem.unitPrice, mrp: newItem.mrp || 0, tax: newItem.tax || 0,
            hsnSac: newItem.hsnSac || '', barcode: newItem.barcode || '',
            unit: newItem.unit || '', unitMultiplier: newItem.unitMultiplier || 1,
          } as any);
        }
        const ref = await getItemDocRef(newItem.barcode, newItem.originalItemId);
        batch.update(ref, { stock: firebaseIncrement(newItem.quantity), updatedAt: serverTimestamp() });
      }

      const newItemsList = Array.from(originalItemsMap.values());
      const newGrossTotal = newItemsList.reduce((sum, item) => sum + item.quantity * (item.purchasePrice || 0), 0);
      const currentTransactionBillDiscount = Number(completionData?.discount || 0);
      const newManualDiscount = Math.max(0, (Number(selectedPurchase.manualDiscount) || 0) - discountDeducted) + currentTransactionBillDiscount;
      const newTotalAmount = newGrossTotal - newManualDiscount;

      let updatedPaymentMethods: any = { ...(selectedPurchase.paymentMethods || {}) };
      if (completionData?.paymentDetails) {
        Object.entries(completionData.paymentDetails).forEach(([mode, amount]) => {
          if (mode !== 'due') updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
        });
      }
      const totalPaidSoFar = Object.entries(updatedPaymentMethods)
        .filter(([k]) => k !== 'due')
        .reduce((sum, [_, v]) => sum + Number(v), 0);
      updatedPaymentMethods.due = Math.max(0, newTotalAmount - totalPaidSoFar);

      const returnHistoryRecord = {
        id: crypto.randomUUID(),
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(({ id, ...item }) => item),
        newItemsReceived: newItemsReceived.map(({ id, ...item }) => item),
        finalBalance, discountDeducted, modeOfReturn,
        returnType: modeOfReturn,
        paymentDetails: completionData?.paymentDetails || null,
        invoiceNumber: selectedPurchase.invoiceNumber,
        partyName: finalSupplierName,
        partyNumber: finalSupplierNumber,
        billDiscount: currentTransactionBillDiscount,
      };

      batch.update(purchaseRef, {
        partyName: finalSupplierName, partyNumber: finalSupplierNumber,
        items: newItemsList, totalAmount: newTotalAmount, manualDiscount: newManualDiscount,
        returnHistory: arrayUnion(returnHistoryRecord), paymentMethods: updatedPaymentMethods,
        isReturned: true, lastUpdated: serverTimestamp(),
      });

      if (finalSupplierNumber.length >= 3) {
        const supplierRef = doc(db, 'companies', companyId, 'suppliers', finalSupplierNumber);
        const supplierUpdateData: any = {
          name: finalSupplierName, number: finalSupplierNumber,
          address: completionData?.partyAddress || supplierAddress || selectedPurchase.partyAddress || '',
          gstin: completionData?.partyGST || supplierGstin || selectedPurchase.partyGstin || '',
          companyId, lastUpdatedAt: serverTimestamp(),
        };
        if (modeOfReturn !== 'Cash Refund' && finalBalance > 0) {
          const netDebitToAdd = finalBalance - (completionData?.discount || 0);
          if (netDebitToAdd > 0) supplierUpdateData.debitBalance = firebaseIncrement(netDebitToAdd);
        }
        batch.set(supplierRef, supplierUpdateData, { merge: true });
      }

      await batch.commit();
      setModal({ type: State.SUCCESS, message: 'Purchase Return processed successfully!' });
      handleClear();
    } catch (error: any) {
      console.error('Error processing return:', error);
      setModal({
        type: State.ERROR,
        message: error.code === 'not-found'
          ? 'Stock update failed: Item Barcode/ID not found.'
          : `Failed to process return: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  // ─── Render Helpers ───────────────────────────────────────────────────────────
  const renderModeSelect = (className?: string) => (
    <select
      value={modeOfReturn}
      onChange={(e) => setModeOfReturn(e.target.value)}
      className={className}
    >
      <option>Exchange</option>
      <option>Debit Note</option>
      <option>Cash Refund</option>
    </select>
  );

  const renderMobileSummary = () => (
    <div className="md:hidden bg-white p-2 rounded-sm shadow-md mt-2">
      <FinancialRow label="Return Value" value={`₹${totalReturnValue.toFixed(2)}`} className="text-red-700" />
      {discountDeducted > 0 && (
        <FinancialRow label="Less Bill Discount" value={`- ₹${discountDeducted.toFixed(2)}`} className="text-xs text-orange-600 mt-1" />
      )}
      {modeOfReturn === 'Exchange' && (
        <FinancialRow label="New Items Value" value={`₹${totalNewItemsValue.toFixed(2)}`} className="text-green-700 mt-1" />
      )}
      <div className="border-t border-gray-200 my-2" />
      <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
        <p>{getBalanceLabel()}</p>
        <p>₹{Math.abs(finalBalance).toFixed(2)}</p>
      </div>
    </div>
  );

  const renderDesktopPanel = () => (
    <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
      {selectedPurchase ? (
        <div className="flex flex-col h-full">
          <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
            {renderModeSelect('w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none')}
          </div>

          <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-2 rounded-xl border border-gray-100 flex-grow">
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

          <div className="mt-auto border-t border-gray-100">
            <div className="flex justify-between items-end">
              <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
              <span className={`text-3xl font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                ₹{Math.abs(finalBalance).toFixed(2)}
              </span>
            </div>
            <button
              onClick={handleProcessReturn}
              className="w-full bg-blue-600 text-white py-4 px-4 rounded-xl shadow-lg shadow-blue-200 transition-all text-lg font-bold hover:bg-blue-700"
            >
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
  );

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      <PurchaseHeader title="Purchase Return" />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* ── Left Panel ── */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-1 md:p-2 pb-24 md:pb-6 relative">

          {/* Purchase Search */}
          <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
            <div className="relative" ref={dropdownRef}>
              <label htmlFor="search-purchase" className="block text-sm font-medium mb-1 text-gray-700">
                Search Original Purchase
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="search-purchase"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder={selectedPurchase ? `${selectedPurchase.partyName} (${selectedPurchase.invoiceNumber})` : 'Supplier or Invoice...'}
                  className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  autoComplete="off"
                  readOnly={!!selectedPurchase}
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
                    <div
                      key={item.id}
                      className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0"
                      onClick={() => handleSelectPurchase(item)}
                    >
                      <p className="font-semibold text-sm">
                        {item.partyName} <span className="text-gray-500 font-normal">({item.invoiceNumber})</span>
                      </p>
                      <p className="text-xs text-gray-500">Amount: ₹{item.totalAmount.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {selectedPurchase && (
            <>
              <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Date</label>
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                      />
                    </div>
                    <PartyDropdown
                      label="Party Name"
                      value={supplierName}
                      onChange={(val) => { setSupplierName(val); setIsNameDropdownOpen(true); }}
                      onFocus={() => setIsNameDropdownOpen(true)}
                      isOpen={isNameDropdownOpen}
                      results={filteredPartiesByName}
                      onSelect={handleSelectParty}
                      dropdownRef={nameDropdownRef}
                      placeholder="Search by name..."
                    />
                  </div>

                  <PartyDropdown
                    label="Party Number"
                    value={supplierNumber}
                    onChange={(val) => {
                      setSupplierNumber(val.replace(/\D/g, '').slice(0, 10));
                      setSupplierName('');
                      setIsPartyDropdownOpen(true);
                    }}
                    onFocus={() => setIsPartyDropdownOpen(true)}
                    isOpen={isPartyDropdownOpen}
                    results={filteredPartiesByNumber}
                    onSelect={handleSelectParty}
                    dropdownRef={partyDropdownRef}
                    placeholder="Search party by number or name..."
                    maxLength={10}
                  />
                </div>

                <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                <div className="flex flex-col gap-2">
                  {originalPurchaseItems.map(item => (
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

              <div className="bg-white p-2 rounded-sm shadow-md mb-5 md:mb-0 border border-gray-200">
                <div className="md:hidden mb-2">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  {renderModeSelect('w-full p-2 border rounded bg-white')}
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="mt-2">
                    <div className="flex items-end gap-2 mb-2">
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
                      <button
                        onClick={() => setScannerPurpose('item')}
                        className="p-2.5 bg-gray-800 text-white rounded-md flex items-center justify-center"
                      >
                        <IconScanCircle width={24} height={24} />
                      </button>
                    </div>

                    {newItemsReceived.length > 0 && (
                      <div className="border rounded-md overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">
                          Received Items
                        </div>
                        <div className="max-h-60 overflow-y-auto bg-gray-50">
                          <GenericCartList<ReturnCartItem>
                            items={newItemsReceived}
                            availableItems={availableItems}
                            basePriceKey="mrp"
                            priceLabel="MRP"
                            settings={{
                              enableRounding: false,
                              roundingInterval: 1,
                              enableItemWiseDiscount: true,
                              lockDiscount: false,
                              lockPrice: false,
                            }}
                            applyRounding={(v) => v}
                            State={State}
                            setModal={setModal}
                            onOpenEditDrawer={() => {}}
                            onDeleteItem={handleRemoveNewItem}
                            onDiscountChange={handleNewItemDiscountChange}
                            onCustomPriceChange={handleNewItemPriceChange}
                            onCustomPriceBlur={handleNewItemPriceBlur}
                            onQuantityChange={handleNewItemQuantity}
                            onDiscountPressStart={() => {}}
                            onDiscountPressEnd={() => {}}
                            onDiscountClick={() => {}}
                            onPricePressStart={() => {}}
                            onPricePressEnd={() => {}}
                            onPriceClick={() => {}}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {renderMobileSummary()}
            </>
          )}
        </div>

        {renderDesktopPanel()}

        {/* Mobile Footer */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-2 bg-transparent flex justify-center pb-18">
          {selectedPurchase && (
            <CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md">
              Process Transaction
            </CustomButton>
          )}
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