import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ACTION } from '../enums/action.enum';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../lib/Firebase';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { GenericCartList } from '../Components/CartItem';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { useDatabase } from '../context/auth-context';
import {
  collection, query, onSnapshot, Timestamp,
  doc, getDoc, getDocs, updateDoc, deleteDoc,
  orderBy, where, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { CustomCard } from '../Components/CustomCard';
import { Spinner } from '../constants/Spinner';
import { Modal, PaymentModal } from '../constants/Modal';
import { State } from '../enums';
import { IconEdit } from '../constants/Icons';
import type { Item } from '../constants/models';
import { CatalogueBill, prepareCatalogueBillData } from './CatalogueBill/CatalogueBill';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/Firebase';
import { ROUTES } from '../constants/routes.constants';

// ─── Shared hooks & components ────────────────────────────────────────────────
import {
  useDateFilter,
  useSearchFilter,
  useExpandedItem,
  usePaymentModal,
  useQrModal,
  usePdfAction,
  DATE_FILTER_OPTIONS,
} from '../Catalogue/hooks';
import {
  DateFilterDropdown,
  CustomDatePicker,
  ActionModal,
  QrModal,
  PaymentBadges,
} from '../Components';
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  mrp: number;
  discount?: number;
  note: string;
  tax?: number;
  itemGroupId?: string;
  purchasePrice?: number;
  stock?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  restockQuantity?: number;
  finalPrice?: number;
  imageBase64?: string;
  imageUrl?: string;
  salesPrice?: number;
  unit?: string;
  unitMultiplier?: number;
  unitPrice?: number;
  customPrice?: number;
  moq?: number;
  itemId?: string;
}

export type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed' | 'Completed' | 'Paid';

export interface Order {
  id: string;
  orderId: string;
  totalAmount: number;
  userName: string;
  status: OrderStatus;
  paidAmount?: number;
  createdAt: Date;
  time: string;
  items?: OrderItem[];
  billingDetails?: { address: string; phone: string; name: string; gstin: string };
  shippingDetails?: any;
  userEmail?: string;
  userLoginPhone?: string;
  paymentMethod?: 'Cash' | 'UPI' | 'Card';
  paymentMethods?: { [key: string]: number };
  note?: string;
  specialInstruction?: string;
  manualDiscount?: number;
  discount?: number;
  returnHistory?: {
    id: string;
    returnedAt: Date;
    returnedItems: any[];
    exchangeItems: any[];
    finalBalance: number;
    discountDeducted: number;
    modeOfReturn: string;
    paymentDetails?: any;
    partyName?: string;
    partyNumber?: string;
  }[];
  paymentStatus?: string;
  updatedAt?: Date;
  type?: string;
  isLead?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (date: Date): string => {
  if (!date) return 'N/A';
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

const formatAmount = (amount: number) => Number(amount || 0).toLocaleString('en-IN');

// ─── Data hook ────────────────────────────────────────────────────────────────

export const useOrdersData = (companyId?: string, startDate?: Date | null, endDate?: Date | null) => {
  const [Orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ordersQuery = useMemo(() => {
    if (!companyId) return null;
    const ordersRef = collection(db, 'companies', companyId, 'Orders');
    if (startDate && endDate) {
      return query(ordersRef, where('createdAt', '>=', Timestamp.fromDate(startDate)), where('createdAt', '<=', Timestamp.fromDate(endDate)), orderBy('createdAt', 'desc'));
    }
    return query(ordersRef, orderBy('createdAt'));
  }, [companyId, startDate?.getTime(), endDate?.getTime()]);

  useEffect(() => {
    if (!ordersQuery) { setOrders([]); setLoading(false); return; }
    setLoading(true);

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const list: Order[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
        const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : createdAt;
        return {
          id: doc.id,
          orderId: data.orderId || '',
          type: data.type || 'order',
          isLead: data.isLead || false,
          totalAmount: Number(data.totalAmount || 0),
          paidAmount: Number(data.paidAmount || 0),
          status: data.status || 'Upcoming',
          paymentMethod: data.paymentMethod,
          paymentMethods: data.paymentMethods,
          returnHistory: Array.isArray(data.returnHistory) ? data.returnHistory : [],
          specialInstruction: data.specialInstruction || '',
          updatedAt,
          userName: data.userName || data.billingDetails?.name || 'Anonymous',
          userLoginPhone: data.userLoginPhone || data.billingDetails?.phone || '',
          billingDetails: data.billingDetails,
          shippingDetails: data.shippingDetails,
          createdAt,
          time: formatDate(createdAt),
          items: Array.isArray(data.items)
            ? data.items.map((i: any) => {
                const salesPrice = Number(i.salesPrice || 0);
                const mrp = Number(i.mrp || 0);
                const finalPrice = i.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                return {
                  id: i.id, itemId: i.itemId || i.id, name: i.name,
                  quantity: Number(i.quantity || 0), mrp, salesPrice,
                  unitPrice: finalPrice, customPrice: finalPrice,
                  moq: Number(i.moq ?? 0), tax: Number(i.tax ?? 0),
                  unitMultiplier: Number(i.unitMultiplier ?? i.multiplier ?? 1),
                  unit: i.unit ?? 'pcs',
                  finalPrice: Number(i.finalPrice ?? finalPrice * Number(i.quantity || 0)),
                  note: i.note || '', imageUrl: i.imageUrl || '', imageBase64: '',
                };
              })
            : [],
        };
      });
      setOrders(list);
      setLoading(false);
    }, () => { setError('Failed to load orders'); setLoading(false); });

    return () => unsubscribe();
  }, [ordersQuery]);

  return { Orders, loading, error };
};

// ─── Main Component ────────────────────────────────────────────────────────────

const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seenOrdersRef = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('seenOrders') || '[]')));

  const OrderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];

  // ── Shared hooks ──────────────────────────────────────────────────────────
  const df = useDateFilter('today');
  const search = useSearchFilter();
  const expanded = useExpandedItem();
  const paymentModal = usePaymentModal<Order>();
  const qr = useQrModal<Order>();
  const pdf = usePdfAction();

  // ── Local state ───────────────────────────────────────────────────────────
  const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>((location.state?.defaultStatus as OrderStatus) || 'Confirmed');
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<any>(null);
  const [_billSettings, setBillSettings] = useState<any>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'billing' | 'shipping'>('billing');
  const [paymentFilter, setPaymentFilter] = useState<'paid' | 'unpaid'>('unpaid');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [enableItemWiseDiscount, setEnableItemWiseDiscount] = useState(false);
  const [_itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
  const [_pageIsLoading, setPageIsLoading] = useState(false);
  const [_error, setError] = useState<string | null>(null);
  const [availableItems, setAvailableItems] = useState<Item[]>([]);

  // Initialise dateRange from location state or today
  useEffect(() => {
    if (location.state?.startDate && location.state?.endDate) {
      // location-state dates take priority on first load — useDateFilter defaults handle the rest
    }
    if (location.state?.defaultStatus) setActiveStatusTab(location.state.defaultStatus);
  }, [location.state]);

  const { Orders, loading: dataLoading, error } = useOrdersData(
    currentUser?.companyId,
    df.dateRange.start,
    df.dateRange.end,
  );

  // ── New-order audio notification ──────────────────────────────────────────
  useEffect(() => {
    let updated = false;
    Orders.forEach((order) => {
      if (!seenOrdersRef.current.has(order.id) && order.status === 'Confirmed') {
        audioRef.current?.play().catch(console.error);
        seenOrdersRef.current.add(order.id);
        updated = true;
      }
    });
    if (updated) localStorage.setItem('seenOrders', JSON.stringify(Array.from(seenOrdersRef.current)));
  }, [Orders]);

  // ── Data fetching effects ─────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.companyId) return;
    const fetchCompanyInfo = async () => {
      const snap = await getDoc(doc(db, 'companies', currentUser.companyId));
      if (snap.exists()) setCompanyInfo(snap.data());
    };
    fetchCompanyInfo();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.companyId) return;
    const fetchBillSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill'));
        setBillSettings(snap.exists() ? snap.data() : {});
      } catch { setBillSettings({}); }
    };
    fetchBillSettings();
  }, [currentUser?.companyId]);

  useEffect(() => {
    if (!currentUser?.companyId) return;
    const fetchSalesSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'catalogue-sales-settings'));
        if (snap.exists()) setEnableItemWiseDiscount(snap.data().enableItemWiseDiscount ?? false);
      } catch { }
    };
    fetchSalesSettings();
  }, [currentUser?.companyId]);

  useEffect(() => {
    if (!dbOperations || !currentUser?.companyId) return;
    const fetchData = async () => {
      try {
        setPageIsLoading(true);
        const fetchedItems = await dbOperations.syncItems();
        setAvailableItems(fetchedItems);
        const groupsSnap = await getDocs(collection(db, 'companies', currentUser.companyId, 'itemGroups'));
        const groupMap: Record<string, string> = {};
        groupsSnap.docs.forEach((d) => { groupMap[d.id] = d.data().name || d.data().groupName || 'Unknown Group'; });
        setItemGroupMap(groupMap);
      } catch (err) { setError('Failed to sync data.'); }
      finally { setPageIsLoading(false); }
    };
    fetchData();
  }, [dbOperations, currentUser?.companyId]);

  useEffect(() => {
    if (!dbOperations) return;
    const unsub = dbOperations.listenToItems((data: Item[]) => setAvailableItems(data));
    return () => unsub && unsub();
  }, [dbOperations]);

  // ── Edit order calculations ───────────────────────────────────────────────
  const itemPrice = (item: OrderItem) => {
    const salesPrice = Number(item.salesPrice || 0);
    const mrp = Number(item.mrp || 0);
    return item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
  };

  const calculatedEditTotal = useMemo(() => {
    if (!editingOrder?.items) return 0;
    return editingOrder.items.reduce((sum, item) => sum + itemPrice(item) * Number(item.quantity || 0), 0);
  }, [editingOrder?.items]);

  useEffect(() => {
    if (!editingOrder) return;
    setEditingOrder((prev) => prev ? { ...prev, totalAmount: calculatedEditTotal } : prev);
  }, [calculatedEditTotal]);

  const handleQuantityChange = (id: string, newQuantity: number) => {
    if (!editingOrder) return;
    setEditingOrder({
      ...editingOrder,
      items: editingOrder.items?.map((item) => {
        if (item.id !== id) return item;
        const moq = Number(item.moq && item.moq > 0 ? item.moq : 1);
        const qty = isNaN(Number(newQuantity)) || Number(newQuantity) < moq ? moq : Number(newQuantity);
        return { ...item, quantity: qty };
      }),
    });
  };

  const handleDiscountChange = (id: string, value: number | string) => {
    if (!editingOrder) return;
    const discountValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
    setEditingOrder({
      ...editingOrder,
      items: editingOrder.items?.map((item) => {
        if (item.id !== id) return item;
        const mrp = Number(item.mrp || 0);
        return { ...item, discount: Number(discountValue.toFixed(2)), customPrice: Number((mrp * (1 - discountValue / 100)).toFixed(2)) };
      }),
    });
  };

  const handleNetPriceChange = (id: string, value: string) => {
    if (!editingOrder) return;
    const newNetPrice = Number(value) || 0;
    setEditingOrder({
      ...editingOrder,
      items: editingOrder.items?.map((item) => {
        if (item.id !== id) return item;
        const mrp = Number(item.mrp || 0);
        const discount = mrp > 0 ? ((mrp - newNetPrice) / mrp) * 100 : 0;
        return { ...item, customPrice: Number(newNetPrice.toFixed(2)), discount: Number(discount.toFixed(2)) };
      }),
    });
  };

  const handleDeleteItem = (id: string) => {
    if (!editingOrder) return;
    setEditingOrder({ ...editingOrder, items: editingOrder.items?.filter((item) => item.id !== id) });
  };

  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    if (!selectedItemForEdit || !editingOrder) return;
    const updatePayload: any = { ...updatedItemData };
    if (updatePayload.Stock !== undefined) { updatePayload.stock = updatePayload.Stock; delete updatePayload.Stock; }
    Object.keys(updatePayload).forEach((k) => { if (updatePayload[k] === undefined) delete updatePayload[k]; });

    const updatedItems = (editingOrder.items || []).map((item) =>
      String(item.id) === String(selectedItemForEdit.id) ? { ...item, ...updatePayload } : item
    );
    const newTotal = updatedItems.reduce((sum, i) => sum + itemPrice(i) * Number(i.quantity || 0), 0);
    setEditingOrder((prev) => prev ? { ...prev, items: updatedItems, totalAmount: newTotal } : prev);

    if (currentUser?.companyId) {
      updateDoc(doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id), {
        items: updatedItems, totalAmount: newTotal, updatedAt: serverTimestamp(),
      });
    }
    setIsEditDrawerOpen(false);
    setSelectedItemForEdit(null);
  };

  const mappedOrderItems = (editingOrder?.items || []).map((item) => {
    const mrp = Number(item.mrp || 0);
    const salePrice = Number(item.salesPrice || 0);
    let discount = Number(item.discount || 0);
    let netPrice = Number(item.customPrice ?? 0);

    if (netPrice > 0) discount = mrp > 0 ? ((mrp - netPrice) / mrp) * 100 : 0;
    else if (salePrice > 0 && discount === 0) { netPrice = salePrice; discount = mrp > 0 ? ((mrp - salePrice) / mrp) * 100 : 0; }
    else if (discount > 0 && mrp > 0) netPrice = mrp * (1 - discount / 100);
    else netPrice = salePrice > 0 ? salePrice : mrp;

    return { ...item, productId: item.itemId || item.id, isEditable: true, discount: Number(discount.toFixed(2)), customPrice: Number(netPrice.toFixed(2)), unitMultiplier: 1 };
  });

  // ── Status counts ─────────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    return OrderStatuses.reduce((acc, status) => {
      acc[status] = status === 'Completed'
        ? Orders.filter((o) => o.status === 'Completed' || o.status === 'Paid').length
        : Orders.filter((o) => o.status === status).length;
      return acc;
    }, {} as Record<string, number>);
  }, [Orders]);

  // ── Filtered orders ───────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    let result = Orders
      .filter((order) => {
        if (activeStatusTab === 'Upcoming') {
          if (order.status === 'Upcoming' && order.isLead) return (order.items?.length || 0) > 0;
          return order.status === 'Upcoming';
        }
        if (activeStatusTab === 'Completed') {
          return paymentFilter === 'unpaid' ? order.status === 'Completed' : order.status === 'Paid';
        }
        return order.status === activeStatusTab;
      })
      .filter((order) => {
        const q = search.searchQuery.toLowerCase();
        return order.orderId?.toLowerCase().includes(q) || order.userName?.toLowerCase().includes(q);
      });

    if (activeStatusTab === 'Completed' && paymentFilter === 'paid') {
      result = result.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.createdAt).getTime();
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
    }
    return result;
  }, [Orders, activeStatusTab, paymentFilter, search.searchQuery]);

  // ── PDF action ────────────────────────────────────────────────────────────
  const handlePdfAction = async (order: Order, action: ACTION) => {
    await pdf.run(order.id, async () => {
      const functions = getFunctions(app);
      const fetchInvoiceCall = httpsCallable(functions, 'fetchInvoiceData');
      const result = await fetchInvoiceCall({ companyId: currentUser?.companyId, orderId: order.id });
      const responseData = result.data as any;
      if (!responseData.success) throw new Error('Failed to fetch order data from server');

      const safeOrderData = responseData.orderData;
      const rawBillData = {
        companyId: currentUser?.companyId,
        companyName: companyInfo?.name || '',
        companyAddress: companyInfo?.address || '',
        companyPhone: companyInfo?.ownerPhoneNumber || '',
        specialInstruction: safeOrderData.specialInstruction || order.specialInstruction || '',
        customer: {
          billing: { name: safeOrderData.billingDetails?.name || order.billingDetails?.name || order.userName || 'Customer', phone: safeOrderData.billingDetails?.phone || order.billingDetails?.phone || '', address: safeOrderData.billingDetails?.address || order.billingDetails?.address || '', gstin: safeOrderData.billingDetails?.gstin || order.billingDetails?.gstin || '' },
          shipping: { name: safeOrderData.shippingDetails?.name || order.shippingDetails?.name || '', phone: safeOrderData.shippingDetails?.phone || order.shippingDetails?.phone || '', address: safeOrderData.shippingDetails?.address || order.shippingDetails?.address || '', gstin: safeOrderData.shippingDetails?.gstin || order.shippingDetails?.gstin || '' },
        },
        order: { orderId: safeOrderData.orderId || order.orderId, date: order.time },
        items: (safeOrderData.items || []).map((item: any, index: number) => ({
          sno: index + 1, name: item.name, qty: item.quantity,
          unitMultiplier: item.unitMultiplier ?? 1, tax: item.tax ?? 0,
          mrp: item.mrp || 0, price: item.salesPrice || item.mrp || 0,
          total: (item.salesPrice || item.mrp || 0) * item.quantity,
          imageBase64: item.imageBase64 || '',
        })),
        grandTotal: safeOrderData.totalAmount || order.totalAmount,
      };

      const preparedData = await prepareCatalogueBillData({ ...rawBillData, isEstimate: pdf.billType === 'estimate' });
      if (action === ACTION.PRINT) await CatalogueBill(preparedData, 'print');
      if (action === ACTION.DOWNLOAD) await CatalogueBill(preparedData, 'download');
    }, () => setModal({ message: 'Bill generation failed. Check console.', type: State.ERROR }));
  };

  // ── Order management ──────────────────────────────────────────────────────
  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Are you sure you want to delete this entire Order?') || !currentUser?.companyId) return;
    try {
      const orderRef = doc(db, 'companies', currentUser.companyId, 'Orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found');

      for (const item of orderSnap.data().items || []) {
        const itemId = item.itemId || item.id;
        if (!itemId) continue;
        const itemRef = doc(db, 'companies', currentUser.companyId, 'items', itemId);
        const itemSnap = await getDoc(itemRef);
        if (!itemSnap.exists()) continue;
        await updateDoc(itemRef, { stock: Number(itemSnap.data().stock || 0) + Number(item.quantity || 0) });
      }
      await deleteDoc(orderRef);
      setModal({ message: 'Order deleted successfully', type: State.SUCCESS });
    } catch (error) {
      setModal({ message: 'Failed to delete order', type: State.ERROR });
    }
  };

  const handleUpdateStatus = async (orderId: string, currentStatus: OrderStatus, manualNextStatus?: OrderStatus) => {
    setIsUpdatingStatus(orderId);
    try {
      const nextStatusMap: Record<OrderStatus, OrderStatus> = { Upcoming: 'Confirmed', Confirmed: 'Packed', Packed: 'Completed', Completed: 'Completed', Paid: 'Paid' };
      const nextStatus = manualNextStatus || nextStatusMap[currentStatus];
      if (!currentUser?.companyId) return;

      const OrderRef = doc(db, 'companies', currentUser.companyId, 'Orders', orderId);

      if (nextStatus === 'Confirmed') {
        const orderSnap = await getDoc(OrderRef);
        const items = orderSnap.data()?.items || [];
        await Promise.all(items.map(async (item: any) => {
          const itemId = item.itemId || item.id;
          if (!itemId) return;
          const itemRef = doc(db, 'companies', currentUser.companyId, 'items', itemId);
          const snap = await getDoc(itemRef);
          if (!snap.exists()) return;
          await updateDoc(itemRef, { stock: Number(snap.data().stock || 0) - Number(item.quantity || 0) * Number(item.unitMultiplier || 1) });
        }));
      }

      await updateDoc(OrderRef, { status: nextStatus, isLead: false, updatedAt: serverTimestamp() });
    } catch (err) { console.error(err); }
    finally { setIsUpdatingStatus(null); }
  };

  const handlePreviousStatus = async (orderId: string, currentStatus: OrderStatus) => {
    const prevStatusMap: Record<OrderStatus, OrderStatus> = { Upcoming: 'Upcoming', Confirmed: 'Confirmed', Packed: 'Confirmed', Completed: 'Packed', Paid: 'Completed' };
    if (!currentUser?.companyId) return;
    await updateDoc(doc(db, 'companies', currentUser.companyId, 'Orders', orderId), { status: prevStatusMap[currentStatus], updatedAt: serverTimestamp() });
  };

  // ── Date display label ────────────────────────────────────────────────────
  const getDateDisplay = useMemo(() => {
    const { start, end } = df.dateRange;
    if (!start || !end) return '';
    const fmt = (d: Date) => d.toLocaleDateString('en-GB');
    return start.toDateString() === end.toDateString() ? fmt(start) : `${fmt(start)} to ${fmt(end)}`;
  }, [df.dateRange]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-100 mb-10">
      {modal && <Modal message={modal.message} type={modal.type} onClose={() => setModal(null)} />}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white shadow-sm sticky top-0 z-[55] px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Search toggle */}
          <div className="w-10">
            <button onClick={search.toggleSearch} className="text-slate-500">
              {search.showSearch
                ? <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              }
            </button>
          </div>

          {/* Center: Title / Search / Date */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {search.showSearch ? (
              <input
                type="text"
                placeholder="Search..."
                className="w-full max-w-[200px] text-center text-sm font-light p-1 border-b border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
                value={search.searchQuery}
                onChange={(e) => search.setSearchQuery(e.target.value)}
                autoFocus
              />
            ) : (
              <h1 className="text-3xl font-bold text-slate-800">Orders</h1>
            )}
            <div className="mt-0.5">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{getDateDisplay}</span>
            </div>
          </div>

          {/* Right: Date filter dropdown (shared component) */}
          <div className="w-10 flex justify-end">
            <DateFilterDropdown
              options={DATE_FILTER_OPTIONS.filter((o) => o.value !== 'last15')}
              activeFilter={df.activeFilter}
              isOpen={df.isFilterOpen}
              onToggle={df.toggleDropdown}
              onSelect={df.selectFilter}
              onSelectCustom={() => { df.selectFilter('custom'); df.setShowCustomPicker(true); }}
              onClose={df.closeDropdown}
            />
          </div>
        </div>

        {/* Custom date picker (shared component) */}
        {df.showCustomPicker && (
          <CustomDatePicker
            startDate={df.customStartDate}
            endDate={df.customEndDate}
            onStartChange={df.setCustomStartDate}
            onEndChange={df.setCustomEndDate}
            onApply={() => { df.selectFilter('custom'); df.setShowCustomPicker(false); }}
          />
        )}
      </div>

      {/* ── Order status stepper ─────────────────────────────────────────── */}
      <div className="bg-white shadow-sm sticky z-[50] border-b top-[72px]">
        <div className="flex items-center w-full px-2 md:px-10 pt-9 pb-9 bg-white">
          {OrderStatuses.map((status, index) => {
            const activeIndex = OrderStatuses.indexOf(activeStatusTab);
            const isCompleted = index < activeIndex;
            const isActive = index === activeIndex;
            const count = statusCounts[status] || 0;

            return (
              <React.Fragment key={status}>
                <div
                  className={`relative flex flex-col items-center flex-1 min-w-0 ${status === 'Upcoming' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => { if (status !== 'Upcoming') setActiveStatusTab(status); }}
                >
                  <span className={`absolute ${index % 2 === 0 ? 'bottom-full mb-2' : 'top-full mt-2'} text-center text-[8px] sm:text-[10px] md:text-[11px] uppercase tracking-tighter ${isActive ? 'text-[#F97316] font-black' : 'text-gray-400 font-bold'} whitespace-nowrap`}>
                    {status}
                  </span>
                  <div className={`relative w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${status === 'Upcoming' ? 'bg-orange-500 text-white' : isCompleted || isActive ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'} ${isActive ? 'scale-110 shadow-md ring-2 ring-orange-100' : ''}`}>
                    {status === 'Upcoming'
                      ? <span className="absolute px-1 py-[2px] text-[5px] font-black uppercase rounded-full bg-orange-100 text-[#F97316] border border-orange-300 whitespace-nowrap">Coming Soon</span>
                      : <span className="text-[10px] md:text-xs font-black">{count}</span>
                    }
                  </div>
                </div>
                {index < OrderStatuses.length - 1 && (
                  <div className={`flex-auto h-0.5 md:h-1.5 transition-colors duration-500 ${index < activeIndex ? 'bg-[#F97316]' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Paid / Unpaid sub-tab for Completed */}
      {activeStatusTab === 'Completed' && (
        <div className="sticky top-[178px] z-[50] flex p-1 bg-white mx-4 mt-2 rounded-sm shadow-sm border border-slate-200 max-w-md md:mx-auto w-[92%]">
          {(['unpaid', 'paid'] as const).map((f) => (
            <button key={f} onClick={() => setPaymentFilter(f)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-sm transition-all ${paymentFilter === f ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500'}`}>{f}</button>
          ))}
        </div>
      )}

      {/* ── Orders list ──────────────────────────────────────────────────── */}
      <div className="flex-grow overflow-y-hidden bg-slate-100 space-y-2 p-1 md:p-4">
        {dataLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : error ? (
          <p className="p-8 text-center text-red-500">{error}</p>
        ) : filteredOrders.length > 0 ? (
          <AnimatePresence>
            {filteredOrders.map((order) => {
              const returnMethods = order.returnHistory && order.returnHistory.length > 0
                ? Array.from(new Set(order.returnHistory.map((r) => r.modeOfReturn)))
                : [];
              const isExpanded = expanded.isExpanded(order.id);
              const isUpcomingStatus = order.status === 'Upcoming';
              const total = (order.items || []).reduce((sum, item) => sum + itemPrice(item) * Number(item.quantity || 0), 0);
              const paid = Number(order.paidAmount || 0);
              const due = Math.max(0, total - paid);
              const isPaid = order.status === 'Paid';
              const isFinalStage = order.status === 'Completed' || order.status === 'Paid';

              return (
                <motion.div key={order.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.25 }}>
                  <CustomCard onClick={() => expanded.toggle(order.id)} className="p-3 mb-3 bg-white shadow-sm border border-gray-100 rounded-sm cursor-pointer relative">

                    {/* Return badges (shared component) */}
                    {returnMethods.length > 0 && (
                      <div className="absolute -top-0.5 left-0 flex flex-wrap gap-1 p-1">
                        {returnMethods.map((method, index) => (
                          <span key={`${method}-${index}`} className={`text-[7px] uppercase font-bold px-2 py-0.5 rounded border ${method === 'EXCHANGE' ? 'bg-purple-50 text-purple-700 border-purple-200' : method === 'CASH REFUND' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-[#F97316] border-orange-200'}`}>{method}</span>
                        ))}
                      </div>
                    )}

                    {!isUpcomingStatus && (
                      <button onClick={(e) => { e.stopPropagation(); setEditingOrder(order); setSelectedItemForEdit(null); }} className="absolute top-5 left-2 p-2 bg-white/90 backdrop-blur-sm text-slate-500 rounded-sm z-20">
                        <IconEdit className="h-3 w-3" />
                      </button>
                    )}

                    {/* Payment method badges (shared component) */}
                    <div className="absolute right-5 top-0 flex gap-1">
                      <PaymentBadges paymentMethods={order.paymentMethods as any} />
                      {order.returnHistory && order.returnHistory.length > 0 && (() => {
                        const latest = order.returnHistory[order.returnHistory.length - 1];
                        if (!latest.paymentDetails) return null;
                        return Object.entries(latest.paymentDetails)
                          .filter(([method, amount]) => method.toLowerCase() !== 'due' && Number(amount) > 0)
                          .map(([method]) => (
                            <span key={`exchange-${method}`} className="text-[8px] uppercase font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">{method}</span>
                          ));
                      })()}
                    </div>

                    {/* Card header */}
                    <div className="flex justify-between items-start pl-6 mt-1">
                      <div>
                        {!isUpcomingStatus && <h3 className="text-sm font-bold text-slate-800">{order.orderId}</h3>}
                        <p className="text-black text-xs font-medium">
                          {order.userName}
                          {order.status === 'Upcoming' && order.userLoginPhone && (
                            <span className="ml-2 text-[10px] text-black font-semibold border p-1 bg-gray-100">{order.userLoginPhone}</span>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">{order.time}</p>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <div className="flex items-center gap-2">
                          <p className="text-[18px] font-bold text-black">₹{formatAmount(total)}</p>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </div>
                        <p className="text-[10px] font-bold px-2 py-0.5 mt-1 mr-6">Items: {order.items?.length || 0}</p>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className={`mt-1 border-t pt-4 ${isUpcomingStatus ? 'pb-2' : ''}`}>
                        {!isUpcomingStatus && (
                          <div className="grid grid-cols-2 gap-4 mb-1 pb-4">
                            <div className="space-y-1">
                              <p className="text-[8px] font-black text-[#F97316] uppercase">Billing Address</p>
                              <p className="text-[11px] font-bold text-slate-800">{order.billingDetails?.name}</p>
                              <p className="text-[10px] text-gray-500 leading-tight">{order.billingDetails?.address}</p>
                              <p className="text-[10px] text-gray-500">{order.billingDetails?.phone}</p>
                            </div>
                            <div className="space-y-1 border-l pl-4">
                              <p className="text-[8px] font-black text-blue-500 uppercase">Shipping Address</p>
                              <p className="text-[11px] font-bold text-slate-800">{order.shippingDetails?.name || order.billingDetails?.name}</p>
                              <p className="text-[10px] text-gray-500 leading-tight">{order.shippingDetails?.address || order.billingDetails?.address}</p>
                              <p className="text-[10px] text-gray-500">{order.shippingDetails?.phone}</p>
                            </div>
                          </div>
                        )}

                        {order.specialInstruction && (
                          <div className="mb-1 bg-gray-50 border border-gray-200 rounded-sm p-2">
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Special Instructions</p>
                            <p className="text-[11px] text-gray-700 font-medium leading-snug break-words">{order.specialInstruction}</p>
                          </div>
                        )}

                        {order.items?.map((item, idx) => (
                          <div key={idx} className="p-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); setEditingOrder(order); setSelectedItemForEdit(item); setIsEditDrawerOpen(true); }}>
                            <div className="flex justify-between items-start -mb-1">
                              <div className="flex-1">
                                <p className="text-[11px] font-extrabold text-slate-800 leading-tight mb-1">{item.name} <span className="ml-1 text-[9px] font-semibold text-gray-500">{item.unit || 'pcs'}</span></p>
                                {item.note && <p className="text-[9px] leading-tight flex items-baseline gap-1.5 mt-1 opacity-80"><span className="font-black uppercase tracking-widest font-xs">Note:</span><span className="font-xs italic text-slate-600">{item.note}</span></p>}
                                <p className="text-[10px] text-gray-400">₹{formatAmount(itemPrice(item))} per {item.unit || 'pcs'}</p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-[13px] font-black text-slate-900">₹{formatAmount(itemPrice(item) * item.quantity)}</p>
                                <p className="text-[9px] font-bold text-slate-500">Qty: {item.quantity}</p>
                              </div>
                            </div>
                          </div>
                        ))}

                        {!isUpcomingStatus && (
                          <div className="border-t mt-1 p-2 flex items-center justify-between">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {paid > 0 && order.paymentMethods && Object.keys(order.paymentMethods).length > 0 ? (
                                Object.entries(order.paymentMethods)
                                  .filter(([method, amount]) => method.toLowerCase() !== 'due' && Number(amount) > 0)
                                  .map(([method, amount]) => (
                                    <div key={method} className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-green-100">
                                      <span className="text-[10px] font-bold text-green-800 uppercase">{method}</span>
                                      <span className="text-[10px] font-black text-green-600">₹{Number(amount).toFixed(2)}</span>
                                    </div>
                                  ))
                              ) : order.paymentMethod && paid > 0 ? (
                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-green-100">
                                  <span className="text-[8px] font-bold text-green-800 uppercase">{order.paymentMethod}</span>
                                  <span className="text-[9px] font-black text-green-600">₹{paid.toFixed(2)}</span>
                                </div>
                              ) : null}
                            </div>
                            <div className="flex gap-3 items-center">
                              <div className="text-right border-r border-slate-200 pr-3">
                                <p className="text-[7px] font-bold text-green-600 uppercase tracking-tighter leading-none mb-0.5">Paid</p>
                                <p className="text-[11px] font-black text-green-700 leading-none">₹{paid.toFixed(2)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[7px] font-bold text-red-600 uppercase tracking-tighter leading-none mb-0.5">Due</p>
                                <p className="text-[11px] font-black text-red-700 leading-none">₹{due.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className={`grid ${isUpcomingStatus ? 'grid-cols-3' : order.status === 'Packed' ? 'grid-cols-5 md:grid-cols-5' : order.status === 'Paid' ? 'grid-cols-3' : order.status === 'Completed' ? 'grid-cols-4' : 'grid-cols-4'} gap-3 pt-6 border-t`}>
                          {isUpcomingStatus && order.userLoginPhone && (
                            <>
                              <a href={`tel:${order.userLoginPhone.replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()} className="py-2.5 bg-white border border-emerald-200 text-emerald-600 text-xs font-bold rounded-sm text-center">Call</a>
                              <a href={`https://wa.me/${order.userLoginPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="py-2.5 bg-[#25D366] text-white text-xs font-bold rounded-sm text-center">WhatsApp</a>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }} className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm cursor-pointer">Delete</button>
                            </>
                          )}

                          {!isUpcomingStatus && (isFinalStage ? (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }} className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm cursor-pointer">Delete</button>
                              {!isPaid && <button onClick={(e) => { e.stopPropagation(); paymentModal.open(order); }} className="py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-sm">Settle</button>}
                              <button onClick={(e) => { e.stopPropagation(); navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`, { state: { selectedOrder: order.orderId } }); }} className="py-2.5 bg-sky-500 text-white text-xs font-bold rounded-sm">Return</button>
                              <button onClick={(e) => { e.stopPropagation(); pdf.openActionModal(order); }} disabled={pdf.pdfLoadingId === order.id} className="py-2.5 bg-black text-white text-xs font-bold rounded-sm flex items-center justify-center">Print</button>
                            </>
                          ) : (
                            <>
                              {order.status === 'Packed' && (
                                <button onClick={(e) => { e.stopPropagation(); handlePreviousStatus(order.id, order.status); }} className="w-full py-2.5 bg-gray-200 text-black text-sm font-bold rounded-sm flex items-center justify-center flex-col">←<span className="text-[10px]">back</span></button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }} className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm">Delete</button>
                              <button onClick={(e) => { e.stopPropagation(); paymentModal.open(order); }} className="py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-sm">Advance</button>
                              <button onClick={(e) => { e.stopPropagation(); pdf.openActionModal(order); }} className="py-2.5 bg-black text-white text-xs font-bold rounded-sm">
                                {pdf.pdfLoadingId === order.id ? <div className="flex items-center gap-2"><Spinner /><span>...Printing</span></div> : 'Print'}
                              </button>
                              {(order.status === 'Confirmed' || order.status === 'Packed') && (
                                <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(order.id, order.status); }} disabled={isUpdatingStatus === order.id} className="py-2.5 bg-[#00A2FF] text-white text-xs font-bold rounded-sm flex items-center justify-center flex-col">→<span className="text-[10px]">Next</span></button>
                              )}
                            </>
                          ))}
                        </div>
                      </div>
                    )}
                  </CustomCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        ) : (
          <p className="p-8 text-center text-slate-500">No Orders found.</p>
        )}
      </div>

      {/* ── Action modal (shared component) ─────────────────────────────── */}
      {pdf.pendingActionItem && (
        <ActionModal
          billType={pdf.billType}
          onBillTypeChange={pdf.setBillType}
          onClose={pdf.closeActionModal}
          actions={[
            {
              label: 'Share on WhatsApp', variant: 'whatsapp',
              onClick: () => { pdf.closeActionModal(); navigate(ROUTES.WHATSAPP_PLAN || '/whatsapp-plans'); },
            },
            {
              label: 'Download PDF', variant: 'download', loading: pdf.pdfLoadingId === pdf.pendingActionItem?.id,
              onClick: () => { const o = pdf.pendingActionItem; pdf.closeActionModal(); setTimeout(() => handlePdfAction(o, ACTION.DOWNLOAD), 50); },
            },
            {
              label: 'Print Directly', variant: 'print', loading: pdf.pdfLoadingId === pdf.pendingActionItem?.id,
              onClick: () => { const o = pdf.pendingActionItem; pdf.closeActionModal(); setTimeout(() => handlePdfAction(o, ACTION.PRINT), 50); },
            },
            {
              label: 'Generate QR Code', variant: 'qr',
              onClick: () => { qr.openQr(pdf.pendingActionItem); pdf.closeActionModal(); },
            },
          ]}
        />
      )}

      {/* ── QR modal (shared component) ─────────────────────────────────── */}
      {qr.qrItem && (
        <QrModal
          value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${qr.qrItem.id}`}
          subtitle={`Invoice #${qr.qrItem.orderId}`}
          onClose={qr.closeQr}
        />
      )}

      {/* ── Payment modal ────────────────────────────────────────────────── */}
      {paymentModal.selectedItem && (() => {
        const order = paymentModal.selectedItem!;
        const updatedTotal = (order.items || []).reduce((sum, item) => sum + itemPrice(item) * Number(item.quantity || 0), 0);
        const alreadyPaid = Number(order.paidAmount || 0);
        const currentDue = Math.max(0, updatedTotal - alreadyPaid);

        return (
          <PaymentModal
            isOpen={paymentModal.isOpen}
            onClose={paymentModal.close}
            invoice={{ id: order.id, invoiceNumber: order.orderId, amount: currentDue, partyName: order.userName, dueAmount: currentDue, time: order.time, status: currentDue === 0 ? 'Paid' : 'Unpaid', type: 'Credit', createdAt: new Date() }}
            onSubmit={async (_inv, amount, method) => {
              try {
                if (!currentUser?.companyId || !paymentModal.selectedItem) return;
                const orderRef = doc(db, 'companies', currentUser.companyId, 'Orders', order.id);
                const methodKey = method ? method.toUpperCase() : 'CASH';
                const updatedMethods = { ...(order.paymentMethods || {}), [methodKey]: ((order.paymentMethods || {})[methodKey] || 0) + amount };
                const newPaidTotal = alreadyPaid + amount;
                let newStatus = order.status;
                if (order.status === 'Completed' && Math.round(newPaidTotal) >= Math.round(updatedTotal)) newStatus = 'Paid';
                await updateDoc(orderRef, { paidAmount: newPaidTotal, paymentMethods: updatedMethods, paymentMethod: methodKey, status: newStatus, updatedAt: serverTimestamp() });
                paymentModal.close();
                setModal({ message: 'Payment successful!', type: State.SUCCESS });
              } catch (err) {
                setModal({ message: 'Payment failed', type: State.ERROR });
              }
            }}
          />
        );
      })()}

      {/* ── Edit order modal ─────────────────────────────────────────────── */}
      {editingOrder && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 md:p-4">
          <div className="bg-white rounded-sm w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 leading-tight">Edit Order</h3>
                  <p className="text-[10px] text-orange-600 font-bold uppercase tracking-tighter">{editingOrder.orderId}</p>
                </div>
                <div className="h-8 w-[1px] bg-gray-500 mx-2" />
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total Amount</span>
                  <span className="text-md font-black text-slate-900 leading-none">₹{formatAmount(calculatedEditTotal)}</span>
                </div>
              </div>
              <button onClick={() => setEditingOrder(null)} className="p-1.5 hover:bg-gray-200 rounded-sm transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                {/* Addresses */}
                <div className="space-y-4">
                  <div className="flex sm:hidden p-1 bg-slate-100 rounded-sm mb-2">
                    {(['billing', 'shipping'] as const).map((t) => (
                      <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${activeTab === t ? `bg-white ${t === 'billing' ? 'text-orange-600' : 'text-blue-600'} shadow-sm` : 'text-slate-500'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Billing */}
                    <div className={`p-4 rounded-sm border border-slate-200 bg-orange-50/30 space-y-3 ${activeTab === 'billing' ? 'block' : 'hidden sm:block'}`}>
                      <div className="flex justify-between items-center">
                        <h4 className="text-[11px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-2"><span className="w-1.5 h-1.5 bg-orange-600 rounded-sm" /> Billing Address</h4>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input type="checkbox" id="sameAsBilling" className="w-3.5 h-3.5 accent-orange-600 rounded-sm cursor-pointer" onChange={(e) => { if (e.target.checked) setEditingOrder({ ...editingOrder, shippingDetails: { ...editingOrder.billingDetails } }); }} />
                          <span className="text-[9px] font-bold text-slate-500 uppercase">Same for Shipping</span>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Name" className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-orange-400" value={editingOrder.billingDetails?.name || ''} onChange={(e) => { const val = e.target.value; const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked; setEditingOrder({ ...editingOrder, billingDetails: { ...editingOrder.billingDetails!, name: val }, ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, name: val } }) }); }} />
                        <input type="text" placeholder="Phone" className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-orange-400" value={editingOrder.billingDetails?.phone || ''} onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 10); const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked; setEditingOrder({ ...editingOrder, billingDetails: { ...editingOrder.billingDetails!, phone: val }, ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, phone: val } }) }); }} />
                        <textarea placeholder="Address" className="col-span-2 p-2 border border-slate-300 rounded-sm text-xs h-16 resize-none outline-none focus:border-orange-400" value={editingOrder.billingDetails?.address || ''} onChange={(e) => { const val = e.target.value; const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked; setEditingOrder({ ...editingOrder, billingDetails: { ...editingOrder.billingDetails!, address: val }, ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, address: val } }) }); }} />
                      </div>
                    </div>
                    {/* Shipping */}
                    <div className={`p-4 rounded-sm border border-slate-200 bg-blue-50/30 space-y-3 ${activeTab === 'shipping' ? 'block' : 'hidden sm:block'}`}>
                      <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-600 rounded-sm" /> Shipping Address</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Name" className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-blue-400" value={editingOrder.shippingDetails?.name || ''} onChange={(e) => setEditingOrder({ ...editingOrder, shippingDetails: { ...editingOrder.shippingDetails!, name: e.target.value } })} />
                        <input type="text" placeholder="Phone" className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-blue-400" value={editingOrder.shippingDetails?.phone || ''} onChange={(e) => setEditingOrder({ ...editingOrder, shippingDetails: { ...editingOrder.shippingDetails!, phone: e.target.value.replace(/\D/g, '').slice(0, 10) } })} />
                        <textarea placeholder="Address" className="col-span-2 p-2 border border-slate-300 rounded-sm text-xs h-16 resize-none outline-none focus:border-blue-400" value={editingOrder.shippingDetails?.address || ''} onChange={(e) => setEditingOrder({ ...editingOrder, shippingDetails: { ...editingOrder.shippingDetails!, address: e.target.value } })} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="flex flex-col w-full space-y-2">
                  <div className="p-2 border-t border-slate-200">
                    <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest mb-2">Add New Item</p>
                    <SearchableItemInput
                      items={availableItems}
                      onItemSelected={(selectedItem) => {
                        if (!selectedItem.id) return;
                        const newMrp = Number(selectedItem.mrp || 0);
                        const newSalesPrice = Number(selectedItem.salesPrice || 0);
                        const finalPrice = newSalesPrice > 0 ? newSalesPrice : newMrp;
                        const qty = selectedItem.moq && selectedItem.moq > 0 ? selectedItem.moq : 1;
                        const newItem: any = { ...selectedItem, id: crypto.randomUUID(), itemId: selectedItem.id, productId: selectedItem.id, name: selectedItem.name, quantity: qty, mrp: newMrp, salesPrice: newSalesPrice, unitMultiplier: selectedItem.unitMultiplier ?? 1, note: '', itemGroupId: selectedItem.itemGroupId, moq: selectedItem.moq ?? 0, tax: Number(selectedItem.tax), imageUrl: selectedItem.imageUrl || '', imageBase64: '', unitPrice: finalPrice, finalPrice, customPrice: finalPrice };
                        const updatedItems = [newItem, ...(editingOrder.items || [])];
                        const newTotal = updatedItems.reduce((sum, i) => sum + itemPrice(i) * Number(i.quantity || 0), 0);
                        setEditingOrder({ ...editingOrder, items: updatedItems, totalAmount: newTotal });
                      }}
                      placeholder="Search item to add..."
                    />
                  </div>

                  <div className="h-fit self-start w-full p-2 rounded-sm border border-slate-200 bg-slate-50 flex flex-col">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Items ({editingOrder.items?.length})</h4>
                    <div className="h-auto">
                      <GenericCartList
                        items={mappedOrderItems}
                        availableItems={availableItems}
                        basePriceKey="mrp"
                        priceLabel="MRP"
                        settings={{ enableRounding: false, roundingInterval: 1, enableItemWiseDiscount, lockDiscount: false, lockPrice: false, hideMrp: false }}
                        applyRounding={(amount: number) => amount}
                        State={State}
                        setModal={setModal}
                        onOpenEditDrawer={(item: any) => { setSelectedItemForEdit(item); setIsEditDrawerOpen(true); }}
                        onDeleteItem={handleDeleteItem}
                        onDiscountChange={handleDiscountChange}
                        onCustomPriceChange={handleNetPriceChange}
                        onCustomPriceBlur={() => { }}
                        onQuantityChange={handleQuantityChange}
                      />
                    </div>
                    {isEditDrawerOpen && selectedItemForEdit && (
                      <ItemEditDrawer item={selectedItemForEdit} isOpen={isEditDrawerOpen} onClose={() => setIsEditDrawerOpen(false)} onSaveSuccess={handleSaveSuccess} isCatalogue={true} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t flex gap-3">
              <button onClick={() => setEditingOrder(null)} className="flex-1 py-2.5 bg-gray-400 text-black text-sm font-bold hover:bg-slate-300 rounded-sm transition-colors">Discard</button>
              <button
                onClick={async () => {
                  if (!editingOrder || !currentUser?.companyId) return;
                  try {
                    const totalAmt = Number(editingOrder.totalAmount || 0);
                    const paidAmt = Number(editingOrder.paidAmount || 0);
                    let updatedStatus = editingOrder.status;
                    if (updatedStatus === 'Paid' && totalAmt > paidAmt) updatedStatus = 'Completed';
                    else if (updatedStatus === 'Completed' && totalAmt <= paidAmt && totalAmt > 0) updatedStatus = 'Paid';
                    await updateDoc(doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id), { items: editingOrder.items, totalAmount: totalAmt, status: updatedStatus, billingDetails: editingOrder.billingDetails, shippingDetails: editingOrder.shippingDetails, updatedAt: serverTimestamp() });
                    setEditingOrder(null);
                  } catch (error) { alert('Failed to save changes.'); }
                }}
                className="flex-[2] bg-orange-600 text-white py-2.5 rounded-sm text-sm font-black shadow-sm hover:bg-orange-700 transition-colors uppercase"
              >
                SAVE CHANGES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
