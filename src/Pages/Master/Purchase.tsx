import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Item, SalesItem } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/Firebase';
import { collection, serverTimestamp, doc, increment as firebaseIncrement, getDoc, runTransaction, query, where, getDocs } from 'firebase/firestore';
import { useAuth, useDatabase } from '../../context/auth-context';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import { CustomButton } from '../../Components';
import { incrementPurchaseCounter, peekNextPurchaseNumber } from '../../UseComponents/InvoiceCounter';
import { Spinner } from '../../constants/Spinner';
import { FiTrash2, FiEdit, FiCamera } from 'react-icons/fi';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import BarcodeLinkModal from '../../Components/BarcodeLinkModal';
import { usePurchaseSettings } from '../../context/SettingsContext';
import { GenericCartList } from '../../Components/CartItem';
import { GenericBillFooter } from '../../Components/Footer';
import { IconScanCircle } from '../../constants/Icons';




interface PurchaseItem extends Omit<SalesItem, 'finalPrice' | 'effectiveUnitPrice' | 'discountPercentage'> {
  purchasePrice: number | string;
  originalPurchasePrice?: number;
  purchasediscount?: number;
  barcode?: string;
  taxRate?: number;
  taxType?: 'inclusive' | 'exclusive' | 'none';
  taxAmount?: number;
  taxableAmount?: number;
  stock: number;
  productId?: string;
  customPrice?: number | string;
  isEditable?: boolean;
  unitMultiplier?: number;
}

interface PurchaseDocumentData {
  userId: string;
  partyName: string;
  partyNumber: string;
  partyAddress?: string;
  partyGstin?: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  subtotal: number;
  totalDiscount?: number;
  taxableAmount?: number;
  taxAmount?: number;
  gstScheme?: 'regular' | 'composition' | 'none';
  taxType?: 'inclusive' | 'exclusive' | 'none';
  totalAmount: number;
  paymentMethods: { [key: string]: number };
  createdAt: any;
  companyId: string;
  voucherName?: string;
  roundingOff?: number;
  manualDiscount?: number;
  updatedAt?: any;
}
type Purchase = PurchaseDocumentData & { id: string };

const applyPurchaseRounding = (amount: number, isRoundingEnabled: boolean): number => {
  if (!isRoundingEnabled) {
    return amount;
  }
  return Math.round(amount);
};

type TaxOption = 'inclusive' | 'exclusive' | 'none';
const PurchasePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseSettings, loadingSettings: loadingPurchaseSettings } = usePurchaseSettings();

  const purchaseIdToEdit = location.state?.purchaseId as string | undefined;
  const isEditMode = !!purchaseIdToEdit;

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  const [items, setItems] = useState<PurchaseItem[]>(() => {
    if (isEditMode) return [];
    try {
      const savedDraft = localStorage.getItem('purchase_cart_draft');
      return savedDraft ? JSON.parse(savedDraft) : [];
    } catch (e) {
      console.error("Error parsing purchase draft", e);
      return [];
    }
  });

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [barcodeToLink, setBarcodeToLink] = useState<string | null>(null);
  const [isBarcodeLinkModalOpen, setIsBarcodeLinkModalOpen] = useState(false);
  const [isLinkingBarcode, setIsLinkingBarcode] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [billTaxType, setBillTaxType] = useState<TaxOption>('exclusive');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [gridSearchQuery, setGridSearchQuery] = useState<string>('');
  const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);

  const [showPrintQrModal, setShowPrintQrModal] = useState<PurchaseItem[] | null>(null);
  const [editModeData, setEditModeData] = useState<Purchase | null>(null);
  const [_settingsDocId, setSettingsDocId] = useState<string | null>(null);

  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    if (!isEditMode) {
      localStorage.setItem('purchase_cart_draft', JSON.stringify(items));
    }
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
        if (!settingsSnapshot.empty) {
          setSettingsDocId(settingsSnapshot.docs[0].id);
        }
      } catch (e) {
        console.error("Error finding settings doc ID:", e);
      }
    };

    const fetchInvoiceNumber = async () => {
      if (!purchaseIdToEdit) {
        try {
          // FIX: Only PEEK, don't increment yet
          const nextNum = await peekNextPurchaseNumber(companyId);
          setInvoiceNumber(nextNum);
        } catch (e) {
          console.error("Error fetching preview number", e);
        }
      }
    };

    findSettingsDocId();

    const initializePage = async () => {
      try {
        const fetchedItems = await dbOperations.syncItems();

        let groupMap: Record<string, string> = {};
        if (currentUser?.companyId) {
          try {
            const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
            const groupsSnap = await getDocs(groupsRef);
            groupsSnap.docs.forEach(doc => {
              const data = doc.data();
              groupMap[doc.id] = data.name || data.groupName || 'Unknown Group';
            });
          } catch (e) { console.error("Error fetching groups", e); }
        }
        setItemGroupMap(groupMap);
        setAvailableItems(fetchedItems);

        if (purchaseIdToEdit) {
          const purchaseDocRef = doc(db, 'companies', companyId, 'purchases', purchaseIdToEdit);
          const docSnap = await getDoc(purchaseDocRef);

          if (docSnap.exists()) {
            const purchaseData = { id: docSnap.id, ...docSnap.data() } as Purchase;
            setInvoiceNumber(purchaseData.invoiceNumber);

            if (purchaseData.taxType) {
              setBillTaxType(purchaseData.taxType as TaxOption);
            }

            const validatedItems = (purchaseData.items || []).map((item: any) => {
              const masterItem = fetchedItems.find(i => i.id === (item.productId || item.id));
              const recoveredTaxRate = (item.taxRate && item.taxRate > 0)
                ? item.taxRate
                : (masterItem?.tax ?? masterItem?.taxRate ?? 0);

              // Use the saved transaction discount, NOT master item sale discount
              const transactionDiscount = item.discount || 0;

              return {
                // FIX: Force a brand new unique ID for React list rendering
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
                productId: item.productId || item.id, // The real DB ID is safely kept here
                isEditable: true,
                unitMultiplier: item.unitMultiplier || 1
              };
            });

            setEditModeData(purchaseData);
            setItems(validatedItems);
          } else {
            throw new Error("Purchase document not found.");
          }
        } else {
          setEditModeData(null);
          fetchInvoiceNumber();
        }
        setError(null);
      } catch (err: any) {
        console.error('Failed to initialize page:', err);
        setError('Failed to load data. Navigating back.');
        setTimeout(() => navigate(-1), 3000);
      }
    };

    initializePage();
  }, [dbOperations, currentUser, purchaseIdToEdit, pageIsLoading, navigate]);

  const cartItemsAdapter = useMemo(() => {
    return items.map(item => ({
      ...item,
      purchasePrice: Number(item.purchasePrice || 0),
      customPrice: item.purchasePrice,
      // GenericCartList will display this as "Discount"
      discount: item.purchasediscount ?? item.discount ?? 0,
      isEditable: item.isEditable ?? true
    }));
  }, [items]);

  // --- LOGIC 1: ADD ITEM ---
  const addItemToCart = (itemToAdd: Item) => {
    if (!itemToAdd || !itemToAdd.id) {
      setModal({ message: "Cannot add invalid item.", type: State.ERROR });
      return;
    }

    const resolvedTax = itemToAdd.tax ?? itemToAdd.taxRate ?? 0;

    // 1. Extract Values
    const mrp = Number(itemToAdd.mrp || 0);
    const masterPurchasePrice = Number(itemToAdd.purchasePrice || 0);

    // FIX: Look ONLY for 'purchasediscount'. Ignore 'discount' (Sale Discount).
    const masterPurchaseDiscount = (itemToAdd as any).purchasediscount || 0;
    const globalDefaultDiscount = purchaseSettings?.defaultDiscount ?? 0;

    let finalNetPrice = 0;
    let calculatedDiscount = 0;

    // 2. Logic Implementation
    if (masterPurchasePrice > 0) {
      // Priority 1: Master Purchase Price exists
      finalNetPrice = masterPurchasePrice;
      if (mrp > 0) {
        calculatedDiscount = ((mrp - masterPurchasePrice) / mrp) * 100;
      }
    } else if (masterPurchaseDiscount > 0) {
      // Priority 2: Master Purchase Discount exists
      calculatedDiscount = masterPurchaseDiscount;
      finalNetPrice = mrp * (1 - (masterPurchaseDiscount / 100));
    } else if (globalDefaultDiscount > 0 && mrp > 0) {
      // Priority 3: Global Default Discount exists
      calculatedDiscount = globalDefaultDiscount;
      finalNetPrice = mrp * (1 - (globalDefaultDiscount / 100));
    } else {
      // Priority 4: No price, no purchase discount -> 0
      finalNetPrice = 0;
      calculatedDiscount = 0;
    }

    const newItemToInsert = {
      id: crypto.randomUUID(),
      productId: itemToAdd.id!,
      name: itemToAdd.name || 'Unnamed Item',
      purchasePrice: finalNetPrice,
      originalPurchasePrice: masterPurchasePrice,
      mrp: mrp,
      barcode: itemToAdd.barcode || '',
      quantity: (itemToAdd as any).unitMultiplier || 1,
      unitMultiplier: (itemToAdd as any).unitMultiplier || 1,
      discount: parseFloat(calculatedDiscount.toFixed(2)),
      purchasediscount: parseFloat(calculatedDiscount.toFixed(2)),
      taxRate: resolvedTax,
      stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
      isEditable: true
    };

    setItems((prevItems) => {
      // Check the setting, default to 'top' if undefined
      const order = purchaseSettings?.cartInsertionOrder || 'top';

      if (order === 'bottom') {
        return [...prevItems, newItemToInsert];
      } else {
        return [newItemToInsert, ...prevItems];
      }
    });
  };

  // --- LOGIC 2: HANDLE PRICE CHANGE (Typing) ---
  const handlePriceChange = (id: string, val: string) => {
    if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, purchasePrice: val } : item
      ));
    }
  };

  // --- LOGIC 3: HANDLE DISCOUNT CHANGE (Calc Price from MRP) ---
  const handleDiscountChange = (id: string, v: number | string) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    const safeDiscount = isNaN(n) ? 0 : n;

    setItems(prev => prev.map(i => {
      if (i.id === id) {
        const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.originalPurchasePrice || 0);

        let newPrice = basePrice * (1 - safeDiscount / 100);

        const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;
        newPrice = applyPurchaseRounding(newPrice, isRoundingEnabled);

        return {
          ...i,
          discount: safeDiscount,
          purchasediscount: safeDiscount,
          purchasePrice: newPrice
        };
      }
      return i;
    }));
  };

  // --- LOGIC 4: HANDLE PRICE BLUR (Calc Discount from MRP) ---
  const handlePriceBlur = (id: string) => {
    setItems(prev => prev.map(i => {
      if (i.id === id) {
        const currentPriceVal = parseFloat(String(i.purchasePrice));

        if (i.purchasePrice === '' || isNaN(currentPriceVal)) {
          return { ...i, purchasePrice: 0 };
        }

        let d = 0;
        const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.originalPurchasePrice || 0);

        if (basePrice > 0) {
          d = ((basePrice - currentPriceVal) / basePrice) * 100;
        }

        const finalDiscount = parseFloat(d.toFixed(2));

        return {
          ...i,
          purchasePrice: currentPriceVal,
          discount: finalDiscount,
          purchasediscount: finalDiscount
        };
      }
      return i;
    }));
  };

  const categories = useMemo(() => {
    const groups = new Set(availableItems.map(i => i.itemGroupId || 'Others'));
    return ['All', ...Array.from(groups).sort()];
  }, [availableItems]);

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

  const {
    subtotal,
    taxableAmount,
    taxAmount,
    roundingOffAmount,
    finalAmount,
    totalDiscount,
    totalQuantity
  } = useMemo(() => {
    const taxType = billTaxType;
    const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;

    let mrpTotalAgg = 0;
    let purchasePriceTotalAgg = 0;
    let totalTaxableBaseAgg = 0;
    let totalTaxAgg = 0;
    let finalAmountAggPreRounding = 0;
    let qtyAgg = 0;

    items.forEach(item => {
      const purchasePrice = Number(item.purchasePrice || 0);
      const quantity = item.quantity || 1;
      const itemTaxRate = item.taxRate || 0;
      const mrp = item.mrp || 0;

      qtyAgg += quantity;
      mrpTotalAgg += mrp * quantity;

      const itemTotalPurchasePrice = purchasePrice * quantity;
      purchasePriceTotalAgg += itemTotalPurchasePrice;

      let itemTaxableBase = 0;
      let itemTax = 0;
      let itemFinalTotal = 0;

      const effectiveScheme = taxType === 'none' ? 'none' : 'regular';
      if (effectiveScheme === 'regular') {
        if (taxType === 'exclusive') {
          itemTaxableBase = itemTotalPurchasePrice;
          itemTax = itemTaxableBase * (itemTaxRate / 100);
          itemFinalTotal = itemTaxableBase + itemTax;
        } else {
          itemFinalTotal = itemTotalPurchasePrice;
          itemTaxableBase = itemTotalPurchasePrice / (1 + (itemTaxRate / 100));
          itemTax = itemTotalPurchasePrice - itemTaxableBase;
        }
      } else {
        itemTaxableBase = itemTotalPurchasePrice;
        itemTax = 0;
        itemFinalTotal = itemTaxableBase;
      }

      totalTaxableBaseAgg += itemTaxableBase;
      totalTaxAgg += itemTax;
      finalAmountAggPreRounding += itemFinalTotal;
    });

    const roundedAmount = applyPurchaseRounding(finalAmountAggPreRounding, isRoundingEnabled);
    const currentRoundingOffAmount = roundedAmount - finalAmountAggPreRounding;
    const currentTotalDiscount = mrpTotalAgg - purchasePriceTotalAgg;

    return {
      subtotal: totalTaxableBaseAgg,
      totalDiscount: currentTotalDiscount > 0 ? currentTotalDiscount : 0,
      taxableAmount: totalTaxableBaseAgg,
      taxAmount: totalTaxAgg,
      roundingOffAmount: currentRoundingOffAmount,
      finalAmount: roundedAmount,
      totalQuantity: qtyAgg
    };
  }, [items, purchaseSettings, billTaxType]);


  const handleQuantityChange = (id: string, newQuantity: number) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, newQuantity) } : item
      )
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
  };

  const handleClearCart = () => {
    if (items.length > 0) {
      if (window.confirm("Are you sure you want to remove all items?")) {
        setItems([]);
      }
    }
  };

  const handleItemSelected = (item: Item | null) => {
    if (item) {
      addItemToCart(item);
    }
  };

  const handleProceedToPayment = () => {
    if (items.length === 0) {
      setModal({ message: 'Please add items to purchase.', type: State.ERROR });
      return;
    }
    if (purchaseSettings?.inputMRP) {
      const missingMrpItem = items.find(item => (item.mrp === undefined || item.mrp === null || item.mrp <= 0));
      if (missingMrpItem) {
        setModal({ message: `Cannot proceed: MRP is required but missing or invalid for "${missingMrpItem.name}". Please input MRP for all items.`, type: State.ERROR });
        return;
      }
    }
    if (!invoiceNumber.trim()) {
      setModal({ message: "Invoice Number is required.", type: State.ERROR });
      return;
    }
    setIsDrawerOpen(true);
  };
  const getParsedInvoiceDate = () => {
    try {
      if (!invoiceDate) return new Date();

      const parts = invoiceDate.split('-'); // [YYYY, MM, DD]

      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed in JS
        const day = parseInt(parts[2], 10);

        // 1. Get the exact current time right now (e.g., 2:45:30 PM)
        const finalDate = new Date();

        // 2. Inject ONLY the Year, Month, and Day from the calendar input
        finalDate.setFullYear(year);
        finalDate.setMonth(month);
        finalDate.setDate(day);

        // Result: The user's selected date + the exact current time!
        return finalDate;
      }
    } catch (e) {
      console.error("Date parsing error", e);
    }
    return new Date(); // Safe fallback
  };

  const handleSavePurchase = async (completionData: PaymentCompletionData) => {
    if (!currentUser?.companyId) {
      setModal({ message: 'User or company information missing.', type: State.ERROR });
      return;
    }
    if (purchaseSettings?.requireSupplierName && !completionData.partyName.trim()) { setModal({ message: 'Supplier name is required.', type: State.ERROR }); setIsDrawerOpen(true); return; }
    if (purchaseSettings?.requireSupplierMobile && !completionData.partyNumber.trim()) { setModal({ message: 'Supplier mobile is required.', type: State.ERROR }); setIsDrawerOpen(true); return; }

    const taxType = billTaxType;

    const finalTaxType = taxType;
    const gstScheme = taxType === 'none' ? 'none' : 'regular';

    const formatItemsForDB = (itemsToFormat: PurchaseItem[]): PurchaseItem[] => {
      return itemsToFormat.map((item) => {
        const purchasePrice = Number(item.purchasePrice || 0);
        const quantity = item.quantity || 1;
        const itemTaxRate = finalTaxType === 'none' ? 0 : (item.taxRate || 0);

        const itemTotalPurchasePrice = purchasePrice * quantity;
        let itemTaxableBase = 0;
        let itemTax = 0;

        if (finalTaxType === 'exclusive') {
          itemTaxableBase = Math.round(itemTotalPurchasePrice);
          itemTax = itemTaxableBase * (itemTaxRate / 100);
        } else if (finalTaxType === 'inclusive') {
          itemTaxableBase = itemTotalPurchasePrice / (1 + (itemTaxRate / 100));
          itemTax = itemTotalPurchasePrice - itemTaxableBase;
        } else {
          itemTaxableBase = itemTotalPurchasePrice;
          itemTax = 0;
        }

        const formattedTaxable = parseFloat(itemTaxableBase.toFixed(2));
        const formattedTax = parseFloat(itemTax.toFixed(2));

        // --- NEW: Calculate Item-Wise Total (Taxable + Tax) ---
        const itemLineTotal = parseFloat((formattedTaxable + formattedTax).toFixed(2));

        const { customPrice, isEditable, originalPurchasePrice, ...dbItem } = item;

        return {
          ...dbItem,
          id: item.productId || item.id,
          purchasePrice: purchasePrice,
          discount: item.purchasediscount ?? item.discount ?? 0,
          taxableAmount: parseFloat(itemTaxableBase.toFixed(2)),
          taxAmount: parseFloat(itemTax.toFixed(2)),
          taxRate: itemTaxRate,
          taxType: finalTaxType,
          finalPrice: itemLineTotal,
          unitMultiplier: item.unitMultiplier || 1,
        };
      });
    };


    const formattedItemsForDB = formatItemsForDB(items);

    if (editModeData && purchaseIdToEdit) {
      await updateExistingPurchase(purchaseIdToEdit, completionData, formattedItemsForDB, gstScheme, finalTaxType);
    } else {
      await createNewPurchase(completionData, formattedItemsForDB, gstScheme, finalTaxType);
    }
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

    if (invoiceNumber.trim() === currentAutoNum) {
      // Only increment if they actually used the suggested number!
      await incrementPurchaseCounter(companyId);
    }

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
          subtotal: subtotal,
          totalDiscount: totalDiscount,
          taxableAmount: taxableAmount,
          taxAmount: taxAmount,
          gstScheme: gstScheme,
          taxType: finalTaxType,
          roundingOff: roundingOffAmount,
          manualDiscount: manualDiscount,
          totalAmount: finalTotalAmount,
          paymentMethods: completionData.paymentDetails,
          createdAt: getParsedInvoiceDate(),
          companyId: companyId,
          voucherName: purchaseSettings?.voucherName ?? 'Purchase',
        };

        const newPurchaseRef = doc(collection(db, 'companies', companyId, 'purchases'));
        transaction.set(newPurchaseRef, purchaseData);

        const stockUpdates = new Map<string, number>();
        formattedItemsForDB.forEach(item => {
          const pid = item.id;
          stockUpdates.set(pid, (stockUpdates.get(pid) || 0) + (item.quantity || 1));
        });

        stockUpdates.forEach((qty, pid) => {
          const itemRef = doc(db, "companies", companyId, "items", pid);
          transaction.update(itemRef, {
            stock: firebaseIncrement(qty),
            updatedAt: serverTimestamp(),
          });
        });
      });

      setIsDrawerOpen(false);
      const savedItemsCopy = [...items];
      localStorage.removeItem('purchase_cart_draft');

      if (!purchaseSettings?.copyVoucherAfterSaving) {
        setItems([]);
        const nextNum = await peekNextPurchaseNumber(companyId);
        setInvoiceNumber(nextNum);
      }
      if (purchaseSettings?.enableBarcodePrinting) {
        setShowPrintQrModal(savedItemsCopy);
      } else {
        setModal({ message: `Purchase #${finalInvoiceNumber} saved!`, type: State.SUCCESS });
        setTimeout(() => { setModal(null); }, 1500);
      }
    } catch (err: any) {
      console.error('Error saving purchase:', err);
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
      const finalTotalAmount = Math.max(0, finalAmount - manualDiscount);

      await runTransaction(db, async (transaction) => {
        const purchaseRef = doc(db, 'companies', companyId, 'purchases', purchaseId);
        const purchaseDoc = await transaction.get(purchaseRef);
        if (!purchaseDoc.exists()) throw new Error("Purchase not found.");

        const originalItemsMap = new Map(
          (purchaseDoc.data().items as PurchaseItem[] || []).map(item => [item.id, item.quantity || 1])
        );
        const currentItemsMap = new Map(
          formattedItemsForDB.map(item => [item.id, item.quantity || 1])
        );
        const allItemIds = new Set([...originalItemsMap.keys(), ...currentItemsMap.keys()]);

        allItemIds.forEach(id => {
          const oldQty = originalItemsMap.get(id) || 0;
          const newQty = currentItemsMap.get(id) || 0;
          const difference = newQty - oldQty;

          if (difference !== 0) {
            const itemRef = doc(db, 'companies', companyId, 'items', id);
            transaction.update(itemRef, {
              stock: firebaseIncrement(difference)
            });
          }
        });

        const updatedPurchaseData: Partial<PurchaseDocumentData> = {
          partyName: completionData.partyName.trim(),
          partyNumber: completionData.partyNumber.trim(),
          partyAddress: completionData.partyAddress || '',
          partyGstin: completionData.partyGST || '',
          invoiceNumber: invoiceNumber.trim(),
          items: formattedItemsForDB,
          subtotal: subtotal,
          totalDiscount: totalDiscount,
          taxableAmount: taxableAmount,
          taxAmount: taxAmount,
          gstScheme: gstScheme,
          taxType: finalTaxType,
          roundingOff: roundingOffAmount,
          manualDiscount: manualDiscount,
          totalAmount: finalTotalAmount,
          paymentMethods: completionData.paymentDetails,
          updatedAt: serverTimestamp(),
          createdAt: getParsedInvoiceDate(),
        };

        transaction.update(purchaseRef, updatedPurchaseData);
      });
      showSuccessModal('Purchase updated successfully!', ROUTES.JOURNAL);
    } catch (err: any) {
      console.error('Error updating purchase:', err);
      setModal({ message: `Update failed: ${err.message || 'Unknown error'}`, type: State.ERROR });
    }
  };

  const showSuccessModal = (message: string, navigateTo?: string) => {
    localStorage.removeItem('purchase_cart_draft');
    setIsDrawerOpen(false);
    setModal({ message, type: State.SUCCESS });
    setTimeout(() => {
      setModal(null);
      if (navigateTo) {
        navigate(navigateTo);
      } else if (!purchaseSettings?.copyVoucherAfterSaving) {
        setItems([]);
      }
    }, 1500);
  };

  const closeBarcodeLinkModal = () => {
    setIsBarcodeLinkModalOpen(false);
    setBarcodeToLink(null);
  };

  const handleLinkScannedBarcode = async (selectedItem: Item) => {
    if (!barcodeToLink || !dbOperations) return;
    if (!selectedItem.id) {
      setModal({ message: 'Selected item is invalid. Please try another item.', type: State.ERROR });
      return;
    }

    setIsLinkingBarcode(true);
    try {
      await dbOperations.updateItem(selectedItem.id, { barcode: barcodeToLink });
      const updatedItem: Item = { ...selectedItem, barcode: barcodeToLink };

      setAvailableItems(prev => {
        const exists = prev.some(item => item.id === selectedItem.id);
        if (!exists) return [...prev, updatedItem];
        return prev.map(item => item.id === selectedItem.id ? { ...item, barcode: barcodeToLink } : item);
      });

      addItemToCart(updatedItem);
      closeBarcodeLinkModal();
      setModal({ message: `Barcode linked to "${selectedItem.name}".`, type: State.SUCCESS });
    } catch (err) {
      console.error('Failed to link barcode:', err);
      setModal({ message: 'Failed to link barcode. Please try again.', type: State.ERROR });
    } finally {
      setIsLinkingBarcode(false);
    }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    setIsScannerOpen(false);
    try {
      const cleanBarcode = barcode.trim();
      let itemToAdd: Item | null | undefined = availableItems.find(item => item.barcode === cleanBarcode);

      if (!itemToAdd && dbOperations) {
        itemToAdd = await dbOperations.getItemByBarcode(cleanBarcode);
      }

      if (itemToAdd) {
        addItemToCart(itemToAdd);
        setAvailableItems(prev => {
          const exists = prev.some(item => item.id === itemToAdd!.id);
          return exists ? prev : [...prev, itemToAdd!];
        });
      } else {
        const hasAnyItemWithoutBarcode = availableItems.some(item => !(item.barcode || '').trim());
        if (!hasAnyItemWithoutBarcode) {
          setModal({ message: `Item not found for barcode: "${cleanBarcode}"`, type: State.ERROR });
          return;
        }
        setBarcodeToLink(cleanBarcode);
        setIsBarcodeLinkModalOpen(true);
      }
    } catch (err) {
      console.error('Barcode scan error:', err);
      setModal({ message: 'Scan error occurred.', type: State.ERROR });
    }
  };

  const handleNavigateToQrPage = () => {
    if (showPrintQrModal) {
      const itemsForPrint = showPrintQrModal.map(item => ({
        ...item,
        id: item.productId || item.id,
        purchasePrice: Number(item.purchasePrice || 0) // Ensure number for QR print
      }));
      navigate(ROUTES.PRINTQR, { state: { prefilledItems: itemsForPrint } });
      setShowPrintQrModal(null);
    }
  };

  const handleCloseQrModal = () => { setShowPrintQrModal(null); };

  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
  const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    setAvailableItems(prevItems => prevItems.map(item =>
      item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item
    ));
    const updateForCart: Partial<PurchaseItem> & { stock?: number } = { ...updatedItemData };
    if ((updateForCart as any).Stock !== undefined) { updateForCart.stock = (updateForCart as any).Stock; delete (updateForCart as any).Stock; }
    Object.keys(updateForCart).forEach(key => { if (updateForCart[key as keyof typeof updateForCart] === undefined) delete updateForCart[key as keyof typeof updateForCart]; });
    setItems(prevCartItems => prevCartItems.map(cartItem => {
      if (cartItem.productId === selectedItemForEdit?.id) {
        return { ...cartItem, ...updateForCart, id: cartItem.id };
      }
      return cartItem;
    }));
  };

  if (pageIsLoading) return (<div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>);
  if (error) return (<div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button></div>);

  const showTaxToggle = true; // Always show the manual tax toggle on the UI
  const displayTaxTotal = showTaxToggle && billTaxType !== 'none';
  const isCardView = purchaseSettings?.purchaseViewType === 'card';
  const isCardImageView = isCardView && (purchaseSettings?.cardViewWithPhoto !== false);


  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-200 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">

      {/* MOBILE: date left, title center, inv no right */}
      <div className="flex md:hidden items-center justify-between w-full mb-2">
        <div className="flex flex-col items-center">
          <input
            type="date" // 👈 Changed to "date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            // 👇 Changed width to w-32 and added cursor-pointer
            className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer"
          />
          <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">DATE</span>

        </div>
        <h1 className="text-2xl font-bold text-gray-800 text-center flex-1">
          {editModeData ? 'Edit Purchase' : (purchaseSettings?.voucherName ?? 'Purchase')}
        </h1>
        <div className="flex flex-col items-center">
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
          />
          <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Inv No</span>
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden md:flex md:flex-row md:items-center w-full md:w-auto gap-1 md:gap-4 md:mb-0">
        <h1 className="text-2xl font-bold text-gray-800">
          {editModeData ? 'Edit Purchase' : (purchaseSettings?.voucherName ?? 'Purchase')}
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">INV NO:</span>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">DATE:</span>
            <input
              type="date" // 👈 Changed to "date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              // 👇 Changed width to w-32 and added cursor-pointer
              className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Purchase / Purchase Return buttons*/}
      {!editModeData && (
        <div className="flex items-center justify-center md:justify-end gap-3">
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE)} active={isActive(ROUTES.PURCHASE)}>Purchase</CustomButton>
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE_RETURN)} active={isActive(ROUTES.PURCHASE_RETURN)}>Purchase Return</CustomButton>
        </div>
      )}
    </div>
  );

  // --- CARD VIEW RENDER (GRID) ---
  if (isCardView) {
    return (
      <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-0">
        {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
        <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
        <BarcodeLinkModal
          isOpen={isBarcodeLinkModalOpen}
          barcode={barcodeToLink}
          items={availableItems}
          isLinking={isLinkingBarcode}
          onClose={closeBarcodeLinkModal}
          onLink={handleLinkScannedBarcode}
        />
        {renderHeader()}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200 overflow-hidden">
            <div className="flex-shrink-0 bg-gray-50 border-b border-gray-200">
              <div className="p-3 bg-white  flex gap-2 items-center">
                <div className="flex-grow">
                  <SearchableItemInput
                    label=""
                    placeholder="Search items by name or barcode..."
                    items={availableItems}
                    onItemSelected={(item) => {
                      if (item) {
                        addItemToCart(item);
                        setGridSearchQuery('');
                      }
                    }}
                    isLoading={pageIsLoading}
                    error={error}
                    onAddItem={(query) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })}
                  />
                </div>
                <button
                  onClick={() => setIsScannerOpen(true)}
                  className='bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors'
                  title="Scan Barcode"
                >
                  <IconScanCircle width={22} height={22} />
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto px-3 pb-3 bg-white border-b border-gray-300">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-sm text-xs whitespace-nowrap border transition
                      ${selectedCategory === cat
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                      }`}
                  >
                    {cat === 'All' ? 'All' : itemGroupMap[cat] || 'Others'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-0 pb-0 bg-gray-100 border-b border-gray-200 px-2 mb-1">
              <h3 className="text-gray-700 text-base font-medium">Cart</h3>
              {items.length > 0 && (
                <button onClick={handleClearCart} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                  <FiTrash2 size={16} />
                  <span>Clear Cart</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5  bg-gray-100" style={{ gridAutoRows: 'auto', alignContent: 'start', gap: '14px', padding: '8px 14px' }}>
              {sortedGridItems.length === 0 ? (
                <div className="col-span-full text-center text-gray-500 mt-10 py-10 bg-white rounded-lg">
                  {gridSearchQuery ? (
                    <>
                      <p className="text-lg">No items found for "<span className="font-semibold">{gridSearchQuery}</span>"</p>
                      <p className="text-sm mt-2">Try searching with different keywords or scan barcode</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg">🔍 Start typing to search items</p>
                      <p className="text-sm mt-2">Search by name or scan barcode to add items</p>
                    </>
                  )}
                </div>
              ) : (
                sortedGridItems.map(item => {
                  const matchingCartItems = items.filter(i => i.productId === item.id);
                  const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
                  const isSelected = matchingCartItems.length > 0;
                  const quantity = lastAddedCartItem?.quantity || 0;
                  const cp = lastAddedCartItem?.purchasePrice ?? item.purchasePrice ?? item.mrp ?? 0;
                  const mrp = item.mrp || 0;
                  const lineSubtotal = Math.round((Number(cp) * quantity) * 100) / 100;
                  const discPct = mrp > 0 && Number(cp) < mrp ? Math.round(((mrp - Number(cp)) / mrp) * 100) : 0;


                  // ── CARD WITH IMAGE ────────────────────────────────────────────────────
                  if (isCardImageView) {
                    const imageUrl: string | undefined =
                      (item as any).image ||
                      (item as any).imageUrl ||
                      (item as any).thumbnail ||
                      (item as any).imageURL;

                    return (
                      <div
                        key={item.id}
                        className={`bg-white rounded-sm flex flex-col w-full overflow-visible transition-all duration-200 relative group
        ${isSelected
                            ? 'border-2 border-blue-400 shadow-md ring-1 ring-blue-100'
                            : 'border border-gray-100 hover:shadow-md hover:border-gray-200'}`}
                        style={{ margin: '0 2px' }}
                      >
                        {/* ── Image Block ── */}
                        <div className="relative w-full bg-gray-100 rounded-t-sm overflow-hidden" style={{ height: '140px' }}>

                          {/* Centered image container */}
                          <div className="w-full h-full flex items-center justify-center p-1.5">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  const placeholder = (e.currentTarget as HTMLImageElement)
                                    .parentElement
                                    ?.querySelector<HTMLElement>('[data-no-image]');
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            ) : null}

                            {/* Camera placeholder – shown when no image */}
                            <div
                              data-no-image
                              className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50"
                              style={{ display: imageUrl ? 'none' : 'flex' }}
                            >
                              <FiCamera className="text-gray-300" size={22} strokeWidth={1.4} />
                              <span className="text-[9px] text-gray-300 mt-1 uppercase tracking-wide font-medium">No Image</span>
                            </div>
                          </div>

                          {/* ── Discount badge – Blinkit style, top-left ── */}
                          {discPct > 0 && (
                            <div
                              className="absolute top-1.5 left-1.5 z-10 bg-blue-600 text-white font-bold text-[9px] leading-tight px-1.5 py-[3px] rounded-md shadow-sm"
                            >
                              {discPct}% OFF
                            </div>
                          )}

                          {/* ✕ remove – shown only when in cart */}
                          {isSelected && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteItem(lastAddedCartItem.id); }}
                              className="absolute top-1 right-1.5 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-[10px] font-bold shadow-sm border border-gray-100"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Content block */}
                        <div className="p-1.5 sm:p-2 flex flex-col flex-1 gap-0.5">
                          {/* Item name — always 2 lines, fixed height */}
                          <div className="flex items-start justify-between gap-1" style={{ minHeight: '28px' }}>
                            <p
                              className="text-[11px]  font-bold text-gray-900 leading-snug flex-1 overflow-hidden"
                              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                              title={item.name}
                            >
                              {item.name.length > 45 ? item.name.slice(0, 45) : item.name}
                            </p>
                            <button onClick={(e) => { e.stopPropagation(); const orig = availableItems.find(a => a.id === item.id); if (orig) handleOpenEditDrawer(orig); }}
                              className="text-gray-400 hover:text-blue-600 flex-shrink-0 mt-0.5">
                              <FiEdit size={11} />
                            </button>
                          </div>

                          {/* Fixed bottom section — always same height regardless of name */}
                          <div className="mt-auto flex flex-col gap-1 pt-1 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>

                            {/* Row 1: Price + MRP */}
                            <div className="flex items-baseline gap-1">
                              <span className="text-xs font-semibold text-gray-900">
                                ₹{Number(cp).toLocaleString('en-IN')}
                              </span>
                              {discPct > 0 && mrp > 0 && Number(cp) < mrp && (
                                <span className="text-[10px] text-gray-400 line-through">
                                  ₹{mrp.toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>

                            {/* Subtotal row — only when selected */}
                            {isSelected && (
                              <div className="flex items-center gap-1 border-t border-gray-50 pt-1 min-w-0">
                                <span className="text-[9px] uppercase text-gray-400 tracking-wide flex-shrink-0">Subtotal</span>
                                <span className="text-[10px] font-semibold text-blue-600 truncate">₹{lineSubtotal.toLocaleString('en-IN')}</span>
                              </div>
                            )}

                            {/* Row 3: Add button OR Quantity selector — always pinned last */}
                            {!isSelected ? (
                              <>
                                <div className="h-[18px] border-t border-gray-50" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addItemToCart(item);
                                  }}
                                  className="w-full h-[26px] rounded-md text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
                                >
                                  + Add
                                </button>
                              </>
                            ) : (
                              <div
                                className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-white w-full"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (quantity > 1) handleQuantityChange(lastAddedCartItem.id, quantity - 1);
                                    else handleDeleteItem(lastAddedCartItem.id);
                                  }}
                                  className="h-7 flex-1 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                >−</button>
                                <span className="w-8 text-center text-[11px] font-semibold text-gray-800">{quantity}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuantityChange(lastAddedCartItem.id, quantity + 1);
                                  }}
                                  className="h-7 flex-1 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                >+</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  // ── CARD WITHOUT IMAGE (existing card — unchanged below) ───────────────
                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-sm border flex flex-col overflow-visible transition-all relative
      ${isSelected ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-100 hover:shadow-sm'}`}
                      style={{ minHeight: 130 }}
                    >
                      {/* Discount badge - corner stamp */}
                      {discPct > 0 && (
                        <div
                          className="absolute -top-px -left-px bg-blue-600 text-white text-[8px] font-medium leading-tight text-center z-10"
                          style={{ borderRadius: '10px 0 8px 0', padding: '3px 6px', minWidth: 28 }}
                        >
                          {discPct}% OFF
                        </div>
                      )}

                      {/* X button - only when selected */}
                      {isSelected && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteItem(lastAddedCartItem.id); }}
                          className="absolute top-1 right-2 text-gray-400 hover:text-red-500 transition-colors z-10 bg-transparent border-none cursor-pointer text-xs leading-none"
                        >
                          ✕
                        </button>
                      )}

                      <div className="p-2.5 flex flex-col gap-1.5 flex-1">

                        {/* Item name - 2 line clamp then ellipsis */}
                        <p
                          className="text-[12px] font-medium text-gray-900 leading-snug pr-4 min-h-[32px] flex items-start"
                          style={{
                            marginTop: discPct > 0 ? 14 : 2,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical' as any,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={item.name}
                        >
                          {item.name}
                        </p>

                        {/* Price + edit icon in same row */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-semibold text-gray-900">
                              ₹{Number(cp).toLocaleString('en-IN')}
                            </span>
                            {discPct > 0 && mrp > 0 && Number(cp) < mrp && (
                              <span className="text-[10px] text-gray-400 line-through">
                                ₹{mrp.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const orig = availableItems.find(a => a.id === item.id);
                              if (orig) handleOpenEditDrawer(orig);
                            }}
                            className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                          >
                            <FiEdit size={10} />
                          </button>
                        </div>

                        {/* Bottom - pinned, same height for all cards */}
                        {/* Bottom - pinned, same height for all cards */}
                        <div className="mt-auto pt-2 flex items-center justify-between gap-2 min-w-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>

                          {!isSelected ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); addItemToCart(item); }}
                              className="w-full py-1.5 rounded-md text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
                            >
                              + Add
                            </button>
                          ) : (
                            <div className="flex items-center justify-between gap-1 w-full min-w-0 overflow-hidden">
                              {/* Subtotal LEFT */}
                              <div className="text-left min-w-0 flex-shrink overflow-hidden">
                                <p className="text-[9px] uppercase text-gray-400 tracking-wide leading-none">Subtotal</p>
                                <p className="text-[11px] font-semibold text-blue-600 truncate">
                                  ₹{lineSubtotal.toLocaleString('en-IN')}
                                </p>
                              </div>

                              {/* Quantity RIGHT */}
                              <div className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-white flex-shrink-0">
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (quantity > 1) handleQuantityChange(lastAddedCartItem.id, quantity - 1); else handleDeleteItem(lastAddedCartItem.id); }}
                                  className="w-6 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                >−</button>
                                <span className="w-5 text-center text-xs font-semibold text-gray-800">{quantity}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleQuantityChange(lastAddedCartItem.id, quantity + 1); }}
                                  className="w-6 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                >+</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Section - Purchase Summary (Same as before) */}
          <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
            <div className="flex-1 p-6 flex flex-col justify-end">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Purchase Summary</h2>

              <GenericBillFooter
                isExpanded={true}
                onToggleExpand={() => { }}
                totalQuantity={totalQuantity}
                subtotal={subtotal}
                taxAmount={taxAmount}
                finalAmount={finalAmount}
                roundingOffAmount={roundingOffAmount}
                showTaxRow={displayTaxTotal}
                taxLabel="Total Tax"
                actionLabel={isEditMode ? 'Update' : 'Pay Now'}
                onActionClick={handleProceedToPayment}
                disableAction={items.length === 0}
              >
                {showTaxToggle && (
                  <div className="flex justify-between items-center py-2 bg-transparent border-b border-gray-100 mb-4">
                    <p className="text-sm font-semibold text-gray-600">Tax Calculation</p>
                    <select
                      value={billTaxType}
                      onChange={(e) => setBillTaxType(e.target.value as TaxOption)}
                      className="border border-gray-300 rounded-md p-1 text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 font-medium"
                    >
                      <option value="exclusive">Tax Exclusive</option>
                      <option value="inclusive">Tax Inclusive</option>
                      <option value="exempt">Tax Exempt</option>
                    </select>
                  </div>
                )}
              </GenericBillFooter>
            </div>
          </div>

          {/* Mobile Footer */}
          <div className="md:hidden w-full flex-shrink-0">
            <GenericBillFooter
              isExpanded={isFooterExpanded}
              onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
              totalQuantity={totalQuantity}
              subtotal={subtotal}
              taxAmount={taxAmount}
              finalAmount={finalAmount}
              roundingOffAmount={roundingOffAmount}
              showTaxRow={displayTaxTotal}
              taxLabel="Total Tax"
              actionLabel={isEditMode ? 'Update' : 'Pay Now'}
              onActionClick={handleProceedToPayment}
              disableAction={items.length === 0}
            >
              {showTaxToggle && (
                <div className="flex justify-between items-center p-2 bg-white border-b border-gray-200 px-5">
                  <p className="text-sm font-semibold text-gray-600">Tax Calculation</p>
                  <select
                    value={billTaxType}
                    onChange={(e) => setBillTaxType(e.target.value as TaxOption)}
                    className="border border-gray-300 rounded-md p-1 text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 font-medium">
                    <option value="exclusive">Tax Exclusive</option>
                    <option value="inclusive">Tax Inclusive</option>
                    <option value="exempt">Tax Exempt</option>
                  </select>
                </div>
              )}
            </GenericBillFooter>
          </div>
        </div>

        <PaymentDrawer
          mode='purchase'
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          subtotal={subtotal}
          billTotal={finalAmount}
          initialDiscount={editModeData?.manualDiscount}
          onPaymentComplete={handleSavePurchase}
          isPartyNameEditable={!editModeData}
          initialPartyName={editModeData ? editModeData.partyName : ''}
          initialPartyNumber={editModeData ? editModeData.partyNumber : ''}
          totalQuantity={totalQuantity}
          requireCustomerName={purchaseSettings?.requireSupplierName}
          requireCustomerMobile={purchaseSettings?.requireSupplierMobile}
        />

        <ItemEditDrawer
          item={selectedItemForEdit}
          isOpen={isItemDrawerOpen}
          onClose={handleCloseEditDrawer}
          onSaveSuccess={handleSaveSuccess}
        />
      </div >
    );
  }

  // --- LIST VIEW (Desktop Split / Mobile Stack) ---
  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      <BarcodeLinkModal
        isOpen={isBarcodeLinkModalOpen}
        barcode={barcodeToLink}
        items={availableItems}
        isLinking={isLinkingBarcode}
        onClose={closeBarcodeLinkModal}
        onLink={handleLinkScannedBarcode}
      />

      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200">

          <div className="flex-shrink-0 p-2 bg-white border-b mt-2 rounded-sm md:mt-0">
            <div className="flex gap-2 items-end">
              <div className="flex-grow">
                <SearchableItemInput label="Search & Add Item" placeholder="Search by name or barcode..." items={availableItems} onItemSelected={handleItemSelected} isLoading={pageIsLoading} error={error} onAddItem={(query) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })} />
              </div>
              <button onClick={() => setIsScannerOpen(true)} className="p-3 bg-gray-700 text-white rounded-md font-semibold transition hover:bg-gray-800" title="Scan Barcode">
                <IconScanCircle width={20} height={20} />
              </button>
            </div>
          </div>

          <div className='flex-grow overflow-y-auto p-2 bg-gray-100'>
            <div className="flex justify-between items-center px-2 mb-2">
              <h3 className="text-gray-700 text-lg font-medium">Cart</h3>
              {items.length > 0 && (
                <button onClick={handleClearCart} className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 font-medium transition-colors">
                  <FiTrash2 size={16} />
                  <span>Clear Cart</span>
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <GenericCartList
                items={cartItemsAdapter}
                availableItems={availableItems}
                basePriceKey="mrp"
                priceLabel="MRP"
                settings={{
                  enableRounding: false,
                  roundingInterval: 0,
                  enableItemWiseDiscount: true,
                  lockDiscount: false,
                  lockPrice: false
                }}
                applyRounding={(val) => val}
                State={State}
                setModal={setModal}
                onOpenEditDrawer={handleOpenEditDrawer}
                onDeleteItem={handleDeleteItem}
                onDiscountChange={handleDiscountChange}
                onCustomPriceChange={handlePriceChange}
                onCustomPriceBlur={handlePriceBlur}
                onQuantityChange={(id, qty) => handleQuantityChange(id, qty)}
              />
            </div>
          </div>

          <div className="md:hidden">
            <GenericBillFooter
              isExpanded={isFooterExpanded}
              onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
              totalQuantity={totalQuantity}
              subtotal={subtotal}
              taxAmount={taxAmount}
              finalAmount={finalAmount}
              roundingOffAmount={roundingOffAmount}
              showTaxRow={displayTaxTotal}
              taxLabel="Total Tax"
              actionLabel={isEditMode ? 'Update' : 'Pay Now'}
              onActionClick={handleProceedToPayment}
              disableAction={items.length === 0}
            >
              {showTaxToggle && (
                <div className="flex justify-between items-center p-2 bg-white border-b border-gray-200 px-5">
                  <p className="text-sm font-semibold text-gray-600">Tax Calculation</p>
                  <select
                    value={billTaxType}
                    onChange={(e) => setBillTaxType(e.target.value as TaxOption)}
                    className="border border-gray-300 rounded-md p-1 text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 font-medium"
                  >
                    <option value="exclusive">Tax Exclusive</option>
                    <option value="inclusive">Tax Inclusive</option>
                    <option value="none">Tax Exempt</option>
                  </select>
                </div>
              )}
            </GenericBillFooter>
          </div>

        </div>

        <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="flex-1 p-6 flex flex-col justify-end">
            <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Purchase Summary</h2>

            <GenericBillFooter
              isExpanded={true}
              onToggleExpand={() => { }}
              totalQuantity={totalQuantity}
              subtotal={subtotal}
              taxAmount={taxAmount}
              finalAmount={finalAmount}
              roundingOffAmount={roundingOffAmount}
              showTaxRow={displayTaxTotal}
              taxLabel="Total Tax"
              actionLabel={isEditMode ? 'Update' : 'Pay Now'}
              onActionClick={handleProceedToPayment}
              disableAction={items.length === 0}
            >
              {showTaxToggle && (
                <div className="flex justify-between items-center py-2 bg-transparent border-b border-gray-100 mb-4">
                  <p className="text-sm font-semibold text-gray-600">Tax Calculation</p>
                  <select
                    value={billTaxType}
                    onChange={(e) => setBillTaxType(e.target.value as TaxOption)}
                    className="border border-gray-300 rounded-md p-1 text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 font-medium"
                  >
                    <option value="exclusive">Tax Exclusive</option>
                    <option value="inclusive">Tax Inclusive</option>
                    <option value="none">Tax Exempt</option>
                  </select>
                </div>
              )}
            </GenericBillFooter>
          </div>
        </div>
      </div>

      <PaymentDrawer
        mode='purchase'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={subtotal}
        totalTax={taxAmount}
        billTotal={finalAmount}
        onPaymentComplete={handleSavePurchase}
        isPartyNameEditable={!editModeData}
        initialDiscount={editModeData?.manualDiscount}
        initialPartyName={editModeData ? editModeData.partyName : ''}
        initialPartyNumber={editModeData ? editModeData.partyNumber : ''}
        totalQuantity={totalQuantity}
        requireCustomerName={purchaseSettings?.requireSupplierName}
        requireCustomerMobile={purchaseSettings?.requireSupplierMobile}
      />
      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isItemDrawerOpen}
        onClose={handleCloseEditDrawer}
        onSaveSuccess={handleSaveSuccess}
      />

      {showPrintQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800">Purchase Saved!</h3>
            <p className="my-4 text-gray-600">Print barcodes/QR codes for the items?</p>
            <div className="flex justify-end gap-4 mt-6">
              <CustomButton variant={Variant.Outline} onClick={handleCloseQrModal}>No</CustomButton>
              <CustomButton variant={Variant.Filled} onClick={handleNavigateToQrPage}>Yes, Print</CustomButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasePage;
