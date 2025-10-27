import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Item, Purchase as OriginalPurchase, SalesItem } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/firebase';
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

import { usePurchaseSettings } from '../../context/Settingscontext';

interface PurchaseItem extends Omit<SalesItem, 'finalPrice' | 'effectiveUnitPrice' | 'discountPercentage'> {
  purchasePrice: number;
  barcode?: string;
}

interface PurchaseDocumentData extends Omit<OriginalPurchase, 'items' | 'paymentMethods'> {
  userId: string;
  partyName: string;
  partyNumber: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  subtotal: number;
  totalDiscount?: number;
  taxableAmount?: number;
  taxAmount?: number;
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


const PurchasePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseSettings, loadingSettings: loadingPurchaseSettings } = usePurchaseSettings();

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true); // Combined loading state
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [showPrintQrModal, setShowPrintQrModal] = useState<PurchaseItem[] | null>(null);

  const [editModeData, setEditModeData] = useState<Purchase | null>(null);
  const purchaseIdToEdit = location.state?.purchaseId as string | undefined;

  const [settingsDocId, setSettingsDocId] = useState<string | null>(null);


  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    setPageIsLoading(authLoading || loadingPurchaseSettings);
  }, [authLoading, loadingPurchaseSettings]);


  useEffect(() => {
    const findSettingsDocId = async () => {
      if (currentUser?.companyId) {
        const settingsQuery = query(collection(db, 'settings'), where('companyId', '==', currentUser.companyId), where('settingType', '==', 'purchase'));
        const settingsSnapshot = await getDocs(settingsQuery);
        if (!settingsSnapshot.empty) {
          setSettingsDocId(settingsSnapshot.docs[0].id);
        } else {
          console.warn("Purchase settings document ID not found on initial load.");
        }
      }
    };
    findSettingsDocId();

    if (pageIsLoading || !dbOperations || !currentUser) return; // Wait for loading & required data

    const initializePage = async () => {
      try {
        const fetchedItems = await dbOperations.getItems();
        setAvailableItems(fetchedItems);

        if (purchaseIdToEdit) {
          const purchaseDocRef = doc(db, 'purchases', purchaseIdToEdit);
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
              Stock: item.Stock
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


  const addItemToCart = (itemToAdd: Item) => {
    if (!itemToAdd || !itemToAdd.id) {
      console.error("Attempted to add invalid item:", itemToAdd);
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
      const defaultDiscount = purchaseSettings?.defaultDiscount ?? 0; // Use setting
      setItems((prevItems) => [
        ...prevItems,
        {
          id: itemToAdd.id!,
          name: itemToAdd.name || 'Unnamed Item',
          purchasePrice: itemToAdd.purchasePrice || 0,
          mrp: itemToAdd.mrp || 0,
          barcode: itemToAdd.barcode || '',
          quantity: 1,
          discount: defaultDiscount,
          Stock: itemToAdd.Stock,
        },
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
    let currentSubtotal = 0;
    let mrpTotal = 0;
    items.forEach(item => {
      currentSubtotal += (item.purchasePrice || 0) * (item.quantity || 1);
      mrpTotal += (item.mrp || item.purchasePrice || 0) * (item.quantity || 1);
    });

    const isTaxEnabled = purchaseSettings?.enableTax ?? true;
    const taxRate = purchaseSettings?.defaultTaxRate ?? 0;
    const taxType = purchaseSettings?.taxType ?? 'exclusive';
    const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;

    let currentTaxableAmount = currentSubtotal;
    let currentTaxAmount = 0;
    let finalPayableAmount = currentSubtotal;

    if (isTaxEnabled && taxRate > 0) {
      if (taxType === 'exclusive') {
        currentTaxAmount = currentSubtotal * (taxRate / 100);
        finalPayableAmount = currentSubtotal + currentTaxAmount;
      } else {
        currentTaxableAmount = currentSubtotal / (1 + (taxRate / 100));
        currentTaxAmount = currentSubtotal - currentTaxableAmount;
        finalPayableAmount = currentSubtotal;
      }
    } else {
      currentTaxableAmount = currentSubtotal;
      currentTaxAmount = 0;
      finalPayableAmount = currentSubtotal;
    }

    const roundedAmount = applyPurchaseRounding(finalPayableAmount, isRoundingEnabled);
    const currentRoundingOffAmount = roundedAmount - finalPayableAmount;

    const currentTotalDiscount = mrpTotal - currentSubtotal;


    return {
      subtotal: currentSubtotal,
      totalDiscount: currentTotalDiscount > 0 ? currentTotalDiscount : 0, // Ensure discount isn't negative
      taxableAmount: currentTaxableAmount,
      taxAmount: currentTaxAmount,
      roundingOffAmount: currentRoundingOffAmount,
      finalAmount: roundedAmount,
    };
  }, [items, purchaseSettings]);


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

    if (purchaseSettings?.requireSupplierName && !completionData.partyName.trim()) {
      setModal({ message: 'Supplier name is required.', type: State.ERROR });
      setIsDrawerOpen(true);
      return;
    }
    if (purchaseSettings?.requireSupplierMobile && !completionData.partyNumber.trim()) {
      setModal({ message: 'Supplier mobile is required.', type: State.ERROR });
      setIsDrawerOpen(true);
      return;
    }

    const isTaxEnabled = purchaseSettings?.enableTax ?? true;
    const finalTaxType = isTaxEnabled ? (purchaseSettings?.taxType ?? 'exclusive') : 'none';


    const formattedItemsForDB = items.map(({ id, name, purchasePrice, quantity, mrp, barcode, discount }) => ({
      id, name: name || 'N/A',
      purchasePrice: purchasePrice || 0,
      quantity: quantity || 1,
      mrp: mrp || 0,
      barcode: barcode || '',
      discount: discount || 0
    }));


    if (editModeData && purchaseIdToEdit) {
      await updateExistingPurchase(purchaseIdToEdit, completionData, formattedItemsForDB, finalTaxType);
    } else {
      await createNewPurchase(completionData, formattedItemsForDB, finalTaxType);
    }
  };

  const createNewPurchase = async (completionData: PaymentCompletionData, formattedItemsForDB: any[], finalTaxType: 'inclusive' | 'exclusive' | 'none') => { // Use any[] for simpler type
    if (!currentUser?.companyId) return;


    try {
      const newInvoiceNumber = await generateNextInvoiceNumber();

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
          taxType: finalTaxType,
          roundingOff: roundingOffAmount,
          totalAmount: finalAmount,
          paymentMethods: completionData.paymentDetails,
          createdAt: serverTimestamp(),
          companyId: currentUser.companyId!,
          voucherName: purchaseSettings?.voucherName ?? 'Purchase',
        };

        const newPurchaseRef = doc(collection(db, 'purchases'));
        transaction.set(newPurchaseRef, purchaseData);

        formattedItemsForDB.forEach(item => {
          const itemRef = doc(db, "items", item.id);
          transaction.update(itemRef, {
            Stock: firebaseIncrement(item.quantity || 1),
            purchasePrice: item.purchasePrice,
            mrp: item.mrp
          });
        });

        if (settingsDocId) {
          const settingsRef = doc(db, "settings", settingsDocId);
          transaction.update(settingsRef, {
            currentVoucherNumber: firebaseIncrement(1)
          });
        } else {
          console.error("CRITICAL: Purchase settings document ID not found. Cannot increment voucher number.");
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
    formattedItemsForDB: any[],
    finalTaxType: 'inclusive' | 'exclusive' | 'none'
  ) => {
    if (!editModeData) return;

    try {
      await runTransaction(db, async (transaction) => {
        const purchaseRef = doc(db, 'purchases', purchaseId);
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
            const itemRef = doc(db, 'items', id);
            transaction.update(itemRef, { Stock: firebaseIncrement(difference) });
          }
        });

        formattedItemsForDB.forEach(item => {
          const itemRef = doc(db, "items", item.id);
          transaction.update(itemRef, {
            purchasePrice: item.purchasePrice,
            mrp: item.mrp
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


  if (pageIsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
        <p className="ml-2">Loading...</p>
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

  const isTaxEnabledDisplay = purchaseSettings?.enableTax ?? true;
  const taxTypeDisplay = purchaseSettings?.taxType ?? 'exclusive';
  const taxRateDisplay = purchaseSettings?.defaultTaxRate ?? 0;

  return (
    <div className="flex flex-col h-screen bg-gray-100 w-full">
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
        <div className="flex flex-col p-1 bg-gray-100 border-b border-gray-300">
          <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">{editModeData ? 'Edit Purchase' : (purchaseSettings?.voucherName ?? 'Purchase')}</h1>
          {!editModeData && (
            <div className="flex items-center justify-center gap-6">
              <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE)} active={isActive(ROUTES.PURCHASE)}>Purchase</CustomButton>
              <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE_RETURN)} active={isActive(ROUTES.PURCHASE_RETURN)}>Purchase Return</CustomButton>
            </div>
          )}
        </div>
        <div className="p-4 bg-white border-b mt-2 rounded-sm">
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
            <button onClick={() => setIsScannerOpen(true)} className="p-3 bg-gray-700 text-white rounded-md font-semibold transition hover:bg-gray-800" title="Scan Barcode"> {/* Original Button Style */}
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
            </button>
          </div>
        </div>
      </div>

      <div className='flex-grow overflow-y-auto p-2'>
        <h3 className="text-gray-700 text-lg font-medium px-2 mb-2">Cart</h3>
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-100 rounded-sm">{pageIsLoading ? 'Loading...' : 'No items added.'}</div>
          ) : (
            items.map((item: PurchaseItem) => (
              <div key={item.id} className="relative bg-white rounded-lg shadow-sm border p-2 flex flex-col gap-1">
                <div className="flex justify-between items-start">
                  <p className="font-semibold text-gray-800 pr-8">{item.name}</p>
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
                  <div className="flex items-center gap-3 text-lg border border-gray-300 rounded-md"> {/* Original Gap & Style */}
                    <button onClick={() => handleQuantityChange(item.id, -1)} disabled={item.quantity <= 1} className="px-3 py-0.5 text-gray-700 hover:bg-gray-100 rounded-l-md disabled:text-gray-300">-</button>
                    <span className="font-bold text-gray-900 w-8 text-center border-l border-r px-2">{item.quantity}</span>
                    <button onClick={() => handleQuantityChange(item.id, 1)} className="px-3 py-0.5 text-gray-700 hover:bg-gray-100 rounded-r-md font-semibold">+</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-shrink-0 p-4 bg-white border-t rounded-sm shadow-[0_-2px_5px_rgba(0,0,0,0.05)] mb-4"> {/* Original Padding & Margin */}
        {isTaxEnabledDisplay && (
          <>
            <div className="flex justify-between items-center text-sm">
              <p className="text-gray-600">Subtotal (Pre-Tax)</p>
              <p className="text-gray-800">₹{(taxTypeDisplay === 'inclusive' ? taxableAmount : subtotal).toFixed(2)}</p>
            </div>
            <div className="flex justify-between items-center text-sm text-blue-600">
              <p>Tax @ {taxRateDisplay}% {taxTypeDisplay === 'inclusive' ? '(Incl.)' : '(Excl.)'}</p>
              <p>₹{taxAmount.toFixed(2)}</p>
            </div>
          </>
        )}
        {(purchaseSettings?.roundingOff && roundingOffAmount !== 0) && (
          <div className="flex justify-between items-center text-sm text-green-600">
            <p>Rounding</p>
            <p>{roundingOffAmount > 0 ? '+' : ''} ₹{roundingOffAmount.toFixed(2)}</p>
          </div>
        )}
        <div className="flex justify-between items-center mb-3">
          <p className="text-gray-700 text-lg font-medium">Total Amount</p>
          <p className="text-gray-900 text-2xl font-bold">₹{finalAmount.toFixed(2)}</p>
        </div>
      </div>

      <div className="px-14 py-1 mb-24">
        <CustomButton onClick={handleProceedToPayment} variant={Variant.Payment} className="w-full flex items-center justify-center py-4 text-xl font-semibold" disabled={items.length === 0}> {/* Original Style */}
          {editModeData ? 'Update Purchase' : 'Proceed to Payment'}
        </CustomButton>
      </div>


      <PaymentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={finalAmount}
        onPaymentComplete={handleSavePurchase}
        isPartyNameEditable={!editModeData}
        initialPartyName={editModeData ? editModeData.partyName : ''}
        initialPartyNumber={editModeData ? editModeData.partyNumber : ''}
      />
    </div>
  );
};

export default PurchasePage;

