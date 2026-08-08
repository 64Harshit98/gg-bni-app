import React from 'react';
import { FiX } from 'react-icons/fi';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import { GenericCartList } from '../../../Components/CartItem';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import { ROUTES } from '../../../constants/routes.constants';
import { State } from '../../../enums';
import type { Item } from '../../../constants/models';
import type { Order } from '../orders.types';
import { formatAmount } from '../orders.utils';

interface OrderEditModalProps {
    editingOrder: Order;
    setEditingOrder: (order: Order | null) => void;
    activeTab: 'billing' | 'shipping';
    setActiveTab: (tab: 'billing' | 'shipping') => void;
    calculatedEditTotal: number;
    availableItems: Item[];
    handleAddItem: (selectedItem: Item) => void;
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

export const OrderEditModal: React.FC<OrderEditModalProps> = ({
    editingOrder,
    setEditingOrder,
    activeTab,
    setActiveTab,
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
    showBillDiscountFields,
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
    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-1 md:p-3">
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
                            <div className="flex justify-between items-center">
                                <div className="flex sm:hidden p-1 bg-slate-100 rounded-sm mb-2 flex-1">
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
                                    onItemSelected={handleAddItem}
                                    onSearchChange={setCartSearchQuery}
                                    placeholder="Search item to add..."
                                />
                            </div>

                            <div className="h-fit self-start w-full flex flex-col">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mt-2">
                                    Items ({editingOrder.items?.length})
                                </h4>

                                {/* Items List Container */}
                                <div className="h-auto">
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
                    </div>
                </div>
                {/* Expenses & Discount Section */}
                <div className="px-4 py-2 bg-white border-t space-y-3">
                    {/* Combined action row */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={handleAddExpense}
                            className="flex-1 text-[10px] font-bold text-orange-500 border border-orange-300 px-2 py-1.5 rounded-sm hover:bg-orange-50"
                        >
                            + Add Expense
                        </button>
                        <button
                            onClick={() => setShowBillDiscountFields(prev => !prev)}
                            className="flex-1 text-[10px] font-bold text-red-500 border border-red-300 px-2 py-1.5 rounded-sm hover:bg-red-50"
                        >
                            + Bill Discount
                        </button>
                        {enableTransportDetails && (
                            <button
                                onClick={() => setShowTransportModal(true)}
                                className={`flex-1 text-[10px] font-bold border px-2 py-1.5 rounded-sm transition-colors ${hasTransportDetails ? 'text-teal-700 border-teal-400 bg-teal-50' : 'text-teal-600 border-teal-300 hover:bg-teal-50'}`}
                            >
                                {hasTransportDetails ? '✓ Transport' : '+ Transport'}
                            </button>
                        )}
                    </div>

                    {editExpenses.length > 0 && (
                        <div className="flex flex-col gap-2">
                            {editExpenses.map((expense) => (
                                <div key={expense.id} className="flex items-center gap-2 p-2 bg-orange-50 rounded-sm border border-orange-100">
                                    <input
                                        type="text"
                                        placeholder="Expense name (e.g. Freight)"
                                        value={expense.name}
                                        onChange={(e) => handleExpenseNameChange(expense.id, e.target.value)}
                                        className="flex-1 p-2 text-xs rounded-sm border border-orange-200 bg-white outline-none focus:border-orange-400"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Amount (₹)"
                                        value={expense.amount}
                                        onChange={(e) => handleExpenseAmountChange(expense.id, e.target.value)}
                                        className="w-24 p-2 text-xs rounded-sm border border-orange-200 bg-white outline-none focus:border-orange-400"
                                    />
                                    <button
                                        onClick={() => handleRemoveExpense(expense.id)}
                                        className="p-1 rounded-full bg-orange-100 hover:bg-red-100 text-orange-400 hover:text-red-500"
                                    >
                                        <FiX size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {showBillDiscountFields && (
                        <div className="flex items-center justify-between gap-3 p-2 bg-red-50 rounded-sm border border-red-100">
                            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest whitespace-nowrap">Bill Discount</p>
                            <div className="flex items-center gap-1">
                                <div className="relative flex items-center">
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={editDiscountPercent || ''}
                                        onChange={(e) => handleDiscountPercentInputChange(e.target.value)}
                                        className="w-16 text-center bg-white border border-red-200 rounded-sm text-red-700 text-xs p-1.5 outline-none focus:border-red-400 pr-4"
                                    />
                                    <span className="absolute right-1 text-[10px] text-red-400 font-bold pointer-events-none">%</span>
                                </div>
                                <span className="text-gray-300 text-xs">|</span>
                                <div className="relative flex items-center">
                                    <span className="absolute left-1 text-[10px] text-red-400 font-bold pointer-events-none">₹</span>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={editDiscount || ''}
                                        onChange={(e) => handleDiscountAmountInputChange(e.target.value)}
                                        className="w-20 text-center bg-white border border-red-200 rounded-sm text-red-700 text-xs p-1.5 outline-none focus:border-red-400 pl-4"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Live total preview */}
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Total</span>
                        <span className="text-base font-black text-slate-800">₹{formatAmount(calculatedEditTotal)}</span>
                    </div>
                </div>
                {/* Footer Buttons */}
                <div className="px-6 py-4 bg-slate-50 border-t flex gap-3">
                    <button
                        onClick={() => {
                            setEditingOrder(null);
                            setCartSearchQuery('');
                            setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode('');
                        }}
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
    );
};
