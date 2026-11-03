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
import useTutorial from '../../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../../Catalogue/hooks/useCompleteTutorial';
import type { Invoice } from './journal.types';
import { SAMPLE_INVOICES } from './journal.types';
import { useJournalList, useInvoicePayment, useInvoiceDeletion, useInvoiceCommunication } from './hooks';
import { BillDetail, JournalListFilters, InvoiceActionSheet, PrintSubMenuModal, QrCodeModal } from './components';
import { JournalTabs } from '../Journal/Journaltabs';
import { formatClockTime, formatDayLabel } from '../../lib/format';
import { useCollapsingPageHeader } from '../../lib/useCollapsingPageHeader';
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL, fmt, getActiveModes, modeBadgeClass, modeLabel, returnModeClass } from './journal.ui';
// ─── Total tutorial steps for Journal ───────────────────────────────────────
const TOTAL_STEPS = 6;

// --- MAIN COMPONENT ---
const Journal: React.FC = () => {
  // ─── Refs for tutorial autoscroll ─────────────────────────────────────────
  const tutorialRefs = useRef<(HTMLElement | null)[]>([]);
  const paneHostRef = useRef<HTMLDivElement>(null);
  useCollapsingPageHeader(paneHostRef, 1280); // xl: where the list + detail split starts
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

    typeInvoices,
    filteredInvoices,
    tabCounts,
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
        (inv) => inv.type === activeType && (activeTab === 'All' || inv.status === activeTab)
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
    //handleSendReminderSnapto,
    handleShowQr,
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

  // Summary strip numbers (display only): the whole period, whichever tab is open
  const summary = useMemo(() => {
    const total = typeInvoices.reduce((s, i) => s + (i.amount || 0), 0);
    const unpaidInvoices = typeInvoices.filter((i) => i.status === 'Unpaid');
    const unpaid = unpaidInvoices.reduce((s, i) => s + (i.dueAmount || 0), 0);
    return {
      total,
      unpaid,
      received: Math.max(total - unpaid, 0),
      count: typeInvoices.length,
      unpaidCount: unpaidInvoices.length,
    };
  }, [typeInvoices]);

  // The bill whose detail is open (desktop side pane / mobile sheet)
  const selectedInvoice: Invoice | null = expandedInvoiceId
    ? filteredInvoices.find((i) => i.id === expandedInvoiceId) || null
    : null;

  // Full bill (used in the desktop side pane and the mobile sheet)
  const renderBillDetail = (invoice: Invoice, onClose?: () => void) => (
    <BillDetail
      key={invoice.id}
      invoice={invoice}
      showBilledBy={!!salesSettings?.enableSalesmanSelection}
      pdfGenerating={pdfGenerating}
      sendingPdf={sendingPdf}
      onClose={onClose}
      onSettle={openPaymentModal}
      onPrint={setInvoiceToPrint}
      onTransport={setTransportPopupInvoice}
      onRemind={handleSendReminder}
      onReturn={(inv) => (inv.type === 'Credit' ? handleSalesReturn(inv) : handlePurchaseReturn(inv))}
      onEdit={handleEditInvoice}
      onDelete={promptDeleteInvoice}
    />
  );

  const renderContent = () => {
    if (authLoading || dataLoading) return <Spinner />;
    if (error) return <p className="p-8 text-center text-[#d5000c]">{error}</p>;

    if (filteredInvoices.length > 0) {
      let previousDay = '';
      return filteredInvoices.map((invoice) => {
        const day = formatDayLabel(invoice.createdAt);
        const startsDay = day !== previousDay;
        previousDay = day;
        const isSelected = expandedInvoiceId === invoice.id;
        const activeModes = getActiveModes(invoice);
        const hasDue = invoice.status === 'Unpaid' && !!invoice.dueAmount && invoice.dueAmount > 0;

        return (
          <React.Fragment key={invoice.id}>
            {startsDay && (
              <div role="presentation" className="px-4 pt-3.5 pb-1.5 bg-[#f5f7ff] border-b border-[#dfe6fb] text-[11px] leading-4 font-semibold tracking-[0.08em] uppercase text-[#5b6b86]">
                {day}
              </div>
            )}
            <div
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
              <div className="text-right text-xs text-[#5b6b86]">{formatClockTime(invoice.createdAt)}</div>
            </div>
          </React.Fragment>
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
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-[#eef2ff] mb-10 xl:mb-0 xl:block xl:h-full xl:min-h-0 xl:overflow-visible xl:bg-transparent">
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
      <div className="flex flex-col relative xl:block xl:h-full">

        <div className="bg-[#eef2ff]">
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
        </div>

        {/* ── LIST (left) + DETAIL (right, desktop only): each scrolls inside its own card ── */}
        <div ref={paneHostRef} className="bg-[#eef2ff] xl:h-[calc(100%+1rem)]">
          <div className="px-4 lg:px-6 mt-4 pb-24 grid gap-4 items-start xl:mt-0 xl:h-[calc(100%-var(--pane-offset,0px))] xl:min-h-[320px] xl:grid-cols-[380px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:items-stretch xl:pb-6 xl:pt-4">
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
                className="bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] overflow-hidden xl:flex xl:min-h-0 xl:flex-col"
              >
                <JournalTabs
                  tutorialStep={tutorialStep}
                  next={next}
                  skip={skip}
                  activeType={activeType}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  tabCounts={tabCounts}
                  totalUnpaidAmount={totalUnpaidAmount}
                />
                <div role="listbox" className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                  {renderContent()}
                </div>
              </div>
            </TutorialStep>

            {/* Desktop detail pane */}
            <div className="hidden xl:block xl:min-h-0">
              <div className="h-full bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] overflow-hidden">
                {selectedInvoice ? (
                  renderBillDetail(selectedInvoice)
                ) : (
                  <p className="py-10 text-center text-sm text-[#45556c]">
                    Pick a bill from the list to see its items, payment and actions.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile detail sheet (hidden while the walkthrough is running so it never covers the highlight) */}
      {selectedInvoice && !isTutorialActive && (
        <div className="xl:hidden fixed inset-0 z-[1500]">
          <div
            className="absolute inset-0 bg-[#020618]/45"
            onClick={() => handleInvoiceClick(selectedInvoice.id)}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-xl max-h-[88dvh] flex-col overflow-hidden bg-white rounded-sm shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] pt-5">
            {/* Drag handle */}
            <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[#dfe6fb]" aria-hidden="true" />
            <div className="flex min-h-0 flex-1 flex-col">
              {renderBillDetail(selectedInvoice, () => handleInvoiceClick(selectedInvoice.id))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Journal;