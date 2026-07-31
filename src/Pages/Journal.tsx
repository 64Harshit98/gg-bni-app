import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { CustomToggle, CustomToggleItem } from '../Components/CustomToggle';
import { CustomCard } from '../Components/CustomCard';
import { Button } from '../Components/ui/button';
import { State, ACTION, PLANS } from '../enums';
import { Spinner } from '../constants/Spinner';
import { Skeleton } from '../Components/ui/skeleton';
import { EmptyState } from '../Components/ui/empty-state';
import { Inbox } from 'lucide-react';
import { ROUTES } from '../constants/routes.constants';
import { Modal, PaymentModal } from '../constants/Modal';
import ShinyText from '../Components/ShinyText';
import { generatePdf, generatePdfBlob } from '../UseComponents/pdfGenerator';
import { useSalesSettings } from '../context/SettingsContext';
import { IconChevronDown, IconClose, IconFilter, IconSearch } from '../constants/Icons';
import { botMasterService } from './Additional/Whatsapp/WhatsappApi';
import { TutorialStep } from '../Components/TutorialStep'; // ← same import as Home.tsx
import { Permissions } from '../enums/permissions.enum';
import ShowWrapper from '../context/ShowWrapper';
import NotificationBell from "../Components/NotificationBell"
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';
import {
  type Invoice,
  subscribeSalesInvoices,
  subscribePurchaseInvoices,
  maybeNotifyPdcCheque,
  fetchCompanyExpiryInfo,
  fetchEnableTriplicate,
  deleteInvoiceAndRestoreStock,
  fetchPartyBalance,
  settleInvoicePayment,
  fetchBusinessWhatsappCreds,
  fetchWhatsappExtraMessage,
  uploadInvoicePdf,
  markJournalTutorialDone,
  preparePdfData as preparePdfDataService,
} from '../services/journal.service';
import { InvoiceActionModals } from './JournalComponents/InvoiceActionModals';
// ─── Total tutorial steps for Journal ───────────────────────────────────────
const TOTAL_STEPS = 6;

// ─── Sample data shown ONLY while the tutorial is running, so the screen
//     never looks empty behind the walkthrough tooltips ──────────────────
const SAMPLE_INVOICES: Invoice[] = [
  {
    id: 'sample-1',
    invoiceNumber: 'INV-1001',
    amount: 2450,
    time: '10:45 AM, 07/07',
    status: 'Paid',
    type: 'Credit',
    partyName: 'Rahul Traders',
    partyNumber: '9876543210',
    createdAt: new Date(),
    dueAmount: 0,
    items: [
      { id: 'i1', name: 'Sample Item A', quantity: 2, finalPrice: 1200, mrp: 700, unit: 'Pcs' },
      { id: 'i2', name: 'Sample Item B', quantity: 1, finalPrice: 1250, mrp: 1250, unit: 'Pcs' },
    ],
    paymentMethods: { cash: 2450, due: 0 },
    paymentHistory: [],
    returnHistory: [],
  },
];


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

    const unsubSales = subscribeSalesInvoices(companyId, (salesData) => {
      setInvoices(prev => {
        const withoutCredit = prev.filter(inv => inv.type !== 'Credit');
        const combined = [...withoutCredit, ...salesData];
        return combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLoading(false);
    }, (message) => {
      setError(message);
      setLoading(false);
    });

    const unsubPurchases = subscribePurchaseInvoices(companyId, (purchasesData) => {
      setInvoices(prev => {
        const withoutDebit = prev.filter(inv => inv.type !== 'Debit');
        const combined = [...withoutDebit, ...purchasesData];
        return combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLoading(false);
    }, (message) => {
      setError(message);
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
  const [showPrintSubMenu, setShowPrintSubMenu] = useState(false);
  const [enableTriplicate, setEnableTriplicate] = useState(false);

  const { currentUser, loading: authLoading, hasPermission } = useAuth();

  // ─── Tutorial state (mirrors Home.tsx pattern) ────────────────────────────
  const [tutorialStep, setTutorialStep] = useState(0);
  // Bill type toggle for action modal
  const [billType, setBillType] = useState<'estimate' | 'bill'>('bill');

  const next = (n: number) => setTutorialStep(n <= TOTAL_STEPS ? n : 0);
  const skip = () => {
    completeTutorial(currentUser, 'journalTutorialDone', setTutorialStep);
  };
  // True only while the walkthrough is actively running
  const isTutorialActive = tutorialStep > 0 && tutorialStep <= TOTAL_STEPS;

  useTutorial(currentUser, setTutorialStep, 'journalTutorialDone');
  // When the tutorial reaches the "invoice card" step, auto-expand a matching
  // sample invoice so the person actually sees the detail view, not a blank card.
  useEffect(() => {
    if (isTutorialActive && tutorialStep === 6) {
      const target = SAMPLE_INVOICES.find(
        (inv) => inv.type === activeType && inv.status === activeTab
      );
      if (target) setExpandedInvoiceId(target.id);
    }
  }, [tutorialStep, isTutorialActive, activeType, activeTab]);
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

    const companyId = currentUser?.companyId || '';

    invoices.forEach((invoice) => {
      const history = invoice.paymentHistory || [];

      history.forEach((payment: any) => {
        maybeNotifyPdcCheque(companyId, invoice, payment).catch((err) => {
          console.error('Error checking PDC notification:', err);
        });
      });
    });
  }, [invoices]);
  const navigate = useNavigate();

  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isPosBasicPlan, setIsPosBasicPlan] = useState(false);
  useEffect(() => {
    const fetchExpiry = async () => {
      if (!currentUser?.companyId) return;
      const { daysRemaining: remaining, isPosBasicPlan: posBasic } = await fetchCompanyExpiryInfo(currentUser.companyId);
      setDaysRemaining(remaining);
      setIsPosBasicPlan(posBasic);
    };
    fetchExpiry();
  }, [currentUser?.companyId]);
  // NEW: fetch bill settings to know if triplicate printing is enabled
  useEffect(() => {
    const fetchBillSettings = async () => {
      if (!currentUser?.companyId) return;
      try {
        setEnableTriplicate(await fetchEnableTriplicate(currentUser.companyId));
      } catch (err) {
        console.error('Error fetching bill settings for triplicate flag:', err);
      }
    };
    fetchBillSettings();
  }, [currentUser?.companyId]);

  const showBadge = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
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
    // While the tutorial is active, always show the sample invoices,
    // regardless of date filter / search / tab state, so every tutorial
    // step has real-looking cards to point at.
    if (isTutorialActive) {
      return SAMPLE_INVOICES.filter(
        (invoice) => invoice.type === activeType && invoice.status === activeTab
      );
    }
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
  }, [invoices, activeType, activeTab, searchQuery, activeDateFilter, customStartDate, customEndDate, isTutorialActive]);

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



  const handlePdfAction = async (invoice: Invoice, action: ACTION.DOWNLOAD | ACTION.PRINT, withDuplicate: boolean = false) => {
    setInvoiceToPrint(null);
    setPdfGenerating(invoice.id);

    if (!currentUser?.companyId) {
      setModal({ message: 'User company ID missing.', type: State.ERROR });
      setPdfGenerating(null);
      return;
    }

    try {
      const dataForPdf = await preparePdfDataService({
        invoice: { ...invoice, isEstimate: billType === 'estimate' } as Invoice,
        forcePosPrint: isPosBasicPlan,
        companyId: currentUser?.companyId || '',
        isPosBasicPlan,
        salesSettings,
      });
      if (dataForPdf) {
        await generatePdf(dataForPdf, action, withDuplicate);
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

      const { botMasterToken, whatsappNumber } = await fetchBusinessWhatsappCreds(currentUser.companyId);

      if (!botMasterToken || !whatsappNumber) {
        setSendingPdf(false);
        navigate(ROUTES.WHATSAPP_PLAN);
        return;
      }

      const dataForPdf = await preparePdfDataService({
        invoice: { ...invoice, isEstimate: billType === 'estimate' } as Invoice,
        forcePosPrint: isPosBasicPlan,
        companyId: currentUser?.companyId || '',
        isPosBasicPlan,
        salesSettings,
      });
      if (!dataForPdf) throw new Error("Failed to prepare invoice data.");

      const pdfBlob = await generatePdfBlob(dataForPdf);

      const safeNum = invoice.invoiceNumber.replace(/[/\\?%*:|"<>]/g, '-');
      const cleanName = `${safeNum}.pdf`;
      const { fileUrl, remove: removeUploadedPdf } = await uploadInvoicePdf(cleanName, pdfBlob);

      // --- Fetch the extra message from bill settings ---
      const extraMsg = await fetchWhatsappExtraMessage(currentUser.companyId);
      // -------------------------------------------------------

      // Append the extraMsg to the end of your standard message
      const message = `Hello ${invoice.partyName},\n\nHere is your invoice #${invoice.invoiceNumber}.\nAmount: ${invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!${extraMsg}`;
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
        setModal({ message: "Invoice sent!", type: State.SUCCESS });
        setTimeout(async () => {
          try {
            await removeUploadedPdf();
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

  const handleSendReminder = async (invoice: Invoice) => {
    if (!invoice.partyNumber) {
      setModal({ message: "Customer phone number is missing.", type: State.ERROR });
      return;
    }
    if (!currentUser?.companyId) return;

    setSendingPdf(true);

    try {
      const { botMasterToken, whatsappNumber } = await fetchBusinessWhatsappCreds(currentUser.companyId);

      if (!botMasterToken || !whatsappNumber) {
        setSendingPdf(false);
        navigate(ROUTES.WHATSAPP_PLAN);
        return;
      }

      // --- Generate PDF and upload, same as handleSendWhatsapp ---
      const dataForPdf = await preparePdfDataService({
        invoice: { ...invoice, isEstimate: billType === 'estimate' } as Invoice,
        forcePosPrint: isPosBasicPlan,
        companyId: currentUser?.companyId || '',
        isPosBasicPlan,
        salesSettings,
      });
      if (!dataForPdf) throw new Error("Failed to prepare invoice data.");

      const pdfBlob = await generatePdfBlob(dataForPdf);

      const safeNum = invoice.invoiceNumber.replace(/[/\\?%*:|"<>]/g, '-');
      const cleanName = `${safeNum}.pdf`;
      const { fileUrl, remove: removeUploadedPdf } = await uploadInvoicePdf(cleanName, pdfBlob);
      // -------------------------------------------------------------

      const dueAmt = (invoice.dueAmount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
      const totalAmt = invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

      const message = `Dear ${invoice.partyName},\n\nThis is a gentle reminder that an amount of ${dueAmt} is still due against your invoice #${invoice.invoiceNumber} (Total: ${totalAmt}).\n\nKindly clear the due amount at your earliest convenience. Thank you!`;

      const response = await botMasterService.sendPdfFromUrl(
        botMasterToken,
        whatsappNumber,
        invoice.partyNumber,
        message,
        fileUrl,
        cleanName
      );

      let isSuccess = false;
      if (Array.isArray(response) && response.length > 0) {
        const res = response[0];
        if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
      } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
        isSuccess = true;
      }

      if (isSuccess) {
        setModal({ message: "Reminder sent via WhatsApp!", type: State.SUCCESS });
        // Cleanup temp file after 1 minute, same pattern as handleSendWhatsapp
        setTimeout(async () => {
          try {
            await removeUploadedPdf();
          } catch (error) {
            console.warn("Could not auto-delete temp file:", error);
          }
        }, 60000);
      } else {
        throw new Error("API reported failure.");
      }
    } catch (err) {
      console.error("Reminder Send Error:", err);
      setModal({ message: "Failed to send reminder.", type: State.ERROR });
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

    // Check if invoice has credit note in payment methods
    const creditNotePayment = Number(invoice.paymentMethods?.['Credit Note'] || 0);

    // Check if invoice has credit note returns
    const hasCreditNoteReturns = (invoice.returnHistory || []).some((h: any) =>
      h.modeOfReturn === 'Credit Note' || h.modeOfReturn?.includes('Credit Note')
    );

    let warningMessage = "Are you sure you want to delete this invoice? This action cannot be undone";

    // Add credit note warning for payments
    if (creditNotePayment > 0) {
      warningMessage += `. This bill was paid using Credit Note of ${creditNotePayment.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}. The credit note balance will be restored to the customer`;
    }

    // Add credit note warning for returns
    if (hasCreditNoteReturns) {
      const creditNoteReturnAmount = (invoice.returnHistory || [])
        .filter((h: any) => h.modeOfReturn === 'Credit Note' || h.modeOfReturn?.includes('Credit Note'))
        .reduce((sum: number, h: any) => sum + (Number(h.finalBalance) || 0), 0);

      if (creditNotePayment > 0) {
        warningMessage += ` and the returned items' Credit Note of ${creditNoteReturnAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} will be removed from the customer`;
      } else {
        warningMessage += `. This bill contains Credit Note returns of ${creditNoteReturnAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} which will be removed from the customer`;
      }
    }

    // Add stock restoration message for non-POS_BASIC plans
    if (currentUser?.plan !== PLANS.POS_BASIC) {
      warningMessage += " and will restore item stock";
    }

    warningMessage += ".";

    setModal({ message: warningMessage, type: State.INFO });
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete || !invoiceToDelete.items) return;
    if (!currentUser?.companyId) {
      setModal({ message: "Error: No company ID found. Cannot delete.", type: State.ERROR });
      return;
    }

    try {
      await deleteInvoiceAndRestoreStock(currentUser.companyId, invoiceToDelete);
      setModal({ message: "Invoice deleted ", type: State.SUCCESS });
    } catch (err) {
      console.error("Error in batch write: ", err);
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

  const [customerCredit, setCustomerCredit] = useState<number>(0);
  const openPaymentModal = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsModalOpen(true);

    const phone = (invoice.partyNumber || '').replace(/\D/g, '').slice(-10);
    if (phone && currentUser?.companyId) {
      try {
        setCustomerCredit(await fetchPartyBalance(currentUser.companyId, phone, invoice.type === 'Debit'));
      } catch (err) {
        console.error('Error fetching balance:', err);
        setCustomerCredit(0);
      }
    } else {
      setCustomerCredit(0);
    }
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

    const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
    const isCreditNote = normalizedMethod === 'credit' || normalizedMethod === 'creditnote'
      || normalizedMethod === 'debit' || normalizedMethod === 'debitnote';
    const normalizedPhone = (invoice.partyNumber || '').replace(/\D/g, '').slice(-10);

    await settleInvoicePayment(currentUser.companyId, invoice, amount, method, chequeNumber, chequeDate);

    // ✅ Transaction complete hone ke BAAD React state update karo
    if (isCreditNote && normalizedPhone) {
      setCustomerCredit(prev => Math.max(0, prev - amount));
    }
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
    if (authLoading || dataLoading) {
      return (
        <div className="space-y-2 p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      );
    }
    if (error) return <p className="p-8 text-center text-destructive">{error}</p>;

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
          (invoice.status === 'Unpaid' ? 1 : 0) +                              // Settle
          (invoice.status === 'Unpaid' && invoice.partyNumber ? 1 : 0) +       // Remind
          (invoice.status === 'Paid' ? 1 : 0) +                                // Delete
          (hasProPermission ? 1 : 0) +                                         // Edit
          (hasProPermission ? (invoice.type === 'Credit' ? 2 : 2) : 0);        // Return + Print

        return (
          <CustomCard key={invoice.id} onClick={() => handleInvoiceClick(invoice.id)} className="cursor-pointer transition-shadow hover:shadow-md">
            <div className="flex justify-between items-end w-full -mt-5 relative pointer-events-none">
              <div className="flex justify-start gap-1 flex-wrap max-w-[50%] pointer-events-auto">
                {invoice.returnHistory && invoice.returnHistory.length > 0 && (
                  invoice.returnHistory.map((historyItem: any, index: number) => (
                    <span
                      key={`return-${index}`}
                      className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-sm border tracking-wider bg-warning/10 text-warning border-warning/20 whitespace-nowrap"
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
                    className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-sm border tracking-wider bg-info/10 text-info border-info/20 whitespace-nowrap"
                  >
                    {mode === 'upi' ? 'UPI' : mode.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-foreground">{invoice.invoiceNumber}</p>
                <p className="text-sm text-muted-foreground mt-1">{invoice.partyName}</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  {invoice.status === 'Unpaid' && invoice.dueAmount && invoice.dueAmount > 0 ? (
                    <>
                      <p className="text-lg font-bold text-destructive">{invoice.dueAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                      <p className="text-xs text-muted-foreground">Total: {invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-foreground">{invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{invoice.time}</p>
                </div>
                <IconChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {isExpanded && (
              <div className="mt-1">
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card px-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">Items</span>
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

                    // --- Collect ALL returned qty for this item across all return entries ---
                    const returnedEntries: { qty: number; modeOfReturn: string; returnedAt: any }[] = [];
                    (invoice.returnHistory || []).forEach((h: any) => {
                      (h.returnedItems || []).forEach((r: any) => {
                        if (r.originalItemId === item.id || r.originalItemId === (item as any).productId) {
                          returnedEntries.push({
                            qty: Number(r.quantity) || Number(r.qty) || 0,
                            modeOfReturn: h.modeOfReturn || '',
                            returnedAt: h.returnedAt,
                          });
                        }
                      });
                    });

                    // const totalReturnedQty = returnedEntries.reduce((sum, e) => sum + e.qty, 0);
                    const remainingQty = item.quantity;

                    const renderPriceRow = (qty: number) => {
                      const amt = netUnitPrice * qty;
                      return amt.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
                    };

                    const priceLabel = item.mrp > 0
                      ? `MRP: ${item.mrp.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}`
                      : `Sales Price: ${(item.effectiveUnitPrice || (item.quantity > 0 ? item.finalPrice / item.quantity : 0)).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}`;

                    return (
                      <div key={index} className="mb-3 space-y-1.5">

                        {/* REMAINING QTY ROW — shown only if some qty is not returned */}
                        {remainingQty > 0 && (
                          <div className="flex justify-between items-center text-foreground">
                            <div className="flex-1 pr-4">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <span>{priceLabel}</span>
                                <span className="text-muted-foreground">|</span>
                                <span className="font-medium">Net: {netUnitPrice.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{renderPriceRow(remainingQty)}</p>
                              <p className="text-xs text-muted-foreground">Qty: {remainingQty}</p>
                            </div>
                          </div>
                        )}

                        {/* RETURNED QTY ROW — one crossed-out row per return event */}
                        {returnedEntries.map((entry, rIdx) => (
                          entry.qty > 0 && (
                            <div key={rIdx} className="flex justify-between items-center text-muted-foreground">
                              <div className="flex-1 pr-4">
                                <p className="font-medium line-through">{item.name}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  {entry.modeOfReturn && (
                                    <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${(() => {
                                      const mode = entry.modeOfReturn.toUpperCase().trim();
                                      if (mode === 'EXCHANGE') return 'bg-info/10 text-info border-info/20';
                                      if (mode.includes('CASH') || mode.includes('REFUND')) return 'bg-success/10 text-success border-success/20';
                                      return 'bg-warning/10 text-warning border-warning/20';
                                    })()}`}>
                                      {entry.modeOfReturn}
                                    </span>
                                  )}
                                  {entry.returnedAt && (
                                    <span className="text-[7px] font-bold text-muted-foreground uppercase tracking-wide">
                                      {new Date(
                                        entry.returnedAt?.toDate ? entry.returnedAt.toDate() : entry.returnedAt
                                      ).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold line-through">{renderPriceRow(entry.qty)}</p>
                                <p className="text-xs">Qty: {entry.qty}</p>
                              </div>
                            </div>
                          )
                        ))}

                      </div>
                    );
                  }) : null}

                  {/* Show returned items crossed out */}
                  {invoice.returnedItemsSnapshot && invoice.returnedItemsSnapshot.length > 0 &&
                    invoice.returnedItemsSnapshot
                      .filter((snap: any) => !invoice.items?.some(i => i.id === snap.id))
                      .map((item: any, index: number) => {
                        const matchedHistory = invoice.returnHistory?.find((h: any) =>
                          h.returnedItems?.some((ri: any) =>
                            String(ri.originalItemId) === String(item.id) ||
                            String(ri.id) === String(item.id)
                          )
                        );
                        return (
                          <div key={`returned-${index}`} className="flex justify-between items-center text-muted-foreground mb-3">
                            <div className="flex-1 pr-4">
                              <p className="font-medium" style={{ textDecoration: 'line-through' }}>
                                {item.name}
                              </p>
                              {/* Return mode badge + date */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {matchedHistory?.modeOfReturn && (
                                  <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${(() => {
                                    const mode = (matchedHistory.modeOfReturn || '').toUpperCase().trim();
                                    if (mode === 'EXCHANGE') return 'bg-info/10 text-info border-info/20';
                                    if (mode.includes('CASH') || mode.includes('REFUND')) return 'bg-success/10 text-success border-success/20';
                                    return 'bg-warning/10 text-warning border-warning/20';
                                  })()}`}>
                                    {matchedHistory.modeOfReturn}
                                  </span>
                                )}
                                {matchedHistory?.returnedAt && (
                                  <span className="text-[7px] font-bold text-muted-foreground uppercase tracking-wide">
                                    {new Date(
                                      matchedHistory.returnedAt?.toDate
                                        ? matchedHistory.returnedAt.toDate()
                                        : matchedHistory.returnedAt
                                    ).toLocaleDateString('en-GB', {
                                      day: '2-digit', month: 'short', year: '2-digit'
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold" style={{ textDecoration: 'line-through' }}>
                                {Number(item.finalPrice).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                              </p>
                              <p className="text-xs">Qty: {item.quantity}</p>
                            </div>
                          </div>
                        );
                      })
                  }
                  {/* ✅ NEW block - fallback for OLD transactions missing returnedItemsSnapshot */}
                  {(!invoice.returnedItemsSnapshot || invoice.returnedItemsSnapshot.length === 0) &&
                    invoice.returnHistory?.flatMap((h: any) =>
                      (h.returnedItems || []).map((ri: any) => ({ ...ri, returnedAt: h.returnedAt, modeOfReturn: h.modeOfReturn }))
                    )
                      .filter((ri: any) => !invoice.items?.some(i => i.id === ri.originalItemId))
                      .map((ri: any, index: number) => (
                        <div key={`rh-fallback-${index}`} className="flex justify-between items-center text-muted-foreground mb-3">
                          <div className="flex-1 pr-4">
                            <p className="font-medium" style={{ textDecoration: 'line-through' }}>
                              {ri.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {ri.modeOfReturn && (
                                <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${(() => {
                                  const mode = (ri.modeOfReturn || '').toUpperCase().trim();
                                  if (mode === 'EXCHANGE') return 'bg-info/10 text-info border-info/20';
                                  if (mode.includes('CASH') || mode.includes('REFUND')) return 'bg-success/10 text-success border-success/20';
                                  return 'bg-warning/10 text-warning border-warning/20';
                                })()}`}>
                                  {ri.modeOfReturn}
                                </span>
                              )}
                              {ri.returnedAt && (
                                <span className="text-[7px] font-bold text-muted-foreground uppercase tracking-wide">
                                  {new Date(
                                    ri.returnedAt?.toDate
                                      ? ri.returnedAt.toDate()
                                      : ri.returnedAt
                                  ).toLocaleDateString('en-GB', {
                                    day: '2-digit', month: 'short', year: '2-digit'
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold" style={{ textDecoration: 'line-through' }}>
                              {Number(ri.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                            </p>
                            <p className="text-xs">Qty: {ri.quantity}</p>
                          </div>
                        </div>
                      ))
                  }
                  {invoice.items?.length === 0 && (!invoice.returnedItemsSnapshot || invoice.returnedItemsSnapshot.length === 0) &&
                    <p className="text-xs text-muted-foreground">No item details available.</p>
                  }
                </div>

                {invoice.manualDiscount && invoice.manualDiscount > 0 ? (
                  <div className="flex justify-between items-center mt-3 pt-1.5 border-t border-line border-border">
                    <p className="text-xs font-medium text-muted-foreground">Bill Discount</p>
                    <p className="text-xs font-semibold text-destructive">
                      - {invoice.manualDiscount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </p>
                  </div>
                ) : null}

                {invoice.taxAmount && invoice.taxAmount > 0 ? (
                  <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground">Tax</p>
                    <p className="text-xs font-semibold text-warning">
                      + {invoice.taxAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </p>
                  </div>
                ) : null}

                {/* --- NEW: EXTRA EXPENSE ROW --- */}
                {invoice.expenses && invoice.expenses.length > 0 ? (
                  invoice.expenses.map((expense, idx) => (
                    <div key={`exp-${idx}`} className="flex justify-between items-center mt-1 pt-1.5 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground">{expense.name || 'Extra Expense'}</p>
                      <p className="text-xs font-semibold text-warning">
                        + {Number(expense.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                      </p>
                    </div>
                  ))
                ) : (invoice.extraExpenseAmount && invoice.extraExpenseAmount > 0) ? (
                  <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground">{invoice.extraExpenseName || 'Extra Expense'}</p>
                    <p className="text-xs font-semibold text-warning">
                      + {invoice.extraExpenseAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </p>
                  </div>
                ) : null}

                {activeModes.length > 0 && (
                  <div className="flex justify-between items-start mt-1 pt-2 border-t border-border text-xs text-muted-foreground">
                    {salesSettings?.enableSalesmanSelection ? (
                      <p className="text-left whitespace-nowrap mr-2">
                        Salesman: {invoice.salesmanName?.slice(0, 15) || 'N/A'}
                      </p>
                    ) : <div></div>}
                    <div className="flex flex-wrap justify-end gap-x-2 gap-y-1 text-right">
                      <span>Paid via:</span>
                      {activeModes.map(([key, val]) => (
                        <span key={key} className="font-medium text-foreground whitespace-nowrap">
                          {key === 'upi' ? 'UPI' : key.charAt(0).toUpperCase() + key.slice(1)}: {Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`grid gap-1.5 mt-2 pt-4 border-t border-border ${visibleButtonsCount === 1 ? 'grid-cols-1' :
                  visibleButtonsCount === 2 ? 'grid-cols-2' :
                    visibleButtonsCount === 3 ? 'grid-cols-3' :
                      visibleButtonsCount === 4 ? 'grid-cols-4' :
                        'grid-cols-5'
                  }`}>
                  {invoice.status === 'Unpaid' && (<button onClick={(e) => { e.stopPropagation(); openPaymentModal(invoice); }} className="py-2 text-[11px] font-bold text-white bg-success rounded-sm hover:bg-success/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-success transition-colors text-center">Settle</button>)}
                  {invoice.status === 'Unpaid' && invoice.partyNumber && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSendReminder(invoice); }}
                      disabled={sendingPdf}
                      className="py-2 text-[11px] font-bold text-white bg-warning rounded-sm hover:bg-warning/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-warning transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {sendingPdf ? <Spinner /> : <>Remind</>}
                    </button>
                  )}
                  {invoice.status === 'Paid' && (<button onClick={(e) => { e.stopPropagation(); promptDeleteInvoice(invoice); }} className="py-2 text-[11px] font-bold text-white bg-destructive rounded-sm hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-destructive transition-colors">Delete</button>)}
                  <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                    <button onClick={(e) => { e.stopPropagation(); handleEditInvoice(invoice); }} className="py-2 text-[11px] font-bold text-white bg-muted-foreground rounded-sm hover:bg-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-muted-foreground transition-colors text-center">Edit</button>
                  </ShowWrapper>

                  {invoice.type === 'Credit' && (
                    <>
                      <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                        <button onClick={(e) => { e.stopPropagation(); handleSalesReturn(invoice); }} className="py-2 text-[11px] font-bold text-white bg-primary rounded-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors text-center">Return</button>

                      </ShowWrapper>
                      <button
                        onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }}
                        disabled={pdfGenerating === invoice.id}
                        className="py-2 text-[11px] font-bold text-white bg-foreground rounded-sm hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-foreground transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {pdfGenerating === invoice.id ? <Spinner /> : 'Print'}
                      </button>
                    </>
                  )}

                  {invoice.type === 'Debit' && (
                    <>
                      <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                        <button onClick={(e) => { e.stopPropagation(); handlePurchaseReturn(invoice); }} className="py-2 text-[11px] font-bold text-white bg-primary rounded-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors text-center">Return</button>
                        <button onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }} className="py-2 text-[11px] font-bold text-white bg-foreground rounded-sm hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-foreground transition-colors flex items-center justify-center gap-1 text-center">Print</button>
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
    return (
      <div className="p-6">
        <EmptyState
          icon={<Inbox />}
          title={isTutorialActive ? 'No sample data here yet' : 'No invoices found'}
          description={
            isTutorialActive
              ? 'Sample data will appear here once you switch to a matching tab.'
              : 'Nothing matches this selection — try a different tab or date range.'
          }
        />
      </div>
    );
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-muted mb-10">
      {modal && <Modal message={modal.message} type={modal.type} onClose={cancelDelete} onConfirm={confirmDeleteInvoice} showConfirmButton={invoiceToDelete !== null} />}
      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCustomerCredit(0); // ✅ Modal band hone pe reset karo
        }}
        invoice={selectedInvoice}
        onSubmit={handleSettlePayment}
        availableCredit={customerCredit}
        isDebitNote={selectedInvoice?.type === 'Debit'}
      />

      <InvoiceActionModals
        invoiceToPrint={invoiceToPrint}
        setInvoiceToPrint={setInvoiceToPrint}
        showPrintSubMenu={showPrintSubMenu}
        setShowPrintSubMenu={setShowPrintSubMenu}
        isPosBasicPlan={isPosBasicPlan}
        billType={billType}
        setBillType={setBillType}
        sendingPdf={sendingPdf}
        enableTriplicate={enableTriplicate}
        companyId={currentUser?.companyId}
        showQrModal={showQrModal}
        setShowQrModal={setShowQrModal}
        handleSendWhatsapp={handleSendWhatsapp}
        handlePdfAction={handlePdfAction}
        handleShowQr={handleShowQr}
        handlePrintQr={handlePrintQr}
      />

      {/* Subscription expiry badge */}
      {showBadge && (
        <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-destructive' : 'bg-warning'}`}>
          <ShinyText
            text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`}
            speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100}
            direction="left" yoyo={false} pauseOnHover={false} disabled={false}
          />
          <Link to="/subscription" className="text-foreground ml-2 underline hover:text-background">Renew Now</Link>
        </div>
      )}

      {/* ── HEADER ROW ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col relative">

        {/* Row 1: Title + Filter icon */}
        <div className="flex items-center justify-between px-4 pt-2 relative">
          {/* Filter + notification block moved OUTSIDE the flex-1 container, at the true top-right of header */}
          <div
            ref={filterRef}
            className="absolute top-4 right-4 flex items-center gap-2 z-30"
          >
            <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
              <div className="border border-border rounded-sm bg-muted shadow-sm flex items-center justify-center">
                <NotificationBell />
              </div>
            </ShowWrapper>

            <TutorialStep
              step={3}
              currentStep={tutorialStep}
              text="Use this filter to quickly jump to Today, Last 7 Days, Last 30 Days, and more."
              onNext={() => next(4)}
              onSkip={skip}
            >
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <IconFilter />
              </button>
            </TutorialStep>

            {isFilterOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-card rounded-sm shadow-lg z-50 border overflow-hidden">
                <ul className="py-1">
                  {dateFilters.map((filter) => (
                    filter.value !== 'custom' && (
                      <li key={filter.value}>
                        <button
                          onClick={() => { handleDateFilterSelect(filter.value); setIsFilterOpen(false); }}
                          className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === filter.value ? 'bg-muted text-foreground' : 'text-foreground'} hover:bg-muted`}
                        >
                          {filter.label}
                        </button>
                      </li>
                    )
                  ))}
                  <li>
                    <button
                      onClick={() => { setActiveDateFilter('custom'); setIsFilterOpen(false); setShowCustomPicker(true); }}
                      className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === 'custom' ? 'bg-muted text-foreground' : 'text-foreground'} hover:bg-muted`}
                    >
                      Custom Range
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center relative">
            <h1 className="text-2xl font-bold text-foreground">Transactions</h1>

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
                    className="text-muted-foreground hover:text-foreground transition-colors ml-0 -mt-1"
                  >
                    <span className="relative -top-1">
                      {showSearch ? <IconClose /> : <IconSearch />}
                    </span>
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
                  className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 cursor-pointer hover:bg-muted px-3 py-1 rounded-sm transition-colors select-none"
                >
                  <p className='text-center text-sm font-light text-muted-foreground'>{selectedPeriodText}</p>
                  <IconChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
                </div>

              </div>
            </TutorialStep>

            {showCustomPicker && (
              <div className="absolute top-full bg-card shadow-xl border border-border rounded-sm p-4 z-50 min-w-[300px] flex flex-col gap-4 animate-in fade-in zoom-in duration-200 cursor-default">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col">
                    <label className="text-center text-xs font-semibold text-muted-foreground mb-1">From</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => { setCustomStartDate(e.target.value); setActiveDateFilter('custom'); }}
                      className="border border-border rounded-sm px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-center text-xs font-semibold text-muted-foreground mb-1">To</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => { setCustomEndDate(e.target.value); setActiveDateFilter('custom'); }}
                      className="border border-border rounded-sm px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="flex justify-center text-center border-t border-border -mt-2 -mb-2">
                  <button
                    onClick={() => setShowCustomPicker(false)}
                    className="flex-grow bg-foreground text-background text-sm px-4 py-2 rounded-sm hover:bg-foreground/90 transition-colors"
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
                  className="w-full text-base font-light p-1 border-b-2 border-border focus:border-foreground outline-none transition-colors bg-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            )}
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
          <div className="flex justify-center gap-2 border-b border-border p-2 mb-2">
            <Button
              variant={activeType === 'Credit' ? 'default' : 'outline'}
              className={activeType === 'Credit' ? 'flex-1 bg-gradient-brand text-white hover:opacity-90' : 'flex-1'}
              onClick={() => setActiveType('Credit')}
            >
              Sales
            </Button>
            <Button
              variant={activeType === 'Debit' ? 'default' : 'outline'}
              className={`flex-1 ${activeType === 'Debit' ? 'bg-gradient-brand text-white hover:opacity-90' : ''} ${!hasPermission(Permissions.HiddenProFeatures) ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setActiveType('Debit')}
              disabled={!hasPermission(Permissions.HiddenProFeatures)}
            >
              {hasPermission(Permissions.HiddenProFeatures) ? 'Purchase' : '🔒 Purchase'}
            </Button>
          </div>
        </TutorialStep>

        {/* Step 5 — Paid / Unpaid toggle */}
        <TutorialStep
          step={5}
          currentStep={tutorialStep}
          text="Toggle between Paid and Unpaid invoices. Unpaid shows your outstanding dues."
          onNext={() => next(6)}
          onSkip={skip}
        >
          <CustomToggle>
            <CustomToggleItem className="mr-2" onClick={() => setActiveTab('Paid')} data-state={activeTab === 'Paid' ? 'on' : 'off'}>Paid</CustomToggleItem>
            <CustomToggleItem onClick={() => setActiveTab('Unpaid')} data-state={activeTab === 'Unpaid' ? 'on' : 'off'}>Unpaid</CustomToggleItem>
          </CustomToggle>
        </TutorialStep>

        {activeTab === 'Unpaid' && (
          <div className="mx-2 mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-sm flex justify-between items-center shadow-sm animate-in fade-in slide-in-from-top-2">
            <div>
              <p className="text-sm text-destructive font-bold tracking-wider">
                {activeType === 'Credit' ? 'Total Receivables : ' : 'Total Payables : '}
                {totalUnpaidAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
              </p>
            </div>
          </div>
        )}
        <TutorialStep
          step={6}
          currentStep={tutorialStep}
          text="Tap any invoice to see full details — items, discounts, tax, and payment breakdown."
          onNext={async () => {
            // Last step — persist tutorial completion in Firestore
            if (!currentUser?.companyId) {
              setTutorialStep(0);
              window.dispatchEvent(new Event("journal_tutorial_done"));
              return;
            }
            try {
              await markJournalTutorialDone(currentUser.companyId);
            } catch (e) {
              console.error('Error saving journal tutorial:', e);
            }
            setTutorialStep(0);
            window.dispatchEvent(new Event("journal_tutorial_done"));
          }}
          onSkip={skip}
          isLast
        >
          <div
            ref={setTutorialRef(6) as any} className="flex-grow overflow-y-auto bg-muted space-y-3 pt-2 pb-24">
            {renderContent()}
          </div>
        </TutorialStep>
      </div>
    </div>
  );
};

export default Journal;