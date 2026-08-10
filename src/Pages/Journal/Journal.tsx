import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { CustomCard } from '../../Components/CustomCard';
import { State, PLANS } from '../../enums';
import { normalizePlan } from '../../context/Plan';
import { Spinner } from '../../constants/Spinner';
import { ROUTES } from '../../constants/routes.constants';
import { Modal, PaymentModal } from '../../constants/Modal';
import ShinyText from '../../Components/ShinyText';
import { useSalesSettings } from '../../context/SettingsContext';
import { IconChevronDown } from '../../constants/Icons';
import { TutorialStep } from '../../Components/TutorialStep'; // ← same import as Home.tsx
import { Permissions } from '../../enums/permissions.enum';
import ShowWrapper from '../../context/ShowWrapper';
import useTutorial from '../../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../../Catalogue/hooks/useCompleteTutorial';
import type { Invoice } from './journal.types';
import { SAMPLE_INVOICES } from './journal.types';
import { useJournalList, useInvoicePayment, useInvoiceDeletion, useInvoiceCommunication } from './hooks';
import { JournalListFilters, InvoiceActionSheet, PrintSubMenuModal, QrCodeModal } from './components';
// ─── Total tutorial steps for Journal ───────────────────────────────────────
const TOTAL_STEPS = 6;

// --- MAIN COMPONENT ---
const Journal: React.FC = () => {
  // ─── Refs for tutorial autoscroll ─────────────────────────────────────────
  const tutorialRefs = useRef<(HTMLElement | null)[]>([]);
  const setTutorialRef = (index: number) => (el: HTMLElement | null) => {
    tutorialRefs.current[index] = el;
  };
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  const { salesSettings } = useSalesSettings();

  const { currentUser, loading: authLoading, hasPermission } = useAuth();

  const {
    customerCredit,
    setCustomerCredit,
    isModalOpen,
    setIsModalOpen,
    selectedInvoice,
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

  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isPosBasicPlan, setIsPosBasicPlan] = useState(false);
  useEffect(() => {
    const fetchExpiry = async () => {
      if (!currentUser?.companyId) return;
      const companyRef = doc(db, 'companies', currentUser.companyId);
      const snap = await getDoc(companyRef);
      if (snap.exists()) {
        const data = snap.data();
        const expiry = data.expiryDate;
        if (expiry) {
          const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
          setDaysRemaining(Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
        }
        const normalizedPlan = normalizePlan(data.pack);
        setIsPosBasicPlan(normalizedPlan === PLANS.POS_BASIC);
      }
    };
    fetchExpiry();
  }, [currentUser?.companyId]);

  const showBadge = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
  const isUrgent = daysRemaining !== null && daysRemaining <= 2;

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
    handleSendReminder,
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
                      className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-sm border tracking-wider bg-orange-50 text-orange-600 border-orange-200 whitespace-nowrap"
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
                    className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-sm border tracking-wider bg-blue-50 text-blue-600 border-blue-100 whitespace-nowrap"
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
                          <div className="flex justify-between items-center text-slate-700">
                            <div className="flex-1 pr-4">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-slate-400 flex items-center gap-1">
                                <span>{priceLabel}</span>
                                <span className="text-slate-400">|</span>
                                <span className="font-medium">Net: {netUnitPrice.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{renderPriceRow(remainingQty)}</p>
                              <p className="text-xs text-slate-400">Qty: {remainingQty}</p>
                            </div>
                          </div>
                        )}

                        {/* RETURNED QTY ROW — one crossed-out row per return event */}
                        {returnedEntries.map((entry, rIdx) => (
                          entry.qty > 0 && (
                            <div key={rIdx} className="flex justify-between items-center text-slate-400">
                              <div className="flex-1 pr-4">
                                <p className="font-medium line-through">{item.name}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  {entry.modeOfReturn && (
                                    <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${(() => {
                                      const mode = entry.modeOfReturn.toUpperCase().trim();
                                      if (mode === 'EXCHANGE') return 'bg-purple-50 text-purple-700 border-purple-200';
                                      if (mode.includes('CASH') || mode.includes('REFUND')) return 'bg-green-50 text-green-700 border-green-200';
                                      return 'bg-orange-50 text-orange-600 border-orange-200';
                                    })()}`}>
                                      {entry.modeOfReturn}
                                    </span>
                                  )}
                                  {entry.returnedAt && (
                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide">
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
                          <div key={`returned-${index}`} className="flex justify-between items-center text-slate-400 mb-3">
                            <div className="flex-1 pr-4">
                              <p className="font-medium" style={{ textDecoration: 'line-through' }}>
                                {item.name}
                              </p>
                              {/* Return mode badge + date */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {matchedHistory?.modeOfReturn && (
                                  <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${(() => {
                                    const mode = (matchedHistory.modeOfReturn || '').toUpperCase().trim();
                                    if (mode === 'EXCHANGE') return 'bg-purple-50 text-purple-700 border-purple-200';
                                    if (mode.includes('CASH') || mode.includes('REFUND')) return 'bg-green-50 text-green-700 border-green-200';
                                    return 'bg-orange-50 text-orange-600 border-orange-200';
                                  })()}`}>
                                    {matchedHistory.modeOfReturn}
                                  </span>
                                )}
                                {matchedHistory?.returnedAt && (
                                  <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide">
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
                        <div key={`rh-fallback-${index}`} className="flex justify-between items-center text-slate-400 mb-3">
                          <div className="flex-1 pr-4">
                            <p className="font-medium" style={{ textDecoration: 'line-through' }}>
                              {ri.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {ri.modeOfReturn && (
                                <span className={`text-[7px] uppercase font-bold px-1.5 py-0.5 rounded border ${(() => {
                                  const mode = (ri.modeOfReturn || '').toUpperCase().trim();
                                  if (mode === 'EXCHANGE') return 'bg-purple-50 text-purple-700 border-purple-200';
                                  if (mode.includes('CASH') || mode.includes('REFUND')) return 'bg-green-50 text-green-700 border-green-200';
                                  return 'bg-orange-50 text-orange-600 border-orange-200';
                                })()}`}>
                                  {ri.modeOfReturn}
                                </span>
                              )}
                              {ri.returnedAt && (
                                <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide">
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
                    <p className="text-xs text-slate-400">No item details available.</p>
                  }
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
                {invoice.expenses && invoice.expenses.length > 0 ? (
                  invoice.expenses.map((expense, idx) => (
                    <div key={`exp-${idx}`} className="flex justify-between items-center mt-1 pt-1.5 border-t border-slate-200">
                      <p className="text-xs font-medium text-slate-400">{expense.name || 'Extra Expense'}</p>
                      <p className="text-xs font-semibold text-orange-500">
                        + {Number(expense.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                      </p>
                    </div>
                  ))
                ) : (invoice.extraExpenseAmount && invoice.extraExpenseAmount > 0) ? (
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

                <div className={`grid gap-1.5 mt-2 pt-4 border-t border-slate-200 ${visibleButtonsCount === 1 ? 'grid-cols-1' :
                  visibleButtonsCount === 2 ? 'grid-cols-2' :
                    visibleButtonsCount === 3 ? 'grid-cols-3' :
                      visibleButtonsCount === 4 ? 'grid-cols-4' :
                        'grid-cols-5'
                  }`}>
                  {invoice.status === 'Unpaid' && (<button onClick={(e) => { e.stopPropagation(); openPaymentModal(invoice); }} className="py-2 text-[11px] font-bold text-white bg-emerald-500 rounded-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors text-center">Settle</button>)}
                  {invoice.status === 'Unpaid' && invoice.partyNumber && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSendReminder(invoice); }}
                      disabled={sendingPdf}
                      className="py-2 text-[11px] font-bold text-white bg-amber-500 rounded-sm hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {sendingPdf ? <Spinner /> : <>Remind</>}
                    </button>
                  )}
                  {invoice.status === 'Paid' && (<button onClick={(e) => { e.stopPropagation(); promptDeleteInvoice(invoice); }} className="py-2 text-[11px] font-bold text-white bg-red-500 rounded-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors">Delete</button>)}
                  <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                    <button onClick={(e) => { e.stopPropagation(); handleEditInvoice(invoice); }} className="py-2 text-[11px] font-bold text-white bg-gray-400 rounded-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors text-center">Edit</button>
                  </ShowWrapper>

                  {invoice.type === 'Credit' && (
                    <>
                      <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                        <button onClick={(e) => { e.stopPropagation(); handleSalesReturn(invoice); }} className="py-2 text-[11px] font-bold text-white bg-blue-600 rounded-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors text-center">Return</button>

                      </ShowWrapper>
                      <button
                        onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }}
                        disabled={pdfGenerating === invoice.id}
                        className="py-2 text-[11px] font-bold text-white bg-black rounded-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {pdfGenerating === invoice.id ? <Spinner /> : 'Print'}
                      </button>
                    </>
                  )}

                  {invoice.type === 'Debit' && (
                    <>
                      <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                        <button onClick={(e) => { e.stopPropagation(); handlePurchaseReturn(invoice); }} className="py-2 text-[11px] font-bold text-white bg-blue-600 rounded-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors text-center">Return</button>
                        <button onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }} className="py-2 text-[11px] font-bold text-white bg-black rounded-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors flex items-center justify-center gap-1 text-center">Print</button>
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
      <p className="p-8 text-center text-base text-slate-500">
        {isTutorialActive
          ? 'Sample data will appear here once you switch to a matching tab.'
          : 'No invoices found for this selection.'}
      </p>
    );
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-100 mb-10">
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
          handleSendWhatsapp={handleSendWhatsapp}
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
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalUnpaidAmount={totalUnpaidAmount}
        />
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
            ref={setTutorialRef(6) as any} className="flex-grow overflow-y-auto bg-slate-100 space-y-3 pt-2 pb-24">
            {renderContent()}
          </div>
        </TutorialStep>
      </div>
    </div>
  );
};

export default Journal;