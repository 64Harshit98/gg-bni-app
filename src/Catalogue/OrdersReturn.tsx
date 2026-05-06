import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { db } from '../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  arrayUnion,
  serverTimestamp,
  increment as firebaseIncrement,
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import type { Item } from '../constants/models';

import { ROUTES } from '../constants/routes.constants';
import { Modal } from '../constants/Modal';
import { State, Variant } from '../enums';
import { CustomButton } from '../Components';
import PaymentDrawer, { type PaymentCompletionData } from '../Components/PaymentDrawer';
import { ReturnListItem } from '../Components/ReturnListItem';
import type { Order, OrderItem } from './Orders';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { IconScanCircle } from '../constants/Icons'
import BarcodeScanner from '../UseComponents/BarcodeScanner';
import { GenericCartList } from '../Components/CartItem';
import { applyRounding } from '../Pages/Master/Sales'
import { ItemEditDrawer } from '../Components/ItemDrawer';
import type { SalesItem } from '../constants/models';

interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}
interface ExchangeItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  salesPrice: number;
  amount: number;
  discount: number;
  basePrice: number;
  customPrice?: number | string;
}

// Interface for Customer
interface Customer {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}

const OrdersReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { state } = useLocation();
  // const location = useLocation();

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [partyNumber, setPartyNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');
  const [catalogueSettings, setCatalogueSettings] = useState<any>(null);
  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);

  const [salesList, setSalesList] = useState<Order[]>([]);
  const [selectedSale, setSelectedSale] = useState<Order | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');

  // Dropdown States
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  // Customer Dropdown States
  const [availableCustomers, _setAvailableCustomers] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // const isActive = (path: string) => location.pathname === path;

  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

  const itemsToReturn = useMemo(() => {
    if (modeOfReturn === 'Exchange') {
      return originalSaleItems.filter(item => selectedReturnIds.has(item.id));
    }

    return originalSaleItems.filter(item => selectedReturnIds.has(item.id));
  }, [originalSaleItems, selectedReturnIds, modeOfReturn]);

  useEffect(() => {
    if (!currentUser?.companyId) {
      setIsLoading(false);
      return;
    }

    const fetchOrders = async () => {
      if (!currentUser?.companyId) return; // Safety check
      setIsLoading(true);
      try {
        const ordersQuery = query(
          collection(db, 'companies', currentUser.companyId, 'Orders')
        );

        const snap = await getDocs(ordersQuery);
        const completedOrders = snap.docs.map(
          d => ({ id: d.id, ...d.data() } as Order)
        );
        setSalesList(completedOrders);
      } catch (err) {
        console.error(err);
        setError('Failed to load orders');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, [currentUser]);

  useEffect(() => {
    if (!state?.selectedOrder || salesList.length === 0) return;

    const foundOrder = salesList.find(
      o => o.orderId === state.selectedOrder
    );

    if (foundOrder) {
      handleSelectSale(foundOrder);
    }
  }, [state, salesList]);


  useEffect(() => {
    if (!currentUser?.companyId) return;

    const fetchSettings = async () => {
      const ref = doc(
        db,
        "companies",
        currentUser.companyId,
        "settings",
        "catalogue-sales-settings"
      );

      const snap = await getDoc(ref);

      if (snap.exists()) {
        setCatalogueSettings(snap.data());
      }
    };

    fetchSettings();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.companyId) return;

    const fetchItems = async () => {
      try {
        const q = query(
          collection(db, 'companies', currentUser.companyId, 'items')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as any[];

        setAvailableItems(list);
      } catch (err) {
        console.error(err);
        setError('Failed to load items');
      }
    };

    fetchItems();
  }, [currentUser]);



  // Click Outside Handler for both Dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (salesDropdownRef.current && !salesDropdownRef.current.contains(event.target as Node)) {
        setIsSalesDropdownOpen(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSales = useMemo(() => {
    if (!salesList) return [];

    return salesList
      .filter(order =>
        ['completed', 'paid', 'unpaid']
          .includes(String(order.status).toLowerCase().trim())
      )
      .filter(order => {
        const query = (searchSaleQuery || "").toLowerCase();
        const orderId = (order?.orderId || "").toLowerCase();
        const userName = (order?.userName || "").toLowerCase();
        const phone = String(order?.billingDetails?.phone || "").toLowerCase();
        return (
          orderId.includes(query) ||
          userName.includes(query) ||
          phone.includes(query)
        );
      });

  }, [salesList, searchSaleQuery]);

  const filteredCustomers = useMemo(() => {
    if (!partyNumber) return [];

    const searchParam = String(partyNumber).trim().toLowerCase();
    if (!searchParam) return [];

    return availableCustomers.filter(c => {
      const customerNumber = String(c.number ?? '').toLowerCase();
      const customerName = String(c.name ?? '').toLowerCase();

      return customerNumber.includes(searchParam) || customerName.includes(searchParam);
    });
  }, [availableCustomers, partyNumber]);

  const handleSelectCustomer = (customer: Customer) => {
    setPartyNumber(customer.number);
    setPartyName(customer.name);
    setIsCustomerDropdownOpen(false);
  };

  const handleSelectSale = (Order: Order) => {
    setSelectedSale(Order);
    setSearchSaleQuery(Order.orderId ?? '');

    setPartyName(Order.userName ?? 'Customer');
    setPartyNumber(Order.billingDetails?.phone ?? '');

    setOriginalSaleItems(
      (Order.items ?? [])
        .map((item: any) => {
          const id = item.id;
          if (!id) return null;

          const qty = Number(item.quantity) || 0;
          const price =
            Number(item.customPrice ?? item.unitPrice ?? item.salesPrice ?? item.mrp) || 0;
          const unit = price;
          const total = price * qty;


          return {
            id,
            originalItemId: id,
            name: item.name ?? 'Unnamed Item',
            quantity: qty,
            originalQuantity: qty,
            unitPrice: unit,
            amount: total,
            mrp: Number(item.mrp) || unit
          };
        })
        .filter(Boolean) as TransactionItem[]
    );
  };


  const handleToggleReturnItem = (itemId: string) => {
    if (!originalSaleItems.find(i => i.id === itemId)) return;

    setSelectedReturnIds(prevIds => {
      const newIds = new Set(prevIds);
      if (newIds.has(itemId)) newIds.delete(itemId);
      else newIds.add(itemId);
      return newIds;
    });
  };

  const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };

  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    if (!selectedItemForEdit) return;

    setAvailableItems(prev =>
      prev.map(item => {
        if (item.id !== selectedItemForEdit.id) return item;

        return {
          ...item,
          ...updatedItemData,
          name: updatedItemData.name ?? item.name,
          mrp: Number(updatedItemData.mrp ?? item.mrp),
          salesPrice: Number(updatedItemData.salesPrice ?? item.salesPrice),
          moq:
            updatedItemData.moq !== undefined
              ? Number(updatedItemData.moq)
              : (item as any).moq ?? 1,
        } as OrderItem;
      })
    );

    setExchangeItems(prev =>
      prev.map(item => {
        if (item.originalItemId !== selectedItemForEdit.id) return item;

        const newMrp = Number(updatedItemData.mrp ?? item.mrp);
        const newSalesPrice = Number(updatedItemData.salesPrice ?? item.salesPrice);

        let finalPrice = newSalesPrice > 0 ? newSalesPrice : newMrp;

        // discount calculate
        let discount = 0;
        if (newMrp > 0 && newSalesPrice > 0) {
          discount = ((newMrp - newSalesPrice) / newMrp) * 100;
        }

        const newAmount = finalPrice * item.quantity;

        return {
          ...item,
          mrp: newMrp,
          salesPrice: newSalesPrice,
          unitPrice: finalPrice,
          basePrice: finalPrice,
          discount: parseFloat(discount.toFixed(2)),
          amount: newAmount,
        };
      })
    );

    setIsItemDrawerOpen(false);
    setSelectedItemForEdit(null);
  };

  const handleListChange = (
    setter: React.Dispatch<React.SetStateAction<any[]>>,
    id: string,
    field: keyof TransactionItem | keyof ExchangeItem,
    value: string | number
  ) => {
    setter(prev =>
      prev.map(item => {
        if (item.id !== id) return item;

        let safeValue = value;

        if (field === 'quantity') {
          const num = Number(value) || 1;

          //  Return Items Validation
          if ((item as any).originalQuantity !== undefined) {
            const maxQty = (item as any).originalQuantity;
            safeValue = Math.min(Math.max(1, num), maxQty);
          }
        }

        const updatedItem = { ...item, [field]: safeValue };

        if (field === 'discount') {
          const discountValue = Number(value) || 0;
          const basePrice = Number(item.mrp) || 0;

          let newPrice = basePrice * (1 - discountValue / 100);

          if (discountValue > 0) {
            newPrice =
              newPrice < 100
                ? Math.ceil(newPrice / 5) * 5
                : Math.ceil(newPrice / 10) * 10;
          }

          if (discountValue === 0) {
            newPrice = Number(item.mrp) || 0;
          }

          updatedItem.unitPrice = newPrice;
        }

        if (
          field === 'quantity' ||
          field === 'unitPrice' ||
          field === 'discount'
        ) {
          updatedItem.amount =
            Number(updatedItem.quantity) *
            Number(updatedItem.unitPrice);
        }

        return updatedItem;
      })
    );
  };

  const handleRemoveFromList = (setter: any, id: string) => {
    setter((prev: any[]) => prev.filter((item: any) => item.id !== id));
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

  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);
    if (purpose === 'sale') {
      const foundSale = salesList.find(
        sale =>
          sale.orderId === barcode &&
          ['paid', 'completed', 'confirmed']
            .includes(String(sale.status).toLowerCase())
      );

      if (foundSale) {
        handleSelectSale(foundSale);
      } else {
        setModal({ message: 'Original sale not found for this invoice.', type: State.ERROR });
      }
    } else if (purpose === 'item') {
      const itemToAdd = availableItems.find(item => item.id === barcode);
      if (itemToAdd) {
        handleExchangeItemSelected(itemToAdd);
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    }
  };


  const handleDiscountChange = (id: string, discountValue: number | string) => {
    const val = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
    handleListChange(setExchangeItems, id, 'discount', val);
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    const item = exchangeItems.find(i => i.id === id);
    if (!item) return;


    handleListChange(setExchangeItems, id, 'quantity', Math.max(1, newQuantity));
  };

  const handleCustomPriceChange = (id: string, value: string) => {
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setExchangeItems(prev => prev.map(item => item.id === id ? { ...item, customPrice: value } : item));
    }
  };

  const handleCustomPriceBlur = (id: string) => {
    setExchangeItems(prev =>
      prev.map(item => {
        if (item.id === id && item.customPrice !== undefined) {
          const num = parseFloat(String(item.customPrice));

          if (!isNaN(num)) {
            const mrp = Number(item.mrp || 0);

            // Auto-calculate discount based on Net Price
            let discount = 0;
            if (mrp > 0) {
              discount = ((mrp - num) / mrp) * 100;
            }

            const newAmount = num * item.quantity;

            return {
              ...item,
              unitPrice: Number(num.toFixed(2)),
              basePrice: mrp,
              discount: Number(discount.toFixed(2)),
              amount: Number(newAmount.toFixed(2)),
              customPrice: undefined
            };
          }

          return { ...item, customPrice: undefined };
        }
        return item;
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


    setExchangeItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        originalItemId: itemToAdd.id!,
        name: itemToAdd.name,

        quantity: 1,
        unitMultiplier: 1,

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
        const unit =
          Number(item.customPrice ?? item.unitPrice ?? item.salesPrice) ||
          (qty > 0 ? total / qty : 0);

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

    // ❌ No items selected at all
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) {
      return setModal({
        type: State.ERROR,
        message: 'No items selected.'
      });
    }

    //  CREDIT NOTE
    if (modeOfReturn === 'Credit Note') {
      if (itemsToReturn.length === 0) {
        return setModal({
          type: State.ERROR,
          message: 'Please select at least one item to return.'
        });
      }

      // Ensure no exchange items are included
      setExchangeItems([]);
      saveReturnTransaction();
      return;
    }

    //  EXCHANGE
    if (modeOfReturn === 'Exchange') {
      if (itemsToReturn.length === 0) {
        return setModal({
          type: State.ERROR,
          message: 'Please select an item to exchange with.'
        });
      }

      if (exchangeItems.length === 0) {
        return setModal({
          type: State.ERROR,
          message: 'Please add an item for exchange.'
        });
      }

      if (finalBalance < 0) {
        // Customer needs to pay extra
        setIsDrawerOpen(true);
      } else {
        // No payment required
        saveReturnTransaction();
      }
      return;
    }

    //  CASH REFUND
    if (modeOfReturn === 'Cash Refund') {
      if (itemsToReturn.length === 0) {
        return setModal({
          type: State.ERROR,
          message: 'Please select at least one item for cash refund.'
        });
      }

      // Remove any mistakenly added exchange items
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

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;


  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      {/* === HEADER === */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 shadow-sm">

        {/* Left: Back Button */}
        <div className="w-14 flex justify-start">
          <button
            onClick={() => navigate(ROUTES.ORDERDETAILS)}
            className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors text-slate-700"
            title="Back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
        </div>

        {/* Center: Title */}
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Orders Return
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            Process Refunds & Exchange
          </p>
        </div>

        {/* Right: Empty space for balance (w-14 keeps title centered) */}
        <div className="w-14 flex justify-end">
          {/* Isse khali rakha hai taaki heading center mein rahe */}
        </div>
      </header>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* --- LEFT PANEL (Desktop: 65%, Search + Lists) --- */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-2 md:p-2 pb-24 md:pb-2 relative">

          {/* Search */}
          <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
            <div className="relative" ref={salesDropdownRef}>
              <label htmlFor="search-sale" className="block text-sm font-medium mb-1 text-gray-700">Search Original Sale</label>
              <div className="flex gap-2">
                <input
                  id="search-sale"
                  type="text"
                  value={searchSaleQuery}
                  onChange={(e) => {
                    let value = e.target.value;

                    // Agar input sirf numbers hai, toh use 10 digits tak limit karo
                    if (/^\d*$/.test(value)) {
                      value = value.slice(0, 10);
                    }

                    setSearchSaleQuery(value);
                    setIsSalesDropdownOpen(true);
                  }}
                  onFocus={() => setIsSalesDropdownOpen(true)}
                  placeholder={
                    selectedSale
                      ? `(${selectedSale.orderId})`
                      : "Invoice, Name or Phone..."
                  }
                  className="flex-grow p-2 border rounded-sm focus:ring-2 focus:ring-[#F97316] outline-none"
                  autoComplete="off"
                  readOnly={!!selectedSale}
                />
                {selectedSale && (<button onClick={handleClear} className=" px-3 bg-gray-200 text-gray-700 font-semibold rounded-sm whitespace-nowrap hover:bg-gray-300">Clear</button>)}
              </div>
              {isSalesDropdownOpen && !selectedSale && (
                <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-sm shadow-lg max-h-60 overflow-y-auto">
                  {filteredSales.map((sale) => {
                    // Calculate total from items instead of using static totalAmount
                    const calculatedAmount = (sale.items || []).reduce(
                      (sum: number, item: any) =>
                        sum +
                        Number(
                          item.finalPrice ??
                          item.amount ??
                          (item.salesPrice || item.mrp || 0) * (item.quantity || 0)
                        ),
                      0
                    );

                    return (
                      <div
                        key={sale.id}
                        className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0"
                        onClick={() => handleSelectSale(sale)}
                      >
                        <p className="font-semibold text-sm">
                          {sale.userName}{' '}
                          <span className="text-gray-500 font-normal">
                            ({sale.orderId || 'N/A'})
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          Amount: ₹{calculatedAmount.toFixed(2)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {selectedSale && (
            <>
              {/* Sale Details & Items To Return */}
              <div className="bg-white p-3 rounded-sm shadow-md mb-4 border border-gray-200">
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Party</label><input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm" /></div>
                  </div>

                  {/* --- NEW DROPDOWN FOR PARTY NUMBER --- */}
                  <div className="relative" ref={customerDropdownRef}>
                    <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                    <input
                      type="text"
                      value={partyNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        if (value.length <= 10) {
                          setPartyNumber(value);
                          setPartyName('');
                          setIsCustomerDropdownOpen(true);
                        }
                      }}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm"
                      autoComplete="off"
                      placeholder="Search customer by number or name..."
                      maxLength={10}
                    />
                    {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                      <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-sm shadow-lg max-h-48 overflow-y-auto">
                        {filteredCustomers.map((customer) => (
                          <div
                            key={customer.id}
                            className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
                            onClick={() => handleSelectCustomer(customer)}
                          >
                            <p className="font-semibold text-sm text-gray-800">{customer.name}</p>
                            <p className="text-xs text-gray-500">{customer.number}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                <div className="flex flex-col gap-2">
                  {originalSaleItems.length === 0 && (
                    <p className="text-sm text-gray-500">
                      No returnable items found for this order.
                    </p>
                  )}

                  {originalSaleItems.map((item) => (
                    <ReturnListItem
                      key={item.id}
                      item={item}
                      isSelected={selectedReturnIds.has(item.id)}
                      onToggle={handleToggleReturnItem}
                      onQuantityChange={(id, val) => {
                        const item = originalSaleItems.find(i => i.id === id);
                        if (!item) return;

                        const safeQty = Math.min(
                          Math.max(1, val),
                          (item as any).originalQuantity
                        );

                        handleListChange(setOriginalSaleItems, id, 'quantity', safeQty);
                      }}

                      showMrp={true}
                    />
                  ))}
                </div>
              </div>

              {/* Exchange Section (Input + List) */}
              <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                {/* Mobile View: Select Mode Here. Desktop: Mode is in Right Panel, but show Content if Exchange is selected */}
                <div className="md:hidden mb-4">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                    <option>Credit Note</option>
                    <option>Exchange</option>
                    <option>Refund</option>
                  </select>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <>
                    <div className="flex items-end gap-1 mb-3">
                      <div className="flex-grow">
                        <SearchableItemInput
                          label="Add Exchange Item"
                          placeholder="Search inventory..."
                          // FIX: availableItems ko map karke purchasePrice ensure karein
                          items={availableItems.map((item: any) => ({
                            ...item,
                            purchasePrice: item.purchasePrice ?? 0 // Agar undefined hai toh 0 set kar do
                          }))}
                          onItemSelected={handleExchangeItemSelected}
                          isLoading={isLoading}
                          error={error}
                        /></div>
                      <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-sm"><IconScanCircle width={20} height={20} /></button>
                    </div>

                    {/* --- DISPLAY ERROR MESSAGES FOR LOCKS --- */}


                    {exchangeItems.length > 0 && (
                      <div className="border rounded-sm overflow-hidden mt-4">
                        <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">
                          Exchange Cart
                        </div>

                        <div className="max-h-60 overflow-y-auto bg-gray-50">
                          <GenericCartList<any>
                            items={mappedExchangeItems}
                            availableItems={availableItems as any}
                            basePriceKey="mrp"
                            priceLabel="MRP"
                            settings={{
                              enableRounding: false,
                              roundingInterval: 1,
                              enableItemWiseDiscount: catalogueSettings?.enableItemWiseDiscount ?? false,
                              lockDiscount: false,
                              lockPrice: false,
                              hideMrp: false
                            }}
                            applyRounding={applyRounding}
                            State={State}
                            setModal={setModal}

                            onOpenEditDrawer={(item: any) => {
                              const realItem = availableItems.find(i => i.id === item.id);
                              if (!realItem) {
                                console.error("Original item not found");
                                return;
                              }

                              setSelectedItemForEdit(realItem as any);
                              setIsItemDrawerOpen(true);
                            }}

                            onDeleteItem={(id: any) => handleRemoveFromList(setExchangeItems, id)}
                            onDiscountChange={handleDiscountChange}
                            onCustomPriceChange={handleCustomPriceChange}
                            onCustomPriceBlur={handleCustomPriceBlur}
                            onQuantityChange={handleQuantityChange}
                          />

                        </div>
                      </div>
                    )}

                    {isItemDrawerOpen && selectedItemForEdit && (
                      <ItemEditDrawer
                        item={selectedItemForEdit}
                        isOpen={isItemDrawerOpen}
                        onClose={handleCloseEditDrawer}
                        onSaveSuccess={handleSaveSuccess}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Mobile Only: Inline Summary (Above Footer) */}
              <div className="md:hidden bg-white p-2 rounded-sm shadow-md">
                <div className="flex justify-between items-center text-sm text-[#F97316]">
                  <p>Return Value</p><p className="font-medium">₹{totalReturnGross.toFixed(2)}</p>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between items-center text-xs text-red-600 mt-1">
                    <p>Less Bill Discount</p><p>- ₹{discountDeducted.toFixed(2)}</p>
                  </div>
                )}
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between items-center text-sm text-[#F97316] mt-1">
                    <p>Exchange Value</p><p className="font-medium">₹{totalExchangeValue.toFixed(2)}</p>
                  </div>
                )}
                <div className="border-t border-gray-200 my-2"></div>
                <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-[#F97316]' : 'text-red-600'}`}>
                  <p>{getBalanceLabel()}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* --- RIGHT PANEL (Desktop Only: 35%) --- */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedSale ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>

              {/* Transaction Type */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
                <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm bg-gray-50 focus:ring-2 focus:ring-[#F97316] outline-none">
                  <option>Credit Note</option>
                  <option>Exchange</option>
                  <option>Cash Refund</option>
                </select>
              </div>

              {/* Financials */}
              <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-sm border border-gray-100 flex-grow">
                <div className="flex justify-between">
                  <span>Return Sale Amount</span>
                  <span className="font-medium">₹{totalReturnGross.toFixed(2)}</span>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Less: Proportional Discount</span>
                    <span>- ₹{discountDeducted.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
                  <span>Net Return Value</span>
                  <span>₹{(totalReturnGross - discountDeducted).toFixed(2)}</span>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-[#F97316] mt-2">
                    <span>Less: New Items Value</span>
                    <span>- ₹{totalExchangeValue.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Final Total */}
              <div className="mt-auto pt-4 border-t border-gray-100">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
                  <span className={`text-3xl font-bold ${finalBalance >= 0 ? 'text-[#F97316]' : 'text-red-600'}`}>
                    ₹{Math.abs(finalBalance).toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={handleProcessReturn}
                  className={`w-full py-4 px-4 rounded-sm text-lg font-bold transition-all ${modeOfReturn === 'Exchange' && exchangeItems.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#F97316] hover:bg-orange-600 text-white'}`}>
                  Process Transaction
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p>Select a sale to begin return</p>
            </div>
          )}
        </div>

        {/* --- MOBILE FOOTER (Sticky) --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          {selectedSale && (<CustomButton
            onClick={handleProcessReturn}
            disabled={
              modeOfReturn === 'Exchange' &&
              (exchangeItems.length === 0 || itemsToReturn.length === 0)
            }
            variant={Variant.Payment}
          >
            Process Transaction
          </CustomButton>)}
        </div>
      </div>

      <PaymentDrawer
        mode='sale'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={partyName}
        initialPartyNumber={partyNumber}
      />
    </div>
  );
};

export default OrdersReturnPage;