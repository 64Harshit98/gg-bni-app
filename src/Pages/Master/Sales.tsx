import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useDatabase } from '../../context/Auth-Context';
import type { Item, SalesItem as OriginalSalesItem } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/Firebase';
import { collection, serverTimestamp, doc, increment as firebaseIncrement, runTransaction, getDocs, query, where } from 'firebase/firestore';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { generateNextInvoiceNumber } from '../../UseComponents/InvoiceCounter';
import { Modal } from '../../constants/Modal';
import { Permissions, State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import type { User } from '../../Role/permission';
import { useSalesSettings } from '../../context/SettingsContext'; // <-- Settings context
import { Spinner } from '../../constants/Spinner'; // <-- Added Spinner import
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { FiEdit } from 'react-icons/fi';


interface SalesItem extends OriginalSalesItem {
  isEditable: boolean;
  customPrice?: number | string;
  taxableAmount?: number;
  taxAmount?: number;
  taxRate?: number;
  taxType?: 'inclusive' | 'exclusive' | 'none';
  purchasePrice: number;
  tax: number;
  itemGroupId: string;
  Stock: number;
  amount: number;
  barcode: string;
  restockQuantity: number;
}

const applyRounding = (amount: number, isRoundingEnabled: boolean): number => {
  if (!isRoundingEnabled) {
    return parseFloat(amount.toFixed(2));
  }
  if (amount < 100) {
    return Math.ceil(amount / 5) * 5;
  }
  return Math.ceil(amount / 10) * 10;
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


  const isActive = (path: string) => location.pathname === path;


  useEffect(() => {
    const findSettingsDocId = async () => {
      if (currentUser?.companyId) {
        // --- FIX: Use multi-tenant path for settings ---
        const settingsQuery = query(collection(db, 'companies', currentUser.companyId, 'settings'), where('settingType', '==', 'sales'));
        const settingsSnapshot = await getDocs(settingsQuery);
        if (!settingsSnapshot.empty) {
          setSettingsDocId(settingsSnapshot.docs[0].id);
        } else {
          console.warn("Sales settings document ID not found on initial load.");
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
        // dbOperations is already multi-tenant aware (from AuthContext)
        const [fetchedItems, fetchedWorkers] = await Promise.all([
          dbOperations.getItems(),
          dbOperations.getWorkers()
        ]);

        setAvailableItems(fetchedItems);
        setWorkers(fetchedWorkers);

        if (isEditMode) {
          const originalSalesman = fetchedWorkers.find(u => u.uid === invoiceToEdit?.salesmanId); // Safe access
          setSelectedWorker(originalSalesman || null);
        } else {
          const currentUserAsWorker = fetchedWorkers.find(u => u.uid === currentUser.uid);
          setSelectedWorker(currentUserAsWorker || null);
        }

      } catch (err) {
        const errorMessage = 'Failed to load initial page data.';
        setError(errorMessage);
        console.error(errorMessage, err); // This is line 123
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
  }, [loadingSettings, salesSettings]);


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
        Stock: item.stock || 0,
        amount: item.amount || 0,
        barcode: item.barcode || '',
        restockQuantity: item.restockQuantity || 0,
      }));
      setItems(nonEditableItems);
    } else if (!isEditMode) {
      setItems([]);
    }
  }, [isEditMode, invoiceToEdit]);

  const {
    subtotal,
    totalDiscount,
    roundOff,
    taxableAmount,
    taxAmount,
    finalAmount
  } = useMemo(() => {
    let subtotal = 0;
    let preDiscountTotal = 0;
    let taxableAmount = 0;

    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const isTaxEnabled = salesSettings?.enableTax ?? true;
    const taxRate = salesSettings?.defaultTaxRate ?? 0;
    const taxType = salesSettings?.taxType ?? 'exclusive';

    items.forEach(item => {
      const currentMrp = item.mrp || 0;
      const currentQuantity = item.quantity || 1;
      const currentDiscount = item.discount || 0;

      const itemSubtotal = currentMrp * currentQuantity;
      subtotal += itemSubtotal;

      const priceAfterDiscount = currentMrp * (1 - currentDiscount / 100);
      preDiscountTotal += priceAfterDiscount * currentQuantity;

      const calculatedRoundedPrice = (currentDiscount > 0)
        ? applyRounding(priceAfterDiscount, isRoundingEnabled)
        : priceAfterDiscount;

      let effectiveUnitPrice = calculatedRoundedPrice;
      if (item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== '') {
        const numericPrice = parseFloat(String(item.customPrice));
        if (!isNaN(numericPrice)) {
          effectiveUnitPrice = numericPrice;
        }
      }

      taxableAmount += effectiveUnitPrice * currentQuantity;
    });

    const totalDiscountValue = subtotal - taxableAmount;
    let finalAmountPreRounding = taxableAmount;
    let calculatedTax = 0;

    if (isTaxEnabled && taxRate > 0) {
      if (taxType === 'exclusive') {
        calculatedTax = taxableAmount * (taxRate / 100);
        finalAmountPreRounding = taxableAmount + calculatedTax;
      } else {
        const base = taxableAmount / (1 + (taxRate / 100));
        calculatedTax = taxableAmount - base;
      }
    } else {
      calculatedTax = 0;
      finalAmountPreRounding = taxableAmount;
    }

    const finalPayableAmount = applyRounding(finalAmountPreRounding, isRoundingEnabled);
    const roundOffValue = finalPayableAmount - finalAmountPreRounding;
    return {
      subtotal,
      totalDiscount: totalDiscountValue,
      roundOff: roundOffValue,
      taxableAmount: taxableAmount,
      taxAmount: calculatedTax,
      finalAmount: finalPayableAmount,
    };

  }, [items, salesSettings?.enableRounding, salesSettings?.enableTax, salesSettings?.defaultTaxRate, salesSettings?.taxType]);


  const amountToPayNow = useMemo(() => {
    if (!isEditMode || !invoiceToEdit) {
      return finalAmount;
    }
    const alreadyPaidAmount = Object.entries(invoiceToEdit.paymentMethods || {}).reduce((sum, [key, value]) => {
      return key === 'due' ? sum : sum + Number(value || 0);
    }, 0);

    return Math.max(0, finalAmount - alreadyPaidAmount);
  }, [isEditMode, finalAmount, invoiceToEdit]);

  const addItemToCart = (itemToAdd: Item) => {
    if (!itemToAdd || !itemToAdd.id) {
      console.error("Attempted to add invalid item:", itemToAdd);
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
        Stock: itemToAdd.stock || 0,
        amount: itemToAdd.amount || 0,
        barcode: itemToAdd.barcode || '',
        restockQuantity: itemToAdd.restockQuantity || 0,
      };
      setItems(prev => [...prev, newSalesItem]);
    }
  };

  const handleItemSelected = (selectedItem: Item | null) => { // Allow null
    if (selectedItem) addItemToCart(selectedItem);
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
      console.error("Error fetching item by barcode:", scanError);
      setModal({ message: 'Error finding item by barcode.', type: State.ERROR });
    }
  };

  const handleQuantityChange = (id: string, delta: number) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, quantity: Math.max(1, (item.quantity || 1) + delta) } : item
    ));
  };

  const handleDeleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleDiscountPressStart = () => {
    if (salesSettings?.lockDiscountEntry) return;
    longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500);
  };
  const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handleDiscountClick = () => {
    if (salesSettings?.lockDiscountEntry || isDiscountLocked) {
      setDiscountInfo("Cannot edit discount");
      setTimeout(() => setDiscountInfo(null), 3000);
    }
  };
  const handlePricePressStart = () => {
    if (salesSettings?.lockSalePriceEntry) return;
    longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 500);
  };
  const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handlePriceClick = () => {
    if (salesSettings?.lockSalePriceEntry || isPriceLocked) {
      setPriceInfo("Cannot edit sale price");
      setTimeout(() => setPriceInfo(null), 3000);
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
        // Otherwise, store the valid number
        return { ...item, customPrice: numericValue };
      }
      return item;
    }));
  };
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const handleOpenEditDrawer = (item: Item) => {
    setSelectedItemForEdit(item);
    setIsItemDrawerOpen(true); // <-- Use item drawer state
  };
  const handleCloseEditDrawer = () => {
    setIsItemDrawerOpen(false); // <-- Use item drawer state
    setTimeout(() => setSelectedItemForEdit(null), 300);
  };
  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    setAvailableItems(prevItems => prevItems.map(item =>
      item.id === selectedItemForEdit?.id
        ? { ...item, ...updatedItemData, id: item.id } as Item
        : item
    ));

    // 2. Update the item if it's already in the sales cart
    setItems(prevCartItems => prevCartItems.map(cartItem => {
      if (cartItem.id === selectedItemForEdit?.id) {
        return {
          ...cartItem, // Keep cart-specific data like quantity
          ...updatedItemData, // Apply new data like name, mrp
          id: cartItem.id, // Ensure id is correct
        };
      }
      return cartItem;
    }));

    console.log("Item updated successfully.");
    // We don't need updateError, so no need to set it
  };

  const handleProceedToPayment = () => {
    if (items.length === 0) {
      setModal({ message: 'Please add at least one item.', type: State.INFO }); return;
    }
    if (salesSettings?.enableSalesmanSelection && !selectedWorker) {
      setModal({ message: 'Please select a salesman.', type: State.ERROR }); return;
    }
    if (!salesSettings?.allowNegativeStock) {
      const invalidStockItems = items.filter(i => i.isEditable).reduce((acc, item) => {
        const available = availableItems.find(a => a.id === item.id)?.stock ?? 0;
        if (available < (item.quantity ?? 1)) {
          acc.push({ name: item.name, stock: available, needed: item.quantity ?? 1 });
        }
        return acc;
      }, [] as { name: string, stock: number, needed: number }[]);

      if (invalidStockItems.length > 0) {
        const msg = invalidStockItems.map(i => `${i.name} (Avail:${i.stock}, Need:${i.needed})`).join(', ');
        setModal({ message: `Insufficient stock: ${msg}`, type: State.ERROR }); return;
      }
    }
    if (salesSettings?.enforceExactMRP) {
      const isRoundingEnabled = salesSettings.enableRounding ?? true;
      const invalidItem = items.find(item => {
        const priceAfterDiscount = (item.mrp || 0) * (1 - (item.discount || 0) / 100);
        const calcPrice = (item.discount || 0) > 0 ? applyRounding(priceAfterDiscount, isRoundingEnabled) : priceAfterDiscount;
        let effectivePrice = calcPrice;
        if (item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== '') {
          const numPrice = parseFloat(String(item.customPrice));
          if (!isNaN(numPrice)) effectivePrice = numPrice;
        }
        return effectivePrice !== (item.mrp || 0);
      });
      if (invalidItem) {
        setModal({ message: `Cannot proceed: '${invalidItem.name}' price does not match its MRP of ₹${invalidItem.mrp || 0}.`, type: State.ERROR });
        return;
      }
    }

    setIsDrawerOpen(true);
  };

  const handleSavePayment = async (completionData: PaymentCompletionData) => {
    if (!currentUser?.companyId) {
      setModal({ message: "User or company information missing.", type: State.ERROR }); return;
    }
    const companyId = currentUser.companyId; // Get companyId for all paths

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

    const formatItemsForDB = (itemsToFormat: SalesItem[]) => {
      return itemsToFormat.map(({ isEditable, customPrice, ...item }) => {
        const currentMrp = item.mrp || 0;
        const currentDiscount = item.discount || 0;
        const currentQuantity = item.quantity || 1;

        const priceAfterDiscount = currentMrp * (1 - currentDiscount / 100);
        const calculatedRoundedPrice = (currentDiscount > 0)
          ? applyRounding(priceAfterDiscount, isRoundingEnabled)
          : priceAfterDiscount;

        let effectiveUnitPrice = calculatedRoundedPrice;
        if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
          const numericPrice = parseFloat(String(customPrice));
          if (!isNaN(numericPrice)) {
            effectiveUnitPrice = numericPrice;
          }
        }

        const itemTaxableAmount = effectiveUnitPrice * currentQuantity;
        let itemTaxAmount = 0;
        let itemFinalPrice = itemTaxableAmount;
        let itemTaxableBase = itemTaxableAmount;
        if (isTaxEnabled && currentTaxRate > 0) {
          if (finalTaxType === 'exclusive') {
            itemTaxAmount = itemTaxableAmount * (currentTaxRate / 100);
            itemFinalPrice = itemTaxableAmount + itemTaxAmount;
          } else {
            itemTaxableBase = itemTaxableAmount / (1 + (currentTaxRate / 100));
            itemTaxAmount = itemTaxableAmount - itemTaxableBase;
          }
        }

        return {
          ...item,
          quantity: currentQuantity,
          discount: currentDiscount,
          effectiveUnitPrice: effectiveUnitPrice,
          finalPrice: itemFinalPrice,
          taxableAmount: itemTaxableBase,
          taxAmount: itemTaxAmount,
          taxRate: isTaxEnabled ? currentTaxRate : 0,
          taxType: finalTaxType,
          discountPercentage: currentDiscount,
        };
      });
    };

    if (isEditMode && invoiceToEdit?.id) {
      const newItems = items.filter(item => item.isEditable);
      try {
        await runTransaction(db, async (transaction) => {
          // --- FIX: Use multi-tenant path ---
          const invoiceRef = doc(db, "companies", companyId, "sales", invoiceToEdit.id);
          const invoiceDoc = await transaction.get(invoiceRef);
          if (!invoiceDoc.exists()) throw new Error("Original invoice not found.");

          for (const newItem of newItems) {
            if (!salesSettings?.allowNegativeStock) {
              // --- FIX: Use multi-tenant path ---
              const itemRef = doc(db, "companies", companyId, "items", newItem.id);
              transaction.update(itemRef, { stock: firebaseIncrement(-(newItem.quantity ?? 1)) });
            }
          }

          const originalItems = invoiceDoc.data().items || [];
          const updatedItems = [...originalItems, ...formatItemsForDB(newItems)];

          const originalPayments = invoiceDoc.data().paymentMethods || {};
          const newPayments = completionData.paymentDetails;
          const mergedPayments = { ...originalPayments };
          for (const method in newPayments) {
            if (method !== 'due') {
              mergedPayments[method] = (Number(mergedPayments[method]) || 0) + (newPayments[method] || 0);
            }
          }



          transaction.update(invoiceRef, {
            items: updatedItems,
            subtotal,
            discount: totalDiscount,
            roundOff,
            taxableAmount,
            taxAmount,
            taxType: finalTaxType,
            totalAmount: finalAmount,
            paymentMethods: mergedPayments,
            updatedAt: serverTimestamp(),
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
      const { paymentDetails, partyName, partyNumber } = completionData;


      try {
        const companyId = currentUser.companyId;
        const newInvoiceNumber = await generateNextInvoiceNumber(companyId);

        await runTransaction(db, async (transaction) => {
          const saleData = {
            invoiceNumber: newInvoiceNumber,
            userId: currentUser.uid,
            salesmanId: finalSalesman.uid,
            salesmanName: finalSalesman.name || 'N/A',
            partyName: partyName.trim(),
            partyNumber: partyNumber.trim(),
            items: formatItemsForDB(items),
            subtotal,
            discount: totalDiscount,
            roundOff,
            taxableAmount,
            taxAmount,
            taxType: finalTaxType,
            totalAmount: finalAmount,
            paymentMethods: paymentDetails,
            createdAt: serverTimestamp(),
            companyId: companyId, // Already correct, just verifying
            voucherName: salesSettings?.voucherName ?? 'Sales',
          };
          // --- FIX: Use multi-tenant path ---
          const newSaleRef = doc(collection(db, "companies", companyId, "sales"));
          transaction.set(newSaleRef, saleData);


          items.forEach(cartItem => {
            if (!salesSettings?.allowNegativeStock) {
              // --- FIX: Use multi-tenant path ---
              const itemRef = doc(db, "companies", companyId, "items", cartItem.id);
              transaction.update(itemRef, { stock: firebaseIncrement(-(cartItem.quantity || 1)) });
            }
          });

          if (settingsDocId) {
            // --- FIX: Use multi-tenant path ---
            const settingsRef = doc(db, "companies", companyId, "settings", settingsDocId);
            transaction.update(settingsRef, { currentVoucherNumber: firebaseIncrement(1) });
          } else {
            console.error("CRITICAL: Sales settings document ID not found. Cannot increment voucher number.");
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


  if (pageIsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner /> <p className="ml-2">Loading...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-600">
        <p>{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button>
      </div>
    );
  }


  const gstSchemeDisplay = salesSettings?.gstScheme ?? 'none';
  const settingsTaxTypeDisplay = salesSettings?.taxType ?? 'exclusive';
  const isTaxInclusiveDisplay = (gstSchemeDisplay === 'regular' && settingsTaxTypeDisplay === 'inclusive') || gstSchemeDisplay === 'composition';

  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-10 ">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      <div className="flex flex-col bg-gray-100 border-b border-gray-200 shadow-sm flex-shrink-0 mb-2">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">{isEditMode ? `Editing Invoice #${invoiceToEdit.invoiceNumber}` : (salesSettings?.voucherName ?? 'Sales')}</h1>
        {!isEditMode && (
          <div className="flex items-center justify-center gap-6 mb-2">
            <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES)} active={isActive(ROUTES.SALES)}>Sales</CustomButton>
            <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES_RETURN)} active={isActive(ROUTES.SALES_RETURN)}>Sales Return</CustomButton>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-2 bg-white border-b pb-3 mb-2 rounded-sm">
        <div className="flex gap-4 items-end w-full">
          <div className="flex-grow">
            <SearchableItemInput
              label="Search Item"
              placeholder="Search by name or barcode..."
              items={availableItems}
              onItemSelected={handleItemSelected}
              isLoading={pageIsLoading}
              error={error}
            />
          </div>
          <button onClick={() => setIsScannerOpen(true)} className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-md font-semibold transition hover:bg-gray-800' title="Scan Barcode">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden">
        <div className="pt-2 flex-shrink-0 grid grid-cols-2 border-b pb-2">
          <h3 className="text-gray-700 text-base font-medium">Cart</h3>

          {salesSettings?.enableSalesmanSelection && (
            <div className="flex items-center gap-2">
              <label htmlFor="worker-select" className="block text-sm text-gray-700 mb-1">Salesman</label>
              <select
                value={selectedWorker?.uid || ''}
                onChange={(e) => setSelectedWorker(workers.find(s => s.uid === e.target.value) || null)}
                className="w-23 p-1 border rounded-md shadow-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                disabled={!hasPermission(Permissions.ViewTransactions) || isEditMode}
              >
                {workers.map(w => <option key={w.uid} value={w.uid}>{w.name || 'Unnamed'}</option>)}
              </select>
            </div>
          )}

          {discountInfo && (
            <div className="flex items-center text-sm bg-red-100 text-red-800 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <span>{discountInfo}</span>
            </div>
          )}
          {priceInfo && (
            <div className="flex items-center text-sm bg-red-100 text-red-800 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <span>{priceInfo}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-1">
          <div className="flex flex-col gap-3">
            {items.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-100 rounded-sm">No items added.</div>
            ) : (
              [...items].reverse().map(item => {
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const currentMrp = item.mrp || 0;
                const currentDiscount = item.discount || 0;

                const priceAfterDiscount = currentMrp * (1 - currentDiscount / 100);
                const calculatedRoundedPrice = (currentDiscount > 0)
                  ? applyRounding(priceAfterDiscount, isRoundingEnabled)
                  : priceAfterDiscount;

                const displayPrice = item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== ''
                  ? String(item.customPrice)
                  : calculatedRoundedPrice.toFixed(2);

                const discountLocked = (salesSettings?.lockDiscountEntry || isDiscountLocked) || !item.isEditable;
                const priceLocked = (salesSettings?.lockSalePriceEntry || isPriceLocked) || !item.isEditable;


                return (
                  <div key={item.id} className={`bg-white rounded-sm shadow-sm border p-2 ${!item.isEditable ? 'bg-gray-100 opacity-75' : ''}`}>
                    <div className="flex justify-between items-start">
                      <button
                        onClick={() => {
                          const originalItem = availableItems.find(a => a.id === item.id);
                          if (originalItem) {
                            handleOpenEditDrawer(originalItem);
                          } else {
                            setModal({ message: "Cannot edit this item. Original data not found.", type: State.ERROR });
                          }
                        }}
                        className="bg-gray-50 hover:bg-gray-100 -mr-5"
                      >
                        <FiEdit className="h-5 w-5 md:h-4 md:w-4" />
                      </button>
                      <p className="font-semibold text-gray-800">{(item.name || 'Unnamed').slice(0, 25)}</p>
                      <button onClick={() => handleDeleteItem(item.id)} disabled={!item.isEditable} className="text-black-400 hover:text-red-500 flex-shrink-0 ml-4 disabled:text-gray-300 disabled:cursor-not-allowed" title="Remove item">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>

                    {salesSettings?.enableItemWiseDiscount && (
                      <>
                        <div className="flex justify-between items-center mb-1">
                          <div
                            className="flex items-center gap-2"
                            onMouseDown={handleDiscountPressStart}
                            onMouseUp={handleDiscountPressEnd}
                            onMouseLeave={handleDiscountPressEnd}
                            onTouchStart={handleDiscountPressStart}
                            onTouchEnd={handleDiscountPressEnd}
                            onClick={handleDiscountClick}
                          >
                            <label htmlFor={`discount-${item.id}`} className={`text-sm text-gray-600`}>Approx. Discount</label>
                            <input
                              id={`discount-${item.id}`} type="number" value={item.discount || ''}
                              onChange={(e) => handleDiscountChange(item.id, e.target.value)}
                              readOnly={discountLocked}
                              className={`w-10 p-1 bg-gray-100 rounded-md text-center text-sm font-medium text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${discountLocked ? 'cursor-not-allowed' : ''}`}
                              placeholder="0"
                            />
                            <span className="text-sm text-gray-600 pr-20">%</span>
                          </div>
                        </div>
                        <hr className="my-1 border-gray-200" />
                      </>
                    )}

                    <div className="flex justify-between items-center">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm text-gray-500 line-through">₹{currentMrp.toFixed(2)}</p>
                        <div className="flex items-center">
                          <div
                            className="flex items-center gap-2"
                            onMouseDown={handlePricePressStart}
                            onMouseUp={handlePricePressEnd}
                            onMouseLeave={handlePricePressEnd}
                            onTouchStart={handlePricePressStart}
                            onTouchEnd={handlePricePressEnd}
                            onClick={handlePriceClick}
                          >
                            <span className="text-sm font-semibold text-gray-600 mr-1">₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={displayPrice}
                              onChange={(e) => handleCustomPriceChange(item.id, e.target.value)}
                              onBlur={() => handleCustomPriceBlur(item.id)}
                              readOnly={priceLocked}
                              className={`w-16 mr-10 p-1 bg-gray-100 rounded-sm text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200 ${priceLocked ? 'cursor-not-allowed' : ''}`}
                              placeholder='Price'
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gray-600">Qty</p>
                      <div className="flex items-center gap-2 text-lg border border-gray-300 rounded-md">
                        <button onClick={() => handleQuantityChange(item.id, -1)} disabled={item.quantity <= 1 || !item.isEditable} className="text-gray-700 pl-4 hover:text-black disabled:text-gray-300 disabled:cursor-not-allowed">-</button>
                        <span className="font-bold text-gray-900 w-8 border-l border-r rounded-none p-0 focus:ring-0 text-center">{item.quantity || 1}</span>
                        <button onClick={() => handleQuantityChange(item.id, 1)} disabled={!item.isEditable} className="text-gray-700 pr-4 hover:text-black font-semibold disabled:text-gray-300 disabled:cursor-not-allowed">+</button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="pl-4 pr-4 flex-shrink-0 p-2 rounded-sm bg-white border-t shadow-[0_-2px_5px_rgba(0,0,0,0.05)] mb-2">
        {isEditMode ? (
          <>
            <div className="flex justify-between items-center mb-1">
              <p className="text-md">Subtotal</p>
              <p className="text-md">₹{subtotal.toFixed(2)}</p>
            </div>
            <div className="flex justify-between items-center mb-1 text-red-600">
              <p className="text-md">Discount</p>
              <p className="text-md">- ₹{totalDiscount.toFixed(2)}</p>
            </div>
            <div className="flex justify-between items-center mb-1 border-t pt-1">
              <p className="text-lg font-medium">Total Amount</p>
              <p className="text-2xl font-bold">₹{finalAmount.toFixed(2)}</p>
            </div>

            {gstSchemeDisplay !== 'none' && (
              <>
                <div className="flex justify-between items-center text-xs text-gray-600"> <p>Taxable Amount</p> <p>₹{taxableAmount.toFixed(2)}</p> </div>
                <div className="flex justify-between items-center text-xs text-blue-600"> <p>Total Tax {isTaxInclusiveDisplay ? '(Incl.)' : ''}</p> <p>₹{taxAmount.toFixed(2)}</p> </div>
              </>
            )}
            <div className="flex justify-between items-center mb-1">
              <p className="text-md font-medium text-[#00A8E8]">Amount Due </p>
              <p className="text-md font-bold text-[#00A8E8]">₹{amountToPayNow.toFixed(2)}</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-1">
              <p className="text-md">Subtotal</p>
              <p className="text-md">₹{subtotal.toFixed(2)}</p>
            </div>
            <div className="flex justify-between items-center mb-1 text-red-600">
              <p className="text-md">Discount</p>
              <p className="text-md">- ₹{totalDiscount.toFixed(2)}</p>
            </div>
            {gstSchemeDisplay !== 'none' && (
              <>
                <div className="flex justify-between items-center text-xs text-gray-600"> <p>Taxable Amount</p> <p>₹{taxableAmount.toFixed(2)}</p> </div>
                <div className="flex justify-between items-center text-xs text-blue-600"> <p>Total Tax {isTaxInclusiveDisplay ? '(Incl.)' : ''}</p> <p>₹{taxAmount.toFixed(2)}</p> </div>
              </>
            )}
            <div className="flex justify-between items-center border-t pt-3">
              <p className="text-lg font-medium">Total Amount</p>
              <p className="text-lg font-bold">₹{finalAmount.toFixed(2)}</p>
            </div>
          </>
        )}
      </div>
      <div className="items-center px-16 py-1 mb-4">
        <CustomButton onClick={handleProceedToPayment} variant={Variant.Payment} className="w-full flex items-center justify-center py-4 text-xl font-semibold">
          {isEditMode ? 'Update & Proceed to Payment' : 'Proceed to Payment'}
        </CustomButton>
      </div>

      <PaymentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={amountToPayNow}
        onPaymentComplete={handleSavePayment}
        isPartyNameEditable={!isEditMode}
        initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''}
        initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''}
      />
      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isItemDrawerOpen}
        onClose={handleCloseEditDrawer}
        onSaveSuccess={handleSaveSuccess}
      />  </div>

  );
};

export default Sales;