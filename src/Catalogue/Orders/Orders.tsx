import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from "framer-motion";
import { Link } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../src/constants/routes.constants';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import ShinyText from '../../Components/ShinyText';
import {
    doc,
    getDoc,
    setDoc,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { Spinner } from '../../constants/Spinner';
import { Modal, PaymentModal } from '../../constants/Modal';
import { State } from '../../enums';
import type { Item } from '../../constants/models';
import { TutorialStep } from '../../Components/TutorialStep';
import useTutorial from '../../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../../Catalogue/hooks/useCompleteTutorial';
import { ORDER_STATUSES } from './orders.types';
import { useOrdersList, useOrderEditor, useOrderStatus, useOrderPayment, useOrderDeletion, usePendingRequestCount, useOrderCommunication } from './hooks';
import { OrderListFilters, OrderEditModal, TransportDetailsModal, ZeroAmountConfirmModal, AdjustmentConfirmModal, StatusConfirmModal, DeleteConfirmModal, OrderActionSheet, PrintSubMenuModal, QrCodeModal, OrderCard, DuplicateItemPromptModal } from './components';

// ─── Total tutorial steps for Orders ────────────────────────────────────────
const TOTAL_STEPS = 5;

const NOTIFICATION_SEEN_ORDERS_KEY = "seenOrderNotifications";

const OrdersPage: React.FC = () => {

    // AUDIO REF
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // ─── Refs for tutorial autoscroll ─────────────────────────────────────────
    const tutorialRefs = useRef<(HTMLElement | null)[]>([]);
    const setTutorialRef = (index: number) => (el: HTMLElement | null) => {
        tutorialRefs.current[index] = el;
    };
    const seenOrdersRef = useRef<Set<string>>(
        new Set(JSON.parse(localStorage.getItem(NOTIFICATION_SEEN_ORDERS_KEY) || "[]"))
    );
    const isInitialNotificationLoadRef = useRef(true);
    const navigate = useNavigate();

    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [_billSettings, setBillSettings] = useState<any>(null);
    const [catalogueWhatsappExtra, setCatalogueWhatsappExtra] = useState<string>('');
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [salesSettings, setSalesSettings] = useState<any>(null);
    const [enableItemWiseDiscount, setEnableItemWiseDiscount] = useState(false);
    const [enableDiscount2, setEnableDiscount2] = useState(false);
    const [enableTransportDetails, setEnableTransportDetails] = useState(false);
    const [_itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
    const [_pageIsLoading, setPageIsLoading] = useState(false);
    const [_error, _setError] = useState<string | null>(null);
    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const { items: catalogueItems, itemsLoading: catalogueItemsLoading, itemGroups: catalogueItemGroups } = useCatalogueData();

    const { currentUser } = useAuth();
    // ─── Tutorial state (mirrors Journal.tsx pattern) ─────────────────────────
    const [tutorialStep, setTutorialStep] = useState(0);
    const next = (n: number) => setTutorialStep(n <= TOTAL_STEPS ? n : 0);
    const skip = () => {
        completeTutorial(currentUser, 'ordersTutorialDone', setTutorialStep);
    };
    const handleTutorialFinish = async () => {
        if (!currentUser?.companyId) {
            setTutorialStep(0);
            window.dispatchEvent(new Event("orders_tutorial_done"));
            return;
        }
        try {
            await setDoc(
                doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
                { ordersTutorialDone: true },
                { merge: true }
            );
        } catch (e) {
            console.error('Error saving orders tutorial:', e);
        }
        setTutorialStep(0);
        window.dispatchEvent(new Event("orders_tutorial_done"));
    };
    // True only while the walkthrough is actively running
    const isTutorialActive = tutorialStep > 0 && tutorialStep <= TOTAL_STEPS;

    useTutorial(currentUser, setTutorialStep, 'ordersTutorialDone');

    const {
        Orders,
        dataLoading,
        error,
        filterRef,
        isFilterOpen,
        setIsFilterOpen,
        activeStatusTab,
        setActiveStatusTab,
        statusCounts,
        activeDateFilter,
        dateRange,
        customDateRange,
        setCustomDateRange,
        dateFilters,
        handleDateFilterSelect,
        handleApplyCustomDate,
        getDateDisplay,
        searchQuery,
        setSearchQuery,
        showSearch,
        setShowSearch,
        paymentFilter,
        setPaymentFilter,
        expandedorderId,
        handleOrderClick,
        filteredOrders,
    } = useOrdersList({
        companyId: currentUser?.companyId,
        isTutorialActive,
        tutorialStep,
    });

    // Same date range currently applied to the Orders list itself, so the
    // "Customer Requests" badge count always agrees with what filtering the
    // Requests page to that same range would show.
    const pendingRequestCount = usePendingRequestCount(currentUser?.companyId, dateRange.start, dateRange.end);

    // ─── Autoscroll: whenever tutorialStep changes, scroll that element into view
    useEffect(() => {
        if (tutorialStep === 0) return;
        const el = tutorialRefs.current[tutorialStep];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [tutorialStep]);

    // ── Subscription badge ────────────────────────────────────────────────────
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

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

    const {
        activeTab, setActiveTab,
        editingOrder, setEditingOrder,
        editExpenses,
        setCartSearchQuery,
        editDiscount,
        editDiscountPercent,
        showBillDiscountFields, setShowBillDiscountFields,
        showTransportModal, setShowTransportModal,
        transportName, setTransportName,
        grRrNo, setGrRrNo,
        grRrDate, setGrRrDate,
        vehicleNo, setVehicleNo,
        stationFrom, setStationFrom,
        pinCode, setPinCode,
        hasTransportDetails,
        pendingAdjustment, setPendingAdjustment,
        showAdjustmentPopup, setShowAdjustmentPopup,
        showZeroAmountModal, setShowZeroAmountModal,
        pendingZeroOrderId, setPendingZeroOrderId,
        duplicateOrderItemPrompt, setDuplicateOrderItemPrompt,
        isEditDrawerOpen, setIsEditDrawerOpen,
        selectedItemForEdit, setSelectedItemForEdit,
        openEditor,
        calculatedEditTotal,
        displayedOrderItems,
        handleNetPriceChange,
        handleQuantityChange,
        handleDiscountChange,
        handleDiscount2Change,
        handleDeleteItem,
        handleAddItem,
        handleIncreaseExistingOrderItemQuantity,
        handleAddOrderItemAsNew,
        handleAddExpense,
        handleExpenseNameChange,
        handleExpenseAmountChange,
        handleRemoveExpense,
        handleDiscountPercentInputChange,
        handleDiscountAmountInputChange,
        handleSaveSuccess,
        handleSaveChanges,
        handleCreditNote,
        handleRefund,
    } = useOrderEditor({
        companyId: currentUser?.companyId,
        currentUser,
        Orders,
        salesSettings,
        enableItemWiseDiscount,
        enableDiscount2,
        enableTransportDetails,
        setModal,
    });

    const {
        isUpdatingStatus,
        selectedOrderForConfirm, setSelectedOrderForConfirm,
        handleUpdateStatus,
        handlePreviousStatus,
    } = useOrderStatus({
        Orders,
        companyId: currentUser?.companyId,
        currentUser,
    });

    const {
        showPaymentModal, setShowPaymentModal,
        customerCredit,
        currentDue,
        onSubmit: handlePaymentSubmit,
    } = useOrderPayment({
        currentUser,
        companyId: currentUser?.companyId,
        setModal,
        setEnableItemWiseDiscount,
        setEnableDiscount2,
        setEnableTransportDetails,
    });

    const {
        pendingDeleteOrderId, setPendingDeleteOrderId,
        pendingDeleteWarning, setPendingDeleteWarning,
        showDeleteConfirmModal, setShowDeleteConfirmModal,
        handleDeleteOrder,
    } = useOrderDeletion({
        companyId: currentUser?.companyId,
        currentUser,
        setModal,
    });

    const {
        selectedOrderForAction, setSelectedOrderForAction,
        pdfLoadingOrderId, setPdfLoadingOrderId,
        showQrModal, setShowQrModal,
        sendingPdf,
        showPrintSubMenu, setShowPrintSubMenu,
        billType, setBillType,
        handlePdfAction,
        handleSendWhatsapp,
        handleSendReminder,
    } = useOrderCommunication({
        currentUser,
        companyInfo,
        availableItems,
        catalogueWhatsappExtra,
        setModal,
    });

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

            if (isNewOrder && isActiveOrder) {
                // ✅ KEEP THIS: Play the sound
                const audio = audioRef.current;
                if (audio) {
                    audio.currentTime = 0;
                    audio.play().catch((err) => {
                        console.error("Audio play failed:", err);
                    });
                }
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
                                createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),

                                // 🔥 ADD THIS LINE TO PREVENT DUPLICATES 🔥
                                orderDocId: order.id,
                            },
                        })
                    );

                    seenOrdersRef.current.add(order.id);
                    updated = true;
                }
                seenOrdersRef.current.add(order.id);
                updated = true;
            }
        });

        // Update local storage
        if (updated) {
            localStorage.setItem(
                NOTIFICATION_SEEN_ORDERS_KEY,
                JSON.stringify(Array.from(seenOrdersRef.current))
            );
        }
    }, [Orders]);

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
                    const data = snap.data();
                    setBillSettings(data);
                    setCatalogueWhatsappExtra(data.catalogueWhatsappExtraMessage || '');
                } else {
                    setBillSettings({});
                    setCatalogueWhatsappExtra('');
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
                    console.log("Sales settings loaded:", data);

                    setSalesSettings(data); // 👈 Add this line to store the settings

                    setEnableItemWiseDiscount(data.enableItemWiseDiscount ?? false);
                    setEnableDiscount2(data.enableDiscount2 ?? false);
                    setEnableTransportDetails(data.enableTransportDetails ?? false);
                }
            } catch (error) {
                console.error("Error fetching sales settings:", error);
            }
        };

        fetchSalesSettings();
    }, [currentUser?.companyId]);

    // items/itemGroups now come from the shared CatalogueDataContext instead
    // of this page fetching (and separately live-listening to) them itself —
    // the old code above did both a one-shot syncItems() AND a listenToItems()
    // live listener writing into the same availableItems state, which was
    // redundant even before this change.
    useEffect(() => {
        setPageIsLoading(catalogueItemsLoading);
        setAvailableItems(catalogueItems);
    }, [catalogueItems, catalogueItemsLoading]);

    useEffect(() => {
        const groupMap: Record<string, string> = {};
        catalogueItemGroups.forEach((g) => { if (g.id) groupMap[g.id] = g.name || 'Unknown Group'; });
        setItemGroupMap(groupMap);
    }, [catalogueItemGroups]);

    return (
        <div className="flex min-h-screen w-full flex-col bg-gray-100 mb-10">
            {showBadge && (
                <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm ${isUrgent ? 'bg-red-300' : 'bg-amber-200'}`}>
                    <ShinyText text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`} speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false} />
                    <Link to="/subscription" className="text-black ml-2 underline hover:text-gray-100">Renew Now</Link>
                </div>
            )}
            {modal && <Modal message={modal.message} type={modal.type} onClose={() => setModal(null)} />}

            <OrderListFilters
                tutorialStep={tutorialStep}
                next={next}
                skip={skip}
                setTutorialRef={setTutorialRef}
                showSearch={showSearch}
                setShowSearch={setShowSearch}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                dateDisplay={getDateDisplay}
                isFilterOpen={isFilterOpen}
                setIsFilterOpen={setIsFilterOpen}
                filterRef={filterRef}
                dateFilters={dateFilters}
                activeDateFilter={activeDateFilter}
                handleDateFilterSelect={handleDateFilterSelect}
                customDateRange={customDateRange}
                setCustomDateRange={setCustomDateRange}
                handleApplyCustomDate={handleApplyCustomDate}
                pendingRequestCount={pendingRequestCount}
                onRequestsClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`, {
                    state: {
                        activeDateFilter,
                        startDate: dateRange.start ? dateRange.start.toISOString() : undefined,
                        endDate: dateRange.end ? dateRange.end.toISOString() : undefined,
                        customDateRange,
                    }
                })}
                orderStatuses={ORDER_STATUSES}
                activeStatusTab={activeStatusTab}
                setActiveStatusTab={setActiveStatusTab}
                statusCounts={statusCounts}
                paymentFilter={paymentFilter}
                setPaymentFilter={setPaymentFilter}
            />

            {/* --- 7. ORDERS LIST --- */}

            <div ref={setTutorialRef(5) as any} className="flex-grow overflow-y-hidden bg-slate-100 space-y-2 p-1 md:p-4">
                {dataLoading ? (
                    <div className="flex justify-center py-10"><Spinner /></div>
                ) : error ? (
                    <p className="p-8 text-center text-red-500">{error}</p>
                ) : filteredOrders.length > 0 ? (
                    <AnimatePresence>
                        {filteredOrders.map((order) => {
                            const card = (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    expandedorderId={expandedorderId}
                                    handleOrderClick={handleOrderClick}
                                    openEditor={openEditor}
                                    setSelectedOrderForAction={setSelectedOrderForAction}
                                    pdfLoadingOrderId={pdfLoadingOrderId}
                                    handleSendReminder={handleSendReminder}
                                    sendingPdf={sendingPdf}
                                    handleDeleteOrder={handleDeleteOrder}
                                    setShowPaymentModal={setShowPaymentModal}
                                    handlePreviousStatus={handlePreviousStatus}
                                    handleUpdateStatus={handleUpdateStatus}
                                    isUpdatingStatus={isUpdatingStatus}
                                />
                            );

                            if (isTutorialActive && tutorialStep === 5 && order.id === expandedorderId) {
                                return (
                                    <TutorialStep
                                        key={`tutorial-${order.id}`}
                                        step={5}
                                        currentStep={tutorialStep}
                                        text="Tap any order to see full details — items, addresses, payments, and status actions."
                                        onNext={handleTutorialFinish}
                                        onSkip={skip}
                                        isLast
                                    >
                                        {card}
                                    </TutorialStep>
                                );
                            }

                            return card;
                        })}
                    </AnimatePresence>
                ) : (
                    <p className="p-8 text-center text-slate-500">
                        {isTutorialActive
                            ? 'Sample orders will appear here once you switch to a matching status.'
                            : 'No Orders found.'}
                    </p>
                )}
            </div>

            {/* Modals (SelectedAction, QR, Payment, Editing) Same as provided */}
            {selectedOrderForAction && (
                <OrderActionSheet
                    selectedOrderForAction={selectedOrderForAction}
                    setSelectedOrderForAction={setSelectedOrderForAction}
                    setShowPrintSubMenu={setShowPrintSubMenu}
                    billType={billType}
                    setBillType={setBillType}
                    handleSendWhatsapp={handleSendWhatsapp}
                    sendingPdf={sendingPdf}
                    pdfLoadingOrderId={pdfLoadingOrderId}
                    setPdfLoadingOrderId={setPdfLoadingOrderId}
                    handlePdfAction={handlePdfAction}
                    setShowQrModal={setShowQrModal}
                />
            )}
            {showPrintSubMenu && selectedOrderForAction && (
                <PrintSubMenuModal
                    selectedOrderForAction={selectedOrderForAction}
                    setSelectedOrderForAction={setSelectedOrderForAction}
                    setShowPrintSubMenu={setShowPrintSubMenu}
                    setPdfLoadingOrderId={setPdfLoadingOrderId}
                    handlePdfAction={handlePdfAction}
                    _billSettings={_billSettings}
                />
            )}
            {showQrModal && (
                <QrCodeModal
                    showQrModal={showQrModal}
                    setShowQrModal={setShowQrModal}
                    companyId={currentUser?.companyId}
                />
            )}

            {showPaymentModal && (
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
                    onSubmit={handlePaymentSubmit}
                />
            )}

            {showTransportModal && (
                <TransportDetailsModal
                    setShowTransportModal={setShowTransportModal}
                    transportName={transportName}
                    setTransportName={setTransportName}
                    grRrNo={grRrNo}
                    setGrRrNo={setGrRrNo}
                    grRrDate={grRrDate}
                    setGrRrDate={setGrRrDate}
                    vehicleNo={vehicleNo}
                    setVehicleNo={setVehicleNo}
                    stationFrom={stationFrom}
                    setStationFrom={setStationFrom}
                    pinCode={pinCode}
                    setPinCode={setPinCode}
                    hasTransportDetails={hasTransportDetails}
                />
            )}
            {editingOrder && (
                <OrderEditModal
                    editingOrder={editingOrder}
                    setEditingOrder={setEditingOrder}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    calculatedEditTotal={calculatedEditTotal}
                    availableItems={availableItems}
                    handleAddItem={handleAddItem}
                    setCartSearchQuery={setCartSearchQuery}
                    displayedOrderItems={displayedOrderItems}
                    enableItemWiseDiscount={enableItemWiseDiscount}
                    enableDiscount2={enableDiscount2}
                    setModal={setModal}
                    handleDeleteItem={handleDeleteItem}
                    handleDiscountChange={handleDiscountChange}
                    handleDiscount2Change={handleDiscount2Change}
                    handleNetPriceChange={handleNetPriceChange}
                    handleQuantityChange={handleQuantityChange}
                    isEditDrawerOpen={isEditDrawerOpen}
                    selectedItemForEdit={selectedItemForEdit}
                    setIsEditDrawerOpen={setIsEditDrawerOpen}
                    setSelectedItemForEdit={setSelectedItemForEdit}
                    handleSaveSuccess={handleSaveSuccess}
                    setTransportName={setTransportName}
                    setGrRrNo={setGrRrNo}
                    setGrRrDate={setGrRrDate}
                    setVehicleNo={setVehicleNo}
                    setStationFrom={setStationFrom}
                    setPinCode={setPinCode}
                    editExpenses={editExpenses}
                    handleAddExpense={handleAddExpense}
                    handleExpenseNameChange={handleExpenseNameChange}
                    handleExpenseAmountChange={handleExpenseAmountChange}
                    handleRemoveExpense={handleRemoveExpense}
                    showBillDiscountFields={showBillDiscountFields}
                    setShowBillDiscountFields={setShowBillDiscountFields}
                    enableTransportDetails={enableTransportDetails}
                    setShowTransportModal={setShowTransportModal}
                    hasTransportDetails={hasTransportDetails}
                    editDiscountPercent={editDiscountPercent}
                    editDiscount={editDiscount}
                    handleDiscountPercentInputChange={handleDiscountPercentInputChange}
                    handleDiscountAmountInputChange={handleDiscountAmountInputChange}
                    handleSaveChanges={handleSaveChanges}
                />
            )}
            {selectedOrderForConfirm && (
                <StatusConfirmModal
                    selectedOrderForConfirm={selectedOrderForConfirm}
                    setSelectedOrderForConfirm={setSelectedOrderForConfirm}
                    handleUpdateStatus={handleUpdateStatus}
                />
            )}
            {/* Delete Confirm Modal */}
            {showDeleteConfirmModal && pendingDeleteOrderId && (
                <DeleteConfirmModal
                    pendingDeleteOrderId={pendingDeleteOrderId}
                    pendingDeleteWarning={pendingDeleteWarning}
                    setShowDeleteConfirmModal={setShowDeleteConfirmModal}
                    setPendingDeleteOrderId={setPendingDeleteOrderId}
                    setPendingDeleteWarning={setPendingDeleteWarning}
                    handleDeleteOrder={handleDeleteOrder}
                />
            )}

            {/* Zero Amount Modal */}
            {showZeroAmountModal && pendingZeroOrderId && (
                <ZeroAmountConfirmModal
                    pendingZeroOrderId={pendingZeroOrderId}
                    setShowZeroAmountModal={setShowZeroAmountModal}
                    setPendingZeroOrderId={setPendingZeroOrderId}
                    setEditingOrder={setEditingOrder}
                    handleDeleteOrder={handleDeleteOrder}
                />
            )}
            {/* Adjustment Popup */}
            {showAdjustmentPopup && pendingAdjustment && (
                <AdjustmentConfirmModal
                    pendingAdjustment={pendingAdjustment}
                    handleCreditNote={handleCreditNote}
                    handleRefund={handleRefund}
                    setShowAdjustmentPopup={setShowAdjustmentPopup}
                    setPendingAdjustment={setPendingAdjustment}
                />
            )}

            {/* Duplicate Item Prompt */}
            {duplicateOrderItemPrompt && (
                <DuplicateItemPromptModal
                    duplicateOrderItemPrompt={duplicateOrderItemPrompt}
                    setDuplicateOrderItemPrompt={setDuplicateOrderItemPrompt}
                    handleIncreaseExistingOrderItemQuantity={handleIncreaseExistingOrderItemQuantity}
                    handleAddOrderItemAsNew={handleAddOrderItemAsNew}
                />
            )}
        </div>
    );
};

export default OrdersPage;
