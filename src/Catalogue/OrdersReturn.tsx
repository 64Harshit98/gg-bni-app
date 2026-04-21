import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import type { Item } from '../constants/models';

import { ROUTES } from '../constants/routes.constants';
import { Modal } from '../constants/Modal';
import { State, Variant } from '../enums';
import { CustomButton } from '../Components';
import PaymentDrawer from '../Components/PaymentDrawer';
import { ReturnListItem } from '../Components/ReturnListItem';
import type { Order, OrderItem } from './Orders';
import BarcodeScanner from '../UseComponents/BarcodeScanner';

// Custom hooks
import { useOrderReturnData } from '../Catalogue/hooks/useOrderReturnData';
import { useExchangeItems } from '../Catalogue/hooks/useExchangeItems';
import { useReturnCalculations } from '../Catalogue/hooks/useReturnCalculations';
import { useReturnTransaction } from '../Catalogue/hooks/useReturnTransaction';

// Sub-components
import { SaleSearchInput } from '../Components/SaleSearchInput';
import { ReturnSummaryPanel } from '../Components/ReturnSummaryPanel';
import { ExchangeSection } from '../Components/ExchangeSection';

interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}

const OrdersReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useLocation();

  // ─── Form state ────────────────────────────────────────────────────────────
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [partyNumber, setPartyNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // ─── Sale selection state ───────────────────────────────────────────────────
  const [selectedSale, setSelectedSale] = useState<Order | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());

  // ─── Item edit drawer state ─────────────────────────────────────────────────
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

  // ─── Data hooks ─────────────────────────────────────────────────────────────
  const {
    salesList, setSalesList,
    availableItems, setAvailableItems,
    catalogueSettings,
    isLoading, error,
  } = useOrderReturnData();

  // ─── Exchange items hook ────────────────────────────────────────────────────
  const {
    exchangeItems, setExchangeItems,
    mappedExchangeItems,
    handleExchangeItemSelected,
    handleQuantityChange,
    handleDiscountChange,
    handleCustomPriceChange,
    handleCustomPriceBlur,
    handleRemoveExchangeItem,
  } = useExchangeItems(availableItems, setModal);

  // ─── Derived items to return ────────────────────────────────────────────────
  const itemsToReturn = useMemo(
    () => originalSaleItems.filter(item => selectedReturnIds.has(item.id)),
    [originalSaleItems, selectedReturnIds]
  );

  // ─── Calculations hook ──────────────────────────────────────────────────────
  const { totalReturnGross, totalExchangeValue, finalBalance, discountDeducted } =
    useReturnCalculations(itemsToReturn, exchangeItems, selectedSale, modeOfReturn);

  // ─── Save hook ──────────────────────────────────────────────────────────────
  const { saveReturnTransaction } = useReturnTransaction({
    selectedSale, itemsToReturn, exchangeItems,
    availableItems, partyName, partyNumber, modeOfReturn, finalBalance,
    setModal, setSelectedSale, setSalesList,
    setOriginalSaleItems,
    setSelectedReturnIds: ids => setSelectedReturnIds(ids),
    setExchangeItems: items => setExchangeItems(items as any),
    onSuccess: () => setTimeout(() => navigate(ROUTES.ORDERDETAILS), 1500),
  });

  // ─── Sale selection helpers ─────────────────────────────────────────────────
  const handleSelectSale = (order: Order) => {
    setSelectedSale(order);
    setSearchSaleQuery(order.orderId ?? '');
    setPartyName(order.userName ?? 'Customer');
    setPartyNumber(order.billingDetails?.phone ?? '');

    setOriginalSaleItems(
      (order.items ?? [])
        .map((item: any) => {
          if (!item.id) return null;
          const qty = Number(item.quantity) || 0;
          const price = Number(item.salesPrice ?? item.mrp) || 0;
          return {
            id: item.id, originalItemId: item.id,
            name: item.name ?? 'Unnamed Item',
            quantity: qty, originalQuantity: qty,
            unitPrice: price, amount: price * qty,
            mrp: Number(item.mrp) || price,
          };
        })
        .filter(Boolean) as TransactionItem[]
    );
  };

  const handleClear = () => {
    setSelectedSale(null);
    setPartyName('');
    setPartyNumber('');
    setOriginalSaleItems([]);
    setSelectedReturnIds(new Set());
    setExchangeItems([]);
    setSearchSaleQuery('');
    navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`);
  };

  // ─── Effects ─────────────────────────────────────────────────────────────
  // Auto-select sale from navigation state
  useEffect(() => {
    if (!state?.selectedOrder || salesList.length === 0) return;
    const found = salesList.find(o => o.orderId === state.selectedOrder);
    if (found) handleSelectSale(found);
  }, [state, salesList]);

  // Clear exchange items when mode changes away from Exchange
  useEffect(() => {
    if (modeOfReturn !== 'Exchange') setExchangeItems([]);
  }, [modeOfReturn]);

  // ─── Filtered sales list ──────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    if (!salesList) return [];
    return salesList
      .filter(order => ['completed', 'paid', 'unpaid'].includes(String(order.status).toLowerCase().trim()))
      .filter(order => {
        const q = (searchSaleQuery || '').toLowerCase();
        return (
          (order?.orderId || '').toLowerCase().includes(q) ||
          (order?.userName || '').toLowerCase().includes(q) ||
          String(order?.billingDetails?.phone || '').toLowerCase().includes(q)
        );
      });
  }, [salesList, searchSaleQuery]);

  // ─── Item toggle ──────────────────────────────────────────────────────────
  const handleToggleReturnItem = (itemId: string) => {
    if (!originalSaleItems.find(i => i.id === itemId)) return;
    setSelectedReturnIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  // ─── Item drawer handlers ─────────────────────────────────────────────────
  const handleCloseEditDrawer = () => {
    setIsItemDrawerOpen(false);
    setTimeout(() => setSelectedItemForEdit(null), 300);
  };

  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    if (!selectedItemForEdit) return;

    setAvailableItems(prev =>
      prev.map(item => {
        if (item.id !== selectedItemForEdit.id) return item;
        return {
          ...item, ...updatedItemData,
          name: updatedItemData.name ?? item.name,
          mrp: Number(updatedItemData.mrp ?? item.mrp),
          salesPrice: Number(updatedItemData.salesPrice ?? item.salesPrice),
          moq: updatedItemData.moq !== undefined ? Number(updatedItemData.moq) : (item as any).moq ?? 1,
        } as OrderItem;
      })
    );

    setExchangeItems(prev =>
      prev.map((item: any) => {
        if (item.originalItemId !== selectedItemForEdit.id) return item;
        const newMrp = Number(updatedItemData.mrp ?? item.mrp);
        const newSalesPrice = Number(updatedItemData.salesPrice ?? item.salesPrice);
        const finalPrice = newSalesPrice > 0 ? newSalesPrice : newMrp;
        const discount = newMrp > 0 && newSalesPrice > 0 ? ((newMrp - newSalesPrice) / newMrp) * 100 : 0;
        return {
          ...item, mrp: newMrp, salesPrice: newSalesPrice,
          unitPrice: finalPrice, basePrice: finalPrice,
          discount: parseFloat(discount.toFixed(2)),
          amount: finalPrice * item.quantity,
        };
      }) as any
    );

    setIsItemDrawerOpen(false);
    setSelectedItemForEdit(null);
  };

  // ─── Barcode scanner ──────────────────────────────────────────────────────
  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);

    if (purpose === 'sale') {
      const found = salesList.find(
        s => s.orderId === barcode && ['paid', 'completed', 'confirmed'].includes(String(s.status).toLowerCase())
      );
      if (found) handleSelectSale(found);
      else setModal({ message: 'Original sale not found for this invoice.', type: State.ERROR });
    } else if (purpose === 'item') {
      const item = availableItems.find(i => i.id === barcode);
      if (item) handleExchangeItemSelected(item);
      else setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
    }
  };

  // ─── Return quantity change ───────────────────────────────────────────────
  const handleReturnQuantityChange = (id: string, val: number) => {
    const item = originalSaleItems.find(i => i.id === id);
    if (!item) return;
    const safeQty = Math.min(Math.max(1, val), (item as any).originalQuantity);
    setOriginalSaleItems(prev =>
      prev.map(i => {
        if (i.id !== id) return i;
        return { ...i, quantity: safeQty, amount: safeQty * i.unitPrice };
      })
    );
  };

  const addExchangeItem = (itemToAdd: Item) => {
    const mrp = Number(itemToAdd.mrp || 0);
    const salesPrice = Number(itemToAdd.salesPrice || 0);
    const presetDiscount = Number(itemToAdd.discount || 0);

    let finalExchangePrice = mrp;
    let calculatedDiscount = 0;

    if (salesPrice > 0) {
      finalExchangePrice = salesPrice;

      if (mrp > 0) {
        calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
      }
    }
    else if (presetDiscount > 0) {
      calculatedDiscount = presetDiscount;
      finalExchangePrice = mrp * (1 - (presetDiscount / 100));
    }
    else {
      finalExchangePrice = mrp;
      calculatedDiscount = 0;
    }



    const existingStock = itemToAdd.stock ?? 0;

    if (existingStock <= 0) {
      setModal({
        type: State.ERROR,
        message: "This item is out of stock."
      });
      return;
    }

    setExchangeItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        originalItemId: itemToAdd.id!,
        name: itemToAdd.name,

        quantity: (itemToAdd as any).unitMultiplier || 1,
        unitMultiplier: (itemToAdd as any).unitMultiplier || 1,

        unitPrice: finalExchangePrice,
        amount: finalExchangePrice,

        mrp: mrp,
        salesPrice: salesPrice,

        discount: parseFloat(calculatedDiscount.toFixed(2)),
        basePrice: mrp,
      }
    ]);
  };

  const handleExchangeItemSelected = (item: any) => {
    if (item) {
      // FIX: Ensure purchasePrice is a number before passing to addExchangeItem
      addExchangeItem({
        ...item,
        purchasePrice: item.purchasePrice ?? 0
      });
    }
  };

  const mappedExchangeItems: SalesItem[] = useMemo(() => {
    return exchangeItems.map(item => {
      const realItem = availableItems.find(i => i.id === item.originalItemId);

      return {
        id: item.id,
        productId: item.originalItemId,
        name: item.name,
        mrp: item.mrp,
        quantity: item.quantity,
        discount: item.discount,
        isEditable: true,
        purchasePrice: 0,
        tax: 0,
        itemGroupId: 0,
        stock: realItem?.stock ?? 0,
        amount: item.amount,
        barcode: '',
        restockQuantity: 0,
        customPrice: item.customPrice ?? item.unitPrice,
      } as SalesItem;
    });
  }, [exchangeItems, availableItems]);

  const refreshSelectedOrder = async (orderId: string) => {
    if (!currentUser?.companyId) return;

    const orderRef = doc(
      db,
      'companies',
      currentUser.companyId,
      'Orders',
      orderId
    );

    const snap = await getDoc(orderRef);

    if (snap.exists()) {
      const updatedOrder = {
        id: snap.id,
        ...snap.data(),
      } as Order;

      // Update selected sale
      setSelectedSale(updatedOrder);
      handleSelectSale(updatedOrder);

      // Update sales list
      setSalesList(prev =>
        prev.map(order =>
          order.id === updatedOrder.id ? updatedOrder : order
        )
      );
    }
  };

  // --- CALCULATION LOGIC (UI) ---
  const {
    totalReturnGross,
    totalExchangeValue,
    finalBalance,
    discountDeducted
  } = useMemo(() => {
    const trg = itemsToReturn.reduce(
      (sum, item) => sum + (item.amount || 0),
      0
    );

    const tev = exchangeItems.reduce(
      (sum, item) => sum + (item.amount || 0),
      0
    );

    let dd = 0;

    if (selectedSale) {
      const baseItems = selectedSale.items || [];

      const originalInvoiceTotal = baseItems.reduce(
        (sum: number, item: any) =>
          sum + Number(item.finalPrice || 0),
        0
      );

      const originalManualDiscount =
        Number(selectedSale.manualDiscount) || 0;

      if (originalInvoiceTotal > 0 && originalManualDiscount > 0) {
        const ratio = trg / originalInvoiceTotal;
        dd = Math.round(originalManualDiscount * ratio * 100) / 100;
      }
    }

    const totalReturnValue = trg - dd;

    //  Mode-based final balance calculation
    let fb = 0;

    if (modeOfReturn === 'Exchange') {
      fb = totalReturnValue - tev;
    } else {
      // Credit Note & Cash Refund
      fb = totalReturnValue;
    }

    return {
      totalReturnGross: trg,
      totalReturnValue,
      totalExchangeValue: tev,
      finalBalance: fb,
      discountDeducted: dd
    };
  }, [itemsToReturn, exchangeItems, selectedSale, modeOfReturn]);


  // --- SAVE LOGIC ---
  const saveReturnTransaction = async (
    completionData?: Partial<PaymentCompletionData>
  ) => {
    if (!currentUser || !currentUser.companyId || !selectedSale) return;

    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'companies', companyId, 'Orders', selectedSale.id);

      // --- 0. FINAL PARTY DETAILS ---
      const finalPartyName =
        (completionData?.partyName || partyName || selectedSale.userName || '').trim();

      const finalPartyNumber =
        (completionData?.partyNumber || partyNumber || '').trim();

      // --- 1. ORIGINAL ITEMS MAP ---
      const originalItemsMap = new Map<string, any>();

      (selectedSale.items || []).forEach((item: any) => {
        const safeId = item.id;
        const qty = Number(item.quantity) || 1;
        const total = Number(item.finalPrice || item.amount || 0);
        const unit = Number(item.customPrice ?? item.unitPrice ?? item.salesPrice ?? item.mrp) || (qty > 0 ? total / qty : 0);

        originalItemsMap.set(safeId, {
          ...item,
          _effectiveUnitPrice: unit
        });
      });


      const originalInvoiceTotal = (selectedSale.items || []).reduce(
        (sum: number, item: any) => sum + Number(item.finalPrice || 0),
        0
      );

      const validInventoryIds = new Set(availableItems.map(i => i.id));

      // --- 2. HANDLE RETURNS ---
      let returnedItemsGrossValue = 0;

      // --- 2. HANDLE RETURNS ---
      if (modeOfReturn !== 'Exchange') {
        itemsToReturn.forEach(returnItem => {
          const originalItem = originalItemsMap.get(returnItem.originalItemId);

          if (originalItem) {
            originalItem.quantity -= returnItem.quantity;
            returnedItemsGrossValue +=
              originalItem._effectiveUnitPrice * returnItem.quantity;

            if (originalItem.quantity <= 0) {
              originalItemsMap.delete(returnItem.originalItemId);
            }
          }
        });
      }

      // --- 3. HANDLE EXCHANGE ---
      if (modeOfReturn === 'Exchange') {
        // 🔁 remove returned items first
        itemsToReturn.forEach(returnItem => {
          const originalItem = originalItemsMap.get(returnItem.originalItemId);

          if (originalItem) {
            originalItem.quantity -= returnItem.quantity;

            if (originalItem.quantity <= 0) {
              originalItemsMap.delete(returnItem.originalItemId);
            }
          }
        });
      }

      // ➕ add exchange items
      if (modeOfReturn === 'Exchange') {
        exchangeItems.forEach(exchangeItem => {
          const existingItem = originalItemsMap.get(exchangeItem.originalItemId);

          if (existingItem) {
            existingItem.quantity += exchangeItem.quantity;
          } else {
            originalItemsMap.set(exchangeItem.originalItemId, {
              id: exchangeItem.originalItemId,
              name: exchangeItem.name,
              mrp: exchangeItem.mrp,
              quantity: exchangeItem.quantity,
              discount: exchangeItem.discount || 0,
              finalPrice: exchangeItem.amount,
              amount: exchangeItem.amount,
              unitPrice:
                exchangeItem.amount / exchangeItem.quantity || exchangeItem.mrp,
              _effectiveUnitPrice:
                exchangeItem.amount / exchangeItem.quantity || exchangeItem.mrp
            });
          }
        });
      }

      // --- 3.5 HANDLE RETURN STOCK (ADD BACK) ---
      itemsToReturn.forEach(returnItem => {
        if (validInventoryIds.has(returnItem.originalItemId)) {
          batch.update(
            doc(db, 'companies', companyId, 'items', returnItem.originalItemId),
            {
              stock: firebaseIncrement(returnItem.quantity),
              updatedAt: serverTimestamp()
            }
          );
        }
      });

      // --- 3.6 HANDLE EXCHANGE STOCK (DEDUCT) ---
      exchangeItems.forEach(exchangeItem => {
        if (validInventoryIds.has(exchangeItem.originalItemId)) {
          batch.update(
            doc(db, 'companies', companyId, 'items', exchangeItem.originalItemId),
            {
              stock: firebaseIncrement(-exchangeItem.quantity),
              updatedAt: serverTimestamp()
            }
          );
        }
      });

      // --- 4. RECALCULATE BILL ---
      const newItemsList = Array.from(originalItemsMap.values()).map(item => {
        const safeUnit =
          Number(item._effectiveUnitPrice) ||
          Number(item.unitPrice) ||
          Number(item.mrp)
        0;

        const lineTotal = safeUnit * Number(item.quantity);

        const { _effectiveUnitPrice, ...clean } = item;

        return {
          ...clean,
          unitPrice: safeUnit,
          salesPrice: safeUnit,
          finalPrice: lineTotal,
          amount: lineTotal
        };
      });

      const totals = newItemsList.reduce(
        (acc, item) => {
          const gross = item.mrp * item.quantity;
          const discount = gross - item.finalPrice;
          acc.subtotal += gross;
          acc.totalItemDiscount += discount;
          return acc;
        },
        { subtotal: 0, totalItemDiscount: 0 }
      );

      // --- 5. MANUAL DISCOUNT ---
      const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
      let discountDeduction = 0;

      if (
        originalManualDiscount > 0 &&
        originalInvoiceTotal > 0 &&
        returnedItemsGrossValue > 0
      ) {
        discountDeduction =
          (returnedItemsGrossValue / originalInvoiceTotal) *
          originalManualDiscount;
      }

      discountDeduction = Math.round(discountDeduction * 100) / 100;
      const newManualDiscount = Math.max(
        0,
        originalManualDiscount - discountDeduction
      );

      const updatedFinalAmount =
        totals.subtotal - totals.totalItemDiscount - newManualDiscount;

      // --- 6. PAYMENTS ---
      const updatedPaymentMethods = {
        ...(selectedSale.paymentMethods || {})
      };

      if (completionData?.paymentDetails) {
        Object.entries(completionData.paymentDetails).forEach(
          ([mode, amount]) => {
            if (mode.toLowerCase() !== 'due') {
              updatedPaymentMethods[mode] =
                (updatedPaymentMethods[mode] || 0) + Number(amount);
            }
          }
        );
      }


      const paid = Object.entries(updatedPaymentMethods)
        .filter(([k]) => k !== 'due')
        .reduce((sum, [, v]) => sum + Number(v), 0);

      updatedPaymentMethods.due = Math.max(0, updatedFinalAmount - paid);

      // --- 7. HISTORY ---

      const cleanItem = (item: any) => ({
        id: item.id || '',
        originalItemId: item.originalItemId || '',
        name: item.name || '',
        mrp: item.mrp ?? 0,
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? 0,
        amount: item.amount ?? 0,
        discount: item.discount ?? 0,
      });
      const cleanPaymentDetails = completionData?.paymentDetails
        ? Object.fromEntries(
          Object.entries(completionData.paymentDetails).filter(
            ([_, v]) => v !== undefined && v !== null
          )
        )
        : null;

      const returnHistoryRecord = {
        id: crypto.randomUUID(),
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(cleanItem),
        exchangeItems: exchangeItems.map(cleanItem),
        finalBalance,
        discountDeducted: discountDeduction,
        modeOfReturn,
        paymentDetails: cleanPaymentDetails,
        partyName: finalPartyName,
        partyNumber: finalPartyNumber
      };

      const safeReturnHistoryRecord = JSON.parse(
        JSON.stringify(returnHistoryRecord)
      );

      // --- 9. CUSTOMER LEDGER ---
      if (finalPartyNumber.length >= 3 && finalBalance > 0) {
        batch.set(
          doc(db, 'companies', companyId, 'customers', finalPartyNumber),
          {
            name: finalPartyName,
            number: finalPartyNumber,
            creditBalance: firebaseIncrement(finalBalance),
            lastUpdatedAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      const actualPaid = selectedSale.paidAmount ?? 0;
      const newStatus =
        updatedFinalAmount > 0 && actualPaid >= updatedFinalAmount
          ? 'Paid'
          : 'Completed';

      const isUnpaidOrder = (selectedSale.paidAmount ?? 0) === 0;

      batch.update(saleRef, {
        items: newItemsList,
        totalAmount: updatedFinalAmount,

        manualDiscount: newManualDiscount,
        paymentMethods: {
          ...updatedPaymentMethods,
          due: isUnpaidOrder
            ? Math.max(0, selectedSale.totalAmount - returnedItemsGrossValue)
            : updatedPaymentMethods.due
        },

        paidAmount: actualPaid,
        status: isUnpaidOrder ? 'Completed' : newStatus,

        returnHistory: arrayUnion(safeReturnHistoryRecord),
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      await refreshSelectedOrder(selectedSale.id);
      setOriginalSaleItems(
        newItemsList.map((item: any) => ({
          id: item.id,
          originalItemId: item.id,
          name: item.name,
          quantity: item.quantity,
          originalQuantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.finalPrice,
          mrp: item.mrp
        }))
      );
      setSelectedSale(prev =>
        prev
          ? {
            ...prev,
            items: newItemsList
          }
          : prev
      );
      setSelectedReturnIds(new Set());
      setModal({
        type: State.SUCCESS,
        message: 'Return processed successfully!'
      });
      setTimeout(() => navigate(ROUTES.ORDERDETAILS), 1500);
    } catch (err: any) {
      console.error(err);
      setModal({
        type: State.ERROR,
        message: `Failed: ${err.message}`
      });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  useEffect(() => {
    if (modeOfReturn !== 'Exchange') {
      setExchangeItems([]);
    }
  }, [modeOfReturn]);

  const handleProcessReturn = () => {

    //  No items selected at all
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) {
      return setModal({ type: State.ERROR, message: 'No items selected.' });
    }

    if (modeOfReturn === 'Credit Note') {
      if (itemsToReturn.length === 0) return setModal({ type: State.ERROR, message: 'Please select at least one item to return.' });
      setExchangeItems([]);
      saveReturnTransaction();
      return;
    }

    if (modeOfReturn === 'Exchange') {
      if (itemsToReturn.length === 0) return setModal({ type: State.ERROR, message: 'Please select an item to exchange with.' });
      if (exchangeItems.length === 0) return setModal({ type: State.ERROR, message: 'Please add an item for exchange.' });
      finalBalance < 0 ? setIsDrawerOpen(true) : saveReturnTransaction();
      return;
    }

    if (modeOfReturn === 'Cash Refund') {
      if (itemsToReturn.length === 0) return setModal({ type: State.ERROR, message: 'Please select at least one item for cash refund.' });
      setExchangeItems([]);
      saveReturnTransaction();
      return;
    }

    // 🔄 FALLBACK (Safety Check)
    if (finalBalance < 0) {
      setIsDrawerOpen(true);
    } else {
      saveReturnTransaction();
    }
  };

  const getBalanceLabel = () => {
    if (finalBalance < 0) return 'Payment Due';
    if (modeOfReturn === 'Cash Refund') return 'Refund Amount';
    return 'Credit Due';
  };

  const remainingCredit = selectedSale
    ? getRemainingCreditNote(selectedSale)
    : 0;

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;


  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner
        isOpen={scannerPurpose !== null}
        onClose={() => setScannerPurpose(null)}
        onScanSuccess={handleBarcodeScanned}
      />

      {/* HEADER */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 shadow-sm">
        <div className="w-14 flex justify-start">
          <button
            onClick={() => navigate(ROUTES.ORDERDETAILS)}
            className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors text-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        </div>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Orders Return</h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Process Refunds & Exchange</p>
        </div>
        <div className="w-14" />
      </header>

      {/* MAIN */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* LEFT PANEL */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-2 md:p-2 pb-24 md:pb-2 relative">

          <SaleSearchInput
            searchQuery={searchSaleQuery}
            onSearchChange={setSearchSaleQuery}
            isDropdownOpen={isSalesDropdownOpen}
            setIsDropdownOpen={setIsSalesDropdownOpen}
            filteredSales={filteredSales}
            selectedSale={selectedSale}
            onSelectSale={sale => { handleSelectSale(sale); setIsSalesDropdownOpen(false); }}
            onClear={handleClear}
          />

          {selectedSale && (
            <>
              {/* Sale details + return item selection */}
              <div className="bg-white p-3 rounded-sm shadow-md mb-4 border border-gray-200">
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Date</label>
                      <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                        className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Party</label>
                      <input type="text" value={partyName} onChange={e => setPartyName(e.target.value)}
                        className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                    <input
                      type="text"
                      value={partyNumber}
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '');
                        if (value.length <= 10) setPartyNumber(value);
                      }}
                      className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm"
                      autoComplete="off"
                      placeholder="Customer phone number"
                      maxLength={10}
                    />
                  </div>
                </div>

                <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                <div className="flex flex-col gap-2">
                  {originalSaleItems.length === 0 && (
                    <p className="text-sm text-gray-500">No returnable items found for this order.</p>
                  )}
                  {originalSaleItems.map(item => (
                    <ReturnListItem
                      key={item.id}
                      item={item}
                      isSelected={selectedReturnIds.has(item.id)}
                      onToggle={handleToggleReturnItem}
                      onQuantityChange={handleReturnQuantityChange}
                      showMrp
                    />
                  ))}
                </div>
              </div>

              {/* Exchange section */}
              <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                {/* Mobile: mode selector */}
                <div className="md:hidden mb-4">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  <select value={modeOfReturn} onChange={e => setModeOfReturn(e.target.value)}
                    className="w-full p-2 border rounded bg-white">
                    <option>Credit Note</option>
                    <option>Exchange</option>
                    <option>Refund</option>
                  </select>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <ExchangeSection
                    availableItems={availableItems}
                    mappedExchangeItems={mappedExchangeItems}
                    catalogueSettings={catalogueSettings}
                    isLoading={isLoading}
                    error={error}
                    onItemSelected={handleExchangeItemSelected}
                    onScanClick={() => setScannerPurpose('item')}
                    onDeleteItem={handleRemoveExchangeItem}
                    onDiscountChange={handleDiscountChange}
                    onCustomPriceChange={handleCustomPriceChange}
                    onCustomPriceBlur={handleCustomPriceBlur}
                    onQuantityChange={handleQuantityChange}
                    setModal={setModal}
                    selectedItemForEdit={selectedItemForEdit}
                    isItemDrawerOpen={isItemDrawerOpen}
                    onOpenEditDrawer={item => {
                      const real = availableItems.find(i => i.id === item.id);
                      if (real) { setSelectedItemForEdit(real as any); setIsItemDrawerOpen(true); }
                    }}
                    onCloseEditDrawer={handleCloseEditDrawer}
                    onSaveSuccess={handleSaveSuccess}
                  />
                )}
              </div>

              {/* Mobile inline summary */}
              <div className="md:hidden">
              <ReturnSummaryPanel
                isMobile
                modeOfReturn={modeOfReturn}
                onModeChange={setModeOfReturn}
                totalReturnGross={totalReturnGross}
                totalExchangeValue={totalExchangeValue}
                finalBalance={finalBalance}
                discountDeducted={discountDeducted}
                onProcess={handleProcessReturn}
                exchangeItemsCount={exchangeItems.length}
              />
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL (desktop) */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedSale ? (
            <ReturnSummaryPanel
              modeOfReturn={modeOfReturn}
              onModeChange={setModeOfReturn}
              totalReturnGross={totalReturnGross}
              totalExchangeValue={totalExchangeValue}
              finalBalance={finalBalance}
              discountDeducted={discountDeducted}
              onProcess={handleProcessReturn}
              exchangeItemsCount={exchangeItems.length}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p>Select a sale to begin return</p>
            </div>
          )}
        </div>

        {/* Mobile sticky footer */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          {selectedSale && (
            <CustomButton
              onClick={handleProcessReturn}
              disabled={modeOfReturn === 'Exchange' && (exchangeItems.length === 0 || itemsToReturn.length === 0)}
              variant={Variant.Payment}
            >
              Process Transaction
            </CustomButton>
          )}
        </div>
      </div>

      <PaymentDrawer
        mode="sale"
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={partyName}
        initialPartyNumber={partyNumber}
        initialCreditOverride={remainingCredit}
      />
    </div>
  );
};

export default OrdersReturnPage;
