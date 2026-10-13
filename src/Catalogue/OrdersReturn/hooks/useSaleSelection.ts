import { useState, useEffect, useMemo, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { ROUTES } from '../../../constants/routes.constants';
import type { Order } from '../../Orders';
import type { TransactionItem, ExchangeItem, Customer } from '../ordersReturn.types';
import { mapOrderItemToTransactionItem } from '../ordersReturn.calculations';

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). Owns the "find and select the original sale" flow
// (search box + dropdown, barcode-driven selection is wired in from
// useBarcodeScanning via the returned handleSelectSale) together with the
// party/customer dropdown that sits right below it in the UI and is set by
// the same handleSelectSale/handleClear handlers — the two were kept in one
// hook rather than split, since splitting them would have required lifting
// searchSaleQuery/availableCustomers too just to share the single
// click-outside-both-dropdowns effect (previously ~L192-203).
//
// `selectedSale`/`salesList`/`partyName`/`partyNumber`/`originalSaleItems`/
// `selectedReturnIds`/`exchangeItems`/`modeOfReturn` are NOT owned here —
// each is also written from a different hook (originalSaleItems by
// useReturnItemsSelection, exchangeItems by useExchangeItems and
// useItemEditDrawer, selectedSale/salesList by saveReturnTransaction's
// post-save refresh, etc.), so per the cross-hook-dependency convention
// they were lifted to OrdersReturn.tsx and threaded into this hook (and
// every other hook that needs them) as params.
// ─────────────────────────────────────────────────────────────────────────

interface UseSaleSelectionParams {
  currentUser: any;
  locationState: any;
  navigate: (path: string) => void;
  salesList: Order[];
  setSalesList: React.Dispatch<React.SetStateAction<Order[]>>;
  selectedSale: Order | null;
  setSelectedSale: React.Dispatch<React.SetStateAction<Order | null>>;
  setPartyName: React.Dispatch<React.SetStateAction<string>>;
  partyNumber: string;
  setPartyNumber: React.Dispatch<React.SetStateAction<string>>;
  setOriginalSaleItems: React.Dispatch<React.SetStateAction<TransactionItem[]>>;
  setSelectedReturnIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setExchangeItems: React.Dispatch<React.SetStateAction<ExchangeItem[]>>;
  setExchangeSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setModeOfReturn: React.Dispatch<React.SetStateAction<string>>;
}

export const useSaleSelection = ({
  currentUser,
  locationState,
  navigate,
  salesList,
  setSalesList,
  selectedSale,
  setSelectedSale,
  setPartyName,
  partyNumber,
  setPartyNumber,
  setOriginalSaleItems,
  setSelectedReturnIds,
  setExchangeItems,
  setExchangeSearchQuery,
  setModeOfReturn,
}: UseSaleSelectionParams) => {
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');

  // Dropdown States
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  // Customer Dropdown States
  const [availableCustomers, _setAvailableCustomers] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

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
        .map((item: any) => mapOrderItemToTransactionItem(item))
        .filter(Boolean) as TransactionItem[]
    );
  };

  useEffect(() => {
    if (!locationState?.selectedOrder || salesList.length === 0) return;

    const foundOrder = salesList.find(
      o => o.orderId === locationState.selectedOrder
    );

    if (foundOrder) {
      handleSelectSale(foundOrder);
    }
  }, [locationState, salesList]);

  const paidAmountOnSale = useMemo(() => {
    const methods = selectedSale?.paymentMethods || {};
    return Object.entries(methods)
      .filter(([key]) => key !== 'due')
      .reduce((sum, [, val]) => sum + (Number(val) || 0), 0);
  }, [selectedSale]);

  const isDueSale = paidAmountOnSale <= 0 && (selectedSale?.paymentMethods?.due ?? 0) > 0;

  useEffect(() => {
    if (isDueSale) {
      setModeOfReturn('Exchange');
    }
  }, [isDueSale]);

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

  const handleClear = () => {
    setSelectedSale(null);
    setPartyName('');
    setPartyNumber('');
    setOriginalSaleItems([]);
    setSelectedReturnIds(new Set());
    setExchangeItems([]);
    setSearchSaleQuery('');
    setExchangeSearchQuery('');
    navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`);
  };

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

  return {
    searchSaleQuery, setSearchSaleQuery,
    isSalesDropdownOpen, setIsSalesDropdownOpen, salesDropdownRef,
    availableCustomers, isCustomerDropdownOpen, setIsCustomerDropdownOpen, customerDropdownRef,
    filteredSales,
    filteredCustomers,
    handleSelectSale,
    handleSelectCustomer,
    handleClear,
    paidAmountOnSale,
    isDueSale,
    refreshSelectedOrder,
  };
};
