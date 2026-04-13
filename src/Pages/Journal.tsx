import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../lib/Firebase';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  Timestamp,
  QuerySnapshot,
  doc,
  getDoc,
  setDoc,
  type DocumentData,
  runTransaction,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { CustomToggle, CustomToggleItem } from '../Components/CustomToggle';
import { CustomCard } from '../Components/CustomCard';
import { CustomButton } from '../Components/CustomButton';
import { Variant, State, ACTION } from '../enums';
import { Spinner } from '../constants/Spinner';
import { ROUTES } from '../constants/routes.constants';
import { Modal, PaymentModal } from '../constants/Modal';
import ShinyText from '../Components/ShinyText';
import { generatePdf, generatePdfBlob } from '../UseComponents/pdfGenerator';
import { getFirestoreOperations } from '../lib/ItemsFirebase';
import { useSalesSettings } from '../context/SettingsContext';
import { IconChevronDown, IconClose, IconFilter, IconSearch, IconDownload, IconPrint, IconScanCircle } from '../constants/Icons';
import QRCode from 'react-qr-code';
import { FiX, FiSend } from 'react-icons/fi';
import { botMasterService } from '../Pages/Additional/Whatsapp/WhatsappApi';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/Firebase';
import { TutorialStep } from '../Components/TutorialStep'; // ← same import as Home.tsx
import { Permissions } from '../enums/permissions.enum';
import ShowWrapper from '../context/ShowWrapper';
import NotificationBell from "../Components/NotificationBell"
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';
// ─── Total tutorial steps for Journal ───────────────────────────────────────
const TOTAL_STEPS = 6;

interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  finalPrice: number;
  mrp: number;
  barcode?: string;
  stock?: number;
  gst?: number;
  taxRate?: number;
  hsnSac?: string;
  effectiveUnitPrice?: number;
  unit?: string;
  discount?: number;
  manualDiscount?: number;
  purchasePrice?: number;
  purchasediscount?: number;
  taxType?: string;
  taxAmount?: number;
  taxableAmount?: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  time: string;
  status: 'Paid' | 'Unpaid';
  type: 'Debit' | 'Credit';
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  partyGstin?: string;
  createdAt: Date;
  dueAmount?: number;
  items?: InvoiceItem[];
  paymentMethods?: DocumentData;
  paymentHistory?: any[];
  returnHistory?: DocumentData[];
  salesmanId?: string | null;
  salesmanName?: string;
  manualDiscount?: number;
  taxType?: string;
  gstScheme?: string;
  subtotal?: number;
  taxAmount?: number;
  taxableAmount?: number;
  totalDiscount?: number;
  roundingOff?: number;
  voucherName?: string;
  shippingName?: string;
  shippingNumber?: string;
  shippingAddress?: string;
  shippingGST?: string;
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
}

interface PdfData {
  gstScheme: string;
  taxType: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail: string;
  signatureBase64: string;
  companyGstin: string;
  msmeNumber: string;
  panNumber: string;
  billDiscount: number;
  upiId: string;
  billTo: {
    name: string;
    address: string;
    phone: string;
    gstin: string;
  };
  shipTo?: {
    name: string;
    address: string;
    phone: string;
    gstin?: string;
  };
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  invoice: {
    number: string;
    date: string;
    billedBy: string;
    roNumber: string;
  };
  items: any[];
  terms: string;
  finalAmount: number;
  bankDetails: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    ifsc: string;
  };
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

const useJournalData = (companyId?: string) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setInvoices([]);
      return;
    }

    setLoading(true);

    const salesQuery = query(
      collection(db, 'companies', companyId, 'sales'),
      orderBy('createdAt', 'desc')
    );

    const purchasesQuery = query(
      collection(db, 'companies', companyId, 'purchases'),
      orderBy('createdAt', 'desc')
    );

    const processSnapshot = (snapshot: QuerySnapshot, type: 'Credit' | 'Debit'): Invoice[] => {
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
        const paymentMethods = data.paymentMethods || {};
        const dueAmount = paymentMethods.due || 0;
        const status: 'Paid' | 'Unpaid' = dueAmount > 0 ? 'Unpaid' : 'Paid';

        const items = (data.items || []).map((item: any) => {
          const quantity = Number(item.quantity) || 0;
          const mrp = Number(item.mrp) || 0;
          const effectiveUnit = Number(item.effectiveUnitPrice) || 0;
          const dbFinalPrice = Number(item.finalPrice) || 0;

          let calculatedFinalPrice = dbFinalPrice;
          if (type === 'Debit') {
            if (effectiveUnit > 0) {
              calculatedFinalPrice = effectiveUnit * quantity;
            } else if (dbFinalPrice === 0) {
              calculatedFinalPrice = (Number(item.purchasePrice) || mrp) * quantity;
            }
          }

          return {
            id: item.id || '',
            name: item.name || 'N/A',
            quantity: quantity,
            finalPrice: type === 'Credit' ? dbFinalPrice : calculatedFinalPrice,
            mrp: mrp,
            discount: item.discount || 0,
            effectiveUnitPrice: effectiveUnit,
            manualDiscount: item.manualDiscount || 0,
            purchasePrice: Number(item.purchasePrice) || 0,
            barcode: item.barcode || '',
            stock: item.stock ?? item.Stock ?? 0,
            gst: item.gst || 0,
            taxRate: item.taxRate || item.gstPercent || 0,
            hsnSac: item.hsnSac || '',
            unit: item.unit || 'Pcs',
            purchasediscount: Number(item.purchasediscount) || 0,
            taxType: item.taxType || '',
            taxAmount: Number(item.taxAmount) || 0,
            taxableAmount: Number(item.taxableAmount) || 0,
          };
        });

        const calculatedTotal = Object.values(paymentMethods).reduce(
          (sum: number, value: any) => sum + (typeof value === 'number' ? value : 0),
          0
        );
        const returnHistory = data.returnHistory || [];
        const savedAmount = Number(data.totalAmount) || 0;
        const changeReturned = Number(data.revDiscount) || 0;
        const fallbackAmount = calculatedTotal - changeReturned;
        const correctDisplayAmount = savedAmount > 0 ? savedAmount : fallbackAmount;

        return {
          id: doc.id,
          invoiceNumber: data.invoiceNumber || `#${doc.id.slice(0, 6).toUpperCase()}`,
          amount: correctDisplayAmount,
          manualDiscount: data.manualDiscount || 0,
          time: formatDate(createdAt),
          status: status,
          type: type,
          partyName: data.partyName || 'N/A',
          partyNumber: data.partyNumber || '',
          partyAddress: data.partyAddress || '',
          partyGstin: data.partyGstin || '',
          salesmanId: data.salesmanId || null,
          salesmanName: data.salesmanName || '',
          createdAt,
          dueAmount: dueAmount,
          returnHistory: returnHistory,
          items: items,
          paymentMethods: paymentMethods,
          paymentHistory: data.paymentHistory || [],
          taxType: data.taxType || '',
          gstScheme: data.gstScheme || '',
          subtotal: Number(data.subtotal) || 0,
          taxAmount: Number(data.taxAmount) || 0,
          taxableAmount: Number(data.taxableAmount) || 0,
          totalDiscount: Number(data.totalDiscount) || 0,
          roundingOff: Number(data.roundingOff) || 0,
          voucherName: data.voucherName || '',
          shippingName: data.shippingName || '',
          shippingNumber: data.shippingNumber || '',
          shippingAddress: data.shippingAddress || '',
          shippingGST: data.shippingGST || '',
          extraExpenseName: data.extraExpenseName || '',
          extraExpenseAmount: Number(data.extraExpenseAmount) || 0,
          narration: data.narration || '',
        };
      });
    };

    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const salesData = processSnapshot(snapshot, 'Credit');
      setInvoices(prev => {
        const withoutCredit = prev.filter(inv => inv.type !== 'Credit');
        const combined = [...withoutCredit, ...salesData];
        return combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLoading(false);
    }, (err) => {
      console.error("Sales listener error:", err);
      setError("Failed to load sales.");
      setLoading(false);
    });

    const unsubPurchases = onSnapshot(purchasesQuery, (snapshot) => {
      const purchasesData = processSnapshot(snapshot, 'Debit');
      setInvoices(prev => {
        const withoutDebit = prev.filter(inv => inv.type !== 'Debit');
        const combined = [...withoutDebit, ...purchasesData];
        return combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLoading(false);
    }, (err) => {
      console.error("Purchases listener error:", err);
      setError("Failed to load purchases.");
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubPurchases();
    };
  }, [companyId]);

  return { invoices, loading, error };
};

// --- MAIN COMPONENT ---
const Journal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Paid' | 'Unpaid'>('Paid');
  const [activeType, setActiveType] = useState<'Debit' | 'Credit'>('Credit');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // ─── Refs for tutorial autoscroll ─────────────────────────────────────────
  const tutorialRefs = useRef<(HTMLElement | null)[]>([]);
  const setTutorialRef = (index: number) => (el: HTMLElement | null) => {
    tutorialRefs.current[index] = el;
  };
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const { salesSettings } = useSalesSettings();

  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);
  const [showQrModal, setShowQrModal] = useState<Invoice | null>(null);
  const [sendingPdf, setSendingPdf] = useState(false);

  const { currentUser, loading: authLoading, hasPermission } = useAuth();

  // ─── Tutorial state (mirrors Home.tsx pattern) ────────────────────────────
  const [tutorialStep, setTutorialStep] = useState(0);

  const next = (n: number) => setTutorialStep(n <= TOTAL_STEPS ? n : 0);
  const skip = () => {
    completeTutorial(currentUser, 'journalTutorialDone', setTutorialStep);
  };

  useTutorial(currentUser, setTutorialStep, 'journalTutorialDone');

  // ─── Autoscroll: whenever tutorialStep changes, scroll that element into view
  useEffect(() => {
    if (tutorialStep === 0) return;
    const el = tutorialRefs.current[tutorialStep];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [tutorialStep]);
  // ─────────────────────────────────────────────────────────────────────────

  const { invoices, loading: dataLoading, error } = useJournalData(currentUser?.companyId);

  // PDC cheque notification effect
  useEffect(() => {
    if (!invoices || invoices.length === 0) return;

    const today = new Date();

    invoices.forEach((invoice) => {
      const history = invoice.paymentHistory || [];

      history.forEach((payment: any) => {
        if (payment.method === 'PDC' && payment.chequeDate) {
          const chequeDate = new Date(payment.chequeDate);

          // Normalize both dates (ignore time)
          const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const chequeMid = new Date(chequeDate.getFullYear(), chequeDate.getMonth(), chequeDate.getDate());

          const diffTime = chequeMid.getTime() - todayMid.getTime();
          const rawDays = diffTime / (1000 * 60 * 60 * 24);
          const diffDays = Math.ceil(rawDays); // normalize to whole days

          // Trigger notification for today, 1 day before, or overdue
          if (diffDays === 1 || diffDays === 0 || diffDays < 0 || diffDays <= -7) {
            const invoiceRef = doc(
              db,
              'companies',
              currentUser?.companyId || '',
              invoice.type === 'Credit' ? 'sales' : 'purchases',
              invoice.id
            );

            runTransaction(db, async (transaction) => {
              const snap = await transaction.get(invoiceRef);
              if (!snap.exists()) return;

              const data = snap.data() as any;
              const notified = data.pdcNotifiedDates || [];

              if (notified.includes(payment.chequeDate)) {
                return;
              }

              transaction.update(invoiceRef, {
                pdcNotifiedDates: [...notified, payment.chequeDate]
              });

              window.dispatchEvent(
                new CustomEvent('pdc_notification', {
                  detail: {
                    invoiceNumber: invoice.invoiceNumber,
                    chequeNumber: payment.chequeNumber,
                    chequeDate: payment.chequeDate,
                    partyName: invoice.partyName,
                    amount: payment.amount || invoice.amount,
                    createdAt: new Date().toISOString(),
                    status:
                      invoice.status === 'Paid'
                        ? 'PAID'
                        : diffDays < 0
                          ? 'OVERDUE'
                          : 'UPCOMING'
                  },
                })
              );
            });
          }
        }
      });
    });
  }, [invoices]);
  const navigate = useNavigate();

  const daysRemaining = useMemo(() => {
    const subData = (currentUser as any)?.subscription || (currentUser as any)?.Subscription;
    const rawDate = subData?.expiryDate;
    if (!rawDate) return null;
    const expiryDate = new Date(
      (rawDate as any).toDate ? (rawDate as any).toDate() : rawDate
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [currentUser]);

  const showBadge = daysRemaining !== null && daysRemaining <= 5 && daysRemaining >= 0;
  const isUrgent = daysRemaining !== null && daysRemaining <= 2;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return invoices
      .filter((invoice) => {
        if (activeDateFilter === 'all') return true;
        const invoiceDate = invoice.createdAt;
        const daysAgo = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);
        switch (activeDateFilter) {
          case 'today': return invoiceDate >= today;
          case 'yesterday': return invoiceDate >= daysAgo(today, 1) && invoiceDate < today;
          case 'last7': return invoiceDate >= daysAgo(today, 7);
          case 'last15': return invoiceDate >= daysAgo(today, 15);
          case 'last30': return invoiceDate >= daysAgo(today, 30);
          case 'custom':
            if (!customStartDate || !customEndDate) return false;
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            return invoiceDate >= start && invoiceDate <= end;
          default: return true;
        }
      })
      .filter((invoice) => {
        const trimmedQuery = searchQuery.toLowerCase().trim();
        if (!trimmedQuery) return true;
        const searchTokens = trimmedQuery.split(/\s+/);
        return searchTokens.every((token) => {
          const matchesDetails =
            invoice.invoiceNumber.toLowerCase().includes(token) ||
            invoice.partyName.toLowerCase().includes(token) ||
            (invoice.partyNumber && invoice.partyNumber.includes(token));
          const matchesItems = invoice.items?.some(item =>
            item.name.toLowerCase().includes(token)
          );
          return matchesDetails || matchesItems;
        });
      })
      .filter((invoice) => invoice.type === activeType && invoice.status === activeTab);
  }, [invoices, activeType, activeTab, searchQuery, activeDateFilter, customStartDate, customEndDate]);

  const selectedPeriodText = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const formatDate = (date: Date) => date.toLocaleDateString('en-IN', options);

    switch (activeDateFilter) {
      case 'today': return `Today, ${formatDate(today)}`;
      case 'yesterday': return `Yesterday, ${formatDate(new Date(today.setDate(today.getDate() - 1)))}`;
      case 'last7': return `${formatDate(new Date(today.setDate(today.getDate() - 6)))} - ${formatDate(now)}`;
      case 'last15': return `${formatDate(new Date(today.setDate(today.getDate() - 14)))} - ${formatDate(now)}`;
      case 'last30': return `${formatDate(new Date(today.setDate(today.getDate() - 29)))} - ${formatDate(now)}`;
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${new Date(customStartDate).toLocaleDateString('en-IN', options)} - ${new Date(customEndDate).toLocaleDateString('en-IN', options)}`;
        }
        return 'Select Custom Range';
      default: return 'Selected Period';
    }
  }, [activeDateFilter, customStartDate, customEndDate]);

  const dateFilters = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7' },
    { label: 'Last 15 Days', value: 'last15' },
    { label: 'Last 30 Days', value: 'last30' },
    { label: 'Custom Range', value: 'custom' },
  ];

  const handleDateFilterSelect = (value: string) => {
    setActiveDateFilter(value);
    setIsFilterOpen(false);
  };

  const handleInvoiceClick = (invoiceId: string) => {
    setExpandedInvoiceId(prevId => (prevId === invoiceId ? null : invoiceId));
  };

  const preparePdfData = async (invoice: Invoice): Promise<PdfData | null> => {
    if (!currentUser?.companyId) return null;

    const dbOps = getFirestoreOperations(currentUser.companyId);
    const isPurchase = invoice.type === 'Debit';

    const [businessInfo, fetchedItems, billSettingsSnap] = await Promise.all([
      dbOps.getBusinessInfo(),
      dbOps.syncItems(),
      getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill'))
    ]);

    const billSettings = billSettingsSnap.exists() ? billSettingsSnap.data() : {};

    const populatedItems = (invoice.items || []).map((item: any, index: number) => {
      const fullItem = fetchedItems.find((fi: any) => fi.id === item.id);
      const finalTaxRate = item.taxRate || item.tax || item.gstPercent || fullItem?.tax || 0;

      let itemAmount = 0;
      if (item.effectiveUnitPrice && item.effectiveUnitPrice > 0) {
        itemAmount = item.effectiveUnitPrice * item.quantity;
      } else if (item.finalPrice !== undefined && item.finalPrice !== null && item.finalPrice > 0) {
        itemAmount = item.finalPrice;
      } else {
        itemAmount = item.mrp * item.quantity;
      }

      return {
        sno: index + 1,
        name: item.name,
        quantity: item.quantity,
        unit: fullItem?.unit || item.unit || "Pcs",
        listPrice: isPurchase ? (item.purchasePrice || item.mrp) : item.mrp,
        gstPercent: finalTaxRate,
        hsn: fullItem?.hsnSac || item.hsnSac || "N/A",
        discountAmount: isPurchase ? (item.purchasediscount || item.discount || item.manualDiscount || 0) : (item.discount || item.manualDiscount || 0),
        amount: itemAmount,
        taxType: item.taxType,
        taxAmount: item.taxAmount,
        taxableAmount: item.taxableAmount
      };
    });

    return {
      gstScheme: salesSettings?.gstScheme || '',
      taxType: invoice.taxType || salesSettings?.taxType || '',
      companyName: businessInfo?.name || '',
      companyAddress: businessInfo?.address || '',
      companyContact: businessInfo?.phoneNumber || '',
      companyEmail: businessInfo?.email || '',
      signatureBase64: billSettings.signatureBase64 || '',
      companyGstin: billSettings.companyGstin || businessInfo?.gstin || '',
      msmeNumber: billSettings.msmeNumber || '',
      panNumber: billSettings.panNumber || '',
      billDiscount: invoice.manualDiscount || 0,
      upiId: billSettings.upiId || '',
      billTo: {
        name: invoice.partyName,
        address: invoice.partyAddress || '',
        phone: invoice.partyNumber || '',
        gstin: invoice.partyGstin || '',
      },
      shipTo: {
        name: invoice.shippingName || '',
        address: invoice.shippingAddress || '',
        phone: invoice.shippingNumber || '',
        gstin: invoice.shippingGST || '',
      },
      extraExpenseName: invoice.extraExpenseName || '',
      extraExpenseAmount: invoice.extraExpenseAmount || 0,
      narration: invoice.narration || '',
      invoice: {
        number: invoice.invoiceNumber,
        date: new Date(invoice.createdAt).toLocaleString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: 'numeric', minute: 'numeric', hour12: true
        }),
        billedBy: salesSettings?.enableSalesmanSelection ? (invoice.salesmanName || 'N/A') : '',
        roNumber: '',
      },
      items: populatedItems,
      terms: billSettings.termsAndConditions || 'Goods once sold will not be taken back.',
      finalAmount: invoice.amount,
      bankDetails: {
        accountName: billSettings.accountName || businessInfo?.accountHolderName,
        accountNumber: billSettings.accountNumber || businessInfo?.accountNumber,
        bankName: billSettings.bankName || businessInfo?.bankName,
        ifsc: billSettings.ifscCode || '',
      }
    };
  };

  const handlePdfAction = async (invoice: Invoice, action: ACTION.DOWNLOAD | ACTION.PRINT) => {
    setInvoiceToPrint(null);
    setPdfGenerating(invoice.id);

    if (!currentUser?.companyId) {
      setModal({ message: 'User company ID missing.', type: State.ERROR });
      setPdfGenerating(null);
      return;
    }

    try {
      const dataForPdf = await preparePdfData(invoice);
      if (dataForPdf) {
        await generatePdf(dataForPdf, action);
      } else {
        throw new Error("Could not prepare PDF data");
      }
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setModal({ message: 'Failed to process PDF action.', type: State.ERROR });
    } finally {
      setPdfGenerating(null);
    }
  };

  const handleSendWhatsapp = async (invoice: Invoice) => {
    if (!invoice.partyNumber) {
      setModal({ message: "Customer phone number is missing.", type: State.ERROR });
      return;
    }

    setSendingPdf(true);

    try {
      if (!currentUser?.companyId || !currentUser?.uid) throw new Error("User context missing.");

      const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
      const businessSnap = await getDoc(businessDocRef);
      const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

      if (!botMasterToken || !whatsappNumber) {
        setModal({ message: "Company WhatsApp is not linked. Please setup WhatsApp first.", type: State.ERROR });
        setSendingPdf(false);
        return;
      }

      const dataForPdf = await preparePdfData(invoice);
      if (!dataForPdf) throw new Error("Failed to prepare invoice data.");
      const pdfBlob = await generatePdfBlob(dataForPdf);

      const safeNum = invoice.invoiceNumber.replace(/[\/\\?%*:|"<>]/g, '-');
      const cleanName = `${safeNum}.pdf`;
      const storageRef = ref(storage, cleanName);
      await uploadBytes(storageRef, pdfBlob);

      const fileUrl = await getDownloadURL(storageRef);

      const message = `Hello ${invoice.partyName},\n\nHere is your invoice #${invoice.invoiceNumber}.\nAmount: ${invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!`;

      const response = await botMasterService.sendPdfFromUrl(
        botMasterToken,
        whatsappNumber,
        invoice.partyNumber,
        message,
        fileUrl,
        cleanName
      );

      let isSuccess = false;
      if (isSuccess) {
        setModal({ message: "Invoice sent! Cleaning up...", type: State.SUCCESS });
        setTimeout(async () => {
          try {
            await deleteObject(storageRef);
          } catch (error) {
            console.warn("Could not auto-delete temp file:", error);
          }
        }, 60000);
        setInvoiceToPrint(null);
      }
      if (Array.isArray(response) && response.length > 0) {
        const res = response[0];
        if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
      } else if (response.status === 'sent' || response.status === 'success' || response.status === 200) {
        isSuccess = true;
      }

      if (isSuccess) {
        setModal({ message: "Invoice PDF sent via WhatsApp!", type: State.SUCCESS });
        setInvoiceToPrint(null);
      } else {
        throw new Error("API reported failure.");
      }
    } catch (err: any) {
      console.error("WhatsApp Send Error:", err);
      setModal({ message: "Failed to send WhatsApp invoice.", type: State.ERROR });
    } finally {
      setSendingPdf(false);
    }
  };

  const handleShowQr = (invoice: Invoice) => {
    setInvoiceToPrint(null);
    setShowQrModal(invoice);
  };

  const promptDeleteInvoice = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setModal({ message: "Are you sure you want to delete this invoice? This action cannot be undone and will restore item stock.", type: State.INFO });
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete || !invoiceToDelete.items) return;
    if (!currentUser?.companyId) {
      setModal({ message: "Error: No company ID found. Cannot delete.", type: State.ERROR });
      return;
    }
    const companyId = currentUser.companyId;
    const collectionName = invoiceToDelete.type === 'Credit' ? 'sales' : 'purchases';
    const invoiceDocRef = doc(db, 'companies', companyId, collectionName, invoiceToDelete.id);

    try {
      await runTransaction(db, async (transaction) => {
        for (const item of invoiceToDelete.items!) {
          if (item.id && item.quantity > 0) {
            const itemDocRef = doc(db, 'companies', companyId, 'items', item.id);
            const stockChange = invoiceToDelete.type === 'Credit' ? item.quantity : -item.quantity;
            transaction.update(itemDocRef, { stock: increment(stockChange), updatedAt: serverTimestamp() });
          }
        }
        transaction.delete(invoiceDocRef);
      });
      setModal({ message: "Invoice deleted and stock updated successfully.", type: State.SUCCESS });
    } catch (err) {
      console.error("Error in transaction: ", err);
      setModal({ message: `Failed to delete invoice: ${err instanceof Error ? err.message : 'Unknown error'}`, type: State.ERROR });
    } finally {
      setInvoiceToDelete(null);
      setTimeout(() => setModal(null), 3000);
    }
  };

  const cancelDelete = () => {
    setInvoiceToDelete(null);
    setModal(null);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    if (invoice.type === 'Credit') {
      navigate(ROUTES.SALES, { state: { invoiceData: invoice, isEditMode: true } });
    } else {
      navigate(ROUTES.PURCHASE, { state: { purchaseId: invoice.id, isEditMode: true } });
    }
  };

  const handleSalesReturn = (invoice: Invoice) => {
    navigate(`${ROUTES.SALES_RETURN}`, { state: { invoiceData: invoice } });
  };

  const handlePurchaseReturn = (invoice: Invoice) => {
    navigate(`${ROUTES.PURCHASE_RETURN}`, { state: { invoiceData: invoice } });
  };

  const openPaymentModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsModalOpen(true);
  };


  const handleSettlePayment = async (
    invoice: any,
    amount: number,
    method: string,
    chequeNumber?: string,
    chequeDate?: string
  ) => {
    if (!currentUser?.companyId) {
      throw new Error("No company ID found. Cannot settle payment.");
    }

    const companyId = currentUser.companyId;
    const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
    const docRef = doc(db, 'companies', companyId, collectionName, invoice.id);

    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists()) throw new Error("Document does not exist!");

      const data = sfDoc.data() as DocumentData;
      const currentPaymentMethods = data.paymentMethods || {};
      const currentDue = currentPaymentMethods.due || 0;
      const currentMethodTotal = currentPaymentMethods[method] || 0;

      const newDue = currentDue - amount;
      if (newDue < 0) throw new Error('Payment exceeds due amount.');

      const newPaymentMethods = {
        ...currentPaymentMethods,
        [method]: currentMethodTotal + amount,
        due: newDue,
      };

      const paymentRecord = {
        amount,
        method,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        chequeNumber: method === 'PDC' ? (chequeNumber || '') : '',
        chequeDate: method === 'PDC' ? (chequeDate || '') : ''
      };

      const currentHistory = data.paymentHistory || [];

      transaction.update(docRef, {
        paymentMethods: newPaymentMethods,
        paymentHistory: [...currentHistory, paymentRecord]
      });

      // Trigger notification ONLY for unpaid sales settled via CASH/UPI
      const isSales = invoice.type === 'Credit';
      const isCashOrUpi = method?.toLowerCase() === 'cash' || method?.toLowerCase() === 'upi';
      const isNowPaid = newDue === 0;

      if (isSales && isCashOrUpi) {
        window.dispatchEvent(
          new CustomEvent('pdc_notification', {
            detail: {
              invoiceNumber: invoice.invoiceNumber,
              partyName: invoice.partyName,
              amount: amount,
              createdAt: new Date().toISOString(),
              status: isNowPaid ? 'PAID' : 'UPCOMING',
              method: method
            },
          })
        );
      }
    });
  };

  const handlePrintQr = (invoice: Invoice) => {
    if (!invoice.items || invoice.items.length === 0) {
      setModal({ message: "No items found in this invoice to print.", type: State.ERROR });
      return;
    }
    const cleanItems = invoice.items.map(item => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity),
      mrp: Number(item.mrp),
      barcode: item.barcode || '',
    }));
    navigate(ROUTES.PRINTQR, {
      state: { prefilledItems: cleanItems }
    });
  };

  const totalUnpaidAmount = useMemo(() => {
    if (activeTab !== 'Unpaid') return 0;
    return filteredInvoices.reduce((sum, invoice) => {
      return sum + (invoice.dueAmount || 0);
    }, 0);
  }, [filteredInvoices, activeTab]);

  const renderContent = () => {
    if (authLoading || dataLoading) return <Spinner />;
    if (error) return <p className="p-8 text-center text-red-500">{error}</p>;

    if (filteredInvoices.length > 0) {
      return filteredInvoices.map((invoice) => {
        const isExpanded = expandedInvoiceId === invoice.id;
        const paymentMethods = invoice.paymentMethods || {};
        const activeModes = Object.entries(paymentMethods)
          .filter(([key, value]) => key !== 'due' && Number(value) > 0);

        // If the tutorial is completed via last step (step 6), persist in Firestore as well
        // (If there are any localStorage.setItem("journal_tutorial_done", "true") calls, replace below)

        // --- Button visibility logic ---
        const hasProPermission = (currentUser as any)?.permissions?.includes(Permissions.HiddenProFeatures);
        const visibleButtonsCount =
          (invoice.status === 'Unpaid' ? 1 : 0) +
          (invoice.status === 'Paid' ? 1 : 0) +
          (hasProPermission ? (invoice.type === 'Credit' ? 3 : 2) : 0);

        return (
          <CustomCard key={invoice.id} onClick={() => handleInvoiceClick(invoice.id)} className="cursor-pointer transition-shadow hover:shadow-md">
            <div className="flex justify-between items-end w-full -mt-5 relative pointer-events-none">
              <div className="flex justify-start gap-1 flex-wrap max-w-[50%] pointer-events-auto">
                {invoice.returnHistory && invoice.returnHistory.length > 0 && (
                  invoice.returnHistory.map((historyItem: any, index: number) => (
                    <span
                      key={`return-${index}`}
                      className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider bg-orange-50 text-orange-600 border-orange-200 whitespace-nowrap"
                    >
                      {historyItem.modeOfReturn || 'Return'}
                    </span>
                  ))
                )}
              </div>
              <div className="flex justify-end gap-1 flex-wrap max-w-[50%] text-right pointer-events-auto">
                {activeModes.map(([mode]) => (
                  <span
                    key={mode}
                    className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider bg-blue-50 text-blue-600 border-blue-100 whitespace-nowrap"
                  >
                    {mode === 'upi' ? 'UPI' : mode.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-slate-800">{invoice.invoiceNumber}</p>
                <p className="text-sm text-slate-500 mt-1">{invoice.partyName}</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  {invoice.status === 'Unpaid' && invoice.dueAmount && invoice.dueAmount > 0 ? (
                    <>
                      <p className="text-lg font-bold text-red-600">{invoice.dueAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                      <p className="text-xs text-slate-400">Total: {invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-slate-800">{invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                  )}
                  <p className="text-xs text-slate-500">{invoice.time}</p>
                </div>
                <IconChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {isExpanded && (
              <div className="mt-1">
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-slate-300"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Items</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {(invoice.items && invoice.items.length > 0) ? invoice.items.map((item, index) => {
                    const netUnitPrice =
                      item.taxableAmount && item.quantity > 0
                        ? item.taxableAmount / item.quantity
                        : item.effectiveUnitPrice
                          ? item.effectiveUnitPrice
                          : (item.quantity > 0 ? (item.finalPrice / item.quantity) : 0);

                    return (
                      <div key={index} className="flex justify-between items-center text-slate-700 mb-3">
                        <div className="flex-1 pr-4">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <span>
                              {item.mrp > 0
                                ? `MRP: ${item.mrp.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}`
                                : `Selling Price: ${
                                    (
                                      item.effectiveUnitPrice ||
                                      (item.quantity > 0 ? item.finalPrice / item.quantity : 0)
                                    ).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })
                                  }`
                              }
                            </span>
                            <span className="text-slate-400">|</span>
                            <span className="text-slate-400 font-medium">
                              Net: {netUnitPrice.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}
                            </span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{item.finalPrice.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                          <p className="text-xs text-slate-400">Qty: {item.quantity}</p>
                        </div>
                      </div>
                    );
                  }) : <p className="text-xs text-slate-400">No item details available.</p>}
                </div>

                {invoice.manualDiscount && invoice.manualDiscount > 0 ? (
                  <div className="flex justify-between items-center mt-3 pt-1.5 border-t border-line border-slate-200">
                    <p className="text-xs font-medium text-slate-400">Bill Discount</p>
                    <p className="text-xs font-semibold text-red-400">
                      - {invoice.manualDiscount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </p>
                  </div>
                ) : null}

                {invoice.taxAmount && invoice.taxAmount > 0 ? (
                  <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-slate-200">
                    <p className="text-xs font-medium text-slate-400">Tax</p>
                    <p className="text-xs font-semibold text-yellow-500">
                      + {invoice.taxAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </p>
                  </div>
                ) : null}

                {/* --- NEW: EXTRA EXPENSE ROW --- */}
                {invoice.extraExpenseAmount && invoice.extraExpenseAmount > 0 ? (
                  <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-slate-200">
                    <p className="text-xs font-medium text-slate-400">{invoice.extraExpenseName || 'Extra Expense'}</p>
                    <p className="text-xs font-semibold text-orange-500">
                      + {invoice.extraExpenseAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </p>
                  </div>
                ) : null}

                {activeModes.length > 0 && (
                  <div className="flex justify-between items-start mt-1 pt-2 border-t border-slate-200 text-xs text-slate-500">
                    {salesSettings?.enableSalesmanSelection ? (
                      <p className="text-left whitespace-nowrap mr-2">
                        Salesman: {invoice.salesmanName?.slice(0, 15) || 'N/A'}
                      </p>
                    ) : <div></div>}
                    <div className="flex flex-wrap justify-end gap-x-2 gap-y-1 text-right">
                      <span>Paid via:</span>
                      {activeModes.map(([key, val]) => (
                        <span key={key} className="font-medium text-slate-700 whitespace-nowrap">
                          {key === 'upi' ? 'UPI' : key.charAt(0).toUpperCase() + key.slice(1)}: {Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`flex gap-2 mt-2 pt-4 border-t border-slate-200 ${
                  visibleButtonsCount === 1 ? 'justify-center' : 'justify-between'
                }`}>
                  {invoice.status === 'Unpaid' && (<button onClick={(e) => { e.stopPropagation(); openPaymentModal(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">Settle</button>)}
                  {invoice.status === 'Paid' && (<button onClick={(e) => { e.stopPropagation(); promptDeleteInvoice(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors">Delete</button>)}
                  <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                    <button onClick={(e) => { e.stopPropagation(); handleEditInvoice(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-gray-400 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors">Edit</button>
                  </ShowWrapper>

                  {invoice.type === 'Credit' && (
                    <>
                      <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                        <button onClick={(e) => { e.stopPropagation(); handleSalesReturn(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-sky-500 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">Return</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }}
                          disabled={pdfGenerating === invoice.id}
                          className="px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {pdfGenerating === invoice.id ? <Spinner /> : 'Print'}
                        </button>
                      </ShowWrapper>
                    </>
                  )}

                  {invoice.type === 'Debit' && (
                    <>
                      <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                        <button onClick={(e) => { e.stopPropagation(); handlePurchaseReturn(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-sky-500 rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors">Return</button>
                        <button onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors flex items-center gap-2">Print</button>
                      </ShowWrapper>
                    </>
                  )}
                </div>
              </div>
            )}
          </CustomCard>
        );
      });
    }
    return <p className="p-8 text-center text-base text-slate-500">No invoices found for this selection.</p>;
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-100 mb-10">
      {modal && <Modal message={modal.message} type={modal.type} onClose={cancelDelete} onConfirm={confirmDeleteInvoice} showConfirmButton={invoiceToDelete !== null} />}
      <PaymentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} invoice={selectedInvoice} onSubmit={handleSettlePayment} />

      {/* ACTION SELECTION MODAL */}
      {invoiceToPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setInvoiceToPrint(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4 shadow-xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Select Action</h3>
              <button onClick={() => setInvoiceToPrint(null)} className="text-gray-500 hover:text-gray-700">
                <IconClose />
              </button>
            </div>
            <p className="text-gray-600 mb-6">Choose how you want to provide the bill.</p>
            <div className="flex flex-col gap-3">
              {invoiceToPrint.type === 'Credit' ? (
                <>
                  <button
                    onClick={() => handleSendWhatsapp(invoiceToPrint)}
                    disabled={sendingPdf}
                    className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
                  </button>
                  <button onClick={() => handlePdfAction(invoiceToPrint, ACTION.DOWNLOAD)} className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    <IconDownload /> Download PDF
                  </button>
                  <button onClick={() => handlePdfAction(invoiceToPrint, ACTION.PRINT)} className="w-full bg-white text-gray-700 border border-gray-300 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                    <IconPrint /> Print Directly
                  </button>
                  <button onClick={() => handleShowQr(invoiceToPrint)} className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                    <IconScanCircle width={20} height={20} /> Generate QR Code
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => handlePdfAction(invoiceToPrint, ACTION.DOWNLOAD)} className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 bg-sky-500 text-gray-300" disabled>
                    <IconDownload /> Download PDF
                  </button>
                  <button
                    onClick={() => {
                      handlePrintQr(invoiceToPrint);
                      setInvoiceToPrint(null);
                    }}
                    className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <IconPrint /> Print QR
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showQrModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300 relative">
            <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <FiX size={24} />
            </button>
            <h3 className="text-xl font-bold text-gray-800 mb-1">Download Bill</h3>
            <p className="text-sm text-gray-500 mb-4">Invoice #{showQrModal.invoiceNumber}</p>
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

      {/* Subscription expiry badge */}
      {showBadge && (
        <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-red-300' : 'bg-amber-200'}`}>
          <ShinyText
            text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`}
            speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100}
            direction="left" yoyo={false} pauseOnHover={false} disabled={false}
          />
          <Link to="/subscription" className="text-black ml-2 underline hover:text-gray-100">Renew Now</Link>
        </div>
      )}

      {/* ── HEADER ROW ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col z-20 relative">

        {/* Row 1: Title + Filter icon */}
        <div className="flex items-center justify-between px-4 pt-2 relative">
          <div className="flex-1 flex flex-col items-center relative">
            <h1 className="text-3xl font-bold text-slate-800">Transactions</h1>

            {/* Step 2 — date label */}
            <TutorialStep
              step={2}
              currentStep={tutorialStep}
              text="Tap the date to pick a custom range for your transactions."
              onNext={() => next(3)}
              onSkip={skip}
            >
              <div
                ref={setTutorialRef(2) as any}
                className="flex items-center w-full relative"
              >
                <TutorialStep
                  step={1}
                  currentStep={tutorialStep}
                  text="Tap the search icon to find invoices by name, number, or phone."
                  onNext={() => next(2)}
                  onSkip={skip}
                  mobileArrowAlign="left"
                >
                  <button
                    onClick={() => setShowSearch(!showSearch)}
                    className="text-slate-500 hover:text-slate-800 transition-colors ml-0"
                  >
                    {showSearch ? <IconClose /> : <IconSearch />}
                  </button>
                </TutorialStep>

                <div
                  onClick={() => {
                    if (showCustomPicker) {
                      setShowCustomPicker(false);
                    } else {
                      setShowCustomPicker(true);
                      setActiveDateFilter('custom');
                    }
                  }}
                  className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 cursor-pointer hover:bg-gray-200 px-3 py-1 rounded-full transition-colors select-none"
                >
                  <p className='text-center text-lg font-light text-slate-600'>{selectedPeriodText}</p>
                  <IconChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
                </div>

                {/* Filter icon block moved here, ml-auto for spacing */}
                <div ref={filterRef} className="flex items-center ml-auto">
                  <TutorialStep
                    step={3}
                    currentStep={tutorialStep}
                    text="Use this filter to quickly jump to Today, Last 7 Days, Last 30 Days, and more."
                    onNext={() => next(4)}
                    onSkip={skip}
                  >
                    <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-slate-500 hover:text-slate-800 transition-colors">
                      <IconFilter />
                    </button>
                  </TutorialStep>

                  {isFilterOpen && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-10 border overflow-hidden">
                      <ul className="py-1">
                        {dateFilters.map((filter) => (
                          filter.value !== 'custom' && (
                            <li key={filter.value}>
                              <button
                                onClick={() => { handleDateFilterSelect(filter.value); setIsFilterOpen(false); }}
                                className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === filter.value ? 'bg-slate-100 text-slate-900' : 'text-slate-700'} hover:bg-slate-50`}
                              >
                                {filter.label}
                              </button>
                            </li>
                          )
                        ))}
                        <li>
                          <button
                            onClick={() => { setActiveDateFilter('custom'); setIsFilterOpen(false); setShowCustomPicker(true); }}
                            className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === 'custom' ? 'bg-slate-100 text-slate-900' : 'text-slate-700'} hover:bg-slate-50`}
                          >
                            Custom Range
                          </button>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </TutorialStep>

            {showCustomPicker && (
              <div className="absolute top-full bg-white shadow-xl border border-gray-200 rounded-lg p-4 z-50 min-w-[300px] flex flex-col gap-4 animate-in fade-in zoom-in duration-200 cursor-default">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col">
                    <label className="text-center text-xs font-semibold text-gray-500 mb-1">From</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => { setCustomStartDate(e.target.value); setActiveDateFilter('custom'); }}
                      className="border border-gray-300 rounded-sm px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-center text-xs font-semibold text-gray-500 mb-1">To</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => { setCustomEndDate(e.target.value); setActiveDateFilter('custom'); }}
                      className="border border-gray-300 rounded-sm px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-center text-center border-t border-gray-100 -mt-2 -mb-2">
                  <button
                    onClick={() => setShowCustomPicker(false)}
                    className="flex-grow bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
            {/* Inserted search input below the date line */}
            {showSearch && (
              <div className="mt-1 w-full max-w-md px-4">
                <input
                  type="text"
                  placeholder="Search by Invoice, Name, or Phone..."
                  className="w-full text-base font-light p-1 border-b-2 border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
          <div className="absolute right-4 top-1 border border-slate-300 rounded-sm p-1 bg-gray-100 shadow-sm">
            <NotificationBell />
          </div>
        </div>

        {/* Step 4 — Sales / Purchase toggle */}
        <TutorialStep
          step={4}
          currentStep={tutorialStep}
          text="Switch between Sales (money received) and Purchase (money spent) transactions here."
          onNext={() => next(5)}
          onSkip={skip}
        >
          <div className="flex justify-center border-b border-gray-500 p-2 mb-2">
            <CustomButton variant={Variant.Transparent} active={activeType === 'Credit'} onClick={() => setActiveType('Credit')}>Sales</CustomButton>
            <CustomButton
              variant={Variant.Transparent}
              active={activeType === 'Debit'} onClick={() => setActiveType('Debit')}
              disabled={!hasPermission(Permissions.HiddenProFeatures)}  // Optional: style it differently if locked
              className={!hasPermission(Permissions.HiddenProFeatures) ? 'opacity-50 cursor-not-allowed' : ''}
            >
              {hasPermission(Permissions.HiddenProFeatures) ? 'Purchase' : '🔒 Purchase'}
            </CustomButton>
          </div>
        </TutorialStep>

        {/* Step 5 — Paid / Unpaid toggle */}
        <TutorialStep
          step={5}
          currentStep={tutorialStep}
          text="Toggle between Paid and Unpaid invoices. Unpaid shows your outstanding dues."
          onNext={async () => {
            // When the last step is completed, also persist in Firestore
            if (!currentUser?.companyId) {
              setTutorialStep(0);
              window.dispatchEvent(new Event("journal_tutorial_done"));
              return;
            }
            try {
              await setDoc(
                doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
                { journalTutorialDone: true },
                { merge: true }
              );
            } catch (e) {
              console.error('Error saving journal tutorial:', e);
            }
            setTutorialStep(0);
            window.dispatchEvent(new Event("journal_tutorial_done"));
          }}
          onSkip={skip}
          isLast
        >
          <CustomToggle>
            <CustomToggleItem className="mr-2" onClick={() => setActiveTab('Paid')} data-state={activeTab === 'Paid' ? 'on' : 'off'}>Paid</CustomToggleItem>
            <CustomToggleItem onClick={() => setActiveTab('Unpaid')} data-state={activeTab === 'Unpaid' ? 'on' : 'off'}>Unpaid</CustomToggleItem>
          </CustomToggle>
        </TutorialStep>

        {activeTab === 'Unpaid' && (
          <div className="mx-2 mt-2 p-2 bg-red-50 border border-red-200 rounded-sm flex justify-between items-center shadow-sm animate-in fade-in slide-in-from-top-2">
            <div>
              <p className="text-sm text-red-600 font-bold tracking-wider">
                {activeType === 'Credit' ? 'Total Receivables : ' : 'Total Payables : '}
                {totalUnpaidAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
              </p>
            </div>
          </div>
        )}

        <div className="flex-grow overflow-y-auto bg-slate-100 space-y-3 pt-2 pb-24">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default Journal;