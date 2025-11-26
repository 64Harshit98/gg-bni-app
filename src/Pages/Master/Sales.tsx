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
import { SalesCartList } from '../../Components/CartItem';

// 1. EXPORT SalesItem
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
}

// 2. UPDATED: applyRounding
export const applyRounding = (amount: number, isRoundingEnabled: boolean, interval: number = 1): number => {
  if (!isRoundingEnabled || !interval || interval <= 0) {
    return parseFloat(amount.toFixed(2));
  }
  const rounded = Math.round(amount / interval) * interval;
  return parseFloat(rounded.toFixed(2));
};

const Sales: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading, hasPermission } = useAuth();
  const dbOperations = useDatabase();
  const { salesSettings, loadingSettings } = useSalesSettings();

  const invoiceToEdit = location.state?.invoiceData;
  const isEditMode = location.state?.isEditMode === true && invoiceToEdit;

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [items, setItems] = useState<SalesItem[]>([]);
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

  // --- NEW STATE FOR GRID VIEW (existing) ---
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

        // Fetch Item Groups Map
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
        const errorMessage = 'Failed to load initial page data.';
        setError(errorMessage);
        console.error(errorMessage, err);
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
    // Only re-run if the specific Lock settings change in the database
  }, [loadingSettings, salesSettings?.lockDiscountEntry, salesSettings?.lockSalePriceEntry]);


  useEffect(() => {
    if (isEditMode && invoiceToEdit?.items) {
      const nonEditableItems = invoiceToEdit.items.map((item: any) => ({
        ...item,
        id: item.id || crypto.randomUUID(),
        isEditable: false,
        customPrice: item.effectiveUnitPrice,
        quantity: item.quantity || 1,
        mrp: item.mrp || 0,
        discount: item.discount || 0,
        // Load Back Tax Values if they exist
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
    } else if (!isEditMode) {
      setItems([]);
    }
  }, [isEditMode, invoiceToEdit]);

  // --- CATEGORY & GRID LOGIC (existing) ---
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
      const aInCart = items.some(i => i.id === a.id);
      const bInCart = items.some(i => i.id === b.id);

      if (aInCart && !bInCart) return -1;
      if (!aInCart && bInCart) return 1;
      return 0;
    });

  }, [availableItems, selectedCategory, gridSearchQuery, items]);

  const {
    subtotal,
    totalDiscount,
    roundOff,
    taxableAmount,
    taxAmount,
    finalAmount
  } = useMemo(() => {
    let subtotal = 0;
    let taxableAmount = 0;
    let totalTaxAmount = 0;

    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
    const isTaxEnabled = salesSettings?.enableTax ?? true;
    const taxRate = salesSettings?.defaultTaxRate ?? 0;
    const taxType = salesSettings?.taxType ?? 'exclusive';

    items.forEach(item => {
      const currentMrp = item.mrp || 0;
      const currentQuantity = item.quantity || 1;
      const currentDiscount = item.discount || 0;

      // Subtotal is always MRP * Qty (Standard practice)
      subtotal += currentMrp * currentQuantity;

      const priceAfterDiscount = currentMrp * (1 - currentDiscount / 100);
      const calculatedRoundedPrice = applyRounding(priceAfterDiscount, isRoundingEnabled, roundingInterval);

      let effectiveUnitPrice = calculatedRoundedPrice;
      if (item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== '') {
        const numericPrice = parseFloat(String(item.customPrice));
        if (!isNaN(numericPrice)) {
          effectiveUnitPrice = numericPrice;
        }
      }

      const lineTotal = effectiveUnitPrice * currentQuantity;

      // TAX CALCULATION LOGIC FOR MEMO
      let lineBaseAmount = lineTotal;
      let lineTaxAmount = 0;

      if (isTaxEnabled && taxRate > 0) {
        if (taxType === 'inclusive') {
            // Inclusive: Back calculate base
            // Formula: Base = Total / (1 + Rate/100)
            lineBaseAmount = lineTotal / (1 + (taxRate / 100));
            lineTaxAmount = lineTotal - lineBaseAmount;
        } else {
            // Exclusive: Add tax
            lineBaseAmount = lineTotal;
            lineTaxAmount = lineTotal * (taxRate / 100);
        }
      }

      taxableAmount += lineBaseAmount;
      totalTaxAmount += lineTaxAmount;
    });

    // Total Discount = MRP Subtotal - (Base + Tax if inclusive, else Base)
    // This represents how much less than MRP the customer is paying
    const totalDiscountValue = subtotal - (taxType === 'inclusive' ? (taxableAmount + totalTaxAmount) : taxableAmount);
    
    const finalAmountRaw = taxableAmount + totalTaxAmount;
    const finalPayableAmount = parseFloat(finalAmountRaw.toFixed(2));

    return {
      subtotal,
      totalDiscount: totalDiscountValue,
      roundOff: 0,
      taxableAmount: parseFloat(taxableAmount.toFixed(2)),
      taxAmount: parseFloat(totalTaxAmount.toFixed(2)),
      finalAmount: finalPayableAmount,
    };

  }, [
    items,
    salesSettings?.enableRounding,
    (salesSettings as any)?.roundingInterval,
    salesSettings?.enableTax,
    salesSettings?.defaultTaxRate,
    salesSettings?.taxType
  ]);


  const amountToPayNow = useMemo(() => {
    if (!isEditMode || !invoiceToEdit) {
      return finalAmount;
    }
    // In edit mode, we use the newly calculated finalAmount as the target
    return finalAmount;
  }, [isEditMode, finalAmount, invoiceToEdit]);

  const addItemToCart = (itemToAdd: Item) => {
    if (!itemToAdd || !itemToAdd.id) {
      setModal({ message: "Cannot add invalid item.", type: State.ERROR });
      return;
    }

    const itemExists = items.find(item => item.id === itemToAdd.id);
    if (itemExists) {
      if (itemExists.isEditable) {
        setItems(prev => prev.map(item =>
          item.id === itemToAdd.id ? { ...item, quantity: (item.quantity || 0) + 1 } : item
        ));
      } else {
        setModal({ message: `${itemToAdd.name} already in invoice. Add new items separately.`, type: State.INFO });
      }
    } else {
      const defaultDiscount = itemToAdd.discount ?? salesSettings?.defaultDiscount ?? 0;

      const newSalesItem: SalesItem = {
        id: itemToAdd.id!,
        name: itemToAdd.name || 'Unnamed Item',
        mrp: itemToAdd.mrp || 0,
        quantity: 1,
        discount: defaultDiscount,
        isEditable: true,
        purchasePrice: itemToAdd.purchasePrice || 0,
        tax: itemToAdd.tax || 0,
        itemGroupId: itemToAdd.itemGroupId || '',
        stock: itemToAdd.stock || (itemToAdd as any).Stock || 0, // Fallback for Stock property
        amount: itemToAdd.amount || 0,
        barcode: itemToAdd.barcode || '',
        restockQuantity: itemToAdd.restockQuantity || 0,
      };
      setItems(prev => [newSalesItem, ...prev]);
    }
  };

  const handleItemSelected = (selectedItem: Item | null) => {
    if (selectedItem) {
      addItemToCart(selectedItem);
      setGridSearchQuery('');
    }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    setIsScannerOpen(false);
    if (!dbOperations) return;
    try {
      const itemToAdd = await dbOperations.getItemByBarcode(barcode);
      if (itemToAdd) {
        addItemToCart(itemToAdd);
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    } catch (scanError) {
      setModal({ message: 'Error finding item by barcode.', type: State.ERROR });
    }
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, quantity: Math.max(0, newQuantity) } : item
    ));
  };

  const handleDeleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleDiscountPressStart = () => {
    // Clear any existing timer first to be safe
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    // Start new timer - 500ms is a standard long-press duration
    longPressTimer.current = setTimeout(() => {
      setIsDiscountLocked(false);
    }, 500);
  };
  const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handleDiscountClick = () => {
    if (salesSettings?.lockDiscountEntry || isDiscountLocked) {
      setDiscountInfo("Cannot edit discount");
      setTimeout(() => setDiscountInfo(null), 3000);
    }
  };
  const handlePricePressStart = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    longPressTimer.current = setTimeout(() => {
      setIsPriceLocked(false);
    }, 500);
  };
  const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handlePriceClick = () => {
    if (salesSettings?.lockSalePriceEntry || isPriceLocked) {
      setPriceInfo("Cannot edit sale price");
      setTimeout(() => setPriceInfo(null), 1000);
    }
  };

  const handleDiscountChange = (id: string, discountValue: number | string) => {
    const numericValue = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
    const newDiscount = Math.max(0, Math.min(100, isNaN(numericValue) ? 0 : numericValue));
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, discount: newDiscount, customPrice: undefined } : item
    ));
  };

  const handleCustomPriceChange = (id: string, value: string) => {
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, customPrice: value } : item
      ));
    }
  };

  const handleCustomPriceBlur = (id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === id && typeof item.customPrice === 'string') {
        const numericValue = parseFloat(item.customPrice);

        if (item.customPrice === '' || isNaN(numericValue)) {
          return { ...item, customPrice: undefined };
        }

        let newDiscountPercent = 0;
        if (item.mrp && item.mrp > 0) {
          newDiscountPercent = ((item.mrp - numericValue) / item.mrp) * 100;
          newDiscountPercent = Math.max(0, newDiscountPercent);
        }

        return {
          ...item,
          customPrice: numericValue,
          discount: parseFloat(newDiscountPercent.toFixed(2))
        };
      }
      return item;
    }));
  };

  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const handleOpenEditDrawer = (item: Item) => {
    setSelectedItemForEdit(item);
    setIsItemDrawerOpen(true);
  };
  const handleCloseEditDrawer = () => {
    setIsItemDrawerOpen(false);
    setTimeout(() => setSelectedItemForEdit(null), 300);
  };

  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    setAvailableItems(prevItems => prevItems.map(item =>
      item.id === selectedItemForEdit?.id
        ? { ...item, ...updatedItemData, id: item.id } as Item
        : item
    ));

    const updateForCart: Partial<SalesItem> = { ...updatedItemData };

    if ((updateForCart as any).Stock !== undefined) {
      updateForCart.stock = (updateForCart as any).Stock;
      delete (updateForCart as any).Stock;
    }

    Object.keys(updateForCart).forEach(key => {
      if (updateForCart[key as keyof typeof updateForCart] === undefined) {
        delete updateForCart[key as keyof typeof updateForCart];
      }
    });

    setItems(prevCartItems => prevCartItems.map(cartItem => {
      if (cartItem.id === selectedItemForEdit?.id) {
        return { ...cartItem, ...updateForCart, id: cartItem.id };
      }
      return cartItem;
    }));
  };

  const handleProceedToPayment = () => {
    if (items.length === 0) {
      setModal({ message: 'Please add at least one item.', type: State.INFO }); return;
    }
    if (salesSettings?.enableSalesmanSelection && !selectedWorker) {
      setModal({ message: 'Please select a salesman.', type: State.ERROR }); return;
    }

    if (!(salesSettings as any)?.allowNegativeStock) {
      const invalidStockItems = items.filter(i => i.isEditable).reduce((acc, item) => {
        const available = availableItems.find(a => a.id === item.id)?.stock ?? 0;
        if (available < (item.quantity ?? 1)) {
          acc.push({ name: item.name, stock: available, needed: item.quantity ?? 1 });
        }
        return acc;
      }, [] as { name: string, stock: number, needed: number }[]);

      if (invalidStockItems.length > 0) {
        const msg = invalidStockItems.map(i => `${i.name} (Avail:${i.stock}, Need:${i.needed})`).join(', ');
        setModal({ message: `Insufficient stock: ${msg}`, type: State.ERROR });
        return;
      }
    }

    setIsDrawerOpen(true);
  };

  // =================================================================
  //  UPDATED: HANDLE SAVE PAYMENT (Fixed Double Save & Tax Saving)
  // =================================================================
  const handleSavePayment = async (completionData: PaymentCompletionData) => {
    if (!currentUser?.companyId) {
      setModal({ message: "User or company information missing.", type: State.ERROR }); return;
    }
    const companyId = currentUser.companyId;

    const salesman = salesSettings?.enableSalesmanSelection ? selectedWorker : workers.find(w => w.uid === currentUser.uid);
    if (!salesman && salesSettings?.enableSalesmanSelection) {
      setModal({ type: State.ERROR, message: "Salesman not selected." }); return;
    }
    const finalSalesman = salesman || { uid: currentUser.uid, name: currentUser.uid || 'Current User' };

    if (!salesSettings?.allowDueBilling && completionData.paymentDetails.due > 0) {
      setModal({ message: 'Due billing is disabled.', type: State.ERROR }); setIsDrawerOpen(true); return;
    }
    if (salesSettings?.requireCustomerName && !completionData.partyName.trim()) {
      setModal({ message: 'Customer name is required.', type: State.ERROR }); setIsDrawerOpen(true); return;
    }
    if (salesSettings?.requireCustomerMobile && !completionData.partyNumber.trim()) {
      setModal({ message: 'Customer mobile is required.', type: State.ERROR }); setIsDrawerOpen(true); return;
    }

    const isTaxEnabled = salesSettings?.enableTax ?? true;
    const finalTaxType = isTaxEnabled ? (salesSettings?.taxType ?? 'exclusive') : 'none';
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

    // --- FIX 2: CORRECT TAX BREAKDOWN FOR DB ---
    const formatItemsForDB = (itemsToFormat: SalesItem[]) => {
      return itemsToFormat.map(({ isEditable, customPrice, ...item }) => {
        const currentMrp = item.mrp || 0;
        const currentDiscount = item.discount || 0;
        const currentQuantity = item.quantity || 1;

        const priceAfterDiscount = currentMrp * (1 - currentDiscount / 100);
        const calculatedRoundedPrice = applyRounding(priceAfterDiscount, isRoundingEnabled, roundingInterval);

        let effectiveUnitPrice = calculatedRoundedPrice;
        if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
          const numericPrice = parseFloat(String(customPrice));
          if (!isNaN(numericPrice)) {
            effectiveUnitPrice = numericPrice;
          }
        }

        const lineTotal = effectiveUnitPrice * currentQuantity;

        let itemTaxableBase = lineTotal;
        let itemTaxAmount = 0;
        let itemFinalPrice = lineTotal;

        if (isTaxEnabled && currentTaxRate > 0) {
            if (finalTaxType === 'inclusive') {
                // INCLUSIVE: Base = Total / (1 + Rate/100)
                itemFinalPrice = lineTotal;
                itemTaxableBase = lineTotal / (1 + (currentTaxRate / 100));
                itemTaxAmount = lineTotal - itemTaxableBase;
            } else {
                // EXCLUSIVE: Tax = Total * Rate/100
                itemTaxableBase = lineTotal;
                itemTaxAmount = lineTotal * (currentTaxRate / 100);
                itemFinalPrice = itemTaxableBase + itemTaxAmount;
            }
        }

        return {
          ...item,
          quantity: currentQuantity,
          discount: currentDiscount,
          effectiveUnitPrice: effectiveUnitPrice,
          // EXPLICITLY SAVE THE BREAKDOWN
          finalPrice: parseFloat(itemFinalPrice.toFixed(2)),
          taxableAmount: parseFloat(itemTaxableBase.toFixed(2)),
          taxAmount: parseFloat(itemTaxAmount.toFixed(2)),
          taxRate: isTaxEnabled ? currentTaxRate : 0,
          taxType: finalTaxType,
          discountPercentage: currentDiscount,
        };
      });
    };

    const finalInvoiceTotal = finalAmount - completionData.discount;
    
    // 1. CAPTURE ALL DISCOUNTS
    const manualDiscount = completionData.discount || 0;
    const revDiscount = completionData.revDiscount || 0;
    const totalInvoiceDiscount = totalDiscount + manualDiscount;

    if (isEditMode && invoiceToEdit?.id) {
      try {
        await runTransaction(db, async (transaction) => {
          const invoiceRef = doc(db, "companies", companyId, "sales", invoiceToEdit.id);
          const invoiceDoc = await transaction.get(invoiceRef);
          if (!invoiceDoc.exists()) throw new Error("Original invoice not found.");

          const originalItems = invoiceDoc.data().items || [];
          const originalQtyMap = new Map<string, number>();
          originalItems.forEach((i: any) => {
            if (i.id) originalQtyMap.set(String(i.id), Number(i.quantity || 1));
          });

          const currentQtyMap = new Map<string, number>();
          items.forEach((i) => {
            if (i.id) currentQtyMap.set(String(i.id), Number(i.quantity || 1));
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

          const updatedItems = formatItemsForDB(items);
          
          // FIX 1: DIRECTLY REPLACE PAYMENT METHODS (No Merging)
          // The PaymentDrawer has already done the logic of setting unused methods to 0
          const newPayments = completionData.paymentDetails;

          transaction.update(invoiceRef, {
            items: updatedItems,
            subtotal,
            discount: totalInvoiceDiscount,
            manualDiscount: manualDiscount, // Save separately
            revDiscount: revDiscount,       // Save separately
            roundOff,
            taxableAmount,
            taxAmount,
            taxType: finalTaxType,
            totalAmount: finalInvoiceTotal,
            paymentMethods: newPayments, // <--- Direct replacement
            updatedAt: serverTimestamp(),
            partyAddress: completionData.partyAddress || invoiceDoc.data().partyAddress || '',
            partyGstin: completionData.partyGST || invoiceDoc.data().partyGstin || '',
            partyName: completionData.partyName.trim() || invoiceDoc.data().partyName,
            partyNumber: completionData.partyNumber.trim() || invoiceDoc.data().partyNumber,
            salesmanId: finalSalesman.uid,
            salesmanName: finalSalesman.name || 'N/A',
          });
        });
        showSuccessModal(`Invoice #${invoiceToEdit.invoiceNumber} updated!`, ROUTES.JOURNAL);
      } catch (error: any) {
        console.error("Failed to update invoice:", error);
        setModal({ message: `Update failed: ${error.message}`, type: State.ERROR });
      }
    } else {
      // --- NEW SALE LOGIC ---
      const { paymentDetails, partyName, partyNumber, partyAddress, partyGST } = completionData;
      try {
        const newInvoiceNumber = await generateNextInvoiceNumber(companyId);

        await runTransaction(db, async (transaction) => {
          const saleData = {
            invoiceNumber: newInvoiceNumber,
            userId: currentUser.uid,
            salesmanId: finalSalesman.uid,
            salesmanName: finalSalesman.name || 'N/A',
            partyName: partyName.trim(),
            partyNumber: partyNumber.trim(),
            partyAddress: partyAddress || '',
            partyGstin: partyGST || '',
            items: formatItemsForDB(items),
            subtotal,
            discount: totalInvoiceDiscount,
            manualDiscount: manualDiscount, // Save separately
            revDiscount: revDiscount,       // Save separately
            roundOff,
            taxableAmount,
            taxAmount,
            taxType: finalTaxType,
            totalAmount: finalInvoiceTotal,
            paymentMethods: paymentDetails,
            createdAt: serverTimestamp(),
            companyId: companyId,
            voucherName: salesSettings?.voucherName ?? 'Sales',
          };
          const newSaleRef = doc(collection(db, "companies", companyId, "sales"));
          transaction.set(newSaleRef, saleData);

          items.forEach(cartItem => {
            const itemRef = doc(db, "companies", companyId, "items", cartItem.id);
            transaction.update(itemRef, { stock: firebaseIncrement(-(cartItem.quantity || 1)) });
          });

          if (settingsDocId) {
            const settingsRef = doc(db, "companies", companyId, "settings", settingsDocId);
            transaction.update(settingsRef, { currentVoucherNumber: firebaseIncrement(1) });
          } else {
            throw new Error("Sales settings document not found for voucher increment.");
          }
        });

        setIsDrawerOpen(false);
        showSuccessModal(`Sale #${newInvoiceNumber} saved!`);
      } catch (error: any) {
        console.error("Sale transaction failed:", error);
        setModal({ message: `Sale failed: ${error.message || 'Unknown error'}`, type: State.ERROR });
      }
    }
  };

  const showSuccessModal = (message: string, navigateTo?: string) => {
    setIsDrawerOpen(false);
    setModal({ message, type: State.SUCCESS });
    setTimeout(() => {
      setModal(null);
      if (navigateTo) {
        navigate(navigateTo);
      } else if (!salesSettings?.copyVoucherAfterSaving) {
        setItems([]);
      }
    }, 1500);
  };

  // ... (Rest of the component: Loading, Render, etc. remains identical) ...
  // I am truncating the render logic here to save space as the core fix is in handleSavePayment
  
  if (pageIsLoading) return <div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>;
  if (error) return <div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button></div>;

  const gstSchemeDisplay = salesSettings?.gstScheme ?? 'none';
  const settingsTaxTypeDisplay = salesSettings?.taxType ?? 'exclusive';
  const isCardView = salesSettings?.salesViewType === 'card';

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

  const renderFooter = () => {
    const showTaxRow = gstSchemeDisplay !== 'none' && settingsTaxTypeDisplay === 'exclusive';
    return (
      <div className="flex-shrink-0 p-2 bg-white border-t shadow-[0_-4px_10px_rgba(0,0,0,0.1)] mb-10">
        <div onClick={() => setIsFooterExpanded(!isFooterExpanded)} className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
          <span className="text-sm font-semibold text-gray-600">Total Bill Details</span>
          <div className={`transform transition-transform duration-300 ${isFooterExpanded ? '' : 'rotate-180'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg></div>
        </div>
        {isFooterExpanded && (
          <div className="px-4 py-2 space-y-1 bg-white text-sm animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex justify-between"><span>Subtotal</span> <span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-red-500"><span>Discount</span> <span>- ₹{totalDiscount.toFixed(2)}</span></div>
            {showTaxRow && <div className="flex justify-between text-xs text-blue-500"><span>Tax (Exclusive)</span> <span>₹{taxAmount.toFixed(2)}</span></div>}
          </div>
        )}
        <div>
          <div className="flex justify-between font-bold text-xl mt-2 mb-2 px-1"><span>Total</span> <span>₹{finalAmount.toFixed(2)}</span></div>
          {isEditMode && <div className="flex justify-between font-bold text-blue-600 mb-2 px-1 text-sm"><span>To Pay</span> <span>₹{amountToPayNow.toFixed(2)}</span></div>}
          <CustomButton onClick={handleProceedToPayment} variant={Variant.Payment} className="flex justify-between ml-30 py-3 text-lg font-bold shadow-md">{isEditMode ? 'Update' : 'Pay Now'}</CustomButton>
        </div>
      </div>
    );
  };

  if (isCardView) {
    return (
      <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2">
        {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
        <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
        {renderHeader()}
        <div className="flex-shrink-0 bg-gray-50 border-b border-gray-300">
          <div className="p-2 bg-white border-b flex gap-2 items-center">
            <div className="flex-grow relative">
              <input type="text" placeholder="Search items..." className="w-full p-2 pr-8 border rounded bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={gridSearchQuery} onChange={(e) => setGridSearchQuery(e.target.value)} />
              {gridSearchQuery && (<button onClick={() => setGridSearchQuery('')} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg></button>)}
            </div>
            <button onClick={() => setIsScannerOpen(true)} className='bg-white text-gray-700 p-2 border rounded hover:bg-gray-100'><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h6v6H3z" /><path d="M15 3h6v6h-6z" /><path d="M3 15h6v6H3z" /><path d="M15 15h6v6h-6z" /><path d="M3 9h18" /><path d="M9 3v18" /></svg></button>
            {salesSettings?.enableSalesmanSelection && ( <div className="w-1/3 min-w-[120px]"> <select value={selectedWorker?.uid || ''} onChange={(e) => setSelectedWorker(workers.find(s => s.uid === e.target.value) || null)} className="w-full p-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"> <option value="">Select Salesman</option> {workers.map(w => <option key={w.uid} value={w.uid}>{w.name || 'Unnamed'}</option>)} </select> </div> )}
          </div>
          <div className="flex overflow-x-auto whitespace-nowrap p-2 gap-2 bg-white border-b border-gray-200 scrollbar-hide"> {categories.map(catId => ( <button key={catId} onClick={() => setSelectedCategory(catId)} className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors flex-shrink-0 ${selectedCategory === catId ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`} >{catId === 'All' ? 'All' : (itemGroupMap[catId] || catId)}</button> ))} </div>
        </div>
        <div className="flex-1 p-3 overflow-y-auto grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start bg-gray-100 pb-20">
          {sortedGridItems.length === 0 ? <div className="col-span-full text-center text-gray-500 mt-10">No items found</div> : (sortedGridItems.map(item => { const cartItem = items.find(i => i.id === item.id); const isSelected = !!cartItem; const quantity = cartItem?.quantity || 0; return ( <div key={item.id} onClick={() => addItemToCart(item)} className={`p-2 rounded shadow-sm border transition-all flex flex-col justify-between text-center relative select-none cursor-pointer ${isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-gray-200 hover:shadow-md hover:border-blue-400'}`}> <div className="w-full flex flex-col items-center pt-1 px-1 pointer-events-none"> <span className="text-sm font-bold text-gray-800 leading-tight text-center line-clamp-2" title={item.name}>{item.name}</span> <span className="text-sm font-medium text-gray-600 mt-1">₹{item.mrp || 0}</span> </div> <div className="w-full flex items-center justify-center pb-1"> {!isSelected ? ( <span className="text-blue-600 font-bold text-sm px-4 py-1 bg-blue-50">Add</span> ) : ( <div className="flex items-center gap-2 bg-white shadow-sm px-2 py-1 border border-gray-200"> <button onClick={(e) => { e.stopPropagation(); if (quantity > 1) handleQuantityChange(item.id!, quantity - 1); else handleDeleteItem(item.id!); }} className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-600 font-bold transition-colors text-sm">-</button> <span className="text-sm font-bold w-4 text-center">{quantity}</span> <button onClick={(e) => { e.stopPropagation(); addItemToCart(item); }} className="w-6 h-6 flex items-center justify-center bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold transition-colors text-sm">+</button> </div> )} </div> </div> ); }))}
        </div>
        {renderFooter()}
        <PaymentDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} subtotal={amountToPayNow} onPaymentComplete={handleSavePayment} isPartyNameEditable={!isEditMode} initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''} initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''} initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined} />
        <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2 ">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      {renderHeader()}
      <div className="flex-shrink-0 p-2 bg-white border-b pb-3 mb-2 rounded-sm">
        <div className="flex gap-4 items-end w-full">
          <div className="flex-grow">
            <SearchableItemInput label="Search Item" placeholder="Search by name or barcode..." items={availableItems} onItemSelected={handleItemSelected} isLoading={pageIsLoading} error={error} />
          </div>
          <button onClick={() => setIsScannerOpen(true)} className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-md font-semibold transition hover:bg-gray-800' title="Scan Barcode"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg></button>
        </div>
      </div>
      <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden">
        <div className="pt-2 flex-shrink-0 grid grid-cols-2 border-b pb-2 px-2">
          <h3 className="text-gray-700 text-base font-medium">Cart</h3>
          {salesSettings?.enableSalesmanSelection && ( <div className="flex items-center justify-end gap-2"> <label htmlFor="worker-select" className="block text-sm text-gray-700 mb-1">Salesman</label> <select value={selectedWorker?.uid || ''} onChange={(e) => setSelectedWorker(workers.find(s => s.uid === e.target.value) || null)} className="w-23 p-1 border rounded-md shadow-sm disabled:bg-gray-100 disabled:cursor-not-allowed" disabled={!hasPermission(Permissions.ViewTransactions) || (isEditMode && !isManager)} > {workers.map(w => <option key={w.uid} value={w.uid}>{w.name || 'Unnamed'}</option>)} </select> </div> )}
        </div>
        <div className="flex-shrink-0 grid grid-cols-2 px-2">
          {discountInfo && <div className="flex items-center text-sm bg-red-100 text-red-800 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg><span>{discountInfo}</span></div>}
          {priceInfo && <div className="flex items-center text-sm bg-red-100 text-red-800 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg><span>{priceInfo}</span></div>}
        </div>
        <SalesCartList items={items} availableItems={availableItems} salesSettings={salesSettings} isDiscountLocked={isDiscountLocked} isPriceLocked={isPriceLocked} applyRounding={applyRounding} State={State} setModal={setModal} onOpenEditDrawer={(item) => { const originalItem = availableItems.find(a => a.id === item.id); if (originalItem) handleOpenEditDrawer(originalItem); }} onDeleteItem={handleDeleteItem} onDiscountChange={handleDiscountChange} onCustomPriceChange={handleCustomPriceChange} onCustomPriceBlur={handleCustomPriceBlur} onQuantityChange={handleQuantityChange} onDiscountPressStart={handleDiscountPressStart} onDiscountPressEnd={handleDiscountPressEnd} onDiscountClick={handleDiscountClick} onPricePressStart={handlePricePressStart} onPricePressEnd={handlePricePressEnd} onPriceClick={handlePriceClick} />
      </div>
      {renderFooter()}
      <PaymentDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} subtotal={amountToPayNow} onPaymentComplete={handleSavePayment} isPartyNameEditable={!isEditMode} initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''} initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''} initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined} />
      <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />
    </div>
  );
};

export default Sales;