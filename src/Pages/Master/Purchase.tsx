import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Item } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/Firebase';
import { collection, serverTimestamp, doc, increment as firebaseIncrement, getDoc, runTransaction, query, where, getDocs } from 'firebase/firestore';
import { useAuth, useDatabase } from '../../context/auth-context';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import { incrementPurchaseCounter, peekNextPurchaseNumber } from '../../UseComponents/InvoiceCounter';
import { Spinner } from '../../constants/Spinner';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { usePurchaseSettings } from '../../context/SettingsContext';
import { GenericBillFooter } from '../../Components/Footer';
import { type CartEntry } from '../../Components/CardGrid';
import PurchaseHeader from './PurchaseComponents/Purchaseheader';
import type { PurchaseItem, PurchaseDocumentData, Purchase, TaxOption } from './PurchaseComponents/Purchasetypes';
import PurchaseCardView from './PurchaseComponents/Purchasecardview';
import PurchaseListView from './PurchaseComponents/Purchaselistview';

const applyPurchaseRounding = (amount: number, isRoundingEnabled: boolean): number =>
  isRoundingEnabled ? Math.round(amount) : amount;

const PurchasePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseSettings, loadingSettings: loadingPurchaseSettings } = usePurchaseSettings();

  const purchaseIdToEdit = location.state?.purchaseId as string | undefined;
  const isEditMode = !!purchaseIdToEdit;

  const [modal, setModal] = useState<{ message: string; type: State; onConfirm?: () => void } | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>(() => {
    if (isEditMode) return [];
    try {
      const savedDraft = localStorage.getItem('purchase_cart_draft');
      return savedDraft ? JSON.parse(savedDraft) : [];
    } catch { return []; }
  });
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    // In edit mode, try to get date from location state immediately
    if (location.state?.purchaseId) {
      // We don't have the data yet, will be set in useEffect
      // Just use today as placeholder — useEffect will correct it
    }
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [billTaxType, setBillTaxType] = useState<TaxOption>('exclusive');
  const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  const [showPrintQrModal, setShowPrintQrModal] = useState<PurchaseItem[] | null>(null);
  const [editModeData, setEditModeData] = useState<Purchase | null>(null);
  const [_settingsDocId, setSettingsDocId] = useState<string | null>(null);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

  const isCardView = purchaseSettings?.purchaseViewType === 'card';
  const isCardImageView = isCardView && (purchaseSettings?.cardViewWithPhoto !== false);
  const displayTaxTotal = billTaxType !== 'none';

  const cartEntries: CartEntry[] = useMemo(() =>
    items.map(i => ({
      cartId: i.id,
      productId: i.productId ?? i.id,
      quantity: i.quantity ?? 1,
      customPrice: i.purchasePrice,
      discount: i.purchasediscount ?? i.discount ?? 0,
    })),
    [items]
  );
  const categories = useMemo(() => {
    const groups = new Set(availableItems.map(i => i.itemGroupId || 'Others'));
    return ['All', ...Array.from(groups).sort()];
  }, [availableItems]);
  useEffect(() => {
    if (!isEditMode) localStorage.setItem('purchase_cart_draft', JSON.stringify(items));
  }, [items, isEditMode]);

  useEffect(() => {
    setPageIsLoading(authLoading || loadingPurchaseSettings);
  }, [authLoading, loadingPurchaseSettings]);

  useEffect(() => {
    if (pageIsLoading || !dbOperations || !currentUser?.companyId) return;
    const companyId = currentUser.companyId;

    const findSettingsDocId = async () => {
      try {
        const settingsQuery = query(collection(db, 'companies', companyId, 'settings'), where('settingType', '==', 'purchase'));
        const settingsSnapshot = await getDocs(settingsQuery);
        if (!settingsSnapshot.empty) setSettingsDocId(settingsSnapshot.docs[0].id);
      } catch (e) { console.error("Error finding settings doc ID:", e); }
    };

    const initializePage = async () => {
      try {
        const fetchedItems = await dbOperations.syncItems();
        let groupMap: Record<string, string> = {};
        try {
          const groupsSnap = await getDocs(collection(db, 'companies', companyId, 'itemGroups'));
          groupsSnap.docs.forEach(d => {
            const data = d.data();
            groupMap[d.id] = data.name || data.groupName || 'Unknown Group';
          });
        } catch (e) { console.error("Error fetching groups", e); }

        setItemGroupMap(groupMap);
        setAvailableItems(fetchedItems);

        if (purchaseIdToEdit) {
          const docSnap = await getDoc(doc(db, 'companies', companyId, 'purchases', purchaseIdToEdit));
          if (!docSnap.exists()) throw new Error("Purchase document not found.");

          const purchaseData = { id: docSnap.id, ...docSnap.data() } as Purchase;
          setInvoiceNumber(purchaseData.invoiceNumber);
          if (purchaseData.taxType) setBillTaxType(purchaseData.taxType as TaxOption);

          if (purchaseData.createdAt?.toDate) {
            const originalDate = purchaseData.createdAt.toDate();
            const y = originalDate.getFullYear();
            const m = String(originalDate.getMonth() + 1).padStart(2, '0');
            const d = String(originalDate.getDate()).padStart(2, '0');
            setInvoiceDate(`${y}-${m}-${d}`);
          }

          setEditModeData(purchaseData);
          setItems((purchaseData.items || []).map((item: any) => {
            const masterItem = fetchedItems.find(i => i.id === (item.productId || item.id));
            const recoveredTaxRate = (item.taxRate && item.taxRate > 0)
              ? item.taxRate
              : (masterItem?.tax ?? masterItem?.taxRate ?? 0);
            const transactionDiscount = item.discount || 0;
            return {
              id: crypto.randomUUID(),
              name: item.name || 'Unknown Item',
              purchasePrice: item.purchasePrice || 0,
              originalPurchasePrice: masterItem?.purchasePrice || 0,
              quantity: item.quantity || 1,
              mrp: item.mrp || 0,
              discount: transactionDiscount,
              purchasediscount: transactionDiscount,
              barcode: item.barcode || '',
              taxRate: recoveredTaxRate,
              taxType: item.taxType,
              taxAmount: item.taxAmount,
              taxableAmount: item.taxableAmount,
              stock: item.stock ?? item.Stock ?? 0,
              productId: item.productId || item.id,
              isEditable: true,
              unitMultiplier: item.unitMultiplier || 1
            };
          }));
        } else {
          setEditModeData(null);
          try {
            setInvoiceNumber(await peekNextPurchaseNumber(companyId));
          } catch (e) { console.error("Error fetching preview number", e); }
        }
        setError(null);
      } catch (err: any) {
        console.error('Failed to initialize page:', err);
        setError('Failed to load data. Navigating back.');
        setTimeout(() => navigate(-1), 3000);
      }
    };

    findSettingsDocId();
    initializePage();
  }, [dbOperations, currentUser, purchaseIdToEdit, pageIsLoading, navigate]);

  const cartItemsAdapter = useMemo(() => items.map(item => ({
    ...item,
    purchasePrice: Number(item.purchasePrice || 0),
    customPrice: item.purchasePrice,
    discount: item.purchasediscount ?? item.discount ?? 0,
    isEditable: item.isEditable ?? true
  })), [items]);

  const addItemToCart = (itemToAdd: Item) => {
    if (!itemToAdd?.id) {
      setModal({ message: "Cannot add invalid item.", type: State.ERROR });
      return;
    }
    const mrp = Number(itemToAdd.mrp || 0);
    const masterPurchasePrice = Number(itemToAdd.purchasePrice || 0);
    const masterPurchaseDiscount = (itemToAdd as any).purchasediscount || 0;
    const globalDefaultDiscount = purchaseSettings?.defaultDiscount ?? 0;

    let finalNetPrice = 0, calculatedDiscount = 0;
    if (masterPurchasePrice > 0) {
      finalNetPrice = masterPurchasePrice;
      if (mrp > 0) calculatedDiscount = ((mrp - masterPurchasePrice) / mrp) * 100;
    } else if (masterPurchaseDiscount > 0) {
      calculatedDiscount = masterPurchaseDiscount;
      finalNetPrice = mrp * (1 - masterPurchaseDiscount / 100);
    } else if (globalDefaultDiscount > 0 && mrp > 0) {
      calculatedDiscount = globalDefaultDiscount;
      finalNetPrice = mrp * (1 - globalDefaultDiscount / 100);
    }

    const newItem = {
      id: crypto.randomUUID(),
      productId: itemToAdd.id!,
      name: itemToAdd.name || 'Unnamed Item',
      purchasePrice: finalNetPrice,
      originalPurchasePrice: masterPurchasePrice,
      mrp,
      barcode: itemToAdd.barcode || '',
      quantity: (itemToAdd as any).unitMultiplier || 1,
      unitMultiplier: (itemToAdd as any).unitMultiplier || 1,
      discount: parseFloat(calculatedDiscount.toFixed(2)),
      purchasediscount: parseFloat(calculatedDiscount.toFixed(2)),
      taxRate: itemToAdd.tax ?? itemToAdd.taxRate ?? 0,
      stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
      isEditable: true
    };

    setItems(prev => purchaseSettings?.cartInsertionOrder === 'bottom'
      ? [...prev, newItem]
      : [newItem, ...prev]
    );
  };

  const handlePriceChange = (id: string, val: string) => {
    if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val))
      setItems(prev => prev.map(i => i.id === id ? { ...i, purchasePrice: val } : i));
  };

  const handleDiscountChange = (id: string, v: number | string) => {
    const safeDiscount = isNaN(Number(v)) ? 0 : Number(v);
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const base = (i.mrp && i.mrp > 0) ? i.mrp : (i.originalPurchasePrice || 0);
      const newPrice = applyPurchaseRounding(base * (1 - safeDiscount / 100), purchaseSettings?.roundingOff ?? true);
      return { ...i, discount: safeDiscount, purchasediscount: safeDiscount, purchasePrice: newPrice };
    }));
  };

  const handlePriceBlur = (id: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const val = parseFloat(String(i.purchasePrice));
      if (i.purchasePrice === '' || isNaN(val)) return { ...i, purchasePrice: 0 };
      const base = (i.mrp && i.mrp > 0) ? i.mrp : (i.originalPurchasePrice || 0);
      const d = parseFloat((base > 0 ? ((base - val) / base) * 100 : 0).toFixed(2));
      return { ...i, purchasePrice: val, discount: d, purchasediscount: d };
    }));
  };

  const { subtotal, taxableAmount, taxAmount, roundingOffAmount, finalAmount, totalDiscount, totalQuantity } = useMemo(() => {
    const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;
    let mrpTotal = 0, purchaseTotal = 0, taxableBase = 0, totalTax = 0, preRounding = 0, qty = 0;

    items.forEach(item => {
      const price = Number(item.purchasePrice || 0);
      const quantity = item.quantity || 1;
      const taxRate = item.taxRate || 0;
      qty += quantity;
      mrpTotal += (item.mrp || 0) * quantity;
      const lineTotal = price * quantity;
      purchaseTotal += lineTotal;

      let taxableAmt = 0, tax = 0, lineFinal = 0;
      if (billTaxType === 'exclusive') {
        taxableAmt = lineTotal; tax = lineTotal * (taxRate / 100); lineFinal = taxableAmt + tax;
      } else if (billTaxType === 'inclusive') {
        lineFinal = lineTotal; taxableAmt = lineTotal / (1 + taxRate / 100); tax = lineTotal - taxableAmt;
      } else {
        taxableAmt = lineTotal; lineFinal = lineTotal;
      }
      taxableBase += taxableAmt; totalTax += tax; preRounding += lineFinal;
    });

    const rounded = applyPurchaseRounding(preRounding, isRoundingEnabled);
    return {
      subtotal: taxableBase, taxableAmount: taxableBase, taxAmount: totalTax,
      roundingOffAmount: rounded - preRounding,
      finalAmount: rounded,
      totalDiscount: Math.max(0, mrpTotal - purchaseTotal),
      totalQuantity: qty
    };
  }, [items, purchaseSettings, billTaxType]);

  const handleQuantityChange = (id: string, qty: number) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, qty) } : i));

  const handleDeleteItem = (id: string) =>
    setItems(prev => prev.filter(i => i.id !== id));

  const handleClearCart = () => {
    if (items.length > 0) {
      setModal({ message: 'Are you sure you want to remove all the items?', type: State.WARNING, onConfirm: () => setItems([]) });
    }
  };

  const handleItemSelected = (item: Item | null) => { if (item) addItemToCart(item); };

  const handleProceedToPayment = () => {
    if (items.length === 0) { setModal({ message: 'Please add items to purchase.', type: State.ERROR }); return; }
    if (purchaseSettings?.inputMRP) {
      const missing = items.find(i => !i.mrp || i.mrp <= 0);
      if (missing) { setModal({ message: `MRP required for "${missing.name}".`, type: State.ERROR }); return; }
    }
    if (!invoiceNumber.trim()) { setModal({ message: "Invoice Number is required.", type: State.ERROR }); return; }
    setIsDrawerOpen(true);
  };

  const getParsedInvoiceDate = () => {
    try {
      if (isEditMode && editModeData?.createdAt?.toDate) {
        const originalDate = editModeData.createdAt.toDate();
        const originalDateStr = originalDate.toISOString().slice(0, 10);

        if (invoiceDate === originalDateStr) {
          // Date unchanged — return original timestamp exactly as-is
          return originalDate;
        }

        // User changed the date — preserve original time, update only the date
        const [y, m, d] = (invoiceDate || '').split('-').map(Number);
        if (y && m && d) {
          const updated = new Date(originalDate); // clone to avoid mutation
          updated.setFullYear(y);
          updated.setMonth(m - 1);
          updated.setDate(d);
          return updated;
        }

        return originalDate; // fallback to original if parsing fails
      }

      // New purchase — use selected date at midnight local time
      const [y, m, d] = (invoiceDate || '').split('-').map(Number);
      if (y && m && d) return new Date(y, m - 1, d);
    } catch { }

    return new Date();
  };
  const handleSavePurchase = async (completionData: PaymentCompletionData) => {
    if (!currentUser?.companyId) { setModal({ message: 'User or company information missing.', type: State.ERROR }); return; }
    if (purchaseSettings?.requireSupplierName && !completionData.partyName.trim()) {
      setModal({ message: 'Supplier name is required.', type: State.ERROR }); setIsDrawerOpen(true); return;
    }
    if (purchaseSettings?.requireSupplierMobile && !completionData.partyNumber.trim()) {
      setModal({ message: 'Supplier mobile is required.', type: State.ERROR }); setIsDrawerOpen(true); return;
    }

    const gstScheme = billTaxType === 'none' ? 'none' : 'regular';

    const formatItemsForDB = (itemsToFormat: PurchaseItem[]): PurchaseItem[] =>
      itemsToFormat.map(item => {
        const price = Number(item.purchasePrice || 0);
        const qty = item.quantity || 1;
        const rate = billTaxType === 'none' ? 0 : (item.taxRate || 0);
        const lineTotal = price * qty;
        let taxableAmt = 0, tax = 0;
        if (billTaxType === 'exclusive') { taxableAmt = Math.round(lineTotal); tax = taxableAmt * (rate / 100); }
        else if (billTaxType === 'inclusive') { taxableAmt = lineTotal / (1 + rate / 100); tax = lineTotal - taxableAmt; }
        else { taxableAmt = lineTotal; }
        const { customPrice, isEditable, originalPurchasePrice, ...dbItem } = item;
        return {
          ...dbItem,
          id: item.productId || item.id,
          purchasePrice: price,
          discount: item.purchasediscount ?? item.discount ?? 0,
          taxableAmount: parseFloat(taxableAmt.toFixed(2)),
          taxAmount: parseFloat(tax.toFixed(2)),
          taxRate: rate, taxType: billTaxType,
          finalPrice: parseFloat((parseFloat(taxableAmt.toFixed(2)) + parseFloat(tax.toFixed(2))).toFixed(2)),
          unitMultiplier: item.unitMultiplier || 1,
        };
      });

    const formattedItems = formatItemsForDB(items);
    if (editModeData && purchaseIdToEdit)
      await updateExistingPurchase(purchaseIdToEdit, completionData, formattedItems, gstScheme, billTaxType);
    else
      await createNewPurchase(completionData, formattedItems, gstScheme, billTaxType);
  };

  const createNewPurchase = async (
    completionData: PaymentCompletionData,
    formattedItemsForDB: PurchaseItem[],
    gstScheme: 'regular' | 'composition' | 'none',
    finalTaxType: 'inclusive' | 'exclusive' | 'none'
  ) => {
    if (!currentUser?.companyId) return;
    const companyId = currentUser.companyId;
    const currentAutoNum = await peekNextPurchaseNumber(companyId);
    if (invoiceNumber.trim() === currentAutoNum) await incrementPurchaseCounter(companyId);

    try {
      const finalInvoiceNumber = invoiceNumber.trim();
      const manualDiscount = completionData.discount || 0;
      const finalTotalAmount = Math.max(0, finalAmount - manualDiscount);

      await runTransaction(db, async (transaction) => {
        const purchaseData: Omit<PurchaseDocumentData, 'id'> = {
          userId: currentUser.uid,
          partyName: completionData.partyName.trim(),
          partyNumber: completionData.partyNumber.trim(),
          partyAddress: completionData.partyAddress || '',
          partyGstin: completionData.partyGST || '',
          invoiceNumber: finalInvoiceNumber,
          items: formattedItemsForDB,
          subtotal, totalDiscount, taxableAmount, taxAmount,
          gstScheme, taxType: finalTaxType,
          roundingOff: roundingOffAmount,
          manualDiscount, totalAmount: finalTotalAmount,
          paymentMethods: completionData.paymentDetails,
          createdAt: getParsedInvoiceDate(),
          companyId,
          voucherName: purchaseSettings?.voucherName ?? 'Purchase',
        };
        const newRef = doc(collection(db, 'companies', companyId, 'purchases'));
        transaction.set(newRef, purchaseData);

        const stockMap = new Map<string, number>();
        formattedItemsForDB.forEach(i => stockMap.set(i.id, (stockMap.get(i.id) || 0) + (i.quantity || 1)));
        stockMap.forEach((qty, pid) =>
          transaction.update(doc(db, "companies", companyId, "items", pid), { stock: firebaseIncrement(qty), updatedAt: serverTimestamp() })
        );
      });

      setIsDrawerOpen(false);
      const savedCopy = [...items];
      localStorage.removeItem('purchase_cart_draft');
      if (!purchaseSettings?.copyVoucherAfterSaving) {
        setItems([]);
        setInvoiceNumber(await peekNextPurchaseNumber(companyId));
      }
      if (purchaseSettings?.enableBarcodePrinting) {
        setShowPrintQrModal(savedCopy);
      } else {
        setModal({ message: `Purchase #${finalInvoiceNumber} saved!`, type: State.SUCCESS });
        setTimeout(() => setModal(null), 1500);
      }
    } catch (err: any) {
      setModal({ message: `Save failed: ${err.message || 'Unknown error'}`, type: State.ERROR });
    }
  };

  const updateExistingPurchase = async (
    purchaseId: string,
    completionData: PaymentCompletionData,
    formattedItemsForDB: PurchaseItem[],
    gstScheme: 'regular' | 'composition' | 'none',
    finalTaxType: 'inclusive' | 'exclusive' | 'none'
  ) => {
    if (!editModeData || !currentUser?.companyId) return;
    const companyId = currentUser.companyId;
    try {
      const manualDiscount = completionData.discount || 0;
      await runTransaction(db, async (transaction) => {
        const purchaseRef = doc(db, 'companies', companyId, 'purchases', purchaseId);
        const purchaseDoc = await transaction.get(purchaseRef);
        if (!purchaseDoc.exists()) throw new Error("Purchase not found.");

        const originalMap = new Map((purchaseDoc.data().items as PurchaseItem[] || []).map(i => [i.id, i.quantity || 1]));
        const currentMap = new Map(formattedItemsForDB.map(i => [i.id, i.quantity || 1]));
        new Set([...originalMap.keys(), ...currentMap.keys()]).forEach(id => {
          const diff = (currentMap.get(id) || 0) - (originalMap.get(id) || 0);
          if (diff !== 0) transaction.update(doc(db, 'companies', companyId, 'items', id), { stock: firebaseIncrement(diff) });
        });

        const originalDateStr = editModeData?.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? '';
        const dateChanged = invoiceDate !== originalDateStr;

        transaction.update(purchaseRef, {
          partyName: completionData.partyName.trim(),
          partyNumber: completionData.partyNumber.trim(),
          partyAddress: completionData.partyAddress || '',
          partyGstin: completionData.partyGST || '',
          invoiceNumber: invoiceNumber.trim(),
          items: formattedItemsForDB,
          subtotal, totalDiscount, taxableAmount, taxAmount,
          gstScheme, taxType: finalTaxType,
          roundingOff: roundingOffAmount,
          manualDiscount,
          totalAmount: Math.max(0, finalAmount - manualDiscount),
          paymentMethods: completionData.paymentDetails,
          updatedAt: serverTimestamp(),
          ...(dateChanged && {
            createdAt: getParsedInvoiceDate(),
          }),
        });
      });
      showSuccessModal('Purchase updated successfully!', ROUTES.JOURNAL);
    } catch (err: any) {
      setModal({ message: `Update failed: ${err.message || 'Unknown error'}`, type: State.ERROR });
    }
  };

  const showSuccessModal = (message: string, navigateTo?: string) => {
    localStorage.removeItem('purchase_cart_draft');
    setIsDrawerOpen(false);
    setModal({ message, type: State.SUCCESS });
    setTimeout(() => {
      setModal(null);
      if (navigateTo) navigate(navigateTo);
      else if (!purchaseSettings?.copyVoucherAfterSaving) setItems([]);
    }, 1500);
  };

  const handleBarcodeScanned = (barcode: string) => {
    setIsScannerOpen(false);
    const item = availableItems.find(i => i.barcode === barcode);
    if (item) addItemToCart(item);
    else setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
  };

  const handleNavigateToQrPage = () => {
    if (!showPrintQrModal) return;
    navigate(ROUTES.PRINTQR, {
      state: { prefilledItems: showPrintQrModal.map(i => ({ ...i, id: i.productId || i.id, purchasePrice: Number(i.purchasePrice || 0) })) }
    });
    setShowPrintQrModal(null);
  };

  const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
  const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    setAvailableItems(prev => prev.map(i => i.id === selectedItemForEdit?.id ? { ...i, ...updatedItemData, id: i.id } as Item : i));
    const update: Partial<PurchaseItem> = { ...updatedItemData };
    if ((update as any).Stock !== undefined) { update.stock = (update as any).Stock; delete (update as any).Stock; }
    Object.keys(update).forEach(k => update[k as keyof typeof update] === undefined && delete update[k as keyof typeof update]);
    setItems(prev => prev.map(c => c.productId === selectedItemForEdit?.id ? { ...c, ...update, id: c.id } : c));
  };

  if (pageIsLoading) return (
    <div className="flex items-center justify-center h-screen"><Spinner /><p className="ml-2">Loading...</p></div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center h-screen text-red-600">
      <p>{error}</p>
      <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button>
    </div>
  );

  // ─── Shared sub-components ─────────────────────────────────────────────────
  const TaxSelect = ({ className }: { className?: string }) => (
    <select
      value={billTaxType}
      onChange={e => setBillTaxType(e.target.value as TaxOption)}
      className={`border border-gray-300 rounded-md p-1 text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 font-medium ${className}`}
    >
      <option value="exclusive">Tax Exclusive</option>
      <option value="inclusive">Tax Inclusive</option>
      <option value="none">Tax Exempt</option>
    </select>
  );

  const TaxToggle = ({ mobile }: { mobile?: boolean }) => (
    <div className={`flex justify-between items-center ${mobile ? 'p-2 bg-white border-b border-gray-200 px-5' : 'py-2 bg-transparent border-b border-gray-100 mb-4'}`}>
      <p className="text-sm font-semibold text-gray-600">Tax Calculation</p>
      <TaxSelect />
    </div>
  );

  const commonFooterProps = {
    totalQuantity, subtotal, taxAmount, finalAmount, roundingOffAmount,
    showTaxRow: displayTaxTotal, taxLabel: "Total Tax",
    actionLabel: isEditMode ? 'Update' : 'Pay Now',
    onActionClick: handleProceedToPayment,
    disableAction: items.length === 0,
  };

  const SummaryPanel = () => (
    <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
      <div className="flex-1 p-6 flex flex-col justify-end">
        <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Purchase Summary</h2>
        <GenericBillFooter {...commonFooterProps} isExpanded={true} onToggleExpand={() => { }}>
          <TaxToggle />
        </GenericBillFooter>
      </div>
    </div>
  );

  const MobileFooter = () => (
    <div className="md:hidden">
      <GenericBillFooter {...commonFooterProps} isExpanded={isFooterExpanded} onToggleExpand={() => setIsFooterExpanded(p => !p)}>
        <TaxToggle mobile />
      </GenericBillFooter>
    </div>
  );

  // ── Shared props for both views ────────────────────────────────────────────
  const sharedViewProps = {
    items, availableItems, cartEntries, cartItemsAdapter, itemGroupMap,
    onAddItem: addItemToCart, onItemSelected: handleItemSelected,
    onQuantityChange: handleQuantityChange, onDeleteItem: handleDeleteItem,
    onClearCart: handleClearCart, onDiscountChange: handleDiscountChange,
    onPriceChange: handlePriceChange, onPriceBlur: handlePriceBlur,
    onOpenEditDrawer: handleOpenEditDrawer,
    onScanBarcode: () => setIsScannerOpen(true),
    pageIsLoading, error, setModal,
    purchaseSettings: purchaseSettings ?? null,
    applyPurchaseRounding,
    SummaryPanel, MobileFooter,
    categories,
  };

  const sharedHeaderProps = {
    title: editModeData ? 'Purchase' : (purchaseSettings?.voucherName ?? 'Purchase'),
    showInvoiceControls: true,
    invoiceNumber, onInvoiceNumberChange: setInvoiceNumber,
    invoiceDate, onInvoiceDateChange: setInvoiceDate,
    hideNavButtons: !!editModeData,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-0">
      {/* Modals (shared) */}
      {modal && (
        <Modal
          message={modal.message} onClose={() => setModal(null)}
          type={modal.type} onConfirm={modal.onConfirm}
          showConfirmButton={!!modal.onConfirm}
        />
      )}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />

      {/* Header (shared) */}
      <PurchaseHeader {...sharedHeaderProps} />

      {/* View */}
      {isCardView
        ? <PurchaseCardView {...sharedViewProps} isCardImageView={isCardImageView} />
        : <PurchaseListView {...sharedViewProps} />
      }

      {/* Drawers (shared) */}
      <PaymentDrawer
        mode="purchase" isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}
        subtotal={subtotal} billTotal={finalAmount} totalTax={taxAmount}
        initialDiscount={editModeData?.manualDiscount}
        onPaymentComplete={handleSavePurchase}
        isPartyNameEditable={!editModeData}
        initialPartyName={editModeData?.partyName ?? ''}
        initialPartyNumber={editModeData?.partyNumber ?? ''}
        totalQuantity={totalQuantity}
        requireCustomerName={purchaseSettings?.requireSupplierName}
        requireCustomerMobile={purchaseSettings?.requireSupplierMobile}
      />
      <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />

      {/* Print QR modal */}
      {showPrintQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/20">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800">Purchase Saved!</h3>
            <p className="my-4 text-gray-600">Print barcodes/QR codes for the items?</p>
            <div className="flex justify-end gap-4 mt-6">
              <CustomButton variant={Variant.Outline} onClick={() => setShowPrintQrModal(null)}>No</CustomButton>
              <CustomButton variant={Variant.Filled} onClick={handleNavigateToQrPage}>Yes, Print</CustomButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasePage;