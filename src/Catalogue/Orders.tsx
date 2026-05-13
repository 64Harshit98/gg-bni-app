import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { ACTION } from '../enums/action.enum'
import { useLocation, Link } from 'react-router-dom';
import { db } from '../lib/Firebase';
import QRCode from 'react-qr-code';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../src/constants/routes.constants';
import { GenericCartList } from '../Components/CartItem';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { useDatabase } from '../context/auth-context';
import ShinyText from '../Components/ShinyText';
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    orderBy,
    where,
    serverTimestamp,
    increment as firebaseIncrement,
    setDoc
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { CustomCard } from '../Components/CustomCard';
import { Spinner } from '../constants/Spinner';
import { Modal, PaymentModal } from '../constants/Modal';
import { State } from '../enums';
import { FiSearch, FiX } from 'react-icons/fi';
import { IconEdit, IconFilter } from '../constants/Icons';
import type { Item } from '../constants/models';
import { CatalogueBill, prepareCatalogueBillData } from './CatalogueBill/CatalogueBill'
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/Firebase';
import NotificationBell from '../Components/NotificationBell';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/Firebase'; // Ensure 'storage' is exported from your Firebase config
import { botMasterService } from '../Pages/Additional/Whatsapp/WhatsappApi';
import { FiSend } from 'react-icons/fi';

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
    imageUrl?: string
    salesPrice?: number
    unit?: string;
    unitMultiplier?: number;
    unitPrice?: number;
    customPrice?: number;
    moq?: number;
    itemId?: string
}

// 1. Updated Status Types
export type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed' | 'Completed' | 'Paid' | 'Cancelled';

export interface Order {
    id: string;
    orderId: string;
    totalAmount: number;
    userName: string;
    status: OrderStatus;
    paidAmount?: number;
    creditNoteAmount?: number;
    refundAmount?: number;
    createdAt: Date;
    time: string;
    items?: OrderItem[];
    billingDetails?: {
        address: string;
        phone: string;
        name: string;
        gstin: string;
    };
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
    paymentStatus?: string
    updatedAt?: Date;
    type?: string;
    isLead?: boolean;
}

const formatDate = (date: Date): string => {
    if (!date) return 'N/A';
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    });
};

const formatAmount = (amount: number) => {
    return Number(amount || 0).toLocaleString('en-IN');
};

export const useOrdersData = (
    companyId?: string,
    startDate?: Date | null,
    endDate?: Date | null
) => {
    const [Orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const ordersQuery = useMemo(() => {
        if (!companyId) return null;

        const ordersRef = collection(db, 'companies', companyId, 'Orders');

        if (startDate && endDate) {
            return query(
                ordersRef,
                where('createdAt', '>=', Timestamp.fromDate(startDate)),
                where('createdAt', '<=', Timestamp.fromDate(endDate)),
                orderBy('createdAt', 'desc')
            );
        }

        return query(ordersRef, orderBy('createdAt'));
    }, [
        companyId,
        startDate?.getTime(),
        endDate?.getTime()
    ]);

    useEffect(() => {
        if (!ordersQuery) {
            setOrders([]);
            setLoading(false);
            return;
        }

        setLoading(true);

        const unsubscribe = onSnapshot(
            ordersQuery,
            (snapshot) => {
                const list: Order[] = snapshot.docs.map((doc) => {
                    const data = doc.data();

                    const createdAt =
                        data.createdAt instanceof Timestamp
                            ? data.createdAt.toDate()
                            : new Date();

                    const updatedAt =
                        data.updatedAt instanceof Timestamp
                            ? data.updatedAt.toDate()
                            : createdAt;

                    return {
                        id: doc.id,
                        orderId: data.orderId || '',
                        type: data.type || "order",
                        isLead: data.isLead || false,
                        totalAmount: Number(data.totalAmount || 0),
                        paidAmount: Number(data.paidAmount || 0),
                        creditNoteAmount: Number(data.creditNoteAmount || 0),
                        refundAmount: Number(data.refundAmount || 0),
                        status: data.status || 'Upcoming',
                        paymentMethod: data.paymentMethod,
                        paymentMethods: data.paymentMethods,
                        returnHistory: Array.isArray(data.returnHistory) ? data.returnHistory : [],
                        specialInstruction: data.specialInstruction || "",
                        updatedAt,
                        userName:
                            data.userName ||
                            data.billingDetails?.name ||
                            'Anonymous',
                        userLoginPhone:
                            data.userLoginPhone ||
                            data.billingDetails?.phone ||
                            '',
                        billingDetails: data.billingDetails,
                        shippingDetails: data.shippingDetails,
                        createdAt,
                        time: formatDate(createdAt),
                        items: Array.isArray(data.items)
                            ? data.items.map((i: any) => {
                                const salesPrice = Number(i.salesPrice || 0);
                                const mrp = Number(i.mrp || 0);
                                const finalPrice =
                                    i.customPrice ??
                                    (salesPrice > 0 ? salesPrice : mrp);
                                // console.log("Item:", i.name, "MOQ :", i.moq);

                                return {
                                    id: i.id,
                                    itemId: i.itemId || i.id,
                                    name: i.name,
                                    quantity: Number(i.quantity || 0),
                                    mrp: mrp,
                                    salesPrice: salesPrice,
                                    unitPrice: finalPrice,
                                    customPrice: finalPrice,
                                    moq: Number(i.moq ?? 0),
                                    itemGroupId: i.itemGroupId || i.groupId || null,
                                    tax: Number(i.tax ?? 0),
                                    unitMultiplier: Number(i.unitMultiplier ?? i.multiplier ?? 1),
                                    unit: i.unit ?? "pcs",
                                    finalPrice: Number(i.finalPrice ?? finalPrice * Number(i.quantity || 0)),
                                    note: i.note || '',
                                    imageUrl: i.imageUrl || "",
                                    imageBase64: "",
                                };
                            })
                            : [],
                    };
                });

                setOrders(list);
                setLoading(false);
            },
            () => {
                setError('Failed to load orders');
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [ordersQuery]);

    return { Orders, loading, error };
};

const getDateRange = (
    filter: string,
    customStart?: Date | null,
    customEnd?: Date | null
) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (filter) {
        case 'today':
            return { start, end };

        case 'yesterday': {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
            return { start, end };
        }

        case 'last7': {
            // FIX HERE (7 days total including today)
            start.setDate(start.getDate() - 6);
            return { start, end };
        }

        case 'last30': {
            // Same logic (30 days total)
            start.setDate(start.getDate() - 29);
            return { start, end };
        }

        case 'custom':
            return {
                start: customStart
                    ? new Date(new Date(customStart).setHours(0, 0, 0, 0))
                    : start,
                end: customEnd
                    ? new Date(new Date(customEnd).setHours(23, 59, 59, 999))
                    : end,
            };

        default:
            return { start, end };
    }
};



export const useLiveMoqMapHook = (
    companyId: string | undefined,
    editingOrder: Order | null
): Record<string, number> => {
    const [moqMap, setMoqMap] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!companyId || !editingOrder?.items?.length) {
            setMoqMap({});
            return;
        }

        let cancelled = false;

        const fetchMoqs = async () => {
            const entries: [string, number][] = await Promise.all(
                editingOrder.items!.map(async (item): Promise<[string, number]> => {
                    const itemId = item.itemId || item.id;
                    if (!itemId) return [item.id, 0];

                    try {
                        const itemSnap = await getDoc(
                            doc(db, 'companies', companyId, 'items', itemId)
                        );

                        if (itemSnap.exists()) {
                            const data = itemSnap.data();
                            console.log(
                                `[MOQ] item "${item.name}" (${itemId}) → moq from DB: ${data.moq}`
                            );
                            return [item.id, Number(data.moq ?? 0)];
                        }
                    } catch (err) {
                        console.warn(`[MOQ] fetch failed for ${itemId}:`, err);
                    }

                    return [item.id, 0];
                })
            );

            if (!cancelled) setMoqMap(Object.fromEntries(entries));
        };

        fetchMoqs();
        return () => { cancelled = true; };
    }, [companyId, editingOrder?.id]);

    return moqMap;
};

const NOTIFICATION_SEEN_ORDERS_KEY = "seenOrderNotifications";

const OrdersPage: React.FC = () => {

    // AUDIO REF
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const seenOrdersRef = useRef<Set<string>>(
        new Set(JSON.parse(localStorage.getItem(NOTIFICATION_SEEN_ORDERS_KEY) || "[]"))
    );
    const isInitialNotificationLoadRef = useRef(true);
    const navigate = useNavigate();
    const OrderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];

    const filterRef = useRef<HTMLDivElement>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const location = useLocation();

    const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>(
        (location.state?.defaultStatus as OrderStatus) || 'Confirmed'
    );
    const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
    const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<any>(null);
    const [_billSettings, setBillSettings] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedorderId, setExpandedorderId] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
    const [selectedOrderForAction, setSelectedOrderForAction] = useState<Order | null>(null);
    const [pdfLoadingOrderId, setPdfLoadingOrderId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'billing' | 'shipping'>('billing');
    const [paymentFilter, setPaymentFilter] = useState<'paid' | 'unpaid'>('unpaid');
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [pendingAdjustment, setPendingAdjustment] = useState<{ amount: number } | null>(null);
    const [showAdjustmentPopup, setShowAdjustmentPopup] = useState(false);
    const [selectedOrderForConfirm, setSelectedOrderForConfirm] = useState<string | null>(null);
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [showQrModal, setShowQrModal] = useState<Order | null>(null);
    const [enableItemWiseDiscount, setEnableItemWiseDiscount] = useState(false);
    const [sendingPdf, setSendingPdf] = useState(false);
    const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>(() => {

        if (location.state?.startDate && location.state?.endDate) {

            const start = new Date(location.state.startDate);
            start.setHours(0, 0, 0, 0);

            const end = new Date(location.state.endDate);
            end.setHours(23, 59, 59, 999);

            return { start, end };
        }

        return {
            start: new Date(new Date().setHours(0, 0, 0, 0)),
            end: new Date(new Date().setHours(23, 59, 59, 999))
        };
    });
    const [_itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
    const [_pageIsLoading, setPageIsLoading] = useState(false);
    const dbOperations = useDatabase();
    const [_error, setError] = useState<string | null>(null);
    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [billType, setBillType] = useState<'estimate' | 'bill'>('bill');
    // const [pendingRequestCount, setPendingRequestCount] = useState(0);

    const { currentUser } = useAuth();

    // ── Subscription badge ────────────────────────────────────────────────────
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
    const [customerCredit, setCustomerCredit] = useState<number>(0);

    // Fetch customer credit when the Payment Modal opens
    useEffect(() => {
        const fetchCredit = async () => {
            if (!showPaymentModal || !currentUser?.companyId) {
                setCustomerCredit(0);
                return;
            }

            const phone = showPaymentModal.userLoginPhone || showPaymentModal.billingDetails?.phone || '';
            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

            if (normalizedPhone) {
                try {
                    const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', normalizedPhone);
                    const snap = await getDoc(customerRef);
                    if (snap.exists()) {
                        setCustomerCredit(Number(snap.data().creditBalance || 0));
                    }
                } catch (err) {
                    console.error("Error fetching credit balance:", err);
                }
            }
        };

        fetchCredit();
    }, [showPaymentModal, currentUser?.companyId]);

    useEffect(() => {
        const fetchExpiry = async () => {
            if (!currentUser?.companyId) return;
            const ref = doc(db, 'companies', currentUser.companyId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const expiry = snap.data().expiryDate;
                if (!expiry) return;
                const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
                setDaysRemaining(Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
            }
        };
        fetchExpiry();
    }, [currentUser?.companyId]);

    const showBadge = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
    const isUrgent = daysRemaining !== null && daysRemaining <= 2;

    const liveMoqMap = useLiveMoqMapHook(currentUser?.companyId, editingOrder);
    const { Orders, loading: dataLoading, error } = useOrdersData(
        currentUser?.companyId,
        dateRange.start,
        dateRange.end
    );

    useEffect(() => {
        if (isInitialNotificationLoadRef.current) {
            Orders.forEach(order => {
                seenOrdersRef.current.add(order.id);
            });
            localStorage.setItem(
                NOTIFICATION_SEEN_ORDERS_KEY,
                JSON.stringify(Array.from(seenOrdersRef.current))
            );
            isInitialNotificationLoadRef.current = false;
            return;
        }

        let updated = false;

        Orders.forEach(order => {
            const isNewOrder = !seenOrdersRef.current.has(order.id);
            const isActiveOrder = order.status !== 'Cancelled';

            // Trigger once when a new active order first appears.
            if (isNewOrder && isActiveOrder) {
                const audio = audioRef.current;
                if (audio) {
                    audio.currentTime = 0;
                    audio.play().catch((err) => {
                        console.error(err);
                    });
                }

                window.dispatchEvent(
                    new CustomEvent('pdc_notification', {
                        detail: {
                            type: 'NEW_ORDER',
                            invoiceNumber: order.orderId,
                            partyName: order.userName || order.billingDetails?.name || 'Customer',
                            amount: Number(order.totalAmount || 0),
                            status: 'UPCOMING',
                            // ❌ REMOVE THIS:
                            // createdAt: new Date().toISOString(), 

                            // ✅ ADD THIS:
                            createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
                        },
                    })
                );

                // mark as seen
                seenOrdersRef.current.add(order.id);
                updated = true;
            }
        });

        //  localStorage update 
        if (updated) {
            localStorage.setItem(
                NOTIFICATION_SEEN_ORDERS_KEY,
                JSON.stringify(Array.from(seenOrdersRef.current))
            );
        }
    }, [Orders]);

    const dateFilters = [
        { label: 'Today', value: 'today' },
        { label: 'Yesterday', value: 'yesterday' },
        { label: 'Last 7 Days', value: 'last7' },
        { label: 'Last 30 Days', value: 'last30' },
        { label: 'Custom Range', value: 'custom' },
    ];

    const handleDateFilterSelect = (value: string) => {
        setActiveDateFilter(value);
        if (value !== 'custom') {
            const range = getDateRange(value);
            setDateRange(range);
            setIsFilterOpen(false);
        }
    };

    const handleApplyCustomDate = () => {
        if (customDateRange.start && customDateRange.end) {
            setDateRange({
                start: new Date(customDateRange.start),
                end: new Date(new Date(customDateRange.end).setHours(23, 59, 59))
            });
            setIsFilterOpen(false);
        }
    };


    const getDateDisplay = useMemo(() => {

        if (!dateRange.start || !dateRange.end) return '';

        const format = (d: Date) =>
            d.toLocaleDateString('en-GB');

        if (dateRange.start.toDateString() === dateRange.end.toDateString()) {
            return format(dateRange.start);
        }

        return `${format(dateRange.start)} to ${format(dateRange.end)}`;

    }, [dateRange]);

    useEffect(() => {
        if (location.state?.defaultStatus) {
            setActiveStatusTab(location.state.defaultStatus);
        }
    }, [location.state]);

    const calculatedEditTotal = useMemo(() => {
        if (!editingOrder?.items) return 0;

        return editingOrder.items.reduce((sum, item) => {
            const salesPrice = Number(item.salesPrice || 0);
            const mrp = Number(item.mrp || 0);

            const price =
                item.customPrice ??
                (salesPrice > 0 ? salesPrice : mrp);

            return sum + price * Number(item.quantity || 0);
        }, 0);
    }, [editingOrder?.items]);

    const handleNetPriceChange = (id: string, value: string) => {
        if (!editingOrder) return;

        const newNetPrice = Number(value) || 0;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const mrp = Number(item.mrp || 0);

            let discount = 0;
            if (mrp > 0) {
                discount = ((mrp - newNetPrice) / mrp) * 100;
            }

            return {
                ...item,
                customPrice: Number(newNetPrice.toFixed(2)),
                discount: Number(discount.toFixed(2)),
            };
        });

        setEditingOrder({
            ...editingOrder,
            items: updatedItems,
        });
    };

    const mappedOrderItems = (editingOrder?.items || []).map((item) => {
        const mrp = Number(item.mrp || 0);
        const salePrice = Number(item.salesPrice || 0);
        let discount = Number(item.discount || 0);
        let netPrice = Number(item.customPrice ?? 0);

        const liveMoq = liveMoqMap[item.id] ?? Number(item.moq ?? 0);

        if (netPrice > 0) {
            discount = mrp > 0 ? ((mrp - netPrice) / mrp) * 100 : 0;
        } else if (salePrice > 0 && discount === 0) {
            netPrice = salePrice;
            discount = mrp > 0 ? ((mrp - salePrice) / mrp) * 100 : 0;
        } else if (discount > 0 && mrp > 0) {
            netPrice = mrp * (1 - discount / 100);
        } else {
            netPrice = salePrice > 0 ? salePrice : mrp;
        }

        return {
            ...item,
            productId: item.itemId || item.id,
            isEditable: true,
            discount: Number(discount.toFixed(2)),
            customPrice: Number(netPrice.toFixed(2)),
            unitMultiplier: Number(item.unitMultiplier || 1),
            moq: liveMoq,
        };
    });

    const handleQuantityChange = (id: string, newQuantity: number) => {
        if (!editingOrder) return;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const moq = Number(item.moq ?? 0);
            const minQty = moq > 0 ? moq : 1;

            let qty = Number(newQuantity);

            if (isNaN(qty) || qty < minQty) qty = minQty;

            return {
                ...item,
                quantity: qty,
            };
        });

        setEditingOrder({
            ...editingOrder,
            items: updatedItems || [],
        });
    };

    const handleDiscountChange = (id: string, value: number | string) => {
        if (!editingOrder) return;

        const discountValue =
            typeof value === "string" ? parseFloat(value) || 0 : value;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const mrp = Number(item.mrp || 0);
            const netPrice = mrp * (1 - discountValue / 100);

            return {
                ...item,
                discount: Number(discountValue.toFixed(2)),
                customPrice: Number(netPrice.toFixed(2)),
            };
        });

        setEditingOrder({
            ...editingOrder,
            items: updatedItems,
        });
    };
    const handleDeleteItem = (id: string) => {
        if (!editingOrder) return;

        const updatedItems = editingOrder.items?.filter(
            (item) => item.id !== id
        );

        setEditingOrder({
            ...editingOrder,
            items: updatedItems,
        });
    };

    // useEffect(() => {
    //     if (!editingOrder || !currentUser?.companyId) return;

    //     setEditingOrder(prev =>
    //         prev ? { ...prev, totalAmount: calculatedEditTotal } : prev
    //     );
    // }, [calculatedEditTotal]);

    useEffect(() => {
        const fetchCompanyInfo = async () => {
            if (currentUser?.companyId) {
                const companyRef = doc(db, 'companies', currentUser.companyId);
                const companySnap = await getDoc(companyRef);
                if (companySnap.exists()) {
                    setCompanyInfo(companySnap.data());
                }
            }
        };
        fetchCompanyInfo();
    }, [currentUser]);

    useEffect(() => {
        const fetchBillSettings = async () => {
            if (!currentUser?.companyId) return;

            try {
                const ref = doc(
                    db,
                    'companies',
                    currentUser.companyId,
                    'settings',
                    'bill'
                );

                const snap = await getDoc(ref);

                if (snap.exists()) {
                    setBillSettings(snap.data());
                } else {
                    setBillSettings({});
                }
            } catch (err) {
                console.error("Bill settings fetch error:", err);
                setBillSettings({});
            }
        };

        fetchBillSettings();
    }, [currentUser?.companyId]);

    useEffect(() => {
        const fetchSalesSettings = async () => {
            if (!currentUser?.companyId) return;

            try {
                const settingsRef = doc(
                    db,
                    "companies",
                    currentUser.companyId,
                    "settings",
                    "catalogue-sales-settings"
                );

                const snap = await getDoc(settingsRef);

                if (snap.exists()) {
                    const data = snap.data();
                    setEnableItemWiseDiscount(
                        data.enableItemWiseDiscount ?? false
                    );
                }
            } catch (error) {
                console.error("Error fetching sales settings:", error);
            }
        };

        fetchSalesSettings();
    }, [currentUser?.companyId]);

    useEffect(() => {
        const fetchData = async () => {
            if (!dbOperations || !currentUser?.companyId) return;
            try {
                setPageIsLoading(true);
                // Sales.tsx wala fast sync logic
                const fetchedItems = await dbOperations.syncItems();
                setAvailableItems(fetchedItems);

                // Item Groups (Categories) fetch logic
                const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
                const groupsSnap = await getDocs(groupsRef);
                const groupMap: Record<string, string> = {};
                groupsSnap.docs.forEach(doc => {
                    const data = doc.data();
                    groupMap[doc.id] = data.name || data.groupName || 'Unknown Group';
                });
                setItemGroupMap(groupMap);
            } catch (err) {
                console.error("Fetch Error:", err);
                setError('Failed to sync data.');
            } finally {
                setPageIsLoading(false);
            }
        };
        fetchData();
    }, [dbOperations, currentUser?.companyId]);

    // useEffect(() => {
    //     if (!currentUser?.companyId) return;

    //     const fetchPendingRequests = async () => {
    //         try {
    //             const snap = await getDocs(
    //                 collection(db, "companies", currentUser.companyId, "AuthorizedUser")
    //             );

    //             // const pending = snap.docs.filter(
    //             //     (d: any) => d.data()?.status === "pending"
    //             // ).length;

    //             // setPendingRequestCount(pending);
    //         } catch (err) {
    //             console.error("Pending request fetch error:", err);
    //         }
    //     };

    //     fetchPendingRequests();
    // }, [currentUser?.companyId]);

    const handlePdfAction = async (Order: Order, action: ACTION) => {
        console.log("FULL ORDER:", Order);
        setPdfLoadingOrderId(Order.id);

        try {
            const functions = getFunctions(app);
            // Call our new data-gathering cloud function
            const fetchInvoiceCall = httpsCallable(functions, 'fetchInvoiceData');

            // 1. Get the safe data (with CORS-free images) from the server
            const result = await fetchInvoiceCall({
                companyId: currentUser?.companyId,
                orderId: Order.id
            });

            const responseData = result.data as any;

            if (!responseData.success) {
                throw new Error("Failed to fetch order data from server");
            }

            const safeOrderData = responseData.orderData;

            // 2. Construct the raw bill data using the safe server data
            const rawBillData = {
                companyId: currentUser?.companyId,

                companyName: companyInfo?.name || "",
                companyAddress: companyInfo?.address || "",
                companyPhone: companyInfo?.ownerPhoneNumber || "",
                specialInstruction: safeOrderData.specialInstruction || Order.specialInstruction || "",

                customer: {
                    billing: {
                        name: safeOrderData.billingDetails?.name || Order.billingDetails?.name || safeOrderData.userName || Order.userName || "Customer",
                        phone: safeOrderData.billingDetails?.phone || Order.billingDetails?.phone || "",
                        address: safeOrderData.billingDetails?.address || Order.billingDetails?.address || "",
                        gstin: safeOrderData.billingDetails?.gstin || Order.billingDetails?.gstin || "",
                    },
                    shipping: {
                        name: safeOrderData.shippingDetails?.name || Order.shippingDetails?.name || safeOrderData.billingDetails?.name || "",
                        phone: safeOrderData.shippingDetails?.phone || Order.shippingDetails?.phone || "",
                        address: safeOrderData.shippingDetails?.address || Order.shippingDetails?.address || "",
                        gstin: safeOrderData.shippingDetails?.gstin || Order.shippingDetails?.gstin || ""
                    }
                },

                order: {
                    orderId: safeOrderData.orderId || Order.orderId,
                    date: Order.time, // Using your formatted time from the frontend
                },

                // The items now have the imageBase64 safely attached by the server!
                items: (safeOrderData.items || []).map((item: any, index: number) => {
                    const mrp = item.mrp || 0;
                    const salePrice = item.salesPrice || item.mrp || 0;

                    return {
                        sno: index + 1,
                        name: item.name,
                        qty: item.quantity,
                        unitMultiplier: item.unitMultiplier ?? 1,
                        tax: item.tax ?? 0,
                        mrp: mrp,
                        price: salePrice,
                        total: salePrice * item.quantity,
                        imageBase64: item.imageBase64 || "", // The golden ticket!
                    };
                }),

                grandTotal: safeOrderData.totalAmount || Order.totalAmount,
                paidAmount: Number(safeOrderData.paidAmount ?? Order.paidAmount ?? 0),
                dueAmount: Math.max(
                    0,
                    (safeOrderData.totalAmount || Order.totalAmount) -
                    Number(safeOrderData.paidAmount ?? Order.paidAmount ?? 0)
                ),
            };

            let preparedData;

            // 3. Prepare the settings (using your existing frontend function)
            if (billType === 'estimate') {
                preparedData = await prepareCatalogueBillData({
                    ...rawBillData,
                    isEstimate: true
                });
            } else {
                preparedData = await prepareCatalogueBillData({
                    ...rawBillData,
                    isEstimate: false
                });
            }

            // 4. Generate the PDF purely on the frontend!
            if (action === ACTION.PRINT) {
                await CatalogueBill(preparedData, "print");
            }

            if (action === ACTION.DOWNLOAD) {
                await CatalogueBill(preparedData, "download");
            }

        } catch (err) {
            console.error("Catalogue bill error:", err);
            setModal({
                message: "Bill generation failed. Check console.",
                type: State.ERROR,
            });
        } finally {
            // spinner stop
            setPdfLoadingOrderId(null);
        }
    };

    const handleSendWhatsapp = async (Order: Order) => {
        const phone = Order.userLoginPhone || Order.billingDetails?.phone || '';
        const name = Order.userName || Order.billingDetails?.name || 'Customer';

        if (!phone) {
            setModal({ message: "Customer phone number is missing.", type: State.ERROR });
            return;
        }

        setSendingPdf(true);

        try {
            if (!currentUser?.companyId) throw new Error("User context missing.");

            // 1. Check if user has an active WhatsApp Plan
            const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
            const businessSnap = await getDoc(businessDocRef);
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingPdf(false);
                setSelectedOrderForAction(null);
                navigate(ROUTES.WHATSAPP_PLAN || '/whatsapp-plans');
                return;
            }

            // 2. Fetch Safe Data from Cloud Function (Same as handlePdfAction)
            const functions = getFunctions(app);
            const fetchInvoiceCall = httpsCallable(functions, 'fetchInvoiceData');

            const result = await fetchInvoiceCall({
                companyId: currentUser.companyId,
                orderId: Order.id
            });

            const responseData = result.data as any;
            if (!responseData.success) {
                throw new Error("Failed to fetch order data from server");
            }

            const safeOrderData = responseData.orderData;

            // 3. Construct Raw Bill Data
            const rawBillData = {
                companyId: currentUser?.companyId,
                companyName: companyInfo?.name || "",
                companyAddress: companyInfo?.address || "",
                companyPhone: companyInfo?.ownerPhoneNumber || "",
                specialInstruction: safeOrderData.specialInstruction || Order.specialInstruction || "",
                customer: {
                    billing: {
                        name: safeOrderData.billingDetails?.name || Order.billingDetails?.name || safeOrderData.userName || Order.userName || "Customer",
                        phone: safeOrderData.billingDetails?.phone || Order.billingDetails?.phone || "",
                        address: safeOrderData.billingDetails?.address || Order.billingDetails?.address || "",
                        gstin: safeOrderData.billingDetails?.gstin || Order.billingDetails?.gstin || "",
                    },
                    shipping: {
                        name: safeOrderData.shippingDetails?.name || Order.shippingDetails?.name || safeOrderData.billingDetails?.name || "",
                        phone: safeOrderData.shippingDetails?.phone || Order.shippingDetails?.phone || "",
                        address: safeOrderData.shippingDetails?.address || Order.shippingDetails?.address || "",
                        gstin: safeOrderData.shippingDetails?.gstin || Order.shippingDetails?.gstin || ""
                    }
                },
                order: {
                    orderId: safeOrderData.orderId || Order.orderId,
                    date: Order.time,
                },
                items: (safeOrderData.items || []).map((item: any, index: number) => {
                    const mrp = item.mrp || 0;
                    const salePrice = item.salesPrice || item.mrp || 0;
                    return {
                        sno: index + 1,
                        name: item.name,
                        qty: item.quantity,
                        unitMultiplier: item.unitMultiplier ?? 1,
                        tax: item.tax ?? 0,
                        mrp: mrp,
                        price: salePrice,
                        total: salePrice * item.quantity,
                        imageBase64: item.imageBase64 || "",
                    };
                }),
                grandTotal: safeOrderData.totalAmount || Order.totalAmount,
                paidAmount: Number(safeOrderData.paidAmount ?? Order.paidAmount ?? 0),
                dueAmount: Math.max(0, (safeOrderData.totalAmount || Order.totalAmount) - Number(safeOrderData.paidAmount ?? Order.paidAmount ?? 0)),
            };

            const preparedData = await prepareCatalogueBillData({
                ...rawBillData,
                isEstimate: billType === 'estimate'
            });

            // 4. Generate Blob (Make sure CatalogueBill supports "blob" or use your generic pdf generator here)
            const pdfBlob = await CatalogueBill(preparedData, "blob");
            if (!pdfBlob) throw new Error("Failed to generate PDF Blob.");

            // 5. Upload to Firebase Storage
            const safeNum = (safeOrderData.orderId || Order.orderId).replace(/[\/\\?%*:|"<>]/g, '-');
            const cleanName = `${safeNum}.pdf`;
            const storageRef = ref(storage, cleanName);
            await uploadBytes(storageRef, pdfBlob);

            const fileUrl = await getDownloadURL(storageRef);

            // 6. Send via BotMaster
            const amount = safeOrderData.totalAmount || Order.totalAmount;
            const message = `Hello ${name},\n\nHere is your order bill #${safeOrderData.orderId || Order.orderId}.\nAmount: ${Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!`;

            const response = await botMasterService.sendPdfFromUrl(
                botMasterToken,
                whatsappNumber,
                phone,
                message,
                fileUrl,
                cleanName
            );

            // 7. Cleanup & Verify
            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                const res = response[0];
                if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
            } else if (response.status === 'sent' || response.status === 'success' || response.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                setModal({ message: "Invoice sent! Cleaning up...", type: State.SUCCESS });
                setTimeout(async () => {
                    try { await deleteObject(storageRef); } catch (error) { console.warn("Auto-delete failed:", error); }
                }, 60000); // 1 minute cleanup
            } else {
                throw new Error("API reported failure.");
            }

        } catch (err) {
            console.error("WhatsApp Send Error:", err);
            setModal({ message: "Failed to send WhatsApp invoice.", type: State.ERROR });
        } finally {
            setSendingPdf(false);
            setSelectedOrderForAction(null); // Close the modal
        }
    };

    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
        if (!selectedItemForEdit || !editingOrder) return;

        const updatePayload: any = { ...updatedItemData };

        // Stock fix
        if (updatePayload.Stock !== undefined) {
            updatePayload.stock = updatePayload.Stock;
            delete updatePayload.Stock;
        }

        Object.keys(updatePayload).forEach(key => {
            if (updatePayload[key] === undefined) delete updatePayload[key];
        });

        const updatedItems = (editingOrder.items || []).map(item => {
            if (String(item.id) === String(selectedItemForEdit.id)) {
                return { ...item, ...updatePayload };
            }
            return item;
        });

        const newTotal = updatedItems.reduce((sum, i) => {
            const salesPrice = Number(i.salesPrice || 0);
            const mrp = Number(i.mrp || 0);

            const price =
                i.customPrice ??
                (salesPrice > 0 ? salesPrice : mrp);

            return sum + price * Number(i.quantity || 0);
        }, 0);

        setEditingOrder(prev => prev ? {
            ...prev,
            items: updatedItems,
            totalAmount: newTotal
        } : prev);

        if (currentUser?.companyId) {
            const orderRef = doc(
                db,
                "companies",
                currentUser.companyId,
                "Orders",
                editingOrder.id
            );

            updateDoc(orderRef, {
                items: updatedItems,
                totalAmount: newTotal,
                updatedAt: serverTimestamp()
            });
        }

        setIsEditDrawerOpen(false);
        setSelectedItemForEdit(null);
    };



    const statusCounts = useMemo(() => {
        return OrderStatuses.reduce((acc, status) => {

            //  Completed = Completed + Paid
            if (status === "Completed") {
                acc[status] = Orders.filter(
                    o => o.status === "Completed" || o.status === "Paid"
                ).length;
            } else {
                acc[status] = Orders.filter(
                    o => o.status === status
                ).length;
            }

            return acc;
        }, {} as Record<string, number>);
    }, [Orders, OrderStatuses]);

    useEffect(() => {
        let unsubscribeItems: () => void;
        if (dbOperations) {
            unsubscribeItems = dbOperations.listenToItems((data) => {
                setAvailableItems(data);
            });
        }
        return () => {
            if (unsubscribeItems) unsubscribeItems();
        };
    }, [dbOperations]);

    // 3. Simplified Filter (No toggle dependency)
    const filteredOrders = useMemo(() => {

        let result = Orders
            .filter(order => {

                //  UPCOMING TAB
                if (activeStatusTab === "Upcoming") {
                    if (order.status === "Upcoming" && order.isLead) {
                        // lead tabhi dikhe jab items ho
                        return (order.items?.length || 0) > 0;
                    }
                    return order.status === "Upcoming";
                }

                //  COMPLETED TAB
                if (activeStatusTab === 'Completed') {
                    if (paymentFilter === 'unpaid') {
                        return order.status === 'Completed';
                    }
                    return order.status === 'Paid';
                }

                //  NORMAL TABS (Confirmed, Packed)
                return order.status === activeStatusTab;
            })

            .filter(order => {
                const q = searchQuery.toLowerCase();
                return (
                    order.orderId?.toLowerCase().includes(q) ||
                    order.userName?.toLowerCase().includes(q)
                );
            });

        //  Paid tab me latest order upar
        if (activeStatusTab === 'Completed' && paymentFilter === 'paid') {
            result = result.sort((a, b) => {
                const aTime = a.updatedAt
                    ? new Date(a.updatedAt).getTime()
                    : new Date(a.createdAt).getTime();

                const bTime = b.updatedAt
                    ? new Date(b.updatedAt).getTime()
                    : new Date(b.createdAt).getTime();

                return bTime - aTime;
            });
        }

        return result;

    }, [Orders, activeStatusTab, paymentFilter, searchQuery]);

    const handleOrderClick = (uiKey: string) => {
        setExpandedorderId(prevId => (prevId === uiKey ? null : uiKey));
    };

    const handleDeleteOrder = async (orderId: string) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this entire Order?"
        );
        if (!confirmDelete || !currentUser?.companyId) return;

        try {
            const companyId = currentUser.companyId;

            const orderRef = doc(db, "companies", companyId, "Orders", orderId);
            const orderSnap = await getDoc(orderRef);

            if (!orderSnap.exists()) {
                throw new Error("Order not found");
            }

            const orderData = orderSnap.data();
            const items = orderData.items || [];

            console.log("🧾 Restoring stock for items:", items);

            // Restore stock
            for (const item of items) {
                const itemId = item.itemId || item.id;
                if (!itemId) {
                    console.warn(" Missing itemId:", item);
                    continue;
                }

                const itemRef = doc(
                    db,
                    "companies",
                    companyId,
                    "items",
                    itemId
                );

                const itemSnap = await getDoc(itemRef);

                if (!itemSnap.exists()) {
                    console.warn("Item not found:", itemId);
                    continue;
                }

                const currentStock = Number(itemSnap.data().stock || 0);
                const restoreQty =
                    Number(item.quantity || 0);

                console.log(
                    `🔄 Restoring Stock → ${itemId}: ${currentStock} + ${restoreQty}`
                );

                await updateDoc(itemRef, {
                    stock: currentStock + restoreQty,
                });
            }

            // Delete order
            await deleteDoc(orderRef);

            setModal({
                message: "Order deleted successfully",
                type: State.SUCCESS,
            });
        } catch (error) {
            console.error("Delete Order Error:", error);
            setModal({
                message: "Failed to delete order",
                type: State.ERROR,
            });
        }
    };

    const handleUpdateStatus = async (
        orderId: string,
        currentStatus: OrderStatus,
        manualNextStatus?: OrderStatus
    ) => {
        if (currentStatus === 'Packed' && !manualNextStatus) {
            setSelectedOrderForConfirm(orderId);
            return;
        }
        setIsUpdatingStatus(orderId);

        try {
            if (!currentUser?.companyId) return;

            const OrderRef = doc(
                db,
                "companies",
                currentUser.companyId,
                "Orders",
                orderId
            );

            // Fetch the latest order data to make smart status decisions
            const orderSnap = await getDoc(OrderRef);
            if (!orderSnap.exists()) return;
            const orderData = orderSnap.data();

            const nextStatusMap: Record<OrderStatus, OrderStatus> = {
                Upcoming: "Confirmed",
                Confirmed: "Packed",
                Packed: "Completed",
                Completed: "Completed",
                Paid: "Paid",
                Cancelled: 'Cancelled',
            };

            let nextStatus = manualNextStatus || nextStatusMap[currentStatus];

            // --- THE FIX ---
            // If moving out of Packed, check if it's already fully paid via Advance
            if (currentStatus === "Packed" && nextStatus === "Completed") {
                const total = Number(orderData.totalAmount || 0);
                const paid = Number(orderData.paidAmount || 0);

                // If Due is 0 (using <= 0.1 to prevent JS decimal bugs), skip Unpaid and go to Paid
                if ((total - paid) <= 0.1) {
                    nextStatus = "Paid";
                }
            }

            //  STOCK DECREASE WHEN CONFIRMED
            if (nextStatus === "Confirmed") {
                const orderSnap = await getDoc(OrderRef);
                const orderData = orderSnap.data();
                const items = orderData?.items || [];

                await Promise.all(
                    items.map(async (item: any) => {
                        try {
                            const itemId = item.itemId || item.id;
                            if (!itemId) return;

                            const itemRef = doc(
                                db,
                                "companies",
                                currentUser.companyId,
                                "items",
                                itemId
                            );

                            const snap = await getDoc(itemRef);
                            if (!snap.exists()) {
                                console.log(" Item not found:", itemId);
                                return;
                            }

                            const currentStock = Number(snap.data().stock || 0);

                            const deductQty =
                                Number(item.quantity || 0) *
                                Number(item.unitMultiplier || 1);

                            console.log("STOCK DECREASE:", itemId, currentStock, "-", deductQty);

                            await updateDoc(itemRef, {
                                stock: currentStock - deductQty
                            });

                        } catch (err) {
                            console.error("Stock update failed:", err);
                        }
                    })
                );
            }

            await updateDoc(OrderRef, {
                status: nextStatus,
                isLead: false,
                updatedAt: serverTimestamp()
            });

        } catch (err) {
            console.error("Error updating status:", err);
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    const handlePreviousStatus = async (
        orderId: string,
        currentStatus: OrderStatus
    ) => {

        const prevStatusMap: Record<OrderStatus, OrderStatus> = {
            Upcoming: "Upcoming",
            Confirmed: "Confirmed",
            Packed: "Confirmed",
            Completed: "Packed",
            Paid: "Completed",
            Cancelled: 'Cancelled',
        };

        const prevStatus = prevStatusMap[currentStatus];

        if (!currentUser?.companyId) return;

        const OrderRef = doc(
            db,
            "companies",
            currentUser.companyId,
            "Orders",
            orderId
        );

        await updateDoc(OrderRef, {
            status: prevStatus,
            updatedAt: serverTimestamp()
        });
    };

    const handleSaveChanges = async () => {
        if (!editingOrder || !currentUser?.companyId) return;

        try {
            const companyId = currentUser.companyId;
            const orderRef = doc(db, 'companies', companyId, 'Orders', editingOrder.id);
            const liveOrderSnap = await getDoc(orderRef);
            const originalOrder = liveOrderSnap.exists()
                ? ({ id: editingOrder.id, ...(liveOrderSnap.data() as any) } as any)
                : Orders.find(o => o.id === editingOrder.id);

            const getItemsTotal = (items: any[] = []) =>
                items.reduce((sum, item) => {
                    const salesPrice = Number(item.salesPrice || 0);
                    const mrp = Number(item.mrp || 0);
                    const unitPrice = item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                    return sum + Number(unitPrice || 0) * Number(item.quantity || 0);
                }, 0);

            // Compare item-based totals so increase/decrease detection is always correct,
            // even if stored totalAmount was stale.
            const originalTotal = Number(getItemsTotal(originalOrder?.items || []));
            const newTotal = Number(getItemsTotal(editingOrder.items || []));
            const netDiff = newTotal - originalTotal;

            // ── Stock delta calculation (same logic as EditOrderModal) ──────────
            const oldQuantities = new Map<string, number>();
            (originalOrder?.items || []).forEach((oldItem: any) => {
                const pid = oldItem.itemId || oldItem.id;
                const qty = Number(oldItem.quantity || 0) * Number(oldItem.unitMultiplier || 1);
                oldQuantities.set(pid, (oldQuantities.get(pid) || 0) + qty);
            });

            const newQuantities = new Map<string, number>();
            (editingOrder.items || []).forEach((item: any) => {
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    newQuantities.set(pid, (newQuantities.get(pid) || 0) + qty);
                }
            });

            const allPids = new Set([...oldQuantities.keys(), ...newQuantities.keys()]);

            // ── Helper: build the Firestore update payload ──────────────────────
            const buildUpdatePayload = (extraFields: Record<string, any> = {}) => ({
                items: editingOrder.items,
                totalAmount: newTotal,
                billingDetails: editingOrder.billingDetails,
                shippingDetails: editingOrder.shippingDetails,
                userName: editingOrder.billingDetails?.name,
                userLoginPhone: editingOrder.billingDetails?.phone,
                updatedAt: serverTimestamp(),
                ...extraFields,
            });

            // ── Helper: resolve status after amount change ──────────────────────
            // Replace your existing resolveStatus inside handleSaveChanges with this:
            const resolveStatus = (total: number, paid: number) => {
                const liveStatus = originalOrder?.status || editingOrder.status;

                // RULE 1: Never auto-move from Confirmed or Packed on edit.
                if (liveStatus !== 'Completed' && liveStatus !== 'Paid') {
                    return liveStatus;
                }

                // RULE 2: Auto-move ONLY between Completed (Unpaid) and Paid
                const effectiveDue = total - paid;
                if (effectiveDue <= 0.1) { // 0.1 handles JavaScript float precision bugs
                    return 'Paid';
                } else {
                    return 'Completed';
                }
            };

            // ── Stock updates (runs for all cases) ─────────────────────────────
            const stockUpdatePromises: Promise<void>[] = [];
            allPids.forEach(pid => {
                const diff = (newQuantities.get(pid) || 0) - (oldQuantities.get(pid) || 0);
                if (diff !== 0) {
                    const itemRef = doc(db, 'companies', companyId, 'items', pid);
                    stockUpdatePromises.push(
                        updateDoc(itemRef, {
                            stock: firebaseIncrement(-diff), // sold more → stock decreases
                            updatedAt: serverTimestamp(),
                        })
                    );
                }
            });

            // CASE 1: Amount reduced -> check due before offering refund (stock still updates)
            const originalPaid = Number(originalOrder?.paidAmount || 0);
            const originalDue = Math.max(0, originalTotal - originalPaid);
            const priceReduction = Math.abs(netDiff);
            if (netDiff < 0) {

                if (priceReduction <= originalDue) {
                    // CASE 1A: The reduction just eats into the unpaid Due. 
                    // No refund/credit note needed. Just save the new total.
                    await Promise.all([
                        ...stockUpdatePromises,
                        updateDoc(orderRef, buildUpdatePayload({
                            status: resolveStatus(newTotal, originalPaid)
                        })),
                    ]);
                    setEditingOrder(null);
                    setModal({ message: 'Due reduced successfully.', type: State.SUCCESS });
                    return;
                } else {
                    // CASE 1B: The reduction wipes out the Due and digs into the Paid amount.
                    // We ONLY refund the leftover difference.
                    const refundableAmount = priceReduction - originalDue;
                    await Promise.all(stockUpdatePromises);

                    setPendingAdjustment({ amount: refundableAmount });
                    setShowAdjustmentPopup(true);
                    return;
                }
            }

            // CASE 2: Amount increased
            if (netDiff > 0) {
                await Promise.all([
                    ...stockUpdatePromises,
                    updateDoc(orderRef, buildUpdatePayload({
                        status: resolveStatus(newTotal, originalPaid), // <--- FIXED
                        extraDueAmount: netDiff,
                    })),
                ]);
                setEditingOrder(null);
                setModal({ message: `Due Increased: ₹${netDiff.toFixed(2)}`, type: State.SUCCESS });
                return;
            }

            // CASE 3: No amount change (items/qty may still have changed)
            await Promise.all([
                ...stockUpdatePromises,
                updateDoc(orderRef, buildUpdatePayload({
                    status: resolveStatus(newTotal, originalPaid) // <--- FIXED
                })),
            ]);
            setEditingOrder(null);

        } catch (error) {
            console.error('Save error:', error);
            setModal({ message: 'Failed to save changes.', type: State.ERROR });
        }
    };

    // {
    //     isGeneratingPdf && (
    //         <div className="fixed inset-0 z-[5000] bg-black/40 flex items-center justify-center">
    //             <div className="bg-white px-6 py-4 rounded-sm shadow-lg flex items-center gap-3">
    //                 <Spinner />
    //                 <span className="text-sm font-bold text-slate-700">
    //                     Generating PDF...
    //                 </span>
    //             </div>
    //         </div>
    //     )
    // }
    // --- Adjustment Handlers ---
    const handleCreditNote = async () => {
        if (!editingOrder || !currentUser?.companyId || !pendingAdjustment) return;

        const liveOrder = Orders.find(o => o.id === editingOrder.id);
        const totalAmt = Number(
            (editingOrder.items || []).reduce((sum, item) => {
                const salesPrice = Number(item.salesPrice || 0);
                const mrp = Number(item.mrp || 0);
                const unitPrice = item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                return sum + Number(unitPrice || 0) * Number(item.quantity || 0);
            }, 0)
        );
        const paidAmt = Number(liveOrder?.paidAmount || 0);
        const updatedPaidAmt = Math.max(0, paidAmt - pendingAdjustment.amount);
        const effectiveDue = Math.max(0, totalAmt - updatedPaidAmt);

        // --- SMART STATUS LOGIC ---
        const liveStatus = liveOrder?.status || editingOrder.status;
        let updatedStatus = liveStatus;

        // Only alter the status if it's already in the final stages
        if (liveStatus === 'Completed' || liveStatus === 'Paid') {
            updatedStatus = effectiveDue > 0.1 ? 'Completed' : 'Paid';
        }
        // --------------------------

        await updateDoc(
            doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id),
            {
                items: editingOrder.items,
                totalAmount: totalAmt,
                paidAmount: updatedPaidAmt,
                status: updatedStatus, // Uses the smart status
                billingDetails: editingOrder.billingDetails,
                shippingDetails: editingOrder.shippingDetails,
                creditNoteAmount: firebaseIncrement(pendingAdjustment.amount),
                updatedAt: serverTimestamp(),
            }
        );

        // Credit balance update (your existing customer code stays the same)
        try {
            const normalizePhone = (num: string) => num.replace(/\D/g, '').slice(-10);
            const rawNumber = editingOrder.userLoginPhone || editingOrder.billingDetails?.phone || '';
            const customerIdentifier = normalizePhone(rawNumber);
            if (customerIdentifier) {
                const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', customerIdentifier);
                const customerName = editingOrder.userName || editingOrder.billingDetails?.name || '';
                await setDoc(customerRef, {
                    number: customerIdentifier,
                    name: customerName,
                    creditBalance: firebaseIncrement(pendingAdjustment.amount),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
        } catch (err) {
            console.error("Failed to update customer credit balance:", err);
        }

        setShowAdjustmentPopup(false);
        setPendingAdjustment(null);
        setEditingOrder(null);
        setModal({ message: `Credit Note: ₹${pendingAdjustment.amount.toFixed(2)} added`, type: State.SUCCESS });
    };
    const handleRefund = async () => {
        if (!editingOrder || !currentUser?.companyId || !pendingAdjustment) return;

        const liveOrder = Orders.find(o => o.id === editingOrder.id);
        const totalAmt = Number(
            (editingOrder.items || []).reduce((sum, item) => {
                const salesPrice = Number(item.salesPrice || 0);
                const mrp = Number(item.mrp || 0);
                const unitPrice = item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                return sum + Number(unitPrice || 0) * Number(item.quantity || 0);
            }, 0)
        );
        const paidAmt = Number(liveOrder?.paidAmount || 0);
        const updatedPaidAmt = Math.max(0, paidAmt - pendingAdjustment.amount);
        const effectiveDue = Math.max(0, totalAmt - updatedPaidAmt);

        // --- SMART STATUS LOGIC ---
        const liveStatus = liveOrder?.status || editingOrder.status;
        let updatedStatus = liveStatus;

        // Only alter the status if it's already in the final stages
        if (liveStatus === 'Completed' || liveStatus === 'Paid') {
            updatedStatus = effectiveDue > 0.1 ? 'Completed' : 'Paid';
        }
        // --------------------------

        await updateDoc(
            doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id),
            {
                items: editingOrder.items,
                totalAmount: totalAmt,
                paidAmount: updatedPaidAmt,
                status: updatedStatus, // Uses the smart status
                billingDetails: editingOrder.billingDetails,
                shippingDetails: editingOrder.shippingDetails,
                refundAmount: firebaseIncrement(pendingAdjustment.amount),
                updatedAt: serverTimestamp(),
            }
        );

        setShowAdjustmentPopup(false);
        setPendingAdjustment(null);
        setEditingOrder(null);
        setModal({ message: `Refund: ₹${pendingAdjustment.amount.toFixed(2)} processed`, type: State.SUCCESS });
    };

    return (
        <div className="flex min-h-screen w-full flex-col bg-gray-100 mb-10">
            {showBadge && (
                <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm ${isUrgent ? 'bg-red-300' : 'bg-amber-200'}`}>
                    <ShinyText text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`} speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false} />
                    <Link to="/subscription" className="text-black ml-2 underline hover:text-gray-100">Renew Now</Link>
                </div>
            )}
            {modal && <Modal message={modal.message} type={modal.type} onClose={() => setModal(null)} />}

            {/* --- 5. UPDATED HEADER (No Toggle) --- */}
            <div className="bg-white shadow-sm sticky top-0 z-[100] px-4 py-2">
                {/* Main Header Row */}
                <div className="flex items-center justify-between">
                    {/* Left: Search Icon */}
                    <div className="w-10">
                        <button onClick={() => setShowSearch(!showSearch)} className="text-slate-500">
                            {showSearch ? <FiX className="w-6 h-6" /> : <FiSearch className="w-6 h-6" />}
                        </button>
                    </div>

                    {/* Center: Title & Search Input */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                        {showSearch ? (
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full max-w-[200px] text-center text-sm font-light p-1 border-b border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        ) : (
                            <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
                        )}

                        {/* Date Filter - Just below Header */}
                        <div className="mt-0.5">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                {getDateDisplay}
                            </span>
                        </div>
                    </div>

                    {/* Right: Notification Bell + Filter Icon */}
                    <div className="w-24 flex justify-end items-center gap-2">
                        <div className="border border-slate-300 rounded-sm p-2 bg-gray-100 shadow-sm flex items-center justify-center">
                            <NotificationBell />
                        </div>
                        {/* //<CataShowWrapper permission={Cata_Permissions.ViewFilterbutton}> */}
                        <div className="relative" ref={filterRef}>
                            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                                <IconFilter />
                            </button>

                            {isFilterOpen && (
                                <div className="absolute top-full right-0 mt-3 w-64 bg-white rounded-sm shadow-lg z-[1000] border p-3">
                                    <ul className="py-1 border-b mb-2">
                                        {dateFilters.map((filter) => (
                                            <li key={filter.value}>
                                                <button onClick={() => handleDateFilterSelect(filter.value)} className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === filter.value ? 'bg-orange-50 text-orange-600 font-bold' : 'text-slate-700'} hover:bg-slate-50`}>{filter.label}</button>
                                            </li>
                                        ))}
                                    </ul>
                                    {activeDateFilter === 'custom' && (
                                        <div className="space-y-2 mt-2">
                                            <input type="date" className="text-xs p-1.5 border rounded w-full" onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })} />
                                            <input type="date" className="text-xs p-1.5 border rounded w-full" onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })} />
                                            <button onClick={handleApplyCustomDate} className="w-full bg-orange-500 text-white py-1.5 rounded text-xs font-bold mt-2">Apply Filter</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* </CataShowWrapper> */}
                    </div>
                </div>
            </div>

            {/* --- 6. UPDATED STEPPER SECTION --- */}
            <div className={`bg-white shadow-sm sticky z-[50] border-b top-[72px]`}>

                {/* Request Page */}
                {/* <div
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`)}
                    className="mx-3 mt-2 mb-2 rounded-sm cursor-pointer bg-white border border-slate-200 px-3 py-2 flex items-center justify-between shadow-sm hover:bg-slate-50 active:scale-[0.99] transition-all">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Customer Requests
                        </span>
                        <span className="text-xs font-black text-slate-800">
                            View All Requests →
                        </span>
                    </div>

                   
                    <div className="min-w-[26px] h-[22px] px-2 flex items-center justify-center
                    text-[11px] font-black rounded-sm
                    bg-red-500 text-white">
                        {pendingRequestCount}
                    </div>
                </div> */}

                {/* ORDER TIMELINE */}
                <div className="flex items-center w-full px-2 md:px-10 pt-9 pb-9 bg-white">
                    {OrderStatuses.map((status, index) => {
                        const activeIndex = OrderStatuses.indexOf(activeStatusTab);
                        const isCompleted = index < activeIndex;
                        const isActive = index === activeIndex;
                        const count = statusCounts[status] || 0;

                        return (
                            <React.Fragment key={status}>
                                <div
                                    className={`relative flex flex-col items-center flex-1 min-w-0 ${status === "Upcoming" ? "cursor-not-allowed" : "cursor-pointer"}`}
                                    onClick={() => {
                                        if (status !== "Upcoming") {
                                            setActiveStatusTab(status);
                                        }
                                    }}
                                >
                                    <span
                                        className={`absolute ${index % 2 === 0 ? 'bottom-full mb-2' : 'top-full mt-2'
                                            } text-center text-[8px] sm:text-[10px] md:text-[11px] uppercase tracking-tighter ${isActive ? 'text-[#F97316] font-black' : 'text-gray-400 font-bold'} whitespace-nowrap`}
                                    >
                                        {status}
                                    </span>
                                    <div
                                        className={`relative w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${status === "Upcoming"
                                            ? "bg-orange-500 text-white"
                                            : isCompleted || isActive
                                                ? "bg-orange-500 text-white"
                                                : "bg-gray-200 text-gray-500"
                                            } ${isActive ? "scale-110 shadow-md ring-2 ring-orange-100" : ""}`}
                                    >

                                        {status === "Upcoming" ? (
                                            <span className="absolute px-1 py-[2px] text-[5px] font-black uppercase rounded-full bg-orange-100 text-[#F97316] border border-orange-300 whitespace-nowrap">
                                                Coming Soon
                                            </span>
                                        ) : (
                                            <span className="text-[10px] md:text-xs font-black">
                                                {count}
                                            </span>
                                        )}

                                    </div>
                                </div>

                                {index < OrderStatuses.length - 1 && (
                                    <div
                                        className={`flex-auto h-0.5 md:h-1.5 transition-colors duration-500 ${index < activeIndex ? 'bg-[#F97316]' : 'bg-gray-200'
                                            }`}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
            {activeStatusTab === 'Completed' && (
                <div className="sticky top-[178px] z-[90] flex p-1 bg-white mx-4 mt-2 rounded-sm shadow-sm border border-slate-200 max-w-md md:mx-auto w-[92%]">
                    {['unpaid', 'paid'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setPaymentFilter(f as any)}
                            className={`flex-1 py-2 text-[10px] font-black uppercase rounded-sm transition-all ${paymentFilter === f
                                ? 'bg-slate-800 text-white shadow-sm'
                                : 'text-slate-500'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            )}

            {/* --- 7. ORDERS LIST --- */}
            <div className="flex-grow overflow-y-hidden bg-slate-100 space-y-2 p-1 md:p-4">
                {dataLoading ? (
                    <div className="flex justify-center py-10"><Spinner /></div>
                ) : error ? (
                    <p className="p-8 text-center text-red-500">{error}</p>
                ) : filteredOrders.length > 0 ? (
                    <AnimatePresence>
                        {filteredOrders.map((Order) => {
                            const returnMethods =
                                Order.returnHistory && Order.returnHistory.length > 0
                                    ? Array.from(
                                        new Set(
                                            Order.returnHistory.map(r => r.modeOfReturn)
                                        )) : [];
                            const isExpanded = expandedorderId === Order.id;
                            const isUpcomingStatus = Order.status === 'Upcoming';
                            const total = (Order.items || []).reduce((sum, item) => {
                                const salesPrice = Number(item.salesPrice || 0);
                                const mrp = Number(item.mrp || 0);
                                const price =
                                    item.customPrice ??
                                    (salesPrice > 0 ? salesPrice : mrp);
                                return sum + price * Number(item.quantity || 0);
                            }, 0);
                            const paid = Number(Order.paidAmount || 0);
                            const due = Math.max(0, total - paid);
                            const isPaid = Order.status === 'Paid';
                            const isFinalStage = Order.status === 'Completed' || Order.status === 'Paid';
                            return (
                                <motion.div
                                    key={Order.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.25 }}
                                >
                                    <CustomCard key={Order.id} onClick={() => handleOrderClick(Order.id)} className="p-4 mb-3 bg-white shadow-sm border border-gray-100 rounded-sm cursor-pointer relative">
                                        {/* 🔁 RETURN METHOD BADGE - TOP LEFT */}
                                        {returnMethods.length > 0 && (
                                            <div className="absolute -top-0.5 left-0 flex flex-wrap gap-1 p-1">
                                                {returnMethods.map((method, index) => (
                                                    <span
                                                        key={`${method}-${index}`}
                                                        className={`text-[7px] uppercase font-bold px-2 py-0.5 rounded border ${method === 'EXCHANGE'
                                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                            : method === 'CASH REFUND'
                                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                                : 'bg-orange-50 text-[#F97316] border-orange-200'
                                                            }`}
                                                    >
                                                        {method}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {!isUpcomingStatus && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation(); setEditingOrder(Order); setEditingOrder(Order);
                                                    setSelectedItemForEdit(null);
                                                }}
                                                className="absolute top-5 left-2 p-2 bg-white/90 backdrop-blur-sm text-slate-500 rounded-sm transition-all duration-300 z-20 group"
                                            >
                                                <div className="flex items-center cursor-pointer">
                                                    <IconEdit className='h-3 w-3' />
                                                </div>
                                            </button>
                                        )}
                                        <div className="flex right-5 top-0 absolute justify-end gap-1 flex-wrap max-w-[50%] text-right pointer-events-auto">
                                            {(() => {
                                                const seen = new Set<string>();

                                                // Collect from original payment methods
                                                if (Order.paymentMethods) {
                                                    Object.entries(Order.paymentMethods).forEach(([method, amount]) => {
                                                        if (method.toLowerCase() !== 'due' && Number(amount) > 0) {
                                                            seen.add(method.toUpperCase());
                                                        }
                                                    });
                                                }

                                                // Collect from latest return's paymentDetails
                                                const latestReturn = Order.returnHistory?.[Order.returnHistory.length - 1];
                                                if (latestReturn?.paymentDetails) {
                                                    Object.entries(latestReturn.paymentDetails).forEach(([method, amount]) => {
                                                        if (method.toLowerCase() !== 'due' && Number(amount) > 0) {
                                                            seen.add(method.toUpperCase());
                                                        }
                                                    });
                                                }

                                                return Array.from(seen).map((method) => (
                                                    <span
                                                        key={method}
                                                        className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-sm tracking-wider bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap"
                                                    >
                                                        {method}
                                                    </span>
                                                ));
                                            })()}
                                        </div>

                                        <div className="flex justify-between items-start pl-6 mt-1">
                                            <div>
                                                {!isUpcomingStatus && (
                                                    <h3 className="text-base font-bold text-slate-800">
                                                        {Order.orderId}
                                                    </h3>
                                                )}
                                                <p className="text-black text-sm font-medium">
                                                    {Order.userName}
                                                    {Order.status === "Upcoming" && Order.userLoginPhone && (
                                                        <span className="ml-2 text-[10px] text-black font-semibold border p-1 bg-gray-100">
                                                            {Order.userLoginPhone}
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-[10px] text-gray-600 mt-1">{Order.time}</p>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-lg font-bold text-black">₹{formatAmount(total)}
                                                    </p>
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                                </div>
                                                <p className="text-[10px] font-boldpx-2 py-0.5 mt-1 mr-6">Items: {Order.items?.length || 0}</p>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className={`mt-1 border-t pt-4 ${isUpcomingStatus ? "pb-2" : ""}`}>
                                                {/* Addresses Section */}
                                                {!isUpcomingStatus && (
                                                    <div className="grid grid-cols-2 gap-4 mb-1 pb-4">
                                                        <div className="space-y-1">
                                                            <p className="text-[8px] font-black text-[#F97316] uppercase">Billing Address</p>
                                                            <p className="text-[11px] font-bold text-slate-800">{Order.billingDetails?.name}</p>
                                                            <p className="text-[10px] text-gray-500 leading-tight">{Order.billingDetails?.address}</p>
                                                            <p className="text-[10px] text-gray-500">{Order.billingDetails?.phone}</p>
                                                        </div>
                                                        <div className="space-y-1 border-l pl-4">
                                                            <p className="text-[8px] font-black text-blue-500 uppercase">Shipping Address</p>
                                                            <p className="text-[11px] font-bold text-slate-800">{Order.shippingDetails?.name || Order.billingDetails?.name}</p>
                                                            <p className="text-[10px] text-gray-500 leading-tight">{Order.shippingDetails?.address || Order.billingDetails?.address}</p>
                                                            <p className="text-[10px] text-gray-500">{Order.shippingDetails?.phone}</p>
                                                        </div>
                                                    </div>

                                                )}
                                                {/* Items Section */}
                                                <div>
                                                    {isExpanded && Order.specialInstruction && (
                                                        <div className="mb-1 bg-gray-50 border border-gray-200 rounded-sm p-2">

                                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">
                                                                Special Instructions
                                                            </p>

                                                            <p className="text-[11px] text-gray-700 font-medium leading-snug break-words">
                                                                {Order.specialInstruction}
                                                            </p>

                                                        </div>
                                                    )}
                                                    {Order.items?.map((item, idx) => {
                                                        // const returnedQty = getReturnedQuantityForItem(item, Order);

                                                        // Collect per-return-event entries for this item
                                                        const returnedEntries: { qty: number; modeOfReturn: string; returnedAt: any }[] = [];
                                                        (Order.returnHistory || []).forEach((h: any) => {
                                                            (h.returnedItems || []).forEach((r: any) => {
                                                                const matches =
                                                                    String(r.originalItemId) === String(item.itemId) ||
                                                                    String(r.originalItemId) === String(item.id) ||
                                                                    String(r.id) === String(item.itemId) ||
                                                                    String(r.id) === String(item.id);
                                                                if (matches) {
                                                                    returnedEntries.push({
                                                                        qty: Number(r.quantity || 0),
                                                                        modeOfReturn: h.modeOfReturn || '',
                                                                        returnedAt: h.returnedAt,
                                                                    });
                                                                }
                                                            });
                                                        });
                                                        const totalReturnedFromHistory = returnedEntries.reduce((sum, e) => sum + e.qty, 0);
                                                        // item.quantity may already reflect post-return qty, so add back returned qty to get original
                                                        const originalQty = Number(item.quantity || 0) + totalReturnedFromHistory;
                                                        const remainingQty = originalQty - totalReturnedFromHistory; // = item.quantity
                                                        const unitPrice = item.customPrice ??
                                                            (Number(item.salesPrice || 0) > 0 ? Number(item.salesPrice) : Number(item.mrp));

                                                        return (
                                                            <div key={idx} className="p-2 cursor-pointer">
                                                                {/* REMAINING QUANTITY ROW */}
                                                                {remainingQty > 0 && (
                                                                    <div className="flex justify-between items-start -mb-1">
                                                                        <div className="flex-1">
                                                                            <p className="text-[11px] font-extrabold leading-tight mb-1" style={{ color: '#1e293b' }}>
                                                                                {item.name}
                                                                                <span className="ml-1 text-[9px] font-semibold text-gray-500">
                                                                                    {item.unit || "pcs"}
                                                                                </span>
                                                                            </p>
                                                                            {item.note && (
                                                                                <p className="text-[9px] leading-tight flex items-baseline gap-1.5 mt-1 opacity-80">
                                                                                    <span className="font-black uppercase tracking-widest font-xs">Note:</span>
                                                                                    <span className="font-xs italic text-slate-600">{item.note}</span>
                                                                                </p>
                                                                            )}
                                                                            <p className="text-[10px] text-gray-400">
                                                                                ₹{formatAmount(unitPrice)} per {item.unit || "pcs"}
                                                                            </p>
                                                                        </div>
                                                                        <div className="text-right ml-4">
                                                                            <p className="text-[13px] font-black text-slate-900">
                                                                                ₹{formatAmount(unitPrice * remainingQty)}
                                                                            </p>
                                                                            <p className="text-[9px] font-bold text-slate-500 bg-white">
                                                                                Qty: {remainingQty}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* RETURNED ENTRIES — one crossed-out row per return event */}
                                                                {returnedEntries.map((entry, rIdx) => (
                                                                    entry.qty > 0 && (
                                                                        <div key={rIdx} className="flex justify-between items-start mt-1 -mb-1">
                                                                            <div className="flex-1">
                                                                                <p className="text-[11px] font-extrabold leading-tight mb-1"
                                                                                    style={{ textDecoration: 'line-through', color: '#94a3b8' }}>
                                                                                    {item.name}
                                                                                    <span className="ml-1 text-[9px] font-semibold text-gray-400">
                                                                                        {item.unit || "pcs"}
                                                                                    </span>
                                                                                </p>
                                                                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5 mb-1">
                                                                                    {entry.modeOfReturn && (
                                                                                        <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${entry.modeOfReturn.toUpperCase() === 'EXCHANGE'
                                                                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                                            : entry.modeOfReturn.toUpperCase().includes('CASH') || entry.modeOfReturn.toUpperCase().includes('REFUND')
                                                                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                                                                : 'bg-orange-50 text-[#F97316] border-orange-200'
                                                                                            }`}>
                                                                                            {entry.modeOfReturn}
                                                                                        </span>
                                                                                    )}
                                                                                    {entry.returnedAt && (
                                                                                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide">
                                                                                            {new Date(
                                                                                                entry.returnedAt?.toDate
                                                                                                    ? entry.returnedAt.toDate()
                                                                                                    : entry.returnedAt
                                                                                            ).toLocaleDateString('en-GB', {
                                                                                                day: '2-digit', month: 'short', year: '2-digit'
                                                                                            })}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="text-right ml-4">
                                                                                <p className="text-[13px] font-black" style={{ color: '#94a3b8', textDecoration: 'line-through' }}>
                                                                                    ₹{formatAmount(unitPrice * entry.qty)}
                                                                                </p>
                                                                                <p className="text-[9px] font-bold text-slate-400">
                                                                                    Qty: {entry.qty}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                ))}
                                                            </div>
                                                        );
                                                    })}
                                                    {/* Show fully removed returned items */}
                                                    {Order.returnHistory?.flatMap((h: any) => h.returnedItems || [])
                                                        .filter((r: any) => !Order.items?.some(item =>
                                                            String(item.itemId) === String(r.originalItemId) ||
                                                            String(item.id) === String(r.originalItemId)
                                                        ))
                                                        .map((r: any, idx: number) => (
                                                            <div key={`removed-${idx}`} className="p-2">
                                                                <div className="flex justify-between items-start -mb-1">
                                                                    <div className="flex-1">
                                                                        <p className="text-[11px] font-extrabold leading-tight mb-1"
                                                                            style={{ textDecoration: 'line-through', color: '#94a3b8' }}>
                                                                            {r.name}
                                                                            <span className="ml-1 text-[9px] font-semibold text-gray-400">
                                                                                {r.unit || "pcs"}
                                                                            </span>
                                                                        </p>
                                                                        {/* Return mode badge + date */}
                                                                        <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-1">
                                                                            {(() => {
                                                                                const matchedHistory = Order.returnHistory?.find((h: any) =>
                                                                                    h.returnedItems?.some((ri: any) =>
                                                                                        String(ri.originalItemId) === String(r.originalItemId) ||
                                                                                        String(ri.id) === String(r.originalItemId)
                                                                                    )
                                                                                );
                                                                                return (
                                                                                    <>
                                                                                        {matchedHistory?.modeOfReturn && (
                                                                                            <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${matchedHistory.modeOfReturn === 'EXCHANGE'
                                                                                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                                                : matchedHistory.modeOfReturn === 'CASH REFUND'
                                                                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                                                                    : 'bg-orange-50 text-[#F97316] border-orange-200'
                                                                                                }`}>
                                                                                                {matchedHistory.modeOfReturn}
                                                                                            </span>
                                                                                        )}
                                                                                        {matchedHistory?.returnedAt && (
                                                                                            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide">
                                                                                                {new Date(
                                                                                                    (matchedHistory.returnedAt as any)?.toDate
                                                                                                        ? (matchedHistory.returnedAt as any).toDate()
                                                                                                        : matchedHistory.returnedAt
                                                                                                ).toLocaleDateString('en-GB', {
                                                                                                    day: '2-digit', month: 'short', year: '2-digit'
                                                                                                })}
                                                                                            </span>
                                                                                        )}
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        {r.note && (
                                                                            <p className="text-[9px] leading-tight flex items-baseline gap-1.5 mt-1 opacity-80">
                                                                                <span className="font-black uppercase tracking-widest">Note:</span>
                                                                                <span className="italic text-slate-400">{r.note}</span>
                                                                            </p>
                                                                        )}

                                                                    </div>
                                                                    <div className="text-right ml-4">
                                                                        <p className="text-[13px] font-black" style={{ color: '#94a3b8', textDecoration: 'line-through' }}>
                                                                            ₹{formatAmount((r.unitPrice ?? r.mrp ?? 0) * r.quantity)}
                                                                        </p>
                                                                        <p className="text-[9px] font-bold text-slate-400">Qty: {r.quantity}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                    {/* Totals Section */}
                                                    {!isUpcomingStatus && (
                                                        <div className="border-t mt-1 p-2 flex items-center justify-between">
                                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                                {paid > 0 && (
                                                                    (() => {
                                                                        // Merge all payment sources into one map
                                                                        const mergedMethods: Record<string, number> = {};

                                                                        if (Order.paymentMethods && Object.keys(Order.paymentMethods).length > 0) {
                                                                            Object.entries(Order.paymentMethods).forEach(([method, amount]) => {
                                                                                if (method.toLowerCase() !== 'due' && Number(amount) > 0) {
                                                                                    const key = method.toUpperCase();
                                                                                    mergedMethods[key] = (mergedMethods[key] || 0) + Number(amount);
                                                                                }
                                                                            });
                                                                        } else if (Order.paymentMethod && paid > 0) {
                                                                            mergedMethods[Order.paymentMethod.toUpperCase()] = paid;
                                                                        }

                                                                        return Object.entries(mergedMethods).map(([method, amount]) => (
                                                                            <div
                                                                                key={method}
                                                                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-green-100"
                                                                            >
                                                                                <span className="text-[10px] font-bold text-green-800 uppercase">
                                                                                    {method}
                                                                                </span>
                                                                                <span className="text-[10px] font-black text-green-600">
                                                                                    ₹{Number(amount).toFixed(2)}
                                                                                </span>
                                                                            </div>
                                                                        ));
                                                                    })()
                                                                )}
                                                            </div>

                                                            <div className='flex gap-3 items-center'>
                                                                <div className="text-right border-r border-slate-200 pr-3">
                                                                    <p className="text-[7px] font-bold text-green-600 uppercase tracking-tighter leading-none mb-0.5">Paid</p>
                                                                    <p className="text-[11px] font-black text-green-700 leading-none">₹{paid.toFixed(2)}</p>
                                                                </div>

                                                                <div className="text-right border-r border-slate-200 pr-3">
                                                                    <p className="text-[7px] font-bold text-blue-600 uppercase tracking-tighter leading-none mb-0.5">C.Note</p>
                                                                    <p className="text-[11px] font-black text-blue-700 leading-none">
                                                                        ₹{Number(Order.creditNoteAmount || 0).toFixed(2)}
                                                                    </p>
                                                                </div>

                                                                {Number(Order.refundAmount || 0) > 0 && (
                                                                    <div className="text-right border-r border-slate-200 pr-3">
                                                                        <p className="text-[7px] font-bold text-red-600  uppercase tracking-tighter leading-none mb-0.5">Refund</p>
                                                                        <p className="text-[11px] font-black text-red-600 leading-none">
                                                                            ₹{Number(Order.refundAmount || 0).toFixed(2)}
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                <div className="text-right">
                                                                    <p className="text-[7px] font-bold text-red-600 uppercase tracking-tighter leading-none mb-0.5">Due</p>
                                                                    <p className="text-[11px] font-black text-red-700 leading-none">₹{due.toFixed(2)}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Buttons Section - Updated Grid & Logic */}
                                                {(
                                                    <div
                                                        className={`grid ${isUpcomingStatus
                                                            ? 'grid-cols-3'
                                                            : Order.status === "Packed"
                                                                ? 'grid-cols-5 md:grid-cols-5'
                                                                : Order.status === "Paid"
                                                                    ? 'grid-cols-3'
                                                                    : Order.status === "Completed"
                                                                        ? 'grid-cols-4'
                                                                        : 'grid-cols-4'
                                                            } gap-3 pt-6 border-t`}
                                                    >
                                                        {/* UPCOMING STAGE BUTTONS */}
                                                        {isUpcomingStatus && Order.userLoginPhone && (
                                                            <>
                                                                <a
                                                                    href={`tel:${Order.userLoginPhone.replace(/\D/g, '')}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="py-2.5 bg-white border border-emerald-200 text-emerald-600 text-xs font-bold rounded-sm text-center"
                                                                >
                                                                    Call
                                                                </a>

                                                                <a
                                                                    href={`https://wa.me/${Order.userLoginPhone.replace(/\D/g, '')}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="py-2.5 bg-[#25D366] text-white text-xs font-bold rounded-sm text-center"
                                                                >
                                                                    WhatsApp
                                                                </a>

                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteOrder(Order.id);
                                                                    }}
                                                                    className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm cursor-pointer"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </>
                                                        )}

                                                        {!isUpcomingStatus && (isFinalStage ? (
                                                            <>

                                                                {/* DELETE */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteOrder(Order.id);
                                                                    }}
                                                                    className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm cursor-pointer"
                                                                >
                                                                    Delete
                                                                </button>

                                                                {/* SETTLE – only UNPAID */}
                                                                {!isPaid && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setShowPaymentModal(Order);
                                                                        }}
                                                                        className="py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-sm"
                                                                    >
                                                                        Settle
                                                                    </button>
                                                                )}

                                                                {/* RETURN – PAID + UNPAID dono me */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(
                                                                            `${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`,
                                                                            { state: { selectedOrder: Order.orderId } }
                                                                        );
                                                                    }}
                                                                    className="py-2.5 bg-sky-500 text-white text-xs font-bold rounded-sm"
                                                                >
                                                                    Return
                                                                </button>

                                                                {/* PRINT */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedOrderForAction(Order);
                                                                    }}
                                                                    disabled={pdfLoadingOrderId === Order.id}
                                                                    className="py-2.5 bg-black text-white text-xs font-bold rounded-sm flex items-center justify-center"
                                                                >
                                                                    Print
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {Order.status === "Packed" && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handlePreviousStatus(Order.id, Order.status);
                                                                        }}
                                                                        className="w-full py-2.5 bg-gray-200 text-black text-sm font-bold rounded-sm flex items-center justify-center flex-col">
                                                                        ←
                                                                        <span className='text-[10px]'>back</span>
                                                                    </button>
                                                                )}
                                                                {/* DELETE */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteOrder(Order.id);
                                                                    }}
                                                                    className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm"
                                                                >
                                                                    Delete
                                                                </button>

                                                                {/* ADVANCE */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setShowPaymentModal(Order);
                                                                    }}
                                                                    className="py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-sm"
                                                                >
                                                                    Advance
                                                                </button>

                                                                {/* PRINT */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedOrderForAction(Order);
                                                                    }}
                                                                    className="py-2.5 bg-black text-white text-xs font-bold rounded-sm"
                                                                >
                                                                    {pdfLoadingOrderId === Order.id ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <Spinner />
                                                                            <span>...Printing</span>
                                                                        </div>
                                                                    ) : (
                                                                        "Print"
                                                                    )}
                                                                </button>

                                                                {/* PREVIOUS ARROW (only Packed stage) */}
                                                                {(Order.status === "Confirmed" || Order.status === "Packed") && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleUpdateStatus(Order.id, Order.status);
                                                                        }}
                                                                        disabled={isUpdatingStatus === Order.id}
                                                                        className="py-2.5 bg-[#00A2FF] text-white text-xs font-bold rounded-sm flex items-center justify-center flex-col"
                                                                    >
                                                                        →
                                                                        <span className='text-[10px]'>Next</span>
                                                                    </button>
                                                                )}
                                                            </>
                                                        ))}
                                                    </div>
                                                )}
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

            {/* Modals (SelectedAction, QR, Payment, Editing) Same as provided */}
            {selectedOrderForAction && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedOrderForAction(null)}>
                    <div className="bg-white rounded-sm p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex mb-4 bg-slate-100 rounded-sm p-1">
                            {['bill', 'estimate'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setBillType(type as any)}
                                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-sm transition-all ${billType === type
                                        ? 'bg-white text-[#F97316] shadow-sm'
                                        : 'text-slate-500'
                                        }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleSendWhatsapp(selectedOrderForAction)}
                                disabled={sendingPdf || pdfLoadingOrderId === selectedOrderForAction.id}
                                className="w-full bg-[#25D366] text-white py-2.5 rounded-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {sendingPdf ? (
                                    <Spinner />
                                ) : (
                                    <>
                                        <FiSend /> Share on WhatsApp
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    const order = selectedOrderForAction;

                                    setPdfLoadingOrderId(order.id);   // spinner start

                                    setSelectedOrderForAction(null);

                                    setTimeout(() => {
                                        handlePdfAction(order, ACTION.DOWNLOAD);
                                    }, 50);
                                }}
                                className="w-full bg-blue-600 text-white py-2.5 rounded-sm font-bold flex items-center justify-center"
                            >
                                Download PDF
                            </button>
                            <button
                                onClick={() => {
                                    const order = selectedOrderForAction;

                                    setPdfLoadingOrderId(order.id);   // spinner start

                                    setSelectedOrderForAction(null);

                                    setTimeout(() => {
                                        handlePdfAction(order, ACTION.PRINT);
                                    }, 50);
                                }}
                                className="w-full border py-2.5 rounded-sm font-bold"
                            >
                                Print Directly
                            </button>
                            <button
                                disabled
                                onClick={() => {
                                    setShowQrModal(selectedOrderForAction);
                                    setSelectedOrderForAction(null);
                                }}
                                className="w-full bg-gray-400 cursor-not-allowed text-white py-2.5 rounded-sm font-bold"
                            >
                                Generate QR Code
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showQrModal && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300 relative">
                        <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                            <FiX size={24} />
                        </button>
                        <h3 className="text-xl font-bold text-gray-800 mb-1">Download Bill</h3>
                        <p className="text-sm text-gray-500 mb-4">Invoice #{showQrModal.orderId}</p>
                        <div className="bg-white p-2 border-2 border-gray-100 rounded-lg shadow-inner mb-4">
                            <QRCode
                                value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${showQrModal.id}`}
                                size={200}
                                viewBox={`0 0 256 256`}
                            />
                        </div>
                        <p className="text-center text-sm text-gray-600 mb-4">Scan to download PDF</p>
                        <button
                            onClick={() => setShowQrModal(null)}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {showPaymentModal && (() => {

                // Updated total calculate karo (items se)
                const updatedTotal =
                    (showPaymentModal.items || []).reduce(
                        (sum, item) =>
                            sum + (
                                (item.customPrice ??
                                    (Number(item.salesPrice || 0) > 0
                                        ? Number(item.salesPrice)
                                        : Number(item.mrp || 0)))
                                * Number(item.quantity || 0)
                            ),
                        0
                    );

                // Current paid
                const alreadyPaid = Number(showPaymentModal.paidAmount || 0);

                // Current due
                const currentDue = Math.max(0, updatedTotal - alreadyPaid);

                return (
                    <PaymentModal
                        isOpen={!!showPaymentModal}
                        onClose={() => setShowPaymentModal(null)}
                        availableCredit={customerCredit} // <--- PASS CREDIT TO MODAL
                        invoice={{
                            id: showPaymentModal.id,
                            invoiceNumber: showPaymentModal.orderId,
                            amount: currentDue,
                            partyName: showPaymentModal.userName,
                            dueAmount: currentDue,
                            time: showPaymentModal.time,
                            status: currentDue === 0 ? 'Paid' : 'Unpaid',
                            type: 'Credit',
                            createdAt: new Date(),
                        }}
                        onSubmit={async (_inv, amount, method) => {
                            try {
                                if (!currentUser?.companyId || !showPaymentModal) return;

                                const orderRef = doc(
                                    db,
                                    'companies',
                                    currentUser.companyId,
                                    'Orders',
                                    showPaymentModal.id
                                );

                                const methodKey = method ? method.toUpperCase() : 'CASH';

                                // --- NEW: DEDUCT FROM CUSTOMER DB IF CREDIT NOTE USED ---
                                if (methodKey === 'CREDIT NOTE' || methodKey === 'CREDIT') {
                                    const phone = showPaymentModal.userLoginPhone || showPaymentModal.billingDetails?.phone || '';
                                    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

                                    if (normalizedPhone) {
                                        const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', normalizedPhone);
                                        await updateDoc(customerRef, {
                                            creditBalance: firebaseIncrement(-amount) // Deduct the used amount
                                        });
                                    }
                                }
                                // --------------------------------------------------------

                                const currentMethods = showPaymentModal.paymentMethods || {};
                                const updatedMethods = {
                                    ...currentMethods,
                                    [methodKey]: (currentMethods[methodKey] || 0) + amount,
                                };

                                const newPaidTotal = alreadyPaid + amount;

                                let newStatus = showPaymentModal.status;
                                if (
                                    showPaymentModal.status === 'Completed' &&
                                    Math.round(newPaidTotal) >= Math.round(updatedTotal)
                                ) {
                                    newStatus = 'Paid';
                                }

                                await updateDoc(orderRef, {
                                    paidAmount: newPaidTotal,
                                    paymentMethods: updatedMethods,
                                    paymentMethod: methodKey,
                                    status: newStatus,
                                    updatedAt: serverTimestamp(),
                                });

                                window.dispatchEvent(
                                    new CustomEvent('pdc_notification', {
                                        detail: {
                                            type: 'PAYMENT_RECEIVED',
                                            invoiceNumber: showPaymentModal.orderId,
                                            partyName: showPaymentModal.userName || showPaymentModal.billingDetails?.name || 'Customer',
                                            amount: Number(amount || 0),
                                            method: methodKey,
                                            status: newStatus === 'Paid' ? 'PAID' : 'UPCOMING',
                                            createdAt: new Date().toISOString(),
                                        },
                                    })
                                );

                                setShowPaymentModal(null);
                                setModal({
                                    message: "Payment successful!",
                                    type: State.SUCCESS,
                                });

                            } catch (err) {
                                console.error("Payment Error:", err);
                                setModal({
                                    message: "Payment failed",
                                    type: State.ERROR,
                                });
                            }
                        }}
                    />
                );
            })()}

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

                                {/* Divider aur Total Amount */}
                                <div className="h-8 w-[1px] bg-gray-500 mx-2"></div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total Amount</span>
                                    <span className="text-md font-black text-slate-900 leading-none">₹{formatAmount(calculatedEditTotal)}  </span>
                                </div>
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={() => setEditingOrder(null)}
                                className="p-1.5 hover:bg-gray-200 rounded-sm transition-colors"
                            >
                                <FiX size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                                {/* LEFT SIDE: ADDRESSES */}
                                <div className="space-y-4">
                                    <div className="flex sm:hidden p-1 bg-slate-100 rounded-sm mb-2">
                                        <button
                                            onClick={() => setActiveTab('billing')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${activeTab === 'billing' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}
                                        >
                                            Billing
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('shipping')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${activeTab === 'shipping' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                                        >
                                            Shipping
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Billing Address Section */}
                                        <div className={`p-4 rounded-sm border border-slate-200 bg-orange-50/30 space-y-3 ${activeTab === 'billing' ? 'block' : 'hidden sm:block'}`}>
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-[11px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 bg-orange-600 rounded-sm"></span> Billing Address
                                                </h4>

                                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        id="sameAsBilling"
                                                        className="w-3.5 h-3.5 accent-orange-600 rounded-sm cursor-pointer"
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setEditingOrder({
                                                                    ...editingOrder,
                                                                    shippingDetails: { ...editingOrder.billingDetails }
                                                                });
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Same for Shipping</span>
                                                </label>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                {/* NAME FIELD */}
                                                <input
                                                    type="text"
                                                    placeholder="Name"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.name || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, name: val },
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, name: val } })
                                                        });
                                                    }}
                                                />

                                                {/* PHONE FIELD (Billing) - Security Check Added */}
                                                <input
                                                    type="text"
                                                    placeholder="Phone"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.phone || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;

                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, phone: val },
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, phone: val } })
                                                        });
                                                    }}
                                                />

                                                {/* ADDRESS FIELD */}
                                                <textarea
                                                    placeholder="Address"
                                                    className="col-span-2 p-2 border border-slate-300 rounded-sm text-xs h-16 resize-none outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.address || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, address: val },
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, address: val } })
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Shipping Address Section */}
                                        <div className={`p-4 rounded-sm border border-slate-200 bg-blue-50/30 space-y-3 ${activeTab === 'shipping' ? 'block' : 'hidden sm:block'}`}>
                                            <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-blue-600 rounded-sm"></span> Shipping Address
                                            </h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Name"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-blue-400"
                                                    value={editingOrder.shippingDetails?.name || ''}
                                                    onChange={(e) => setEditingOrder({
                                                        ...editingOrder,
                                                        shippingDetails: { ...editingOrder.shippingDetails!, name: e.target.value }
                                                    })}
                                                />

                                                <input
                                                    type="text"
                                                    placeholder="Phone"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-blue-400"
                                                    value={editingOrder.shippingDetails?.phone || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            shippingDetails: { ...editingOrder.shippingDetails!, phone: val }
                                                        });
                                                    }}
                                                />

                                                <textarea
                                                    placeholder="Address"
                                                    className="col-span-2 p-2 border border-slate-300 rounded-sm text-xs h-16 resize-none outline-none focus:border-blue-400"
                                                    value={editingOrder.shippingDetails?.address || ''}
                                                    onChange={(e) => setEditingOrder({
                                                        ...editingOrder,
                                                        shippingDetails: { ...editingOrder.shippingDetails!, address: e.target.value }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT SIDE: ITEMS & TOTAL */}
                                <div className="flex flex-col w-full space-y-2">
                                    {/* ADD NEW ITEM SEARCH BOX */}
                                    <div className="p-2 border-t border-slate-200">
                                        <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest mb-2">Add New Item</p>
                                        <SearchableItemInput
                                            items={availableItems}
                                            onItemSelected={(selectedItem) => {
                                                if (!selectedItem.id) return;
                                                const newMrp = Number(selectedItem.mrp || 0);
                                                const newSalesPrice = Number(selectedItem.salesPrice || 0);
                                                let finalPrice = newSalesPrice > 0 ? newSalesPrice : newMrp;
                                                const qty = selectedItem.moq && selectedItem.moq > 0 ? selectedItem.moq : 1;
                                                const newItem: any = {
                                                    ...selectedItem,
                                                    id: crypto.randomUUID(),
                                                    itemId: selectedItem.id,
                                                    productId: selectedItem.id,
                                                    name: selectedItem.name,
                                                    quantity: qty,
                                                    mrp: newMrp,
                                                    salesPrice: newSalesPrice,
                                                    unitMultiplier: selectedItem.unitMultiplier ?? 1,
                                                    note: "",
                                                    itemGroupId: selectedItem.itemGroupId,
                                                    moq: selectedItem.moq ?? 0,
                                                    tax: Number(selectedItem.tax),
                                                    imageUrl: selectedItem.imageUrl || "",
                                                    imageBase64: "",
                                                    unitPrice: finalPrice,
                                                    finalPrice: finalPrice,
                                                    customPrice: finalPrice
                                                };

                                                const updatedItems = [newItem, ...(editingOrder.items || [])];
                                                const newTotal = updatedItems.reduce((sum, i) => sum + ((i.customPrice ?? (Number(i.salesPrice || 0) > 0 ? Number(i.salesPrice) : Number(i.mrp))) * Number(i.quantity || 0)), 0);
                                                setEditingOrder({ ...editingOrder, items: updatedItems, totalAmount: newTotal });
                                            }}
                                            placeholder="Search item to add..."
                                        />
                                    </div>

                                    <div className="h-fit self-start w-full p-2 rounded-sm border border-slate-200 bg-slate-50 flex flex-col">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
                                            Items ({editingOrder.items?.length})
                                        </h4>

                                        {/* Items List Container */}
                                        <div className="h-auto">
                                            <GenericCartList
                                                items={mappedOrderItems}
                                                availableItems={availableItems}
                                                basePriceKey="mrp"
                                                priceLabel="MRP"
                                                settings={{
                                                    enableRounding: false,
                                                    roundingInterval: 1,
                                                    enableItemWiseDiscount: enableItemWiseDiscount,
                                                    lockDiscount: false,
                                                    lockPrice: false,
                                                    hideMrp: false,
                                                }}
                                                applyRounding={(amount) => amount}
                                                State={State}
                                                setModal={setModal}
                                                onOpenEditDrawer={(item) => {
                                                    setSelectedItemForEdit(item);
                                                    setIsEditDrawerOpen(true);
                                                }}
                                                onDeleteItem={handleDeleteItem}
                                                onDiscountChange={handleDiscountChange}
                                                onCustomPriceChange={handleNetPriceChange}
                                                onCustomPriceBlur={() => { }}
                                                onQuantityChange={handleQuantityChange}
                                            />
                                        </div>

                                        {/* --- ITEM EDIT DRAWER COMPONENT --- */}
                                        {isEditDrawerOpen && selectedItemForEdit && (
                                            <ItemEditDrawer
                                                item={selectedItemForEdit}
                                                isOpen={isEditDrawerOpen}
                                                onClose={() => setIsEditDrawerOpen(false)}
                                                onSaveSuccess={handleSaveSuccess}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="px-6 py-4 bg-slate-50 border-t flex gap-3">
                            <button
                                onClick={() => setEditingOrder(null)}
                                className="flex-1 py-2.5 bg-gray-400 text-black text-sm font-bold hover:bg-slate-300 rounded-sm transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                onClick={handleSaveChanges}
                                className="flex-[2] bg-orange-600 text-white py-2.5 rounded-sm text-sm font-black shadow-sm hover:bg-orange-700 transition-colors uppercase"
                            >
                                SAVE CHANGES
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {selectedOrderForConfirm && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-[340px] rounded-sm shadow-xl border border-slate-200 p-5">
                        <p className="text-center text-sm font-semibold text-slate-700 mb-1">
                            Move order to <span className="text-orange-600">Completed</span>?
                        </p>
                        <p className="text-center text-[11px] text-slate-400 mb-5">
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                className="flex-1 py-2.5 bg-slate-200 text-slate-800 text-xs font-black rounded-sm hover:bg-slate-300 transition"
                                onClick={() => setSelectedOrderForConfirm(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="flex-1 py-2.5 bg-orange-600 text-white text-xs font-black rounded-sm hover:bg-orange-700 transition"
                                onClick={() => {
                                    const orderId = selectedOrderForConfirm;
                                    setSelectedOrderForConfirm(null);
                                    handleUpdateStatus(orderId, 'Packed', 'Completed');
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Adjustment Popup */}
            {showAdjustmentPopup && pendingAdjustment && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-[360px] rounded-sm shadow-xl border border-slate-200 p-5">

                        <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-500">
                            Amount Reduced
                        </p>

                        <p className="text-center text-xl font-black text-orange-600 mt-2 mb-5">
                            ₹{pendingAdjustment.amount.toFixed(2)}
                        </p>

                        <div className="flex gap-3">
                            <button
                                className="flex-1 py-2.5 bg-orange-600 text-white text-xs font-black rounded-sm hover:bg-orange-700 transition"
                                onClick={handleCreditNote}
                            >
                                Credit Note
                            </button>

                            <button
                                className="flex-1 py-2.5 bg-green-600 text-white text-xs font-black rounded-sm hover:bg-green-700 transition"
                                onClick={handleRefund}
                            >
                                Refund
                            </button>
                        </div>

                        <button
                            className="mt-4 w-full text-[10px] font-bold text-slate-400 hover:text-slate-700"
                            onClick={() => {
                                setShowAdjustmentPopup(false);
                                setPendingAdjustment(null);
                            }}
                        >
                            Cancel
                        </button>

                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdersPage;