import React from 'react';
import { FiChevronDown } from 'react-icons/fi';

interface TaxToggleProps {
    activeTaxMode: 'inclusive' | 'exclusive' | 'exempt';
    onTaxModeChange: (mode: 'inclusive' | 'exclusive' | 'exempt') => void;
    gstScheme?: string;
    lockTaxToggle?: boolean;
}

const TaxToggle: React.FC<TaxToggleProps> = ({
    activeTaxMode,
    onTaxModeChange,
    gstScheme,
    lockTaxToggle = false,
}) => {
    const isSettingLocked = lockTaxToggle;
    const isSchemeLocked = gstScheme !== 'regular';
    const isLocked = isSettingLocked || isSchemeLocked;

    return (
        <>
            {/* MOBILE VIEW */}
            <div className="flex md:hidden justify-between items-center p-1 bg-white border-b border-gray-200 px-5 rounded-sm">
                <span className="text-sm font-semibold text-gray-700">Tax Calculation</span>
                <div className="relative">
                    <select
                        value={activeTaxMode}
                        onChange={(e) => onTaxModeChange(e.target.value as 'inclusive' | 'exclusive' | 'exempt')}
                        disabled={isSchemeLocked}
                        className={`appearance-none border border-gray-300 pr-8 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all ${
                            isLocked
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-50 hover:border-blue-400 text-gray-700 cursor-pointer'
                        }`}
                    >
                        <option value="exclusive">Tax Exclusive</option>
                        <option value="inclusive">Tax Inclusive</option>
                        <option value="exempt">Tax Exempt</option>
                    </select>
                    {!isLocked && (
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                            <FiChevronDown size={14} />
                        </div>
                    )}
                </div>
            </div>

            {/* DESKTOP VIEW */}
            <div className="hidden md:flex flex-row items-center justify-between md:flex-col md:items-start gap-2 py-2 bg-white border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Tax Calculation
                </span>
                <div className="relative w-1/2 md:w-full">
                    <select
                        value={activeTaxMode}
                        onChange={(e) => onTaxModeChange(e.target.value as 'inclusive' | 'exclusive' | 'exempt')}
                        disabled={isSchemeLocked}
                        className={`appearance-none w-full bg-white border border-gray-300 px-3 py-2 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all shadow-sm md:px-4 md:py-2.5 md:text-[15px] md:rounded-sm ${
                            isLocked
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'hover:border-blue-400 text-gray-700 cursor-pointer'
                        }`}
                    >
                        <option value="exclusive">Tax Exclusive</option>
                        <option value="inclusive">Tax Inclusive</option>
                        <option value="exempt">Tax Exempt</option>
                    </select>
                    {!isLocked && (
                        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400">
                            <FiChevronDown size={14} />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default TaxToggle;