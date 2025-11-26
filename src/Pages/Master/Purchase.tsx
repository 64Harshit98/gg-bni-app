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
import { generateNextInvoiceNumber } from '../../UseComponents/InvoiceCounter';
import { Spinner } from '../../constants/Spinner';
import { FiEdit } from 'react-icons/fi';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { usePurchaseSettings } from '../../context/SettingsContext';

// --- Interfaces ---
interface PurchaseItem extends Omit<SalesItem, 'finalPrice' | 'effectiveUnitPrice' | 'discountPercentage'> {
  purchasePrice: number;
  barcode?: string;
  taxRate?: number;
  taxType?: 'inclusive' | 'exclusive' | 'none';
  taxAmount?: number;
  taxableAmount?: number;
  stock: number;
}

interface PurchaseDocumentData {
  userId: string;
  partyName: string;
  partyNumber: string;
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
  updatedAt?: any;
}
type Purchase = PurchaseDocumentData & { id: string };

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

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // --- STATE: UI/Filter Controls ---
  const [billTaxType, setBillTaxType] = useState<TaxOption>('exclusive');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [gridSearchQuery, setGridSearchQuery] = useState<string>('');
  const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  // ----------------------------------

  const [showPrintQrModal, setShowPrintQrModal] = useState<PurchaseItem[] | null>(null);

  const [editModeData, setEditModeData] = useState<Purchase | null>(null);
  const purchaseIdToEdit = location.state?.purchaseId as string | undefined;

  const [settingsDocId, setSettingsDocId] = useState<string | null>(null);

  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    setPageIsLoading(authLoading || loadingPurchaseSettings);
  }, [authLoading, loadingPurchaseSettings]);

  // --- SYNC TAX TYPE WITH SETTINGS OR EDIT DATA ---
  useEffect(() => {
    if (!loadingPurchaseSettings) {
      if (editModeData && editModeData.taxType) {
        const savedTaxType: TaxOption = editModeData.taxType === 'none'
          ? 'exclusive'
          : editModeData.taxType as TaxOption;
        setBillTaxType(savedTaxType);
      } else if (purchaseSettings?.taxType) {
        setBillTaxType(purchaseSettings.taxType as TaxOption);
      }
    }
  }, [loadingPurchaseSettings, purchaseSettings, editModeData]);

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

    findSettingsDocId();

    const initializePage = async () => {
      try {
        const fetchedItems = await dbOperations.getItems();

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

        if (purchaseIdToEdit) {
          const purchaseDocRef = doc(db, 'companies', companyId, 'purchases', purchaseIdToEdit);
          const docSnap = await getDoc(purchaseDocRef);
          if (docSnap.exists()) {
            const purchaseData = { id: docSnap.id, ...docSnap.data() } as Purchase;
            const validatedItems = (purchaseData.items || []).map((item: any) => ({
              id: item.id || crypto.randomUUID(),
              name: item.name || 'Unknown Item',
              purchasePrice: item.purchasePrice || 0,
              quantity: item.quantity || 1,
              mrp: item.mrp || 0,
              discount: item.discount || 0,
              barcode: item.barcode || '',
              taxRate: item.taxRate || 0,
              taxType: item.taxType,
              taxAmount: item.taxAmount,
              taxableAmount: item.taxableAmount,
              stock: item.stock ?? item.Stock ?? 0,
            }));
            setEditModeData(purchaseData);
            setItems(validatedItems);
          } else {
            throw new Error("Purchase document not found.");
          }
        } else {
          setEditModeData(null);
          setItems([]);
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

  // --- MEMO: Category and Item Filtering for Grid View ---
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
      // Prioritize items already in the cart
      if (aInCart && !bInCart) return -1;
      if (!aInCart && bInCart) return 1;
      return 0;
    });
  }, [availableItems, selectedCategory, gridSearchQuery, items]);
  // ----------------------------------------------------


  const addItemToCart = (itemToAdd: Item) => {
    if (!itemToAdd || !itemToAdd.id) {
      setModal({ message: "Cannot add invalid item.", type: State.ERROR });
      return;
    }
    const itemExists = items.find((item) => item.id === itemToAdd.id);
    if (itemExists) {
      setItems((prevItems) =>
        prevItems.map((item: PurchaseItem) =>
          item.id === itemToAdd.id ? { ...item, quantity: (item.quantity || 0) + 1 } : item
        )
      );
    } else {
      const defaultDiscount = purchaseSettings?.defaultDiscount ?? 0;
      setItems((prevItems) => [
        {
          id: itemToAdd.id!,
          name: itemToAdd.name || 'Unnamed Item',
          purchasePrice: itemToAdd.purchasePrice || 0,
          mrp: itemToAdd.mrp || 0,
          barcode: itemToAdd.barcode || '',
          quantity: 1,
          discount: defaultDiscount,
          taxRate: itemToAdd.taxRate || 0,
          stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
        },
        ...prevItems, // Ensures newest item is on top
      ]);
    }
  };

  const {
    subtotal,
    taxableAmount,
    taxAmount,
    roundingOffAmount,
    finalAmount,
    totalDiscount
  } = useMemo(() => {
    const gstScheme = purchaseSettings?.gstScheme ?? 'none';
    const taxType = billTaxType;
    const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;

    let mrpTotalAgg = 0;
    let purchasePriceTotalAgg = 0;
    let totalTaxableBaseAgg = 0;
    let totalTaxAgg = 0;
    let finalAmountAggPreRounding = 0;

    items.forEach(item => {
      const purchasePrice = item.purchasePrice || 0;
      const quantity = item.quantity || 1;
      const itemTaxRate = item.taxRate || 0;
      const mrp = item.mrp || 0;

      mrpTotalAgg += mrp * quantity;
      const itemTotalPurchasePrice = purchasePrice * quantity;
      purchasePriceTotalAgg += itemTotalPurchasePrice;

      let itemTaxableBase = 0;
      let itemTax = 0;
      let itemFinalTotal = 0;

      const effectiveScheme = taxType === 'exempt' ? 'none' : gstScheme;

      if (effectiveScheme === 'regular' || effectiveScheme === 'composition') {
        if (taxType === 'exclusive') {
          itemTaxableBase = itemTotalPurchasePrice;
          itemTax = itemTaxableBase * (itemTaxRate / 100);
          itemFinalTotal = itemTaxableBase + itemTax;
        } else {
          // Inclusive logic
          itemFinalTotal = itemTotalPurchasePrice;
          itemTaxableBase = itemTotalPurchasePrice / (1 + (itemTaxRate / 100));
          itemTax = itemTotalPurchasePrice - itemTaxableBase;
        }
      } else {
        // Effective scheme is 'none' or due to 'exempt' selection
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
      subtotal: purchasePriceTotalAgg,
      totalDiscount: currentTotalDiscount > 0 ? currentTotalDiscount : 0,
      taxableAmount: totalTaxableBaseAgg,
      taxAmount: totalTaxAgg,
      roundingOffAmount: currentRoundingOffAmount,
      finalAmount: roundedAmount,
    };
  }, [items, purchaseSettings, billTaxType]);

  const handleQuantityChange = (id: string, delta: number) => {
    setItems((prevItems) =>
      prevItems.map((item: PurchaseItem) =>
        item.id === id ? { ...item, quantity: Math.max(1, (item.quantity || 1) + delta) } : item
      )
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
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
    if (purchaseSettings?.zeroValueValidation) {
      const hasZeroValueItem = items.some(item => (item.purchasePrice || 0) <= 0);
      if (hasZeroValueItem) {
        setModal({ message: 'Cannot proceed: One or more items have a zero or negative purchase price.', type: State.ERROR });
        return;
      }
    }
    if (purchaseSettings?.inputMRP) {
      const missingMrpItem = items.find(item => (item.mrp === undefined || item.mrp === null || item.mrp <= 0));
      if (missingMrpItem) {
        setModal({ message: `Cannot proceed: MRP is required but missing or invalid for "${missingMrpItem.name}". Please input MRP for all items.`, type: State.ERROR });
        return;
      }
    }
    setIsDrawerOpen(true);
  };

  const handleSavePurchase = async (completionData: PaymentCompletionData) => {
    if (!currentUser?.companyId) {
      setModal({ message: 'User or company information missing.', type: State.ERROR });
      return;
    }
    if (purchaseSettings?.requireSupplierName && !completionData.partyName.trim()) { setModal({ message: 'Supplier name is required.', type: State.ERROR }); setIsDrawerOpen(true); return; }
    if (purchaseSettings?.requireSupplierMobile && !completionData.partyNumber.trim()) { setModal({ message: 'Supplier mobile is required.', type: State.ERROR }); setIsDrawerOpen(true); return; }

    const gstScheme = purchaseSettings?.gstScheme ?? 'none';
    const taxType = billTaxType;

    let finalTaxType: 'inclusive' | 'exclusive' | 'none';
    if (gstScheme === 'none' || taxType === 'exempt') {
      finalTaxType = 'none';
    } else {
      finalTaxType = taxType;
    }

    const formatItemsForDB = (itemsToFormat: PurchaseItem[]): PurchaseItem[] => {
      return itemsToFormat.map((item) => {
        const purchasePrice = item.purchasePrice || 0;
        const quantity = item.quantity || 1;
        const itemTaxRate = finalTaxType === 'none' ? 0 : (item.taxRate || 0);

        const itemTotalPurchasePrice = purchasePrice * quantity;
        let itemTaxableBase = 0;
        let itemTax = 0;

        if (finalTaxType === 'exclusive') {
          itemTaxableBase = itemTotalPurchasePrice;
          itemTax = itemTaxableBase * (itemTaxRate / 100);
        } else if (finalTaxType === 'inclusive') {
          itemTaxableBase = itemTotalPurchasePrice / (1 + (itemTaxRate / 100));
          itemTax = itemTotalPurchasePrice - itemTaxableBase;
        } else {
          itemTaxableBase = itemTotalPurchasePrice;
          itemTax = 0;
        }
        return {
          ...item,
          taxableAmount: parseFloat(itemTaxableBase.toFixed(2)),
          taxAmount: parseFloat(itemTax.toFixed(2)),
          taxRate: itemTaxRate,
          taxType: finalTaxType,
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

    try {
      const newInvoiceNumber = await generateNextInvoiceNumber(companyId);

      await runTransaction(db, async (transaction) => {
        const purchaseData: Omit<PurchaseDocumentData, 'id'> = {
          userId: currentUser.uid,
          partyName: completionData.partyName.trim(),
          partyNumber: completionData.partyNumber.trim(),
          invoiceNumber: newInvoiceNumber,
          items: formattedItemsForDB,
          subtotal: subtotal,
          totalDiscount: totalDiscount,
          taxableAmount: taxableAmount,
          taxAmount: taxAmount,
          gstScheme: gstScheme,
          taxType: finalTaxType,
          roundingOff: roundingOffAmount,
          totalAmount: finalAmount,
          paymentMethods: completionData.paymentDetails,
          createdAt: serverTimestamp(),
          companyId: companyId,
          voucherName: purchaseSettings?.voucherName ?? 'Purchase',
        };

        const newPurchaseRef = doc(collection(db, 'companies', companyId, 'purchases'));
        transaction.set(newPurchaseRef, purchaseData);

        // --- INVENTORY UPDATE FIX ---
        formattedItemsForDB.forEach(item => {
          const itemRef = doc(db, "companies", companyId, "items", item.id);
          transaction.update(itemRef, {
            stock: firebaseIncrement(item.quantity || 1), // FIX: Update lowercase 'stock'
            purchasePrice: item.purchasePrice,
            mrp: item.mrp,
            taxRate: item.taxRate,
            updatedAt: serverTimestamp(),
          });
        });

        if (settingsDocId) {
          const settingsRef = doc(db, "companies", companyId, "settings", settingsDocId);
          transaction.update(settingsRef, {
            currentVoucherNumber: firebaseIncrement(1)
          });
        } else {
          throw new Error("Settings document not found for voucher increment.");
        }
      });

      setIsDrawerOpen(false);
      const savedItemsCopy = [...items];
      if (!purchaseSettings?.copyVoucherAfterSaving) {
        setItems([]);
      }
      if (purchaseSettings?.enableBarcodePrinting) {
        setShowPrintQrModal(savedItemsCopy);
      } else {
        setModal({ message: `Purchase #${newInvoiceNumber} saved!`, type: State.SUCCESS });
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

        // --- INVENTORY UPDATE FIX ---
        allItemIds.forEach(id => {
          const oldQty = originalItemsMap.get(id) || 0;
          const newQty = currentItemsMap.get(id) || 0;
          const difference = newQty - oldQty;

          if (difference !== 0) {
            const itemRef = doc(db, 'companies', companyId, 'items', id);
            transaction.update(itemRef, {
              stock: firebaseIncrement(difference) // FIX: Update lowercase 'stock'
            });
          }
        });

        formattedItemsForDB.forEach(item => {
          const itemRef = doc(db, "companies", companyId, "items", item.id);
          transaction.update(itemRef, {
            purchasePrice: item.purchasePrice,
            mrp: item.mrp,
            taxRate: item.taxRate,
            updatedAt: serverTimestamp(),
          });
        });

        const updatedPurchaseData: Partial<PurchaseDocumentData> = {
          partyName: completionData.partyName.trim(),
          partyNumber: completionData.partyNumber.trim(),
          items: formattedItemsForDB,
          subtotal: subtotal,
          totalDiscount: totalDiscount,
          taxableAmount: taxableAmount,
          taxAmount: taxAmount,
          gstScheme: gstScheme,
          taxType: finalTaxType,
          roundingOff: roundingOffAmount,
          totalAmount: finalAmount,
          paymentMethods: completionData.paymentDetails,
          updatedAt: serverTimestamp(),
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
      navigate(ROUTES.PRINTQR, { state: { prefilledItems: showPrintQrModal } });
      setShowPrintQrModal(null);
    }
  };

  const handleCloseQrModal = () => {
    setShowPrintQrModal(null);
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

    const updateForCart: Partial<PurchaseItem> & { stock?: number } = { ...updatedItemData };

    // FIX: Ensure 'stock' lowercase mapping is handled
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
        return {
          ...cartItem,
          ...updateForCart,
          id: cartItem.id,
        };
      }
      return cartItem;
    }));
  };

  if (pageIsLoading) {
    return (<div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>);
  }
  if (error) {
    return (<div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button></div>);
  }

  const gstSchemeDisplay = purchaseSettings?.gstScheme ?? 'none';

  const showTaxToggle = gstSchemeDisplay !== 'none';
  const displayTaxTotal = showTaxToggle && billTaxType !== 'exempt';

  // Flag to enable Card/Grid view based on setting (Assuming 'card' is the setting value)
  const isCardView = purchaseSettings?.purchaseViewType === 'card';

  // --- SHARED COMPONENTS ---

  const renderHeader = () => (
    <div className="flex flex-col p-1 bg-gray-100 border-b border-gray-300">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">{editModeData ? 'Edit Purchase' : (purchaseSettings?.voucherName ?? 'Purchase')}</h1>
      {!editModeData && (
        <div className="flex items-center justify-center gap-6">
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE)} active={isActive(ROUTES.PURCHASE)}>Purchase</CustomButton>
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE_RETURN)} active={isActive(ROUTES.PURCHASE_RETURN)}>Purchase Return</CustomButton>
        </div>
      )}
    </div>
  );

  // ** SHARED FOOTER (Collapsible) **
  const renderFooter = () => {
    return (
      <div className="flex-shrink-0 p-2 bg-white border-t shadow-[0_-4px_10px_rgba(0,0,0,0.1)] mb-2">

        {/* Tax Calculation Dropdown (Fixed location) */}
        {showTaxToggle && (
          <div className="flex justify-between items-center p-1 bg-white border-b border-gray-200">
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
        <div
          onClick={() => setIsFooterExpanded(!isFooterExpanded)}
          className="flex justify-between items-center p-1 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-600">Total Bill Details</span>
          <div className={`transform transition-transform duration-300 ${isFooterExpanded ? '' : 'rotate-180'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {/* --- EXPANDED DETAILS --- */}
        {isFooterExpanded && (
          <div className="px-4 py-2 space-y-1 bg-white text-sm animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex justify-between"><span>Subtotal (Purchase Price)</span> <span>₹{subtotal.toFixed(2)}</span></div>
            {totalDiscount > 0 && <div className="flex justify-between text-red-500"><span>MRP Discount</span> <span>- ₹{totalDiscount.toFixed(2)}</span></div>}

            {displayTaxTotal && (
              <>
                <div className="flex justify-between text-xs text-gray-600"> <span>Taxable Amount</span> <span>₹{taxableAmount.toFixed(2)}</span> </div>
                <div className="flex justify-between text-xs text-blue-500"> <span>Total Tax</span> <span>₹{taxAmount.toFixed(2)}</span> </div>
              </>
            )}
            {roundingOffAmount !== 0 && (
              <div className="flex justify-between text-xs text-gray-500"><span>Rounding Off</span> <span>{roundingOffAmount.toFixed(2)}</span></div>
            )}
          </div>
        )}

        <div className="">
          <div className="flex justify-between font-bold text-xl mt-2 mb-2 px-1">
            <span>Total</span> <span>₹{finalAmount.toFixed(2)}</span>
          </div>

          <div className="">
            <CustomButton
              onClick={handleProceedToPayment}
              variant={Variant.Payment}
              className="flex justify-between py-3 text-lg font-bold shadow-md ml-16" 
              disabled={items.length === 0}
            >
              {editModeData ? 'Update Purchase' : 'Proceed to Payment'}
            </CustomButton>
          </div>
        </div>
      </div>
    );
  };

  // --- RENDERING FUNCTIONS ---

  const renderCardView = () => (
    <>
      <div className="flex-shrink-0 bg-gray-50 border-b border-gray-300">
        {/* Search Input for Grid */}
        <div className="p-2 bg-white border-b flex gap-2 items-center">
          <input
            type="text" placeholder="Search items..."
            className="w-full p-2 pr-8 border rounded bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={gridSearchQuery} onChange={(e) => setGridSearchQuery(e.target.value)}
          />
          {gridSearchQuery && (
            <button onClick={() => setGridSearchQuery('')} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
            </button>
          )}
          <button onClick={() => setIsScannerOpen(true)} className='bg-white text-gray-700 p-2 border rounded hover:bg-gray-100'>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h6v6H3z" /><path d="M15 3h6v6h-6z" /><path d="M3 15h6v6H3z" /><path d="M15 15h6v6h-6z" /><path d="M3 9h18" /><path d="M9 3v18" /></svg>
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex overflow-x-auto whitespace-nowrap p-2 gap-2 bg-white border-b border-gray-200 scrollbar-hide">
          {categories.map(catId => (
            <CustomButton
              key={catId}
              onClick={() => setSelectedCategory(catId)}
              variant={selectedCategory === catId ? Variant.Filled : Variant.Outline}
              className={`text-sm flex-shrink-0 ${selectedCategory === catId ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-700'}`}
            >
              {itemGroupMap[catId] || catId}
            </CustomButton>
          ))}
        </div>
      </div>

      {/* Grid Display Area */}
      <div className="flex-1 p-3 overflow-y-auto grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start bg-gray-100 pb-20">
        {sortedGridItems.length === 0 ? <div className="col-span-full text-center text-gray-500 mt-10">No items found</div> : (
          sortedGridItems.map(item => {
            const cartItem = items.find(i => i.id === item.id);
            const isSelected = !!cartItem;
            const quantity = cartItem?.quantity || 0;

            return (
              <div key={item.id}
                onClick={() => addItemToCart(item)}
                className={`p-2 rounded shadow-sm border transition-all flex flex-col justify-between text-center relative select-none cursor-pointer
                           ${isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-gray-200 hover:shadow-md hover:border-blue-400'}`}
              >
                {/* Item Content and Price */}
                <div className="w-full flex flex-col items-center pt-1 px-1 pointer-events-none">
                  <span className="text-sm font-bold text-gray-800 leading-tight text-center line-clamp-2" title={item.name}>{item.name}</span>
                  <span className="text-sm font-medium text-gray-600 mt-1">₹{item.purchasePrice || 0}</span>
                </div>

                {/* Quantity/Add Control */}
                <div className="w-full flex items-center justify-center pb-1 mt-auto">
                  {!isSelected ? (
                    <span className="text-blue-600 font-bold text-sm px-4 py-1 bg-blue-50 rounded-lg">Add</span>
                  ) : (
                    <div className="flex items-center gap-1 bg-white shadow-sm px-1 py-0.5 border border-gray-200 rounded-full text-lg">
                      <button onClick={(e) => { e.stopPropagation(); if (quantity > 1) handleQuantityChange(item.id!, quantity - 1); else handleDeleteItem(item.id!); }} className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-600 font-bold transition-colors text-sm">-</button>
                      <span className="text-sm font-bold w-4 text-center">{quantity}</span>
                      <button onClick={(e) => { e.stopPropagation(); addItemToCart(item); }} className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold transition-colors text-sm">+</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  const renderListView = () => (
    <>
      <div className="flex-shrink-0 p-4 bg-white border-b mt-2 rounded-sm">
        <div className="flex gap-2 items-end">
          <div className="flex-grow">
            <SearchableItemInput
              label="Search & Add Item"
              placeholder="Search by name or barcode..."
              items={availableItems}
              onItemSelected={handleItemSelected}
              isLoading={pageIsLoading}
              error={error}
            />
          </div>
          <button onClick={() => setIsScannerOpen(true)} className="p-3 bg-gray-700 text-white rounded-md font-semibold transition hover:bg-gray-800" title="Scan Barcode">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
          </button>
        </div>
      </div>

      <div className='flex-grow overflow-y-auto p-2'>
        <h3 className="text-gray-700 text-lg font-medium px-2 mb-2">Cart</h3>

        {/* Purchase Cart List (Original Logic) */}
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-100 rounded-sm">No items added.</div>
          ) : (
            items.map((item: PurchaseItem) => (
              <div key={item.id} className="relative bg-white rounded-lg shadow-sm border p-2 flex flex-col gap-1">
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
                    className="absolute top-3 left-4 bg-gray-50 hover:bg-gray-100 "
                  >
                    <FiEdit className="h-5 w-5 md:h-4 md:w-4" />
                  </button>
                  <p className="font-semibold text-gray-800 pr-8 pl-10">{item.name}</p>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
                    title="Remove item"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center text-sm">
                    <label htmlFor={`price-${item.id}`} className="text-xs text-gray-500 mr-1">Price:</label>
                    <span className="text-xs mr-0.5">₹</span>
                    <input
                      id={`price-${item.id}`} type="text" inputMode="decimal"
                      value={item.purchasePrice ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                          setItems(prev => prev.map(i => i.id === item.id ? { ...i, purchasePrice: val === '' ? 0 : parseFloat(val) || 0 } : i))
                        }
                      }}
                      className="w-16 p-0.5 text-sm font-medium" placeholder="0.00"
                    />
                  </div>
                </div>

                <hr className="my-1 border-gray-200" />

                <div className="flex justify-between items-center">
                  <p className="font-medium text-sm text-gray-600">Quantity</p>
                  <div className="flex items-center gap-3 text-lg border border-gray-300 rounded-md">
                    <button onClick={() => handleQuantityChange(item.id, -1)} disabled={item.quantity <= 1} className="px-3 py-0.5 text-gray-700 hover:bg-gray-100 rounded-l-md disabled:text-gray-300">-</button>
                    <input
                      type="number"
                      inputMode="decimal" // Use decimal for flexible entry
                      value={item.quantity}
                      min="1"
                      onChange={(e) => {
                        const newQty = parseFloat(e.target.value);
                        if (!isNaN(newQty) && newQty > 0) {
                          setItems(prevItems => prevItems.map(i => i.id === item.id ? { ...i, quantity: newQty } : i));
                        } else if (e.target.value === '') {
                          setItems(prevItems => prevItems.map(i => i.id === item.id ? { ...i, quantity: 0 } : i));
                        }
                      }}
                      onBlur={() => {
                        if (!item.quantity || item.quantity <= 0) {
                          setItems(prevItems => prevItems.map(i => i.id === item.id ? { ...i, quantity: 1 } : i));
                        }
                      }}
                      className="w-8 h-8 text-center font-bold text-gray-900 border-l border-r p-0 focus:ring-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button onClick={() => handleQuantityChange(item.id, 1)} className="px-3 py-0.5 text-gray-700 hover:bg-gray-100 rounded-r-md font-semibold">+</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-10 ">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />

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

      <div className="flex-shrink-0">
        {renderHeader()}
      </div>

      {/* CONDITIONAL CONTENT RENDERING */}
      {isCardView ? renderCardView() : renderListView()}

      {/* --- FOOTER SECTION --- */}
      {renderFooter()}


      <PaymentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={finalAmount}
        onPaymentComplete={handleSavePurchase}
        isPartyNameEditable={!editModeData}
        initialPartyName={editModeData ? editModeData.partyName : ''}
        initialPartyNumber={editModeData ? editModeData.partyNumber : ''}
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

export default PurchasePage;