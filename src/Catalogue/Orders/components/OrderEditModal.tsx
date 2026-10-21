import React, { useState } from 'react';
import { FiX, FiFileText, FiPlus, FiTag, FiTruck, FiCheck, FiMapPin, FiEdit2, FiAlertTriangle, FiTrash2, FiCreditCard } from 'react-icons/fi';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import { GenericCartList } from '../../../Components/CartItem';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import { ROUTES } from '../../../constants/routes.constants';
import { State } from '../../../enums';
import type { Item, PriceTier } from '../../../constants/models';
import { TierPickerModal } from '../../../Components/TierPickerModal';
import { hasMultiplePricing } from '../../../Pages/utils/pricingUtils';
import type { Order } from '../orders.types';
import { formatAmount } from '../../../lib/format';

interface OrderEditModalProps {
    editingOrder: Order;
    setEditingOrder: (order: Order | null) => void;
    activeTab: 'billing' | 'shipping';
    setActiveTab: (tab: 'billing' | 'shipping') => void;
    calculatedEditTotal: number;
    availableItems: Item[];
    handleAddItem: (selectedItem: Item, tier?: PriceTier) => void;
    setCartSearchQuery: (q: string) => void;
    displayedOrderItems: any[];
    enableItemWiseDiscount: boolean;
    enableDiscount2: boolean;
    setModal: (modal: { message: string; type: State } | null) => void;
    handleDeleteItem: (id: string) => void;
    handleDiscountChange: (id: string, value: number | string) => void;
    handleDiscount2Change: (id: string, value: number | string) => void;
    handleNetPriceChange: (id: string, value: string) => void;
    handleQuantityChange: (id: string, newQuantity: number) => void;
    isEditDrawerOpen: boolean;
    selectedItemForEdit: any;
    setIsEditDrawerOpen: (v: boolean) => void;
    setSelectedItemForEdit: (item: any) => void;
    handleSaveSuccess: (updatedItemData: Partial<Item>) => void;
    setTransportName: (v: string) => void;
    setGrRrNo: (v: string) => void;
    setGrRrDate: (v: string) => void;
    setVehicleNo: (v: string) => void;
    setStationFrom: (v: string) => void;
    setPinCode: (v: string) => void;
    editExpenses: { id: number; name: string; amount: number | '' }[];
    handleAddExpense: () => void;
    handleExpenseNameChange: (id: number, value: string) => void;
    handleExpenseAmountChange: (id: number, value: string) => void;
    handleRemoveExpense: (id: number) => void;
    showBillDiscountFields: boolean;
    setShowBillDiscountFields: React.Dispatch<React.SetStateAction<boolean>>;
    enableTransportDetails: boolean;
    setShowTransportModal: (v: boolean) => void;
    hasTransportDetails: boolean;
    editDiscountPercent: number;
    editDiscount: number;
    handleDiscountPercentInputChange: (value: string) => void;
    handleDiscountAmountInputChange: (value: string) => void;
    handleSaveChanges: () => void;
}

// ─── UI-only helpers (SELLAR "Catalogue orange" — PageCatEditOrderDesktop / Mobile) ───
const FIELD =
    'h-10 w-full px-3 border border-slate-300 rounded-sm text-[13px] text-slate-900 bg-white outline-none placeholder:text-slate-400 focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/20';
const OVERLINE = 'text-[11px] leading-4 font-semibold uppercase tracking-[0.08em] text-slate-500';
const CHIP =
    'inline-flex items-center gap-1.5 h-[34px] px-3 rounded-full text-[13px] font-medium transition-colors border-[1.5px]';
const CHIP_IDLE = 'border-dashed border-slate-300 bg-white text-slate-600 hover:bg-[#fff8f2]';
const CHIP_SET = 'border-solid border-[#c2410c] bg-[#ffedd5] text-[#9a3412]';

const formatPhone = (p?: string) => (p ? p.replace(/^(\d{5})(\d{1,5})$/, '$1 $2') : '');

// Module-level on purpose: defining this inside the component would remount inputs (focus loss) on every keystroke.
const PopupShell: React.FC<{
    title: string;
    subtitle: string;
    tone: 'green' | 'magenta';
    icon: React.ReactNode;
    onClose: () => void;
    footer: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, subtitle, tone, icon, onClose, footer, children }) => (
    <div
        className="fixed inset-0 z-[2100] flex items-start md:items-center justify-center bg-[#020618]/50 p-3 pt-[18vh] md:pt-3"
        onClick={onClose}
    >
        <div
            role="dialog"
            aria-label={title}
            className="w-full max-w-md bg-white rounded-sm shadow-2xl overflow-hidden flex flex-col text-left"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#f6e1d0]">
                <span
                    className={`w-8 h-8 shrink-0 grid place-items-center rounded-sm ${tone === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#ffe8f8] text-[#c4009a]'}`}
                >
                    {icon}
                </span>
                <div className="flex-1 min-w-0">
                    <b className="block text-[17px] font-semibold text-slate-900 leading-6">{title}</b>
                    <small className="block text-xs text-slate-500">{subtitle}</small>
                </div>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="w-10 h-10 grid place-items-center rounded-sm text-slate-500 hover:bg-[#fff8f2]"
                >
                    <FiX size={20} />
                </button>
            </div>
            <div className="p-4 grid gap-3">{children}</div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#f6e1d0] bg-[#fff8f2]">{footer}</div>
        </div>
    </div>
);

export const OrderEditModal: React.FC<OrderEditModalProps> = ({
    editingOrder,
    setEditingOrder,
    calculatedEditTotal,
    availableItems,
    handleAddItem,
    setCartSearchQuery,
    displayedOrderItems,
    enableItemWiseDiscount,
    enableDiscount2,
    setModal,
    handleDeleteItem,
    handleDiscountChange,
    handleDiscount2Change,
    handleNetPriceChange,
    handleQuantityChange,
    isEditDrawerOpen,
    selectedItemForEdit,
    setIsEditDrawerOpen,
    setSelectedItemForEdit,
    handleSaveSuccess,
    setTransportName,
    setGrRrNo,
    setGrRrDate,
    setVehicleNo,
    setStationFrom,
    setPinCode,
    editExpenses,
    handleAddExpense,
    handleExpenseNameChange,
    handleExpenseAmountChange,
    handleRemoveExpense,
    setShowBillDiscountFields,
    enableTransportDetails,
    setShowTransportModal,
    hasTransportDetails,
    editDiscountPercent,
    editDiscount,
    handleDiscountPercentInputChange,
    handleDiscountAmountInputChange,
    handleSaveChanges,
}) => {
    const [tierPickerItem, setTierPickerItem] = useState<Item | null>(null);

    // ── UI-only state ──
    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [showDiscountPopup, setShowDiscountPopup] = useState(false);
    const [showExpensePopup, setShowExpensePopup] = useState(false);
    // Replaces the old document.getElementById('sameAsBilling').checked lookup (same rule, now a state).
    const [sameAddress, setSameAddress] = useState<boolean>(() => {
        const b = editingOrder.billingDetails;
        const s = editingOrder.shippingDetails;
        return (
            (b?.name || '') === (s?.name || '') &&
            (b?.phone || '') === (s?.phone || '') &&
            (b?.address || '') === (s?.address || '')
        );
    });

    const handleItemSelectedWrapper = (item: Item | null) => {
        if (!item) return;
        if (hasMultiplePricing(item)) {
            setTierPickerItem(item);
            return;
        }
        handleAddItem(item);
    };

    const toggleSameAddress = () => {
        const next = !sameAddress;
        setSameAddress(next);
        if (next) {
            setEditingOrder({
                ...editingOrder,
                shippingDetails: { ...editingOrder.billingDetails }
            });
        } else {
            setIsEditingAddress(true);
        }
    };

    const openExpensePopup = () => {
        if (editExpenses.length === 0) handleAddExpense();
        setShowExpensePopup(true);
    };
    const openDiscountPopup = () => {
        setShowBillDiscountFields(true);
        setShowDiscountPopup(true);
    };

    // Display-only values
    const headerName = editingOrder.userName || editingOrder.billingDetails?.name;
    const customerName = editingOrder.billingDetails?.name || headerName || 'Customer';
    const billingAddress = editingOrder.billingDetails?.address?.trim() || '';
    const billingCity = editingOrder.billingDetails?.city?.trim() || '';
    const billingLine = [billingAddress, billingCity, editingOrder.billingDetails?.state?.trim()].filter(Boolean).join(', ');
    // Checkout saves city in its own field; older orders may have it typed into the address (with a PIN)
    const addressIncomplete = !billingAddress || !(billingCity || /\b\d{6}\b/.test(billingAddress));
    const itemCount = editingOrder.items?.length ?? 0;
    const filledExpenses = editExpenses.filter((e) => e.name || e.amount !== '');
    const totalLabel = `₹${formatAmount(calculatedEditTotal)}`;

    const extraChips = (
        <>
            <button onClick={openExpensePopup} aria-haspopup="dialog" className={`${CHIP} ${filledExpenses.length ? CHIP_SET : CHIP_IDLE}`}>
                <FiPlus size={14} className={filledExpenses.length ? '' : 'text-[#c2410c]'} />
                Shop expense{filledExpenses.length ? ` · ${filledExpenses.length}` : ''}
            </button>
            <button onClick={openDiscountPopup} aria-haspopup="dialog" className={`${CHIP} ${editDiscount > 0 ? CHIP_SET : CHIP_IDLE}`}>
                <FiTag size={14} className={editDiscount > 0 ? '' : 'text-[#c2410c]'} />
                Bill discount{editDiscount > 0 ? ` · ₹${formatAmount(editDiscount)}` : ''}
            </button>
            {enableTransportDetails && (
                <button onClick={() => setShowTransportModal(true)} aria-haspopup="dialog" className={`${CHIP} ${hasTransportDetails ? CHIP_SET : CHIP_IDLE}`}>
                    {hasTransportDetails ? <FiCheck size={14} /> : <FiTruck size={14} className="text-[#c2410c]" />}
                    Transport
                </button>
            )}
        </>
    );

    return (
        <div className="fixed inset-0 z-[2000] flex md:items-center md:justify-center md:bg-black/60 md:backdrop-blur-sm md:p-6">
            <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:min-h-[560px] md:max-w-6xl md:rounded-sm flex flex-col md:shadow-2xl overflow-hidden">

                {/* ───────── HEADER — mobile ───────── */}
                <div className="md:hidden flex items-center gap-2.5 px-3.5 py-3 bg-white border-b border-[#f6e1d0]">
                    <button
                        onClick={() => setEditingOrder(null)}
                        aria-label="Close"
                        className="w-10 h-10 grid place-items-center rounded-sm text-slate-600 hover:bg-[#fff8f2]"
                    >
                        <FiX size={20} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-500 leading-4 truncate">Edit order · {editingOrder.orderId}</p>
                        <b className="block text-[17px] font-semibold text-slate-900 leading-6 truncate">{headerName || customerName}</b>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-xs text-slate-500 leading-4">Total</p>
                        <b className="block text-[17px] font-semibold text-slate-900 tabular-nums leading-6">{totalLabel}</b>
                    </div>
                </div>

                {/* ───────── HEADER — desktop ───────── */}
                <div className="hidden md:flex items-center gap-3.5 px-[22px] py-4 border-b border-[#f6e1d0] bg-white">
                    <span className="w-10 h-10 shrink-0 grid place-items-center rounded-sm bg-[#ffedd5] text-[#9a3412]">
                        <FiFileText size={20} />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-500 leading-4">Edit order · Catalogue</p>
                        <h3 className="text-[19px] font-semibold text-slate-900 leading-tight truncate">
                            {editingOrder.orderId}
                            {headerName ? ` · ${headerName}` : ''}
                        </h3>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-xs text-slate-500 leading-4">Total</p>
                        <b className="block text-xl font-semibold text-slate-900 tabular-nums leading-tight">{totalLabel}</b>
                    </div>
                    <button
                        onClick={() => setEditingOrder(null)}
                        aria-label="Close"
                        className="w-10 h-10 grid place-items-center rounded-sm text-slate-500 hover:bg-[#fff8f2] hover:text-slate-900"
                    >
                        <FiX size={20} />
                    </button>
                </div>

                {/* ───────── BODY ─────────
                    mobile : one column  → customer card, search, items
                    desktop: two columns → items | customer, extras, totals                         */}
                <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden custom-scrollbar bg-[#fff5ec] md:bg-white flex flex-col gap-2.5 px-4 py-3 md:p-0 md:gap-0 md:grid md:grid-cols-[minmax(0,1fr)_340px]">

                    {/* LEFT COLUMN (items) */}
                    <div className="contents md:block md:min-w-0 md:overflow-y-auto md:px-[22px] md:py-[18px] custom-scrollbar">
                        <div className="order-2 flex flex-col gap-2.5 md:gap-3 min-w-0">
                            {/* desktop: title row */}
                            <div className="hidden md:flex items-center gap-2.5 order-1">
                                <h4 className="flex-1 text-[15px] font-semibold text-slate-900">Items · {itemCount}</h4>
                                <span className="text-xs text-slate-500">Prices and quantities can be changed</span>
                            </div>

                            {/* Add item search */}
                            <div className="order-2">
                                <SearchableItemInput
                                    items={availableItems}
                                    onItemSelected={handleItemSelectedWrapper}
                                    onSearchChange={setCartSearchQuery}
                                    placeholder="Search item to add..."
                                />
                            </div>

                            {/* mobile: overline */}
                            <p className={`${OVERLINE} md:hidden order-3`}>Items · {itemCount}</p>

                            {/* Items list */}
                            <div className="order-4 h-auto md:rounded-sm md:border md:border-[#f6e1d0] md:bg-white">
                                <GenericCartList
                                    items={displayedOrderItems}
                                    availableItems={availableItems}
                                    basePriceKey="mrp"
                                    priceLabel="MRP"
                                    settings={{
                                        enableRounding: false,
                                        roundingInterval: 1,
                                        enableItemWiseDiscount: enableItemWiseDiscount,
                                        enableDiscount2: enableDiscount2,
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
                                    onDiscount2Change={handleDiscount2Change}
                                    onCustomPriceChange={handleNetPriceChange}
                                    onCustomPriceBlur={() => { }}
                                    onQuantityChange={handleQuantityChange}
                                />
                            </div>

                            <TierPickerModal
                                item={tierPickerItem}
                                isOpen={!!tierPickerItem}
                                onClose={() => setTierPickerItem(null)}
                                onSelect={(item, tier) => {
                                    handleAddItem(item, tier.id === '__base__' ? undefined : tier);
                                }}
                            />
                            {/* --- ITEM EDIT DRAWER COMPONENT --- */}
                            {isEditDrawerOpen && selectedItemForEdit && (
                                <ItemEditDrawer
                                    item={selectedItemForEdit}
                                    isOpen={isEditDrawerOpen}
                                    onClose={() => setIsEditDrawerOpen(false)}
                                    onSaveSuccess={handleSaveSuccess}
                                    itemGroupRoute={`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`}
                                />
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN (customer & delivery, extras, totals) */}
                    <div className="contents md:block md:min-w-0 md:overflow-y-auto md:px-5 md:py-[18px] md:bg-[#fff8f2] md:border-l md:border-[#f6e1d0] custom-scrollbar">

                        {/* Customer & delivery */}
                        <div className="order-1 min-w-0">
                            <p className={`${OVERLINE} hidden md:block mb-2`}>Customer &amp; delivery</p>
                            <div className="rounded-sm border border-[#f6e1d0] bg-white overflow-hidden">
                                <div className="p-3.5 grid gap-2">
                                    {/* name / phone / Edit */}
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-[#ffedd5] text-[#9a3412] text-sm font-semibold">
                                            {customerName.trim().charAt(0).toUpperCase() || '?'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <b className="block text-[15px] font-semibold text-slate-900 truncate">{customerName}</b>
                                            <span className="block text-xs text-slate-500">{formatPhone(editingOrder.billingDetails?.phone) || 'No phone'}</span>
                                        </div>
                                        <button
                                            onClick={() => setIsEditingAddress((v) => !v)}
                                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-[13px] font-medium text-[#c2410c] hover:bg-[#fff8f2]"
                                        >
                                            {isEditingAddress ? <FiCheck size={14} /> : <FiEdit2 size={14} />}
                                            {isEditingAddress ? 'Done' : 'Edit'}
                                        </button>
                                    </div>

                                    {!isEditingAddress ? (
                                        <>
                                            <div className="flex items-start gap-2 text-[13px] text-slate-600">
                                                <FiMapPin size={15} className="shrink-0 mt-0.5 text-slate-400" />
                                                <span className="min-w-0 line-clamp-2 break-words">Billing: {billingLine || 'Not added'}</span>
                                            </div>
                                            {addressIncomplete && (
                                                <div className="flex items-start gap-1.5 text-xs font-medium text-[#a16207]">
                                                    <FiAlertTriangle size={13} className="shrink-0 mt-px" />
                                                    <span>
                                                        {billingAddress
                                                            ? 'Address has no city — add it for delivery.'
                                                            : 'No address yet — add it for delivery.'}
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="grid gap-2 pt-1">
                                            <p className={OVERLINE}>Billing address</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {/* NAME FIELD */}
                                                <input
                                                    type="text"
                                                    placeholder="Name"
                                                    className={FIELD}
                                                    value={editingOrder.billingDetails?.name || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, name: val },
                                                            ...(sameAddress && { shippingDetails: { ...editingOrder.shippingDetails!, name: val } })
                                                        });
                                                    }}
                                                />
                                                {/* PHONE FIELD (Billing) - Security Check Added */}
                                                <input
                                                    type="text"
                                                    placeholder="Phone"
                                                    className={FIELD}
                                                    value={editingOrder.billingDetails?.phone || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, phone: val },
                                                            ...(sameAddress && { shippingDetails: { ...editingOrder.shippingDetails!, phone: val } })
                                                        });
                                                    }}
                                                />
                                                {/* ADDRESS FIELD */}
                                                <textarea
                                                    placeholder="Address"
                                                    className={`${FIELD} col-span-2 h-16 py-2 resize-none`}
                                                    value={editingOrder.billingDetails?.address || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, address: val },
                                                            ...(sameAddress && { shippingDetails: { ...editingOrder.shippingDetails!, address: val } })
                                                        });
                                                    }}
                                                />
                                                {/* CITY FIELD */}
                                                <input
                                                    type="text"
                                                    placeholder="City"
                                                    className={`${FIELD} col-span-2`}
                                                    value={editingOrder.billingDetails?.city || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, city: val },
                                                            ...(sameAddress && { shippingDetails: { ...editingOrder.shippingDetails!, city: val } })
                                                        });
                                                    }}
                                                />
                                            </div>

                                            {!sameAddress && (
                                                <>
                                                    <p className={`${OVERLINE} pt-1`}>Shipping address</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Name"
                                                            className={FIELD}
                                                            value={editingOrder.shippingDetails?.name || ''}
                                                            onChange={(e) => setEditingOrder({
                                                                ...editingOrder,
                                                                shippingDetails: { ...editingOrder.shippingDetails!, name: e.target.value }
                                                            })}
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Phone"
                                                            className={FIELD}
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
                                                            className={`${FIELD} col-span-2 h-16 py-2 resize-none`}
                                                            value={editingOrder.shippingDetails?.address || ''}
                                                            onChange={(e) => setEditingOrder({
                                                                ...editingOrder,
                                                                shippingDetails: { ...editingOrder.shippingDetails!, address: e.target.value }
                                                            })}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Ship to same address */}
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={sameAddress}
                                    onClick={toggleSameAddress}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 border-t border-[#f6e1d0] text-left text-[13px]"
                                >
                                    <FiTruck size={16} className="shrink-0 text-slate-400" />
                                    <span className="flex-1 min-w-0">
                                        <b className="block font-semibold text-slate-900">Ship to same address</b>
                                        <span className="block text-xs text-slate-500 truncate">
                                            Shipping: {editingOrder.shippingDetails?.name || '—'}
                                            {editingOrder.shippingDetails?.phone ? ` · ${formatPhone(editingOrder.shippingDetails.phone)}` : ''}
                                        </span>
                                    </span>
                                    <span className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${sameAddress ? 'bg-[#c2410c]' : 'bg-slate-300'}`}>
                                        <span className={`absolute top-[3px] left-[3px] w-3.5 h-3.5 rounded-full bg-white transition-transform ${sameAddress ? 'translate-x-4' : ''}`} />
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Extras + totals — desktop only (mobile has the bottom bar) */}
                        <div className="hidden md:block order-3 mt-3.5 space-y-3.5">
                            <p className={OVERLINE}>
                                Extras <span className="normal-case tracking-normal font-normal">· each opens a pop-up</span>
                            </p>
                            <div className="flex flex-wrap gap-2">{extraChips}</div>

                            {filledExpenses.length > 0 && (
                                <div className="grid gap-2">
                                    {filledExpenses.map((expense) => (
                                        <button
                                            key={expense.id}
                                            onClick={() => setShowExpensePopup(true)}
                                            className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2 rounded-xl border border-[#f6e1d0] bg-white text-left"
                                        >
                                            <span className="w-7 h-7 grid place-items-center rounded-sm bg-[#ffe8f8] text-[#c4009a]"><FiCreditCard size={14} /></span>
                                            <span className="min-w-0">
                                                <b className="block text-sm font-semibold text-slate-900 truncate">{expense.name || 'Expense'}</b>
                                                <small className="block text-xs text-slate-500">Shop expense</small>
                                            </span>
                                            <span className="flex items-center gap-1.5 text-xs font-medium text-[#c2410c]">
                                                {expense.amount !== '' && <b className="text-sm text-slate-900 tabular-nums">₹{formatAmount(Number(expense.amount))}</b>}
                                                <FiEdit2 size={12} />
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="rounded-sm border border-[#f6e1d0] bg-white p-3.5">
                                <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13px] text-slate-600">
                                    <dt>Bill discount</dt>
                                    <dd className="m-0 text-right text-slate-900 tabular-nums">₹{formatAmount(editDiscount || 0)}</dd>
                                    <dt className="pt-2 mt-1 border-t border-[#f6e1d0] text-[15px] font-semibold text-slate-900 self-end">Final total</dt>
                                    <dd className="m-0 pt-2 mt-1 border-t border-[#f6e1d0] text-right text-[22px] leading-7 font-semibold text-slate-900 tabular-nums">{totalLabel}</dd>
                                </dl>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ───────── FOOTER ───────── */}
                <div className="bg-white border-t border-[#f6e1d0] px-3.5 pt-2.5 pb-[max(16px,env(safe-area-inset-bottom))] md:px-[22px] md:py-3.5 grid gap-2.5 md:flex md:items-center md:justify-end md:gap-2.5">
                    {/* mobile: extras chips */}
                    <div className="md:hidden flex flex-wrap gap-2">{extraChips}</div>

                    <div className="grid grid-cols-[auto_1fr] gap-2 md:flex md:gap-2.5">
                        <button
                            onClick={() => {
                                setEditingOrder(null);
                                setCartSearchQuery('');
                                setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode('');
                            }}
                            className="h-12 px-5 rounded-lg text-[15px] font-medium text-slate-600 hover:bg-[#fff8f2] hover:text-slate-900 transition-colors"
                        >
                            Discard
                        </button>
                        <button
                            onClick={handleSaveChanges}
                            className="h-12 px-6 inline-flex items-center justify-center gap-2 rounded-sm bg-[#c2410c] text-white text-[15px] font-medium hover:bg-[#9a3412] transition-colors"
                        >
                            <FiCheck size={16} />
                            <span>
                                Save changes<span className="md:hidden"> · {totalLabel}</span>
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ───────── POP-UP: Bill discount ───────── */}
            {showDiscountPopup && (
                <PopupShell
                    title="Bill discount"
                    subtitle="On the whole order"
                    tone="green"
                    icon={<FiTag size={18} />}
                    onClose={() => setShowDiscountPopup(false)}
                    footer={
                        <button
                            onClick={() => setShowDiscountPopup(false)}
                            className="h-10 px-4 inline-flex items-center gap-2 rounded-sm bg-[#c2410c] text-white text-sm font-medium hover:bg-[#9a3412]"
                        >
                            <FiCheck size={14} /> Apply
                        </button>
                    }
                >
                    <div>
                        <span className="block text-xs font-medium text-slate-600 mb-1">Bill discount</span>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={editDiscountPercent || ''}
                                    onChange={(e) => handleDiscountPercentInputChange(e.target.value)}
                                    className={`${FIELD} h-11 text-right pr-8 text-sm`}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">₹</span>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={editDiscount || ''}
                                    onChange={(e) => handleDiscountAmountInputChange(e.target.value)}
                                    className={`${FIELD} h-11 text-right pl-8 text-sm`}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Type either — the other fills in.</p>
                    </div>
                    <div className="flex items-baseline justify-between px-3 py-2.5 rounded-sm bg-[#fff8f2] text-[13px] text-slate-600">
                        <span>New final total</span>
                        <b className="text-lg text-slate-900 tabular-nums">{totalLabel}</b>
                    </div>
                </PopupShell>
            )}

            {/* ───────── POP-UP: Shop expense ───────── */}
            {showExpensePopup && (
                <PopupShell
                    title="Shop expense"
                    subtitle="Not added to the order total"
                    tone="magenta"
                    icon={<FiCreditCard size={18} />}
                    onClose={() => setShowExpensePopup(false)}
                    footer={
                        <button
                            onClick={() => setShowExpensePopup(false)}
                            className="h-10 px-4 inline-flex items-center gap-2 rounded-sm bg-[#c2410c] text-white text-sm font-medium hover:bg-[#9a3412]"
                        >
                            <FiCheck size={14} /> Done
                        </button>
                    }
                >
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-[#ffedd5] text-[#9a3412] text-xs leading-[18px]">
                        <FiCreditCard size={14} className="shrink-0 mt-0.5" />
                        <span>
                            Shop’s own spending for this order, like freight — saved to <b>Expenses</b>. It doesn’t change what {headerName || 'the customer'} pays.
                        </span>
                    </div>

                    {editExpenses.map((expense) => (
                        <div key={expense.id} className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-end gap-2">
                            <div>
                                <span className="block text-xs font-medium text-slate-600 mb-1">Expense name</span>
                                <input
                                    type="text"
                                    placeholder="e.g. Freight"
                                    value={expense.name}
                                    onChange={(e) => handleExpenseNameChange(expense.id, e.target.value)}
                                    className={`${FIELD} h-11 text-sm`}
                                />
                            </div>
                            <div>
                                <span className="block text-xs font-medium text-slate-600 mb-1">Amount</span>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">₹</span>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={expense.amount}
                                        onChange={(e) => handleExpenseAmountChange(expense.id, e.target.value)}
                                        className={`${FIELD} h-11 text-right pl-7 text-sm`}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => handleRemoveExpense(expense.id)}
                                aria-label="Remove expense"
                                className="w-11 h-11 grid place-items-center rounded-sm text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                                <FiTrash2 size={16} />
                            </button>
                        </div>
                    ))}

                    <div>
                        <button onClick={handleAddExpense} className={`${CHIP} ${CHIP_IDLE}`}>
                            <FiPlus size={14} className="text-[#c2410c]" />
                            {editExpenses.length === 0 ? 'Add expense' : 'Add another'}
                        </button>
                    </div>
                </PopupShell>
            )}
        </div>
    );
};