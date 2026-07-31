import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Item } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { useAuth, useDatabase } from '../../context/auth-context';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import { incrementPurchaseCounter, peekNextPurchaseNumber } from '../../UseComponents/InvoiceCounter';
import { Spinner } from '../../Components/ui/spinner';
import { Button } from '../../Components/ui/button';
import { ConfirmDialog } from '../../Components/ui/confirm-dialog';
import { Camera, Trash2, AlertTriangle } from 'lucide-react';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { usePurchaseSettings } from '../../context/SettingsContext';
import { GenericCartList } from '../../Components/CartItem';
import { GenericBillFooter } from '../../Components/Footer';
import { useSmartScanner } from '../../Pages/hooks/SmartScanner';
import Fuse from 'fuse.js';
import {
  findPurchaseSettingsDocId,
  subscribeToPurchaseCounter,
  fetchItemGroupMap,
  fetchPurchaseById,
  createPurchaseTransaction,
  updatePurchaseTransaction,
  type PurchaseItem,
  type PurchaseRecord,
} from '../../services/purchase/purchaseTransaction.service';
import { PurchaseHeader } from './components/PurchaseHeader';
import { PurchaseCatalogGrid, type PurchaseGridSortOrder } from './components/PurchaseCatalogGrid';
import { SmartScanVerifyModal } from './components/PurchaseSmartScanModal';
import { PurchaseCameraChoiceModal } from './components/PurchaseCameraChoiceModal';

const applyPurchaseRounding = (amount: number, isRoundingEnabled: boolean): number => {
  if (!isRoundingEnabled) {
    return amount;
  }
  return Math.round(amount);
};

type TaxOption = 'inclusive' | 'exclusive' | 'exempt';
const PurchasePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseSettings, loadingSettings: loadingPurchaseSettings } = usePurchaseSettings();

  const purchaseIdToEdit = location.state?.purchaseId as string | undefined;
  const isEditMode = !!purchaseIdToEdit;

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
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
  const { fileInputRef, isScanning, scannedData, setScannedData, processFile, clearScannedData } = useSmartScanner();
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const isInvoiceNumberManuallyEdited = useRef(false);
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
  const [cartSearchQuery, setCartSearchQuery] = useState<string>('');
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  const [sortOrder, setSortOrder] = useState<PurchaseGridSortOrder>('az');

  const [showPrintQrModal, setShowPrintQrModal] = useState<PurchaseItem[] | null>(null);
  const [editModeData, setEditModeData] = useState<PurchaseRecord | null>(null);
  const [_settingsDocId, setSettingsDocId] = useState<string | null>(null);


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
      const docId = await findPurchaseSettingsDocId(companyId);
      if (docId) setSettingsDocId(docId);
    };

    let unsubscribeCounter: () => void = () => { };

    if (!purchaseIdToEdit) {
      unsubscribeCounter = subscribeToPurchaseCounter(companyId, (nextNum) => {
        // Prevent overwriting if the user is typing their own number
        if (isInvoiceNumberManuallyEdited.current) return;

        // Note: If you use a dynamic prefix for purchases, you can fetch it from purchaseSettings here
        const prefix = purchaseSettings?.voucherPrefix || 'PUR';
        setInvoiceNumber(`${prefix}-${nextNum}`);
      });
    }

    findSettingsDocId();

    const initializePage = async () => {
      try {
        const fetchedItems = await dbOperations.syncItems();

        const groupMap: Record<string, string> = currentUser?.companyId
          ? await fetchItemGroupMap(currentUser.companyId)
          : {};
        setItemGroupMap(groupMap);
        setAvailableItems(fetchedItems);

        if (purchaseIdToEdit) {
          const purchaseData = await fetchPurchaseById(companyId, purchaseIdToEdit);

          if (purchaseData) {
            setInvoiceNumber(purchaseData.invoiceNumber);

            if (purchaseData.taxType) {
              setBillTaxType((purchaseData.taxType === 'exempt' ? 'none' : purchaseData.taxType) as TaxOption);
            }

            const validatedItems = (purchaseData.items || []).map((item: any) => {
              const masterItem = fetchedItems.find(i => i.id === (item.productId || item.id));
              const recoveredTaxRate = (item.taxRate && item.taxRate > 0)
                ? item.taxRate
                : (masterItem?.tax ?? masterItem?.taxRate ?? 0);

              // Use the saved transaction discount, NOT master item sale discount
              const transactionDiscount = item.discount || 0;
              const transactionDiscount2 = item.purchasediscount2 || 0;

              return {
                // FIX: Force a brand new unique ID for React list rendering
                id: crypto.randomUUID(),
                name: item.name || 'Unknown Item',
                unit: item.unit || masterItem?.unit || '',
                purchasePrice: item.purchasePrice || 0,
                originalPurchasePrice: masterItem?.purchasePrice || 0,
                quantity: item.quantity || 1,
                mrp: item.mrp || 0,
                discount: transactionDiscount,
                purchasediscount: transactionDiscount,
                purchasediscount2: transactionDiscount2,
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
        }
        setError(null);
      } catch (err: any) {
        console.error('Failed to initialize page:', err);
        setError('Failed to load data. Navigating back.');
        setTimeout(() => navigate(-1), 3000);
      }
    };

    initializePage();
    return () => unsubscribeCounter();
  }, [dbOperations, currentUser, purchaseIdToEdit, pageIsLoading, navigate]);

  const cartItemsAdapter = useMemo(() => {
    const mapped = items.map(item => ({
      ...item,
      purchasePrice: Number(item.purchasePrice || 0),
      customPrice: item.purchasePrice,
      // GenericCartList will display this as "Discount"
      discount: item.purchasediscount ?? item.discount ?? 0,
      discount2: item.purchasediscount2 ?? 0,
      isEditable: item.isEditable ?? true
    }));
    const q = cartSearchQuery.trim().toLowerCase();
    if (!q) return mapped;

    // same "search bumps result to top" behavior as the Orders page search
    return [...mapped].sort((a, b) => {
      const aMatch = (a.name || '').toLowerCase().includes(q);
      const bMatch = (b.name || '').toLowerCase().includes(q);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0; // keep original relative order otherwise
    });
  }, [items, cartSearchQuery]);

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
    } else if (mrp > 0) {
      finalNetPrice = mrp;
      calculatedDiscount = 0;
      if (masterPurchaseDiscount > 0) {
        // Priority 2: Master Purchase Discount exists
        calculatedDiscount = masterPurchaseDiscount;
        finalNetPrice = mrp * (1 - (masterPurchaseDiscount / 100));
      } else if (globalDefaultDiscount > 0) {
        // Priority 3: Global Default Discount exists
        calculatedDiscount = globalDefaultDiscount;
        finalNetPrice = mrp * (1 - (globalDefaultDiscount / 100));
      }
    }
    else {
      // No MRP, no purchase price — fall back to salesPrice as base
      const salesPriceBase = Number((itemToAdd as any).salesPrice || 0);
      if (masterPurchaseDiscount > 0 && salesPriceBase > 0) {
        calculatedDiscount = masterPurchaseDiscount;
        finalNetPrice = salesPriceBase * (1 - (masterPurchaseDiscount / 100));
      } else if (globalDefaultDiscount > 0 && salesPriceBase > 0) {
        calculatedDiscount = globalDefaultDiscount;
        finalNetPrice = salesPriceBase * (1 - (globalDefaultDiscount / 100));
      } else {
        // Truly no data — default to salesPrice as-is or 0
        calculatedDiscount = 0;
        finalNetPrice = salesPriceBase;
      }
    }

    const newItemToInsert = {
      id: crypto.randomUUID(),
      productId: itemToAdd.id!,
      name: itemToAdd.name || 'Unnamed Item',
      unit: itemToAdd.unit || '',
      purchasePrice: finalNetPrice,
      originalPurchasePrice: masterPurchasePrice,
      mrp: mrp,
      barcode: itemToAdd.barcode || '',
      quantity: 1,
      unitMultiplier: 1,
      discount: parseFloat(calculatedDiscount.toFixed(2)),
      purchasediscount: parseFloat(calculatedDiscount.toFixed(2)),
      purchasediscount2: 0,
      taxRate: resolvedTax,
      stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
      isEditable: true
    };

    setItems((prevItems) => {
      // Check the setting, default to 'top' if undefined
      const order = purchaseSettings?.cartInsertionOrder || 'top';
      const newList = order === 'bottom'
        ? [...prevItems, newItemToInsert]
        : [newItemToInsert, ...prevItems];

      // Auto-scroll after state update
      setTimeout(() => {
        if (cartListRef.current) {
          if (order === 'bottom') {
            cartListRef.current.scrollTo({ top: cartListRef.current.scrollHeight, behavior: 'smooth' });
          } else {
            cartListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }, 50);

      return newList;
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
        const safeDiscount2 = i.purchasediscount2 || 0;

        let newPrice = basePrice * (1 - safeDiscount / 100) * (1 - safeDiscount2 / 100);

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
  // --- LOGIC 3B: HANDLE SECOND DISCOUNT CHANGE (Compound on top of first discount) ---
  const handleDiscount2Change = (id: string, v: number | string) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    const safeDiscount2 = isNaN(n) ? 0 : n;

    setItems(prev => prev.map(i => {
      if (i.id === id) {
        const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.originalPurchasePrice || 0);
        const safeDiscount = i.discount || i.purchasediscount || 0;

        let newPrice = basePrice * (1 - safeDiscount / 100) * (1 - safeDiscount2 / 100);

        const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;
        newPrice = applyPurchaseRounding(newPrice, isRoundingEnabled);

        return {
          ...i,
          purchasediscount2: safeDiscount2,
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

        // purchasediscount2 left as-is intentionally; only discount1 is recalculated from manual price
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
    const groups = new Set(availableItems.map(i => i.itemGroupId || 'uncategorized'));
    return ['All', ...Array.from(groups).sort()];
  }, [availableItems]);
  const sortedGridItems = useMemo(() => {
    const filtered = availableItems.filter(item => {
      const itemGroupId = item.itemGroupId || 'uncategorized';
      const matchesCategory = selectedCategory === 'All' || itemGroupId === selectedCategory;
      const matchesSearch = gridSearchQuery === '' ||
        item.name.toLowerCase().includes(gridSearchQuery.toLowerCase()) ||
        item.barcode?.includes(gridSearchQuery);
      return matchesCategory && matchesSearch;
    });

    const sortFn = (a: Item, b: Item) => {
      switch (sortOrder) {
        case 'az': return a.name.localeCompare(b.name);
        case 'za': return b.name.localeCompare(a.name);
        case 'price_asc': return (a.purchasePrice || a.mrp || 0) - (b.purchasePrice || b.mrp || 0);
        case 'price_desc': return (b.purchasePrice || b.mrp || 0) - (a.purchasePrice || a.mrp || 0);
        default: return 0;
      }
    };
    return [...filtered].sort(sortFn);
  }, [availableItems, selectedCategory, gridSearchQuery, items, sortOrder]);

  const {
    subtotal,
    taxableAmount,
    taxAmount,
    roundingOffAmount,
    finalAmount,
    totalDiscount,
    totalQuantity,
    totalMrp
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

      const effectiveScheme = taxType === 'exempt' ? 'none' : 'regular';
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
      totalQuantity: qtyAgg,
      totalMrp: mrpTotalAgg
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

  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

  const handleClearCart = () => {
    if (items.length > 0) {
      setShowClearCartConfirm(true);
    }
  };

  const handleConfirmClearCart = () => {
    setItems([]);
    setCartSearchQuery('');
    setShowClearCartConfirm(false);
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
    const gstScheme = taxType === 'exempt' ? 'none' : 'regular';

    const formatItemsForDB = (itemsToFormat: PurchaseItem[]): PurchaseItem[] => {
      return itemsToFormat.map((item) => {
        const purchasePrice = Number(item.purchasePrice || 0);
        const quantity = item.quantity || 1;
        const itemTaxRate = finalTaxType === 'exempt' ? 0 : (item.taxRate || 0);

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

        // --- Item-Wise Total (Taxable + Tax) ---
        const itemLineTotal = parseFloat((formattedTaxable + formattedTax).toFixed(2));

        const { customPrice, isEditable, originalPurchasePrice, ...dbItem } = item;

        return {
          ...dbItem,
          id: item.productId || item.id,
          purchasePrice: purchasePrice,
          discount: item.purchasediscount ?? item.discount ?? 0,
          purchasediscount2: item.purchasediscount2 ?? 0,
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
    finalTaxType: 'inclusive' | 'exclusive' | 'exempt'
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

      await createPurchaseTransaction({
        companyId,
        userId: currentUser.uid,
        invoiceNumber: finalInvoiceNumber,
        completionData,
        formattedItemsForDB,
        subtotal,
        totalDiscount,
        taxableAmount,
        taxAmount,
        gstScheme,
        taxType: finalTaxType,
        roundingOffAmount,
        finalAmount,
        voucherName: purchaseSettings?.voucherName,
        createdAt: getParsedInvoiceDate(),
      });

      // ✅ FIX: Update local inventory immediately without requiring refresh
      setAvailableItems(prev => prev.map(item => {
        const stockDelta = formattedItemsForDB
          .filter(i => i.id === item.id)
          .reduce((sum, i) => sum + (i.quantity || 1), 0);
        if (stockDelta === 0) return item;
        return { ...item, stock: (item.stock || 0) + stockDelta };
      }));
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
      console.error('Error saving purchase:', err?.code, err?.message);
      if (err?.code === 'unavailable' || err?.message?.includes('network-request-failed')) {
        setModal({ message: 'Network lost during save. Please check your connection and try again.', type: State.ERROR });
      } else if (err?.message?.includes('undefined') || err?.message?.includes('invalid data')) {
        setModal({ message: 'Save failed due to invalid data. Please refresh and try again.', type: State.ERROR });
      } else if (err?.code === 'permission-denied') {
        setModal({ message: 'You do not have permission to complete this action.', type: State.ERROR });
      } else if (err?.code === 'aborted') {
        setModal({ message: 'Transaction conflict. Please try again.', type: State.ERROR });
      } else {
        setModal({ message: 'Failed to save purchase. Please try again.', type: State.ERROR });
      }
    }
  };

  const updateExistingPurchase = async (
    purchaseId: string,
    completionData: PaymentCompletionData,
    formattedItemsForDB: PurchaseItem[],
    gstScheme: 'regular' | 'composition' | 'none',
    finalTaxType: 'inclusive' | 'exclusive' | 'exempt'
  ) => {
    if (!editModeData || !currentUser?.companyId) return;
    const companyId = currentUser.companyId;

    try {
      await updatePurchaseTransaction({
        companyId,
        purchaseId,
        invoiceNumber: invoiceNumber.trim(),
        completionData,
        formattedItemsForDB,
        subtotal,
        totalDiscount,
        taxableAmount,
        taxAmount,
        gstScheme,
        taxType: finalTaxType,
        roundingOffAmount,
        finalAmount,
        createdAt: getParsedInvoiceDate(),
      });
      // ✅ FIX: Update local inventory immediately for edit mode
      setAvailableItems(prev => prev.map(item => {
        const oldQty = ((editModeData?.items || []) as PurchaseItem[])
          .filter(i => (i.productId || i.id) === item.id)
          .reduce((sum, i) => sum + (i.quantity || 1), 0);
        const newQty = formattedItemsForDB
          .filter(i => i.id === item.id)
          .reduce((sum, i) => sum + (i.quantity || 1), 0);
        const delta = newQty - oldQty;
        if (delta === 0) return item;
        return { ...item, stock: (item.stock || 0) + delta };
      }));

      showSuccessModal('Purchase updated successfully!', ROUTES.JOURNAL);
    } catch (err: any) {
      console.error('Error updating purchase:', err?.code, err?.message);
      if (err?.code === 'unavailable' || err?.message?.includes('network-request-failed')) {
        setModal({ message: 'Network lost during update. Please check your connection and try again.', type: State.ERROR });
      } else if (err?.message?.includes('undefined') || err?.message?.includes('invalid data')) {
        setModal({ message: 'Update failed due to invalid data. Please refresh and try again.', type: State.ERROR });
      } else if (err?.code === 'permission-denied') {
        setModal({ message: 'You do not have permission to complete this action.', type: State.ERROR });
      } else if (err?.code === 'aborted') {
        setModal({ message: 'Transaction conflict. Please try again.', type: State.ERROR });
      } else {
        setModal({ message: 'Failed to update purchase. Please try again.', type: State.ERROR });
      }
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

  const handleApplySmartScan = () => {
    if (scannedData) {
      // We intentionally DO NOT update setInvoiceNumber or setInvoiceDate here anymore.
      // The scanner acts strictly as an item importer.

      if (scannedData.items && scannedData.items.length > 0) {

        const fuse = new Fuse(availableItems, {
          keys: ['name', 'barcode'],
          threshold: 0.4,
          distance: 100
        });

        const newCartItems = scannedData.items.map(ocrItem => {
          const ocrNetPrice = ocrItem.purchasePrice * (1 - (ocrItem.discountPercentage / 100));
          const roundedOcrNetPrice = Math.round(ocrNetPrice * 100) / 100;

          const searchResults = fuse.search(ocrItem.name);

          // LINKED ITEM (Found in DB)
          if (searchResults.length > 0) {
            const dbItem = searchResults[0].item;
            const finalDiscount = ocrItem.discountPercentage || (dbItem as any).purchasediscount || 0;
            const finalMrp = dbItem.mrp || ocrItem.purchasePrice;

            const finalDbNetPrice = finalMrp * (1 - (finalDiscount / 100));
            const roundedDbNetPrice = Math.round(finalDbNetPrice * 100) / 100;

            return {
              id: crypto.randomUUID(),
              productId: dbItem.id,
              name: dbItem.name,
              unit: dbItem.unit || ocrItem.unit,
              purchasePrice: roundedDbNetPrice,
              originalPurchasePrice: dbItem.purchasePrice,
              mrp: finalMrp,
              barcode: dbItem.barcode || '',
              quantity: ocrItem.quantity || 1,
              unitMultiplier: 1,
              discount: finalDiscount,
              purchasediscount: finalDiscount,
              taxRate: dbItem.tax || dbItem.taxRate || 0,
              stock: dbItem.stock || 0,
              isEditable: true
            };
          }

          // UNLINKED ITEM (Not in DB)
          return {
            id: crypto.randomUUID(),
            productId: crypto.randomUUID(),
            name: `⚠️ ${ocrItem.name} (Not in DB)`,
            unit: ocrItem.unit,
            purchasePrice: roundedOcrNetPrice,
            originalPurchasePrice: ocrItem.purchasePrice,
            mrp: ocrItem.purchasePrice,
            barcode: '',
            quantity: ocrItem.quantity,
            unitMultiplier: 1,
            discount: ocrItem.discountPercentage,
            purchasediscount: ocrItem.discountPercentage,
            taxRate: 0,
            stock: 0,
            isEditable: true
          };
        });

        // Append items to cart
        setItems(prev => [...prev, ...newCartItems]);
      }

      clearScannedData();
      setModal({ message: 'Items linked and applied successfully!', type: State.SUCCESS });
      setTimeout(() => setModal(null), 1500);
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    setIsScannerOpen(false);
    const itemToAdd = availableItems.find(item => item.barcode === barcode);
    if (itemToAdd) {
      addItemToCart(itemToAdd);
    } else {
      setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
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
  const cartListRef = useRef<HTMLDivElement>(null);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
  const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    // 1. Update the master available items list
    setAvailableItems(prevItems => prevItems.map(item =>
      item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item
    ));

    // 2. Re-run addItemToCart pricing logic for cart items linked to this product
    const editedProductId = selectedItemForEdit?.id;
    if (!editedProductId) return;

    setItems(prevCartItems => prevCartItems.map(cartItem => {
      if (cartItem.productId !== editedProductId) return cartItem;

      // Build a merged "master item" with the freshly saved fields
      const mergedMaster = {
        ...selectedItemForEdit,
        ...updatedItemData,
        id: editedProductId,
      } as Item;

      const resolvedTax = mergedMaster.tax ?? mergedMaster.taxRate ?? 0;
      const mrp = Number(mergedMaster.mrp || 0);
      const masterPurchasePrice = Number(mergedMaster.purchasePrice || 0);
      const masterPurchaseDiscount = (mergedMaster as any).purchasediscount || 0;
      const globalDefaultDiscount = purchaseSettings?.defaultDiscount ?? 0;

      let finalNetPrice = 0;
      let calculatedDiscount = 0;

      if (masterPurchasePrice > 0) {
        finalNetPrice = masterPurchasePrice;
        if (mrp > 0) {
          calculatedDiscount = ((mrp - masterPurchasePrice) / mrp) * 100;
        }
      } else if (mrp > 0) {
        finalNetPrice = mrp;
        calculatedDiscount = 0;
        if (masterPurchaseDiscount > 0) {
          calculatedDiscount = masterPurchaseDiscount;
          finalNetPrice = mrp * (1 - (masterPurchaseDiscount / 100));
        } else if (globalDefaultDiscount > 0) {
          calculatedDiscount = globalDefaultDiscount;
          finalNetPrice = mrp * (1 - (globalDefaultDiscount / 100));
        }
      } else if (masterPurchaseDiscount > 0) {
        calculatedDiscount = masterPurchaseDiscount;
        finalNetPrice = 0;
      }
      // Apply second discount on top, compounded
      const existingDiscount2 = cartItem.purchasediscount2 || 0;
      finalNetPrice = finalNetPrice * (1 - (existingDiscount2 / 100));
      const stock = (updatedItemData as any).stock ?? (updatedItemData as any).Stock ?? cartItem.stock;

      return {
        ...cartItem,
        name: mergedMaster.name || cartItem.name,
        mrp,
        purchasePrice: parseFloat(finalNetPrice.toFixed(2)),
        originalPurchasePrice: masterPurchasePrice,
        discount: parseFloat(calculatedDiscount.toFixed(2)),
        purchasediscount: parseFloat(calculatedDiscount.toFixed(2)),
        taxRate: resolvedTax,
        barcode: mergedMaster.barcode || cartItem.barcode,
        stock,
        // preserve cart-specific fields
        id: cartItem.id,
        productId: cartItem.productId,
        quantity: cartItem.quantity,
        unitMultiplier: cartItem.unitMultiplier,
        isEditable: cartItem.isEditable,
      };
    }));
  };

  if (pageIsLoading) return (<div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground"><Spinner size="xl" /> <p className="text-sm font-medium">Loading...</p></div>);
  if (error) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-destructive">
      <p>{error}</p>
      <Button onClick={() => navigate(-1)}>Go Back</Button>
    </div>
  );

  const showTaxToggle = true; // Always show the manual tax toggle on the UI
  const displayTaxTotal = showTaxToggle && billTaxType !== 'exempt';
  const isCardView = purchaseSettings?.purchaseViewType === 'card';
  const isCardImageView = isCardView && (purchaseSettings?.cardViewWithPhoto !== false);
  // Checks if any item in the current cart has the unlinked warning flag
  const hasUnlinkedItems = items.some(item => item.name.includes('(Not in DB)'));

  const pageTitle = editModeData ? 'Edit Purchase' : (purchaseSettings?.voucherName ?? 'Purchase');

  // --- CARD VIEW RENDER (GRID) ---
  if (isCardView) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-muted pb-0">
        {modal && (
          <Modal
            message={modal.message}
            onClose={() => setModal(null)}
            type={modal.type}
          />
        )}
        <ConfirmDialog
          open={showClearCartConfirm}
          onOpenChange={setShowClearCartConfirm}
          title="Clear Cart"
          description="Are you sure you want to remove all items from the cart?"
          confirmLabel="Clear"
          variant="destructive"
          onConfirm={handleConfirmClearCart}
        />

        <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
        <PurchaseHeader
          title={pageTitle}
          invoiceNumber={invoiceNumber}
          onInvoiceNumberChange={setInvoiceNumber}
          invoiceDate={invoiceDate}
          onInvoiceDateChange={setInvoiceDate}
        />

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <PurchaseCatalogGrid
            sortedGridItems={sortedGridItems}
            cartItems={items}
            categories={categories}
            itemGroupMap={itemGroupMap}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            gridSearchQuery={gridSearchQuery}
            onGridSearchQueryChange={setGridSearchQuery}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            isSearchOpen={isSearchOpen}
            onToggleSearchOpen={() => setIsSearchOpen(prev => !prev)}
            isSortOpen={isSortOpen}
            onToggleSortOpen={() => setIsSortOpen(prev => !prev)}
            isCardImageView={isCardImageView}
            globalDefaultDiscount={purchaseSettings?.defaultDiscount ?? 0}
            cartItemCount={items.length}
            onOpenScanner={() => setIsScannerOpen(true)}
            onClearCart={handleClearCart}
            onAddItem={addItemToCart}
            onIncrementCartItem={handleQuantityChange}
            onDecrementCartItem={handleQuantityChange}
            onRemoveCartItem={handleDeleteItem}
            onEditItem={handleOpenEditDrawer}
          />

          {/* Right Section - Purchase Summary (Same as before) */}
          <div className="relative hidden h-full w-1/4 flex-col border-l border-border bg-card shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] md:flex">
            <div className="flex flex-1 flex-col justify-end p-6">
              <h2 className="mb-6 border-b border-border pb-2 text-xl font-bold text-foreground">Purchase Summary</h2>

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
                disableAction={items.length === 0 || hasUnlinkedItems}
              >
              </GenericBillFooter>
            </div>
          </div>

          {/* Mobile Footer */}
          <div className="w-full flex-shrink-0 md:hidden">
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
              disableAction={items.length === 0 || hasUnlinkedItems}
            >
            </GenericBillFooter>
          </div>
        </div>

        <PaymentDrawer
          mode='purchase'
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          subtotal={subtotal}
          totalTax={taxAmount} // Ensure totalTax is passed
          billTotal={finalAmount}
          initialDiscount={editModeData?.manualDiscount}
          onPaymentComplete={handleSavePurchase}
          isPartyNameEditable={!editModeData}
          initialPartyName={editModeData ? editModeData.partyName : ''}
          initialPartyNumber={editModeData ? editModeData.partyNumber : ''}
          initialPaymentMethods={editModeData ? editModeData.paymentMethods : undefined}
          totalQuantity={totalQuantity}
          requireCustomerName={purchaseSettings?.requireSupplierName}
          requireCustomerMobile={purchaseSettings?.requireSupplierMobile}

          taxMode={billTaxType}
          onTaxModeChange={setBillTaxType}
          isTaxToggleLocked={false}
          totalMrp={totalMrp}
        />

        <ItemEditDrawer
          item={selectedItemForEdit}
          isOpen={isItemDrawerOpen}
          onClose={handleCloseEditDrawer}
          onSaveSuccess={handleSaveSuccess}
        />
      </div>
    );
  }

  // --- LIST VIEW (Desktop Split / Mobile Stack) ---
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-muted">
      {/* SMART SCAN VERIFICATION MODAL */}
      {scannedData && (
        <SmartScanVerifyModal
          amount={scannedData.amount}
          items={scannedData.items}
          onAmountChange={(value) => setScannedData({ ...scannedData, amount: value })}
          onCancel={clearScannedData}
          onApply={handleApplySmartScan}
        />
      )}
      {modal && (
        <Modal
          message={modal.message}
          onClose={() => setModal(null)}
          type={modal.type}
        />
      )}
      <ConfirmDialog
        open={showClearCartConfirm}
        onOpenChange={setShowClearCartConfirm}
        title="Clear Cart"
        description="Are you sure you want to remove all items from the cart?"
        confirmLabel="Clear"
        variant="destructive"
        onConfirm={handleConfirmClearCart}
      />
      {/* FULL SCREEN LOADING OVERLAY */}
      {isScanning && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-card/70 backdrop-blur-sm">
          {/* Animated Spinner */}
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-border border-t-[#ff1894] shadow-sm"></div>

          <h3 className="animate-pulse text-lg font-bold text-foreground">
            Analyzing Document...
          </h3>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            Extracting items, prices, and discounts
          </p>

          {/* Sellar AI Badge */}
          <div className="mt-6 flex items-center gap-2 rounded-full border border-[#ff1894]/20 bg-[#ff1894]/10 px-3 py-1.5">
            {/* Glowing Dot */}
            <div className="relative flex h-2 w-2">
              <div className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff1894] opacity-75"></div>
              <div className="relative inline-flex h-2 w-2 rounded-full bg-[#ff1894]"></div>
            </div>

            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
              Sellar AI
            </span>
          </div>
        </div>
      )}
      {/* CAMERA SELECTION MODAL */}
      {showScannerModal && (
        <PurchaseCameraChoiceModal
          onScanItem={() => setShowScannerModal(false)}
          onUploadBill={() => { setShowScannerModal(false); fileInputRef.current?.click(); }}
          onClose={() => setShowScannerModal(false)}
        />
      )}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />

      <PurchaseHeader
        title={pageTitle}
        invoiceNumber={invoiceNumber}
        onInvoiceNumberChange={setInvoiceNumber}
        invoiceDate={invoiceDate}
        onInvoiceDateChange={setInvoiceDate}
      />

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">

        <div className="relative flex h-full w-full min-w-0 flex-col border-r border-border md:w-3/4">

          <div className="mt-2 flex-shrink-0 rounded-sm border-b bg-card p-2 md:mt-0">
            <div className="flex items-end gap-2">

              <div className="flex-grow">
                <SearchableItemInput label="Search & Add Item" placeholder="Search by name or barcode..." items={availableItems} onItemSelected={handleItemSelected} isLoading={pageIsLoading} error={error} categories={categories}
                  onAddItem={(query) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })}
                  itemGroupMap={itemGroupMap}
                  onSearchChange={setCartSearchQuery}
                />
              </div>
              <button
                onClick={() => setShowScannerModal(true)}
                className="rounded-md bg-secondary p-3 font-semibold text-secondary-foreground transition hover:bg-secondary/80"
              >
                <Camera size={20} />
              </button>

              <input
                type="file"
                accept="image/*,application/pdf"
                ref={fileInputRef}
                onChange={processFile}
                className="hidden"
              />
            </div>
          </div>

          <div ref={cartListRef} className='flex-grow overflow-y-auto bg-muted p-2'>
            <div className="mb-2 flex items-center justify-between border-b px-2 pt-1">
              <h3 className="text-lg font-medium text-foreground">Cart</h3>
              {items.length > 0 && (
                <div className="justify-self-end">
                  <button onClick={handleClearCart} className="flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
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
                  enableDiscount2: purchaseSettings?.enableDiscount2 ?? false,
                  lockDiscount: false,
                  lockPrice: false
                }}
                applyRounding={(val) => val}
                State={State}
                setModal={setModal}
                onOpenEditDrawer={handleOpenEditDrawer}
                onDeleteItem={handleDeleteItem}
                onDiscountChange={handleDiscountChange}
                onDiscount2Change={handleDiscount2Change}
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
              disableAction={items.length === 0 || hasUnlinkedItems}
            >
            </GenericBillFooter>
          </div>

        </div>

        <div className="relative hidden h-full w-1/4 flex-col border-l border-border bg-card shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] md:flex">
          <div className="flex flex-1 flex-col justify-end p-6">
            <div className="mb-6 flex items-end justify-between border-b pb-2">
              <h2 className="text-xl font-bold text-foreground">Purchase Summary</h2>
              <span className="text-xs font-semibold text-primary">{items.length} Items</span>
            </div>

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
              disableAction={items.length === 0 || hasUnlinkedItems}
            >
            </GenericBillFooter>
          </div>
        </div>
      </div>

      <PaymentDrawer
        mode='purchase'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={subtotal}
        totalTax={taxAmount} // Ensure totalTax is passed
        billTotal={finalAmount}
        initialDiscount={editModeData?.manualDiscount}
        onPaymentComplete={handleSavePurchase}
        isPartyNameEditable={!editModeData}
        initialPartyName={editModeData ? editModeData.partyName : ''}
        initialPartyNumber={editModeData ? editModeData.partyNumber : ''}
        initialPaymentMethods={editModeData ? editModeData.paymentMethods : undefined}
        totalQuantity={totalQuantity}
        requireCustomerName={purchaseSettings?.requireSupplierName}
        requireCustomerMobile={purchaseSettings?.requireSupplierMobile}

        taxMode={billTaxType}
        onTaxModeChange={setBillTaxType}
        isTaxToggleLocked={false}
        totalMrp={totalMrp}
      />

      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isItemDrawerOpen}
        onClose={handleCloseEditDrawer}
        onSaveSuccess={handleSaveSuccess}
      />
      {hasUnlinkedItems && (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2">
          <AlertTriangle size={14} className="shrink-0 text-destructive" />
          <p className="text-center text-xs font-medium leading-tight text-destructive">
            Cannot save bill. Please remove unlinked items or add them to your inventory.
          </p>
        </div>
      )}
      <ConfirmDialog
        open={!!showPrintQrModal}
        onOpenChange={(open) => { if (!open) handleCloseQrModal(); }}
        title="Purchase Saved!"
        description="Print barcodes/QR codes for the items?"
        confirmLabel="Yes, Print"
        cancelLabel="No"
        onConfirm={handleNavigateToQrPage}
      />
    </div>
  );
};

export default PurchasePage;
