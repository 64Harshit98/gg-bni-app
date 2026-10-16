import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { State, PLANS } from '../../enums';
import { normalizePlan } from '../../context/Plan';
import { Spinner } from '../../constants/Spinner';
import { ROUTES } from '../../constants/routes.constants';
import { Modal, PaymentModal } from '../../constants/Modal';
//import ShinyText from '../../Components/ShinyText';
import { useSalesSettings } from '../../context/SettingsContext';
import { TutorialStep } from '../../Components/TutorialStep'; // ← same import as Home.tsx
import { Permissions } from '../../enums/permissions.enum';
import ShowWrapper from '../../context/ShowWrapper';
import useTutorial from '../../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../../Catalogue/hooks/useCompleteTutorial';
import type { Invoice } from './journal.types';
import { SAMPLE_INVOICES } from './journal.types';
import { useJournalList, useInvoicePayment, useInvoiceDeletion, useInvoiceCommunication } from './hooks';
import { JournalListFilters, InvoiceActionSheet, PrintSubMenuModal, QrCodeModal } from './components';
import { JournalTabs } from '../Journal/Journaltabs';
// ─── Total tutorial steps for Journal ───────────────────────────────────────
const TOTAL_STEPS = 6;

// ─── UI helpers (display only) ──────────────────────────────────────────────
const fmt = (n: number) =>
  Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
const fmt0 = (n: number) =>
  Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 });

const getActiveModes = (invoice: Invoice) =>
  Object.entries(invoice.paymentMethods || {}).filter(([key, value]) => key !== 'due' && Number(value) > 0);

const modeLabel = (mode: string) => (mode === 'upi' ? 'UPI' : mode.replace(/_/g, ' '));

const BADGE = 'inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11px] font-semibold tracking-[0.03em] leading-[22px] whitespace-nowrap';
const modeBadgeClass = (mode: string) =>
  mode === 'upi' ? 'bg-[#e6eeff] text-[#155dfc]' : 'bg-[#f5f7ff] text-[#45556c]';

const returnModeClass = (modeRaw: string) => {
  const mode = (modeRaw || '').toUpperCase().trim();
  if (mode === 'EXCHANGE') return 'bg-[#e6eeff] text-[#155dfc]';
  if (mode.includes('CASH') || mode.includes('REFUND')) return 'bg-[#e9faef] text-[#008236]';
  return 'bg-[#fff3dd] text-[#bb4d00]';
};

const fmtReturnDate = (v: any) =>
  new Date(v?.toDate ? v.toDate() : v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

const ITEM_GRID = 'grid grid-cols-[minmax(0,1fr)_32px_72px_84px] gap-x-3';

const BTN_BASE =
  'h-10 px-4 inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]';
const BTN_PRIMARY = `${BTN_BASE} bg-[#155dfc] text-white hover:bg-[#1447e6]`;
const BTN_SECONDARY = `${BTN_BASE} bg-white text-[#0f172b] border border-[#7a8aa3] hover:bg-[#f5f7ff]`;

const FIELD_LABEL = 'block text-xs font-medium text-[#45556c] mb-1';
const FIELD_INPUT =
  'w-full h-10 px-3 text-sm text-[#0f172b] rounded-sm border border-[#7a8aa3] bg-white outline-none focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#155dfc]';

// --- MAIN COMPONENT ---
const Journal: React.FC = () => {
  // ─── Refs for tutorial autoscroll ─────────────────────────────────────────
  const tutorialRefs = useRef<(HTMLElement | null)[]>([]);
  const setTutorialRef = (index: number) => (el: HTMLElement | null) => {
    tutorialRefs.current[index] = el;
  };
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [transportPopupInvoice, setTransportPopupInvoice] = useState<Invoice | null>(null);
  const [transportForm, setTransportForm] = useState({
    transportName: '', grRrNo: '', grRrDate: '', vehicleNo: '', stationFrom: '', pinCode: ''
  });
  const [savingTransport, setSavingTransport] = useState(false);

  // Prefill form whenever popup opens for an invoice
  useEffect(() => {
    if (transportPopupInvoice) {
      const t = (transportPopupInvoice as any).transportDetails || {};
      setTransportForm({
        transportName: t.transportName || '',
        grRrNo: t.grRrNo || '',
        grRrDate: t.grRrDate || '',
        vehicleNo: t.vehicleNo || '',
        stationFrom: t.stationFrom || '',
        pinCode: t.pinCode || '',
      });
    }
  }, [transportPopupInvoice]);

  const handleSaveTransport = async () => {
    if (!transportPopupInvoice || !currentUser?.companyId) return;
    setSavingTransport(true);
    try {
      const invoiceRef = doc(
        db,
        'companies',
        currentUser.companyId,
        transportPopupInvoice.type === 'Credit' ? 'sales' : 'purchases',
        transportPopupInvoice.id
      );
      await updateDoc(invoiceRef, {
        transportDetails: {
          transportName: transportForm.transportName.trim(),
          grRrNo: transportForm.grRrNo.trim(),
          grRrDate: transportForm.grRrDate.trim(),
          vehicleNo: transportForm.vehicleNo.trim(),
          stationFrom: transportForm.stationFrom.trim(),
          pinCode: transportForm.pinCode.trim(),
        },
      });
      setTransportPopupInvoice(null);
    } catch (e) {
      setModal({ message: 'Failed to update transport details.', type: State.ERROR });
    } finally {
      setSavingTransport(false);
    }
  };

  const { salesSettings } = useSalesSettings();

  const { currentUser, loading: authLoading, hasPermission } = useAuth();

  const {
    customerCredit,
    setCustomerCredit,
    isModalOpen,
    setIsModalOpen,
    selectedInvoice: paymentInvoice,
    openPaymentModal,
    handleSettlePayment,
  } = useInvoicePayment({ currentUser });

  const {
    invoiceToDelete,
    promptDeleteInvoice,
    confirmDeleteInvoice,
    cancelDelete,
  } = useInvoiceDeletion({ currentUser, setModal });

  // ─── Tutorial state (mirrors Home.tsx pattern) ────────────────────────────
  const [tutorialStep, setTutorialStep] = useState(0);

  const next = (n: number) => setTutorialStep(n <= TOTAL_STEPS ? n : 0);
  const skip = () => {
    completeTutorial(currentUser, 'journalTutorialDone', setTutorialStep);
  };
  // True only while the walkthrough is actively running
  const isTutorialActive = tutorialStep > 0 && tutorialStep <= TOTAL_STEPS;

  useTutorial(currentUser, setTutorialStep, 'journalTutorialDone');

  const {
    invoices,
    dataLoading,
    error,

    activeTab,
    setActiveTab,
    activeType,
    setActiveType,
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    activeDateFilter,
    setActiveDateFilter,
    isFilterOpen,
    setIsFilterOpen,
    filterRef,

    expandedInvoiceId,
    setExpandedInvoiceId,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    showCustomPicker,
    setShowCustomPicker,

    filteredInvoices,
    selectedPeriodText,
    dateFilters,
    handleDateFilterSelect,
    handleInvoiceClick,
  } = useJournalList({ companyId: currentUser?.companyId, isTutorialActive });

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

  const [isPosBasicPlan, setIsPosBasicPlan] = useState(false);
  useEffect(() => {
    const fetchPlan = async () => {
      if (!currentUser?.companyId) return;
      const snap = await getDoc(doc(db, 'companies', currentUser.companyId));
      if (snap.exists()) {
        const normalizedPlan = normalizePlan(snap.data().pack);
        setIsPosBasicPlan(normalizedPlan === PLANS.POS_BASIC || normalizedPlan === PLANS.CALC_CATALOG);
      }
    };
    fetchPlan();
  }, [currentUser?.companyId]);

  const {
    pdfGenerating,
    invoiceToPrint, setInvoiceToPrint,
    showQrModal, setShowQrModal,
    sendingPdf,
    showPrintSubMenu, setShowPrintSubMenu,
    enableTriplicate,
    billType, setBillType,
    handlePdfAction,
    handleSendWhatsapp,
    handleSendWhatsappSnapto,
    handleSendReminder,
    handleSendReminderSnapto,
    handleShowQr,
    handlePrintQr,
  } = useInvoiceCommunication({ currentUser, salesSettings, isPosBasicPlan, setModal });

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

  const totalUnpaidAmount = useMemo(() => {
    if (activeTab !== 'Unpaid') return 0;
    return filteredInvoices.reduce((sum, invoice) => {
      return sum + (invoice.dueAmount || 0);
    }, 0);
  }, [filteredInvoices, activeTab]);

  // Summary strip numbers (display only, derived from the list already on screen)
  const summary = useMemo(() => {
    const total = filteredInvoices.reduce((s, i) => s + (i.amount || 0), 0);
    const unpaidInvoices = filteredInvoices.filter((i) => i.status === 'Unpaid');
    const unpaid = unpaidInvoices.reduce((s, i) => s + (i.dueAmount || 0), 0);
    return {
      total,
      unpaid,
      received: Math.max(total - unpaid, 0),
      count: filteredInvoices.length,
      unpaidCount: unpaidInvoices.length,
    };
  }, [filteredInvoices]);

  // The bill whose detail is open (desktop side pane / mobile sheet)
  const selectedInvoice: Invoice | null = expandedInvoiceId
    ? filteredInvoices.find((i) => i.id === expandedInvoiceId) || null
    : null;

  // One crossed-out row for a returned quantity
  const renderReturnedRow = (
    key: string,
    name: string,
    modeOfReturn: string,
    returnedAt: any,
    amount: number,
    qty: number,
  ) => (
    <div key={key} className={`${ITEM_GRID} py-3 border-b border-[#dfe6fb] text-[#5b6b86]`}>
      <div className="min-w-0">
        <p className="font-medium line-through break-words">{name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {modeOfReturn && (
            <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full ${returnModeClass(modeOfReturn)}`}>
              {modeOfReturn}
            </span>
          )}
          {returnedAt && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-[#5b6b86]">
              {fmtReturnDate(returnedAt)}
            </span>
          )}
        </div>
      </div>
      <p className="text-right tabular-nums line-through">{qty}</p>
      <p className="text-right tabular-nums line-through">{qty > 0 ? fmt(amount / qty) : ''}</p>
      <p className="text-right tabular-nums font-medium line-through">{fmt(amount)}</p>
    </div>
  );

  // Full bill detail (used in the desktop side pane and the mobile sheet)
  const renderInvoiceDetail = (invoice: Invoice) => {
    const activeModes = getActiveModes(invoice);
    const hasTransportInfo =
      !!(invoice as any).transportDetails && Object.values((invoice as any).transportDetails).some(Boolean);
    const isSale = invoice.type === 'Credit';
    const dueAmount = invoice.dueAmount || 0;

    return (
      <div className="grid gap-5">
        {/* Header: bill number + total */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] leading-4 font-semibold tracking-[0.08em] uppercase text-[#5b6b86]">
                {isSale ? 'Sale bill' : 'Purchase bill'}
              </span>
              <span className={`${BADGE} ${invoice.status === 'Paid' ? 'bg-[#e9faef] text-[#008236]' : 'bg-[#fff3dd] text-[#bb4d00]'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                {invoice.status}
              </span>
            </div>
            <h2 className="mt-1 text-lg lg:text-[22px] leading-[26px] lg:leading-[30px] font-semibold text-[#0f172b] break-words">
              {invoice.invoiceNumber}
            </h2>
            <p className="text-xs text-[#45556c]">
              {invoice.time}
              {salesSettings?.enableSalesmanSelection && invoice.salesmanName
                ? ` · Billed by ${invoice.salesmanName.slice(0, 15)}`
                : ''}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-[#45556c]">Total</p>
            <p className="text-lg lg:text-2xl leading-[26px] lg:leading-8 font-semibold text-[#0f172b] tabular-nums">{fmt(invoice.amount)}</p>
          </div>
        </div>

        {/* Customer strip */}
        <div className="flex items-center gap-3 p-3 rounded-sm bg-[#f5f7ff]">
          <span className="w-10 h-10 rounded-full grid place-items-center bg-[#e6eeff] text-[#155dfc] font-semibold shrink-0">
            {(invoice.partyName || 'W').trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-[#0f172b] truncate">{invoice.partyName || 'Walk-in customer'}</p>
            {invoice.partyNumber && <p className="text-xs text-[#5b6b86]">{invoice.partyNumber}</p>}
          </div>
        </div>

        {/* Return badges + payment modes */}
        {((invoice.returnHistory && invoice.returnHistory.length > 0) || activeModes.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {(invoice.returnHistory || []).map((historyItem: any, index: number) => (
              <span key={`return-${index}`} className={`${BADGE} uppercase ${returnModeClass(historyItem.modeOfReturn || 'Return')}`}>
                {historyItem.modeOfReturn || 'Return'}
              </span>
            ))}
            {activeModes.map(([mode]) => (
              <span key={mode} className={`${BADGE} uppercase ${modeBadgeClass(mode)}`}>
                {modeLabel(mode)}
              </span>
            ))}
          </div>
        )}

        {/* Items table */}
        <div>
          <div className={`${ITEM_GRID} pb-2 border-b border-[#dfe6fb] text-[11px] font-semibold tracking-[0.08em] uppercase text-[#5b6b86]`}>
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amount</span>
          </div>

          {(invoice.items && invoice.items.length > 0) ? invoice.items.map((item, index) => {
            const netUnitPrice =
              item.taxableAmount && item.quantity > 0
                ? item.taxableAmount / item.quantity
                : item.effectiveUnitPrice
                  ? item.effectiveUnitPrice
                  : (item.quantity > 0 ? (item.finalPrice / item.quantity) : 0);

            // --- Collect ALL returned qty for this item across all return entries ---
            // Same-item exchanges re-add a line with the SAME id as the one that
            // was just returned, so matching purely by id (as below) can pair a
            // return record with the wrong (new-price) current line. Carrying the
            // return record's own recorded `amount` (its true value at return time)
            // and using that instead of recomputing from the current item's price
            // keeps the struck-through row honest even when the id collides.
            const returnedEntries: { qty: number; modeOfReturn: string; returnedAt: any; amount?: number }[] = [];
            (invoice.returnHistory || []).forEach((h: any) => {
              (h.returnedItems || []).forEach((r: any) => {
                if (r.originalItemId === item.id || r.originalItemId === (item as any).productId) {
                  returnedEntries.push({
                    qty: Number(r.quantity) || Number(r.qty) || 0,
                    modeOfReturn: h.modeOfReturn || '',
                    returnedAt: h.returnedAt,
                    amount: r.amount !== undefined ? Number(r.amount) || 0 : undefined,
                  });
                }
              });
            });

            const remainingQty = item.quantity;

            const priceLabel = item.mrp > 0
              ? `MRP: ${fmt0(item.mrp)}`
              : `Sales Price: ${fmt0(item.effectiveUnitPrice || (item.quantity > 0 ? item.finalPrice / item.quantity : 0))}`;

            return (
              <React.Fragment key={index}>
                {/* REMAINING QTY ROW — shown only if some qty is not returned */}
                {remainingQty > 0 && (
                  <div className={`${ITEM_GRID} py-3 border-b border-[#dfe6fb] text-[#0f172b]`}>
                    <div className="min-w-0">
                      <p className="font-medium break-words">{item.name}</p>
                      <p className="text-xs text-[#5b6b86]">{priceLabel}</p>
                    </div>
                    <p className="text-right tabular-nums">{remainingQty}</p>
                    <p className="text-right tabular-nums">{fmt(netUnitPrice)}</p>
                    <p className="text-right tabular-nums font-medium">{fmt(netUnitPrice * remainingQty)}</p>
                  </div>
                )}

                {/* RETURNED QTY ROW — one crossed-out row per return event */}
                {returnedEntries.map((entry, rIdx) => (
                  entry.qty > 0 &&
                  renderReturnedRow(
                    `ret-${index}-${rIdx}`,
                    item.name,
                    entry.modeOfReturn,
                    entry.returnedAt,
                    entry.amount !== undefined ? entry.amount : netUnitPrice * entry.qty,
                    entry.qty,
                  )
                ))}
              </React.Fragment>
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
                return renderReturnedRow(
                  `returned-${index}`,
                  item.name,
                  matchedHistory?.modeOfReturn || '',
                  matchedHistory?.returnedAt,
                  Number(item.finalPrice),
                  item.quantity,
                );
              })
          }

          {/* Fallback for OLD transactions missing returnedItemsSnapshot */}
          {(!invoice.returnedItemsSnapshot || invoice.returnedItemsSnapshot.length === 0) &&
            invoice.returnHistory?.flatMap((h: any) =>
              (h.returnedItems || []).map((ri: any) => ({ ...ri, returnedAt: h.returnedAt, modeOfReturn: h.modeOfReturn }))
            )
              .filter((ri: any) => !invoice.items?.some(i => i.id === ri.originalItemId))
              .map((ri: any, index: number) =>
                renderReturnedRow(
                  `rh-fallback-${index}`,
                  ri.name,
                  ri.modeOfReturn || '',
                  ri.returnedAt,
                  Number(ri.amount),
                  ri.quantity,
                )
              )
          }

          {invoice.items?.length === 0 && (!invoice.returnedItemsSnapshot || invoice.returnedItemsSnapshot.length === 0) &&
            <p className="py-4 text-xs text-[#5b6b86]">No item details available.</p>
          }
        </div>

        {/* Totals */}
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
          {invoice.manualDiscount && invoice.manualDiscount > 0 ? (
            <>
              <dt className="text-[#45556c]">Bill discount</dt>
              <dd className="text-right tabular-nums text-[#d5000c]">- {fmt(invoice.manualDiscount)}</dd>
            </>
          ) : null}

          {invoice.taxAmount && invoice.taxAmount > 0 ? (
            <>
              <dt className="text-[#45556c]">Tax</dt>
              <dd className="text-right tabular-nums">+ {fmt(invoice.taxAmount)}</dd>
            </>
          ) : null}

          {/* EXTRA EXPENSE ROWS */}
          {invoice.expenses && invoice.expenses.length > 0 ? (
            invoice.expenses.map((expense, idx) => (
              <React.Fragment key={`exp-${idx}`}>
                <dt className="text-[#45556c]">{expense.name || 'Extra expense'}</dt>
                <dd className="text-right tabular-nums">+ {fmt(Number(expense.amount))}</dd>
              </React.Fragment>
            ))
          ) : (invoice.extraExpenseAmount && invoice.extraExpenseAmount > 0) ? (
            <>
              <dt className="text-[#45556c]">{invoice.extraExpenseName || 'Extra expense'}</dt>
              <dd className="text-right tabular-nums">+ {fmt(invoice.extraExpenseAmount)}</dd>
            </>
          ) : null}

          <dt className="pt-2 mt-1 border-t border-[#dfe6fb] text-base font-semibold text-[#0f172b]">Total</dt>
          <dd className="pt-2 mt-1 border-t border-[#dfe6fb] text-right text-base font-semibold text-[#0f172b] tabular-nums">{fmt(invoice.amount)}</dd>

          {activeModes.map(([key, val]) => (
            <React.Fragment key={key}>
              <dt className="text-[#45556c]">Paid via {key === 'upi' ? 'UPI' : key.charAt(0).toUpperCase() + key.slice(1)}</dt>
              <dd className="text-right tabular-nums font-medium text-[#008236]">{fmt(Number(val))}</dd>
            </React.Fragment>
          ))}

          {invoice.status === 'Unpaid' && dueAmount > 0 && (
            <>
              <dt className="font-medium text-[#bb4d00]">{isSale ? 'They owe you' : 'You owe'}</dt>
              <dd className="text-right tabular-nums font-semibold text-[#bb4d00]">{fmt(dueAmount)}</dd>
            </>
          )}
        </dl>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-[#dfe6fb]">
          {invoice.status === 'Unpaid' && (
            <button
              onClick={(e) => { e.stopPropagation(); openPaymentModal(invoice); }}
              className={BTN_PRIMARY}
            >
              Settle
            </button>
          )}

          {/* Print: primary, except on an unpaid bill where Settle takes the primary slot */}
          {isSale && (
            <button
              onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }}
              disabled={pdfGenerating === invoice.id}
              className={invoice.status === 'Unpaid' ? BTN_SECONDARY : BTN_PRIMARY}
            >
              {pdfGenerating === invoice.id ? <Spinner /> : 'Print'}
            </button>
          )}
          {!isSale && (
            <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
              <button
                onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }}
                className={invoice.status === 'Unpaid' ? BTN_SECONDARY : BTN_PRIMARY}
              >
                Print
              </button>
            </ShowWrapper>
          )}

          {hasTransportInfo && (
            <button
              onClick={(e) => { e.stopPropagation(); setTransportPopupInvoice(invoice); }}
              className={BTN_SECONDARY}
            >
              Transport
            </button>
          )}

          {invoice.status === 'Unpaid' && invoice.partyNumber && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSendReminder(invoice); }}
              disabled={sendingPdf}
              className={BTN_SECONDARY}
            >
              {sendingPdf ? <Spinner /> : <>Remind</>}
            </button>
          )}
          {invoice.status === 'Unpaid' && invoice.partyNumber && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSendReminderSnapto(invoice); }}
              disabled={sendingPdf}
              className={BTN_SECONDARY}
            >
              {sendingPdf ? <Spinner /> : <>Remind (Snapto)</>}
            </button>
          )}

          <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
            <button
              onClick={(e) => { e.stopPropagation(); isSale ? handleSalesReturn(invoice) : handlePurchaseReturn(invoice); }}
              className={BTN_SECONDARY}
            >
              Return
            </button>
          </ShowWrapper>

          <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
            <button
              onClick={(e) => { e.stopPropagation(); handleEditInvoice(invoice); }}
              className={BTN_SECONDARY}
            >
              Edit
            </button>
          </ShowWrapper>

          {invoice.status === 'Paid' && (
            <button
              onClick={(e) => { e.stopPropagation(); promptDeleteInvoice(invoice); }}
              aria-label="Delete bill"
              title="Delete bill"
              className="ml-auto h-10 w-10 inline-flex items-center justify-center rounded-sm text-[#d5000c] hover:bg-[#ffeef0] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" /></svg>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (authLoading || dataLoading) return <Spinner />;
    if (error) return <p className="p-8 text-center text-[#d5000c]">{error}</p>;

    if (filteredInvoices.length > 0) {
      return filteredInvoices.map((invoice) => {
        const isSelected = expandedInvoiceId === invoice.id;
        const activeModes = getActiveModes(invoice);
        const hasDue = invoice.status === 'Unpaid' && !!invoice.dueAmount && invoice.dueAmount > 0;

        return (
          <div
            key={invoice.id}
            role="option"
            aria-selected={isSelected}
            onClick={() => handleInvoiceClick(invoice.id)}
            className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 border-b border-[#dfe6fb] cursor-pointer transition-colors ${isSelected ? 'bg-[#e6eeff]' : 'bg-white hover:bg-[#f5f7ff]'}`}
          >
            <div className="flex flex-wrap items-center gap-2 min-w-0 text-[15px] font-semibold text-[#0f172b]">
              <span>{invoice.invoiceNumber}</span>
              {(invoice.returnHistory || []).map((historyItem: any, index: number) => (
                <span key={`return-${index}`} className={`${BADGE} uppercase ${returnModeClass(historyItem.modeOfReturn || 'Return')}`}>
                  {historyItem.modeOfReturn || 'Return'}
                </span>
              ))}
              {activeModes.map(([mode]) => (
                <span key={mode} className={`${BADGE} uppercase ${modeBadgeClass(mode)}`}>
                  {modeLabel(mode)}
                </span>
              ))}
              {invoice.status === 'Unpaid' && (
                <span className={`${BADGE} bg-[#fff3dd] text-[#bb4d00]`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                  Unpaid
                </span>
              )}
            </div>
            <div className={`text-right text-[15px] font-semibold tabular-nums ${hasDue ? 'text-[#bb4d00]' : 'text-[#0f172b]'}`}>
              {fmt(hasDue ? (invoice.dueAmount as number) : invoice.amount)}
            </div>
            <div className="text-[13px] text-[#45556c] truncate">
              {invoice.partyName || 'Walk-in customer'}
              {invoice.partyNumber ? ` · ${invoice.partyNumber}` : ''}
            </div>
            <div className="text-right text-xs text-[#5b6b86]">{invoice.time}</div>
          </div>
        );
      });
    }
    return (
      <p className="p-8 text-center text-sm text-[#45556c]">
        {isTutorialActive
          ? 'Sample data will appear here once you switch to a matching tab.'
          : 'No bills found for this selection. Try a different date range or tab.'}
      </p>
    );
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-[#eef2ff] mb-10">
      {modal && <Modal message={modal.message} type={modal.type} onClose={cancelDelete} onConfirm={confirmDeleteInvoice} showConfirmButton={invoiceToDelete !== null} />}
      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCustomerCredit(0); // ✅ Modal band hone pe reset karo
        }}
        invoice={paymentInvoice}
        onSubmit={handleSettlePayment}
        availableCredit={customerCredit}
        isDebitNote={paymentInvoice?.type === 'Debit'}
      />

      {/* ACTION SELECTION MODAL */}
      {invoiceToPrint && (
        <InvoiceActionSheet
          invoiceToPrint={invoiceToPrint}
          setInvoiceToPrint={setInvoiceToPrint}
          setShowPrintSubMenu={setShowPrintSubMenu}
          isPosBasicPlan={isPosBasicPlan}
          billType={billType}
          setBillType={setBillType}
          sendingPdf={sendingPdf}
          companyId={currentUser?.companyId}
          handleSendWhatsapp={handleSendWhatsapp}
          handleSendWhatsappSnapto={handleSendWhatsappSnapto}
          handlePdfAction={handlePdfAction}
          handleShowQr={handleShowQr}
          handlePrintQr={handlePrintQr}
        />
      )}
      {!isPosBasicPlan && showPrintSubMenu && invoiceToPrint && (
        <PrintSubMenuModal
          invoiceToPrint={invoiceToPrint}
          setInvoiceToPrint={setInvoiceToPrint}
          setShowPrintSubMenu={setShowPrintSubMenu}
          billType={billType}
          enableTriplicate={enableTriplicate}
          handlePdfAction={handlePdfAction}
        />
      )}
      {showQrModal && (
        <QrCodeModal
          showQrModal={showQrModal}
          setShowQrModal={setShowQrModal}
          companyId={currentUser?.companyId}
        />
      )}

      {/* Transport details pop-up */}
      {transportPopupInvoice && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
          onClick={() => setTransportPopupInvoice(null)}
        >
          <div className="absolute inset-0 bg-[#020618]/45" />
          <div
            className="relative w-full max-w-md bg-white border border-[#dfe6fb] rounded-sm shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#0f172b]">Transport details</h3>
              <button
                onClick={() => setTransportPopupInvoice(null)}
                aria-label="Close"
                className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 pb-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Transport name</label>
                  <input type="text" value={transportForm.transportName} onChange={(e) => setTransportForm(f => ({ ...f, transportName: e.target.value }))} placeholder="e.g. DP World Express Logistic" className={FIELD_INPUT} />
                </div>
                <div>
                  <label className={FIELD_LABEL}>GR/RR no.</label>
                  <input type="text" value={transportForm.grRrNo} onChange={(e) => setTransportForm(f => ({ ...f, grRrNo: e.target.value }))} className={FIELD_INPUT} />
                </div>
                <div>
                  <label className={FIELD_LABEL}>GR/RR date</label>
                  <input type="date" value={transportForm.grRrDate} onChange={(e) => setTransportForm(f => ({ ...f, grRrDate: e.target.value }))} className={FIELD_INPUT} />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Vehicle no.</label>
                  <input type="text" value={transportForm.vehicleNo} onChange={(e) => setTransportForm(f => ({ ...f, vehicleNo: e.target.value }))} className={FIELD_INPUT} />
                </div>
                <div>
                  <label className={FIELD_LABEL}>PIN code</label>
                  <input type="text" maxLength={6} value={transportForm.pinCode} onChange={(e) => setTransportForm(f => ({ ...f, pinCode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} className={FIELD_INPUT} />
                </div>
                <div className="col-span-2">
                  <label className={FIELD_LABEL}>Station / from place</label>
                  <input type="text" value={transportForm.stationFrom} onChange={(e) => setTransportForm(f => ({ ...f, stationFrom: e.target.value }))} className={FIELD_INPUT} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setTransportPopupInvoice(null)} className={BTN_SECONDARY}>
                  Cancel
                </button>
                <button onClick={handleSaveTransport} disabled={savingTransport} className={BTN_PRIMARY}>
                  {savingTransport ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER + FILTERS ───────────────────────────────────────────────── */}
      <div className="flex flex-col relative">

        <JournalListFilters
          tutorialStep={tutorialStep}
          next={next}
          skip={skip}
          setTutorialRef={setTutorialRef}
          filterRef={filterRef}
          isFilterOpen={isFilterOpen}
          setIsFilterOpen={setIsFilterOpen}
          dateFilters={dateFilters}
          activeDateFilter={activeDateFilter}
          setActiveDateFilter={setActiveDateFilter}
          handleDateFilterSelect={handleDateFilterSelect}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedPeriodText={selectedPeriodText}
          showCustomPicker={showCustomPicker}
          setShowCustomPicker={setShowCustomPicker}
          customStartDate={customStartDate}
          setCustomStartDate={setCustomStartDate}
          customEndDate={customEndDate}
          setCustomEndDate={setCustomEndDate}
          activeType={activeType}
          setActiveType={setActiveType}
          hasPermission={hasPermission}
          summary={summary}
        />

        {/* ── LIST (left) + DETAIL (right, desktop only) ───────────────────── */}
        <div className="px-4 lg:px-6 mt-4 pb-24 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)] items-start">
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
            <div
              ref={setTutorialRef(6) as any}
              role="listbox"
              className="bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] overflow-hidden"
            >
              <JournalTabs
                tutorialStep={tutorialStep}
                next={next}
                skip={skip}
                activeType={activeType}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                totalUnpaidAmount={totalUnpaidAmount}
              />
              {renderContent()}
            </div>
          </TutorialStep>

          {/* Desktop detail pane */}
          <div className="hidden xl:block xl:sticky xl:top-4">
            <div className="bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] p-5">
              {selectedInvoice ? (
                renderInvoiceDetail(selectedInvoice)
              ) : (
                <p className="py-10 text-center text-sm text-[#45556c]">
                  Pick a bill from the list to see its items, payment and actions.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile detail sheet (hidden while the walkthrough is running so it never covers the highlight) */}
      {selectedInvoice && !isTutorialActive && (
        <div className="xl:hidden fixed inset-0 z-[9000]">
          <div
            className="absolute inset-0 bg-[#020618]/45"
            onClick={() => handleInvoiceClick(selectedInvoice.id)}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl max-h-[88vh] overflow-y-auto bg-white rounded-sm shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] px-4 pt-2 pb-6">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#dfe6fb]" aria-hidden="true" />
            {renderInvoiceDetail(selectedInvoice)}
          </div>
        </div>
      )}
    </div>
  );
};

export default Journal;