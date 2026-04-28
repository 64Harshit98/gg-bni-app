import React, { useRef } from 'react';
import PaymentDrawer from '../../../Components/PaymentDrawer';
import { Modal } from '../../../constants/Modal';
import { calcKeys } from './Salescalculations';
import type { SalesViewProps } from './Salesviewprops';
import type { CalcKey } from './Salestypes';

const SalesCalculatorView: React.FC<SalesViewProps> = ({
    // Modal
    modal, setModal,
    // Items
    setItems,
    // Calculator state
    calcInput, setCalcInput,
    stagedCalcInput, setStagedCalcInput,
    liveTotal, liveItemCount,
    // Keypad handlers
    handlePointerDown, handlePointerUp, handlePointerLeave, handleKeypadPress,
    handleCheckoutClick,
    // Settings
    salesSettings,
    // Drawer
    isDrawerOpen, setIsDrawerOpen, drawerSharedProps,
    // Payment
    handleSavePayment,
}) => {
    const displayRef = useRef<HTMLInputElement>(null);

    return (
        <div className="fixed inset-0 flex flex-col bg-transparent w-full overflow-hidden">
            {modal && (
                <Modal
                    message={modal.message}
                    onClose={() => setModal(null)}
                    type={modal.type}
                    onConfirm={modal.onConfirm}
                    showConfirmButton={!!modal.onConfirm}
                />
            )}

            {/* Top bar */}
            <div className="shrink-0 bg-white border-b border-gray-200">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center p-2 md:px-4 md:py-3">
                    <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left md:mb-0">
                        Sales
                    </h1>
                </div>
            </div>

            {/* Main calculator area */}
            <div className="flex-1 flex flex-col items-center p-1 sm:p-4 min-h-0 w-full">
                <div className="w-full max-w-sm mx-auto flex flex-col h-full">

                    {/* Total display */}
                    <div className="flex justify-between items-end px-2 py-1 shrink-0">
                        <div className="flex flex-col">
                            <span className="text-gray-500 font-medium text-sm mb-0.5">Grand Total</span>
                            <span className="text-xs text-indigo-500 font-semibold">
                                {liveItemCount} Items
                            </span>
                        </div>
                        <span className="text-4xl font-bold text-gray-900 tracking-tight">
                            ₹{liveTotal.toFixed(2)}
                        </span>
                    </div>

                    {/* Input display */}
                    <div
                        className="bg-white border border-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] p-4 flex flex-col items-end justify-end h-32 sm:h-40 shrink-0 w-full cursor-text"
                        onClick={() => displayRef.current?.focus()}
                    >
                        <input
                            ref={displayRef}
                            type="text"
                            inputMode="none"
                            value={calcInput}
                            placeholder="0"
                            onChange={(e) =>
                                setCalcInput(e.target.value.replace(/[^0-9*.\-+]/g, ''))
                            }
                            className="text-4xl sm:text-5xl font-light text-gray-800 tracking-wide w-full text-right bg-transparent border-none outline-none m-0 p-0 overflow-x-auto caret-indigo-600"
                        />
                    </div>

                    {/* Keypad */}
                    <div className="grid grid-cols-8 sm:gap-2 flex-1 min-h-0 w-full">
                        {calcKeys.flat().map((key: CalcKey) => {
                            const { label, icon: Icon, colClass, type, value } = key;
                            const isBackspace = value === 'Backspace';
                            return (
                                <button
                                    key={key.label}
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        isBackspace
                                            ? handlePointerDown(key)
                                            : handleKeypadPress(key);
                                    }}
                                    onPointerUp={isBackspace ? () => handlePointerUp(key) : undefined}
                                    onPointerLeave={
                                        isBackspace ? () => handlePointerLeave(key) : undefined
                                    }
                                    className={`h-full w-full flex items-center justify-center text-2xl sm:text-3xl font-medium transition-all active:scale-95 border select-none
                                        ${type === 'function'
                                            ? 'bg-red-50 border-red-300 text-red-500 hover:bg-red-100'
                                            : type === 'operator'
                                                ? 'bg-indigo-50 border-indigo-300 text-indigo-600 hover:bg-indigo-100'
                                                : 'bg-white shadow-sm border-gray-300 text-gray-800 hover:bg-gray-50'
                                        }
                                        ${colClass || 'col-span-2'}`}
                                >
                                    {Icon ? <Icon size={28} /> : label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Proceed to pay bar */}
            <div className="shrink-0 bg-transparent p-1 sm:p-4 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)] mb-16">
                <div className="w-full max-w-sm mx-auto">
                    <button
                        onClick={handleCheckoutClick}
                        disabled={liveItemCount === 0}
                        className="w-full bg-emerald-500 rounded-xs hover:bg-emerald-600 disabled:bg-emerald-200 disabled:text-white text-white font-bold py-1 text-xl transition-colors shadow-md active:scale-[0.98]"
                    >
                        Proceed to Pay
                    </button>
                </div>
            </div>

            {/* Payment drawer */}
            <PaymentDrawer
                mode="calculator"
                isOpen={isDrawerOpen}
                onClose={() => {
                    setIsDrawerOpen(false);
                    if (stagedCalcInput) {
                        setCalcInput(stagedCalcInput);
                        setItems((prev) => prev.filter((i) => !i.isStagedCalcItem));
                        setStagedCalcInput('');
                    }
                }}
                enableCustomerDetails={
                    (salesSettings?.requireCustomerName || salesSettings?.requireCustomerMobile)
                        ? true
                        : (salesSettings?.enableCustomerInfoToggle ?? false)
                }
                {...drawerSharedProps}
                onPaymentComplete={handleSavePayment}
                enableShippingDetails={false}
                enableExtraExpense={false}
                enableNarration={false}
                allowDueBilling={false}
                requireCustomerName={salesSettings?.requireCustomerName ?? false}
                requireCustomerMobile={salesSettings?.requireCustomerMobile ?? false}
                isPartyNameEditable={true}
                initialPartyName=""
                initialPartyNumber=""
            />
        </div>
    );
};

export default SalesCalculatorView;