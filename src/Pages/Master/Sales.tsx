import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useDatabase } from '../../context/auth-context';
import type { Item, SalesItem as OriginalSalesItem } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/Firebase';
import { collection, serverTimestamp, doc, increment as firebaseIncrement, runTransaction, getDocs, query, where } from 'firebase/firestore';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { generateNextInvoiceNumber } from '../../UseComponents/InvoiceCounter';
import { Modal } from '../../constants/Modal';
import { Permissions, ROLES, State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import type { User } from '../../Role/permission';
import { useSalesSettings } from '../../context/SettingsContext';
import { Spinner } from '../../constants/Spinner';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { GenericCartList } from '../../Components/CartItem';
import { FiTrash2 } from 'react-icons/fi';
import { GenericBillFooter } from '../../Components/Footer';
import { IconScanCircle } from '../../constants/Icons';

// 1. EXPORT SalesItem (Extended with productId)
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
  stock: number;
  amount: number;
  barcode: string;
  restockQuantity: number;
  productId: string; // Links to the DB Item ID
}

export const applyRounding = (amount: number, isRoundingEnabled: boolean, interval: number = 1): number => {
  if (!isRoundingEnabled || !interval || interval <= 0) {
    return parseFloat(amount.toFixed(2));
  }
  const rounded = Math.round(amount / interval) * interval;
  return parseFloat(rounded.toFixed(2));
};

const toCurrency = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const Sales: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading, hasPermission } = useAuth();
  const dbOperations = useDatabase();
  const { salesSettings, loadingSettings } = useSalesSettings();

  const invoiceToEdit = location.state?.invoiceData;
  const isEditMode = location.state?.isEditMode === true && !!invoiceToEdit;

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  // Initialize Items
  const [items, setItems] = useState<SalesItem[]>(() => {
    if (isEditMode) return [];
    try {
      const savedDraft = localStorage.getItem('sales_cart_draft');
      return savedDraft ? JSON.parse(savedDraft) : [];
    } catch (e) {
      console.error("Error parsing sales draft", e);
      return [];
    }
  });

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const [isDiscountLocked, setIsDiscountLocked] = useState(true);
  const [discountInfo, setDiscountInfo] = useState<string | null>(null);
  const [isPriceLocked, setIsPriceLocked] = useState(true);
  const [priceInfo, setPriceInfo] = useState<string | null>(null);

  const [workers, setWorkers] = useState<User[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
  const [settingsDocId, setSettingsDocId] = useState<string | null>(null);

  // Grid/Category State
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [gridSearchQuery, setGridSearchQuery] = useState<string>('');
  const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  const userRole = currentUser?.role || '';
  const isManager = userRole === ROLES.MANAGER || userRole === ROLES.OWNER;

  useEffect(() => {
    const findSettingsDocId = async () => {
      if (currentUser?.companyId) {
        const settingsQuery = query(collection(db, 'companies', currentUser.companyId, 'settings'), where('settingType', '==', 'sales'));
        const settingsSnapshot = await getDocs(settingsQuery);
        if (!settingsSnapshot.empty) {
          setSettingsDocId(settingsSnapshot.docs[0].id);
        }
      }
    };
    findSettingsDocId();

    if (authLoading || !currentUser || !dbOperations || loadingSettings) {
      setPageIsLoading(authLoading || loadingSettings);
      return;
    }

    const fetchData = async () => {
      try {
        setPageIsLoading(true);
        setError(null);
        const [fetchedItems, fetchedWorkers] = await Promise.all([
          dbOperations.getItems(),
          dbOperations.getWorkers()
        ]);

        let groupMap: Record<string, string> = {};
        if (currentUser?.companyId) {
          try {
            const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
            const groupsSnap = await getDocs(groupsRef);
            groupsSnap.docs.forEach(doc => {
              const data = doc.data();
              groupMap[doc.id] = data.name || data.groupName || 'Unknown Group';
            });
          } catch (e) {
            console.error("Error fetching item groups", e);
          }
        }
        setItemGroupMap(groupMap);
        setAvailableItems(fetchedItems);
        setWorkers(fetchedWorkers);

        if (isEditMode) {
          const originalSalesman = fetchedWorkers.find(u => u.uid === invoiceToEdit?.salesmanId);
          setSelectedWorker(originalSalesman || null);
        } else {
          const currentUserAsWorker = fetchedWorkers.find(u => u.uid === currentUser.uid);
          setSelectedWorker(currentUserAsWorker || null);
        }

      } catch (err) {
        setError('Failed to load initial page data.');
        console.error(err);
      } finally {
        setPageIsLoading(false);
      }
    };

    fetchData();
  }, [authLoading, currentUser, dbOperations, isEditMode, invoiceToEdit, loadingSettings]);

  useEffect(() => {
    if (!loadingSettings && salesSettings) {
      setIsDiscountLocked(salesSettings.lockDiscountEntry ?? false);
      setIsPriceLocked(salesSettings.lockSalePriceEntry ?? false);
    }
  }, [loadingSettings, salesSettings?.lockDiscountEntry, salesSettings?.lockSalePriceEntry]);

  // Populate items for Edit Mode
  useEffect(() => {
    if (isEditMode && invoiceToEdit?.items) {
      const nonEditableItems = invoiceToEdit.items.map((item: any) => ({
        ...item,
        id: crypto.randomUUID(), // New UI ID
        productId: item.id,      // Preserve Original ID
        isEditable: false,
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
        discountPercentage: item.discountPercentage,
        purchasePrice: item.purchasePrice || 0,
        tax: item.tax || 0,
        itemGroupId: item.itemGroupId || '',
        stock: item.stock ?? item.Stock ?? 0,
        amount: item.amount || 0,
        barcode: item.barcode || '',
        restockQuantity: item.restockQuantity || 0,
      }));
      setItems(nonEditableItems);
    }
  }, [isEditMode, invoiceToEdit]);

  // Save Draft
  useEffect(() => {
    if (!isEditMode) {
      localStorage.setItem('sales_cart_draft', JSON.stringify(items));
    }
  }, [items, isEditMode]);

  // --- Categories for Grid View ---
  const categories = useMemo(() => {
    const groups = new Set(availableItems.map(i => i.itemGroupId || 'Others'));
    return ['All', ...Array.from(groups).sort()];
  }, [availableItems]);

  // --- Sorted Items for Grid View ---
  const sortedGridItems = useMemo(() => {
    const filtered = availableItems.filter(item => {
      const itemGroupId = item.itemGroupId || 'Others';
      const matchesCategory = selectedCategory === 'All' || itemGroupId === selectedCategory;
      const matchesSearch = gridSearchQuery === '' ||
        item.name.toLowerCase().includes(gridSearchQuery.toLowerCase()) ||
        item.barcode?.includes(gridSearchQuery);
      return matchesCategory && matchesSearch;
    });

    return filtered.sort((a, b) => {
      const aInCart = items.some(i => i.productId === a.id);
      const bInCart = items.some(i => i.productId === b.id);
      if (aInCart && !bInCart) return -1;
      if (!aInCart && bInCart) return 1;
      return 0;
    });
  }, [availableItems, selectedCategory, gridSearchQuery, items]);

  // Totals Calculation
  const { subtotal, totalDiscount, roundOff, taxableAmount, taxAmount, finalAmount, totalQuantity } = useMemo(() => {
    let accumulatorSubtotal = 0, accumulatorTaxable = 0, accumulatorTax = 0, accumulatorQuantity = 0;
    const isTaxEnabled = salesSettings?.enableTax ?? true;
    const taxRate = salesSettings?.defaultTaxRate ?? 0;
    const taxType = salesSettings?.taxType ?? 'exclusive';
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

    items.forEach(item => {
      const currentMrp = item.mrp || 0;
      const currentQuantity = item.quantity || 1;
      const currentDiscount = item.discount || 0;
      accumulatorQuantity += currentQuantity;
      const priceAfterDiscount = currentMrp * (1 - currentDiscount / 100);
      const calculatedRoundedPrice = applyRounding(priceAfterDiscount, isRoundingEnabled, roundingInterval);
      let effectiveUnitPrice = calculatedRoundedPrice;
      if (item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== '') {
        const numericPrice = parseFloat(String(item.customPrice));
        if (!isNaN(numericPrice)) effectiveUnitPrice = numericPrice;
      }
      effectiveUnitPrice = toCurrency(effectiveUnitPrice);
      const lineTotal = toCurrency(effectiveUnitPrice * currentQuantity);
      accumulatorSubtotal += currentMrp * currentQuantity;
      let lineBaseAmount = 0, lineTaxAmount = 0;
      const itemSpecificTaxRate = (item.tax !== undefined && item.tax !== null) ? Number(item.tax) : taxRate;

      if (isTaxEnabled && itemSpecificTaxRate > 0) {
        if (taxType === 'inclusive') {
          lineBaseAmount = toCurrency(lineTotal / (1 + (itemSpecificTaxRate / 100)));
          lineTaxAmount = toCurrency(lineTotal - lineBaseAmount);
        } else {
          lineBaseAmount = lineTotal;
          lineTaxAmount = toCurrency(lineTotal * (itemSpecificTaxRate / 100));
        }
      } else {
        lineBaseAmount = lineTotal;
      }
      accumulatorTaxable += lineBaseAmount;
      accumulatorTax += lineTaxAmount;
    });

    const finalTaxable = toCurrency(accumulatorTaxable);
    const finalTax = toCurrency(accumulatorTax);
    const finalPayableAmount = toCurrency(finalTaxable + finalTax);
    const amountCustomerPaysBeforeFinalTax = taxType === 'inclusive' ? (finalTaxable + finalTax) : finalTaxable;
    const totalDiscountValue = toCurrency(accumulatorSubtotal - amountCustomerPaysBeforeFinalTax);

    return { subtotal: accumulatorSubtotal, totalDiscount: totalDiscountValue > 0 ? totalDiscountValue : 0, roundOff: 0, taxableAmount: finalTaxable, taxAmount: finalTax, finalAmount: finalPayableAmount, totalQuantity: accumulatorQuantity };
  }, [items, salesSettings]);

  const amountToPayNow = useMemo(() => finalAmount, [finalAmount]);

  const addItemToCart = (itemToAdd: Item) => {
    if (!itemToAdd || !itemToAdd.id) { setModal({ message: "Cannot add invalid item.", type: State.ERROR }); return; }
    const defaultDiscount = itemToAdd.discount ?? salesSettings?.defaultDiscount ?? 0;
    const newSalesItem: SalesItem = {
      ...itemToAdd,
      id: crypto.randomUUID(),
      productId: itemToAdd.id!,
      quantity: 1,
      discount: defaultDiscount,
      isEditable: true,
      purchasePrice: itemToAdd.purchasePrice || 0,
      tax: itemToAdd.tax || 0,
      itemGroupId: itemToAdd.itemGroupId || '',
      stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
      amount: itemToAdd.amount || 0,
      barcode: itemToAdd.barcode || '',
      restockQuantity: itemToAdd.restockQuantity || 0,
    };
    setItems(prev => [newSalesItem, ...prev]);
  };

  const handleClearCart = () => {
    if (items.length > 0 && window.confirm("Are you sure you want to remove all items?")) {
      setItems([]);
    }
  };

  const handleItemSelected = (selectedItem: Item | null) => {
    if (selectedItem) { addItemToCart(selectedItem); setGridSearchQuery(''); }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    setIsScannerOpen(false);
    if (!dbOperations) return;
    try {
      const itemToAdd = await dbOperations.getItemByBarcode(barcode);
      if (itemToAdd) {
        addItemToCart(itemToAdd);
        setAvailableItems(prev => {
          const exists = prev.find(p => p.id === itemToAdd.id);
          return exists ? prev : [...prev, itemToAdd];
        });
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    } catch { setModal({ message: 'Scan error.', type: State.ERROR }); }
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, quantity: Math.max(0, newQuantity) } : item));
  };

  const handleDeleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleDiscountPressStart = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500); };
  const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handleDiscountClick = () => { if (salesSettings?.lockDiscountEntry || isDiscountLocked) { setDiscountInfo("Cannot edit discount"); setTimeout(() => setDiscountInfo(null), 3000); } };
  const handlePricePressStart = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 500); };
  const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handlePriceClick = () => { if (salesSettings?.lockSalePriceEntry || isPriceLocked) { setPriceInfo("Cannot edit sale price"); setTimeout(() => setPriceInfo(null), 1000); } };
  const handleDiscountChange = (id: string, v: number | string) => { const n = typeof v === 'string' ? parseFloat(v) : v; setItems(prev => prev.map(i => i.id === id ? { ...i, discount: Math.max(0, Math.min(100, isNaN(n) ? 0 : n)), customPrice: undefined } : i)); };
  const handleCustomPriceChange = (id: string, v: string) => { if (v === '' || /^[0-9]*\.?[0-9]*$/.test(v)) setItems(prev => prev.map(i => i.id === id ? { ...i, customPrice: v } : i)); };
  const handleCustomPriceBlur = (id: string) => {
    setItems(prev => prev.map(i => {
      if (i.id === id && typeof i.customPrice === 'string') {
        const n = parseFloat(i.customPrice);
        if (i.customPrice === '' || isNaN(n)) return { ...i, customPrice: undefined };
        let d = 0; if (i.mrp > 0) d = ((i.mrp - n) / i.mrp) * 100;
        return { ...i, customPrice: n, discount: parseFloat(d.toFixed(2)) };
      }
      return i;
    }));
  };

  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
  const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };

  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    setAvailableItems(prevItems => prevItems.map(item => item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item));
    const updateForCart: Partial<SalesItem> = { ...updatedItemData };
    if ((updateForCart as any).Stock !== undefined) { updateForCart.stock = (updateForCart as any).Stock; delete (updateForCart as any).Stock; }
    Object.keys(updateForCart).forEach(key => { if (updateForCart[key as keyof typeof updateForCart] === undefined) delete updateForCart[key as keyof typeof updateForCart]; });

    setItems(prevCartItems => prevCartItems.map(cartItem => {
      if (cartItem.productId === selectedItemForEdit?.id || cartItem.id === selectedItemForEdit?.id) {
        return { ...cartItem, ...updateForCart } as SalesItem;
      }
      return cartItem;
    }));
  };

  const handleProceedToPayment = () => {
    if (items.length === 0) { setModal({ message: 'Please add at least one item.', type: State.INFO }); return; }
    if (salesSettings?.enableSalesmanSelection && !selectedWorker) { setModal({ message: 'Please select a salesman.', type: State.ERROR }); return; }
    if (!(salesSettings as any)?.allowNegativeStock) {
      const stockNeeds = new Map<string, number>();
      items.filter(i => i.isEditable).forEach(i => { const pid = i.productId; stockNeeds.set(pid, (stockNeeds.get(pid) || 0) + (i.quantity || 1)); });
      const invalidItems: string[] = [];
      stockNeeds.forEach((needed, pid) => {
        const avail = availableItems.find(a => a.id === pid);
        if ((avail?.stock ?? 0) < needed) invalidItems.push(`${avail?.name} (Avail:${avail?.stock}, Need:${needed})`);
      });
      if (invalidItems.length > 0) { setModal({ message: `Insufficient stock: ${invalidItems.join(', ')}`, type: State.ERROR }); return; }
    }
    setIsDrawerOpen(true);
  };

  const handleSavePayment = async (completionData: PaymentCompletionData) => {
    if (!currentUser?.companyId) return;

    // --- VALIDATION: ENFORCE SETTINGS ---
    if (salesSettings?.requireCustomerName && !completionData.partyName?.trim()) {
      throw new Error("Customer Name is required.");
    }
    if (salesSettings?.requireCustomerMobile && !completionData.partyNumber?.trim()) {
      throw new Error("Customer Mobile Number is required.");
    }

    const companyId = currentUser.companyId;
    const salesman = salesSettings?.enableSalesmanSelection ? selectedWorker : workers.find(w => w.uid === currentUser.uid);
    const finalSalesman = salesman || { uid: currentUser.uid, name: currentUser.uid || 'Current User' };

    // ... Validations ...
    const isTaxEnabled = salesSettings?.enableTax ?? true;
    const finalTaxType = isTaxEnabled ? (salesSettings?.taxType ?? 'exclusive') : 'none';
    const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

    const formatItemsForDB = (itemsToFormat: SalesItem[]) => {
      return itemsToFormat.map(({ isEditable, customPrice, ...item }) => {
        const currentMrp = item.mrp || 0;
        const currentDiscount = item.discount || 0;
        const currentQuantity = item.quantity || 1;
        const priceAfterDiscount = currentMrp * (1 - currentDiscount / 100);
        const calculatedRoundedPrice = applyRounding(priceAfterDiscount, isRoundingEnabled, roundingInterval);
        let effectiveUnitPrice = calculatedRoundedPrice;
        if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
          const num = parseFloat(String(customPrice));
          if (!isNaN(num)) effectiveUnitPrice = num;
        }
        effectiveUnitPrice = toCurrency(effectiveUnitPrice);
        const lineTotal = toCurrency(effectiveUnitPrice * currentQuantity);

        const itemSpecificTaxRate = (item.tax !== undefined && item.tax !== null) ? Number(item.tax) : currentTaxRate;
        let itemTaxableBase = 0, itemTaxAmount = 0, itemFinalPrice = 0;

        if (isTaxEnabled && itemSpecificTaxRate > 0) {
          if (finalTaxType === 'inclusive') {
            itemFinalPrice = lineTotal;
            itemTaxableBase = toCurrency(lineTotal / (1 + (itemSpecificTaxRate / 100)));
            itemTaxAmount = toCurrency(lineTotal - itemTaxableBase);
          } else {
            itemTaxableBase = lineTotal;
            itemTaxAmount = toCurrency(lineTotal * (itemSpecificTaxRate / 100));
            itemFinalPrice = toCurrency(itemTaxableBase + itemTaxAmount);
          }
        } else {
          itemTaxableBase = lineTotal; itemFinalPrice = lineTotal;
        }

        return {
          ...item,
          id: item.productId, // Restore DB ID
          quantity: currentQuantity, discount: currentDiscount, effectiveUnitPrice, finalPrice: itemFinalPrice,
          taxableAmount: itemTaxableBase, taxAmount: itemTaxAmount, taxRate: isTaxEnabled ? itemSpecificTaxRate : 0,
          taxType: finalTaxType, discountPercentage: currentDiscount,
        };
      });
    };

    const finalInvoiceTotal = finalAmount - completionData.discount;
    const totalInvoiceDiscount = totalDiscount + (completionData.discount || 0);

    if (isEditMode && invoiceToEdit?.id) {
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, "companies", companyId, "sales", invoiceToEdit.id);
        const invoiceDoc = await transaction.get(invoiceRef);
        if (!invoiceDoc.exists()) throw "Err";

        const originalItems = invoiceDoc.data().items || [];
        const originalQtyMap = new Map<string, number>();
        originalItems.forEach((i: any) => { if (i.id) originalQtyMap.set(String(i.id), Number(i.quantity || 1)); });

        const currentQtyMap = new Map<string, number>();
        items.forEach((i) => {
          const pid = i.productId || i.id || '';
          if (pid) {
            const current = currentQtyMap.get(pid) || 0;
            currentQtyMap.set(pid, current + Number(i.quantity || 1));
          }
        });

        const allItemIds = Array.from(new Set([...originalQtyMap.keys(), ...currentQtyMap.keys()]));
        allItemIds.forEach((itemId) => {
          const oldQty = originalQtyMap.get(itemId) || 0;
          const newQty = currentQtyMap.get(itemId) || 0;
          const difference = oldQty - newQty;
          if (difference !== 0) {
            const itemRef = doc(db, "companies", companyId, "items", itemId);
            transaction.update(itemRef, { stock: firebaseIncrement(difference) });
          }
        });

        transaction.update(invoiceRef, {
          items: formatItemsForDB(items),
          subtotal, discount: totalInvoiceDiscount, manualDiscount: completionData.discount || 0, revDiscount: completionData.revDiscount || 0,
          roundOff, taxableAmount, taxAmount, taxType: finalTaxType, totalAmount: finalInvoiceTotal,
          paymentMethods: completionData.paymentDetails, updatedAt: serverTimestamp(),
          partyName: completionData.partyName, partyNumber: completionData.partyNumber,
          salesmanId: finalSalesman.uid, salesmanName: finalSalesman.name
        });
      });
      showSuccessModal("Invoice Updated", ROUTES.JOURNAL);
    } else {
      try {
        const newInvoiceNumber = await generateNextInvoiceNumber(companyId);
        await runTransaction(db, async (transaction) => {
          const saleData = {
            invoiceNumber: newInvoiceNumber, userId: currentUser.uid, salesmanId: finalSalesman.uid, salesmanName: finalSalesman.name,
            partyName: completionData.partyName, partyNumber: completionData.partyNumber, partyAddress: completionData.partyAddress || '', partyGstin: completionData.partyGST || '',
            items: formatItemsForDB(items), subtotal, discount: totalInvoiceDiscount, manualDiscount: completionData.discount || 0, revDiscount: completionData.revDiscount || 0,
            roundOff, taxableAmount, taxAmount, taxType: finalTaxType, totalAmount: finalInvoiceTotal,
            paymentMethods: completionData.paymentDetails, createdAt: serverTimestamp(), companyId: companyId, voucherName: salesSettings?.voucherName ?? 'Sales'
          };
          const newSaleRef = doc(collection(db, "companies", companyId, "sales"));
          transaction.set(newSaleRef, saleData);
          items.forEach(i => {
            const pid = i.productId || i.id;
            if (pid) {
              const itemRef = doc(db, "companies", companyId, "items", pid);
              transaction.update(itemRef, { stock: firebaseIncrement(-(i.quantity || 1)) });
            }
          });
          if (settingsDocId) {
            const settingsRef = doc(db, "companies", companyId, "settings", settingsDocId);
            transaction.update(settingsRef, { currentVoucherNumber: firebaseIncrement(1) });
          }
        });
        setIsDrawerOpen(false);
        showSuccessModal(`Sale #${newInvoiceNumber} saved!`);
      } catch (e: any) {
        console.error(e); setModal({ message: "Error saving", type: State.ERROR });
      }
    }
  };

  const showSuccessModal = (message: string, navigateTo?: string) => {
    localStorage.removeItem('sales_cart_draft');
    setIsDrawerOpen(false);
    setModal({ message, type: State.SUCCESS });
    setTimeout(() => { setModal(null); if (navigateTo) navigate(navigateTo); else if (!salesSettings?.copyVoucherAfterSaving) setItems([]); }, 1500);
  };

  if (pageIsLoading) return <div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>;
  if (error) return <div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button></div>;

  const gstSchemeDisplay = salesSettings?.gstScheme ?? 'none';
  const settingsTaxTypeDisplay = salesSettings?.taxType ?? 'exclusive';
  const isCardView = salesSettings?.salesViewType === 'card';

  const showTaxRow = gstSchemeDisplay !== 'none' && settingsTaxTypeDisplay === 'exclusive';
  const renderHeader = () => (
    <div className="flex flex-col bg-gray-100 border-b border-gray-200 shadow-sm flex-shrink-0 mb-2">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">{isEditMode ? `Editing #${invoiceToEdit.invoiceNumber}` : (salesSettings?.voucherName ?? 'Sales')}</h1>
      {!isEditMode && (
        <div className="flex items-center justify-center gap-6 mb-2">
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES)} active={isActive(ROUTES.SALES)}>Sales</CustomButton>
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES_RETURN)} active={isActive(ROUTES.SALES_RETURN)}>Sales Return</CustomButton>
        </div>
      )}
    </div>
  );


  if (isCardView) {
    return (
      <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2">
        {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
        <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
        {renderHeader()}
        {/* Grid Search Header */}
        <div className="flex-shrink-0 bg-gray-50 border-b border-gray-300">
          <div className="p-2 bg-white border-b flex gap-2 items-center">
            <div className="flex-grow relative">
              <input type="text" placeholder="Search..." className="w-full p-2 pr-8 border rounded" value={gridSearchQuery} onChange={e => setGridSearchQuery(e.target.value)} />
              {gridSearchQuery && <button onClick={() => setGridSearchQuery('')} className="absolute right-2 top-2 text-gray-400">X</button>}
            </div>
            <button onClick={() => setIsScannerOpen(true)} className="p-2 border rounded bg-white">Scan</button>
            {salesSettings?.enableSalesmanSelection && (<div className="w-1/3 min-w-[120px]"> <select value={selectedWorker?.uid || ''} onChange={(e) => setSelectedWorker(workers.find(s => s.uid === e.target.value) || null)} className="w-full p-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"> <option value="">Select Salesman</option> {workers.map(w => <option key={w.uid} value={w.uid}>{w.name || 'Unnamed'}</option>)} </select> </div>)}
          </div>
          <div className="flex overflow-x-auto p-2 gap-2 bg-white border-b">
            {categories.map(cat => <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-1 rounded-full border ${selectedCategory === cat ? 'bg-green-600 text-white' : 'bg-white'}`}>{itemGroupMap[cat] || cat}</button>)}
          </div>
        </div>
        {/* Grid Content */}
        <div className="flex-1 p-3 overflow-y-auto grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start bg-gray-100 pb-20">
          {sortedGridItems.map(item => {
            const countInCart = items.filter(i => i.productId === item.id).length;
            const isSelected = countInCart > 0;
            const quantity = items.filter(i => i.productId === item.id).reduce((sum, i) => sum + i.quantity, 0);

            return (
              <div key={item.id} onClick={() => addItemToCart(item)} className={`p-2 rounded border bg-white text-center cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50' : ''}`}>
                <div className="text-sm font-bold truncate">{item.name}</div>
                <div className="text-xs text-gray-600">₹{item.mrp}</div>
                {isSelected && <div className="text-xs text-blue-600 font-bold mt-1">Added ({quantity})</div>}
              </div>
            );
          })}
        </div>
        <GenericBillFooter
          isExpanded={isFooterExpanded}
          onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
          totalQuantity={totalQuantity}
          subtotal={subtotal}
          totalDiscount={totalDiscount}
          taxAmount={taxAmount}
          finalAmount={finalAmount}
          showTaxRow={showTaxRow}
          taxLabel="Tax (Exclusive)"
          actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
          onActionClick={handleProceedToPayment}
          disableAction={items.length === 0}
        />
        <PaymentDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} subtotal={amountToPayNow} onPaymentComplete={handleSavePayment} isPartyNameEditable={!isEditMode} initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''} initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''} initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined} totalItemDiscount={totalDiscount} totalQuantity={totalQuantity} 
          requireCustomerName={salesSettings?.requireCustomerName}
        requireCustomerMobile={salesSettings?.requireCustomerMobile}
          />
        <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2 ">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      {renderHeader()}
      {/* Search Bar */}
      <div className="flex-shrink-0 p-2 bg-white border-b pb-3 mb-2 rounded-sm">
        <div className="flex gap-4 items-end w-full">
          <div className="flex-grow">
            <SearchableItemInput label="Search Item" placeholder="Search by name or barcode..." items={availableItems} onItemSelected={handleItemSelected} isLoading={pageIsLoading} error={error} />
          </div>
          <button onClick={() => setIsScannerOpen(true)} className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-md font-semibold transition hover:bg-gray-800' title="Scan Barcode">
            <IconScanCircle width={20} height={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden">
        {/* Cart Header */}
        <div className="pt-2 flex-shrink-0 grid grid-cols-3 items-center border-b pb-2 px-2">
          <div className="justify-self-start"><h3 className="text-gray-700 font-medium">Cart</h3></div>
          <div className="justify-self-center w-full flex justify-center">{salesSettings?.enableSalesmanSelection && <select value={selectedWorker?.uid} onChange={e => setSelectedWorker(workers.find(w => w.uid === e.target.value) || null)} className="p-1 border rounded text-sm" disabled={!hasPermission(Permissions.ViewTransactions) || (isEditMode && !isManager)}><option value="">Salesman</option>{workers.map(w => <option key={w.uid} value={w.uid}>{w.name}</option>)}</select>}</div>
          <div className="justify-self-end">{items.length > 0 && <button onClick={handleClearCart} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1"><FiTrash2 /> Clear</button>}</div>
        </div>
        {/* Status Bar */}
        <div className="flex-shrink-0 grid grid-cols-2 px-2">
          {discountInfo && <div className="text-xs text-red-600">{discountInfo}</div>}
          {priceInfo && <div className="text-xs text-red-600">{priceInfo}</div>}
        </div>
        {/* Cart List */}
        <GenericCartList
          items={items}
          availableItems={availableItems}
          basePriceKey="mrp"
          priceLabel="MRP"
          settings={{
            enableRounding: salesSettings?.enableRounding ?? true,
            // FIX: Type cast to resolve 'roundingInterval' error
            roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
            enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
            lockDiscount: isDiscountLocked,
            lockPrice: isPriceLocked
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
        <GenericBillFooter
          isExpanded={isFooterExpanded}
          onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
          totalQuantity={totalQuantity}
          subtotal={subtotal}
          totalDiscount={totalDiscount}
          taxAmount={taxAmount}
          finalAmount={finalAmount}
          showTaxRow={showTaxRow}
          taxLabel="Tax (Exclusive)"
          actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
          onActionClick={handleProceedToPayment}
          disableAction={items.length === 0}
        />
      </div>
      <PaymentDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} subtotal={amountToPayNow} 
      onPaymentComplete={handleSavePayment} isPartyNameEditable={!isEditMode} 
      initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''} initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''} 
      initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined} totalItemDiscount={totalDiscount} 
      totalQuantity={totalQuantity} 
      requireCustomerName={salesSettings?.requireCustomerName}
        requireCustomerMobile={salesSettings?.requireCustomerMobile}/>
      <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />
    </div>
  );
};

export default Sales;