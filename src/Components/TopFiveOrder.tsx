import React, { useState } from 'react';
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from './ui/card';
interface TopItem {
    id: string;
    name: string;
    totalQuantity: number;
    totalAmount: number;
}
 
// ── Props (data comes from HomePage, no internal fetch) ──────────────────────
interface TopSoldItemsCardProps {
    isDataVisible: boolean;
    topByQuantity: TopItem[];
    topByAmount: TopItem[];
    loading: boolean;
}
 
export const TopSoldItemsCard: React.FC<TopSoldItemsCardProps> = ({
    isDataVisible,
    topByQuantity,
    topByAmount,
    loading,
}) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('quantity');
 
    const renderContent = () => {
        if (loading) {
            return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
        }
        if (!isDataVisible) {
            return (
                <div className="flex flex-col items-center justify-center text-center text-gray-500 py-8 h-40">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                    Data is hidden
                </div>
            );
        }

        const itemsToDisplay = viewMode === 'quantity' ? topByQuantity : topByAmount;

        if (itemsToDisplay.length === 0) {
            return <p className="text-center text-gray-500 py-8 h-40">No items sold in this period.</p>;
        }

        return (
            <ul className="space-y-4">
                {itemsToDisplay.map((item, index) => (
                    <li key={item.id} className="flex items-center">
                        <div className="flex items-center w-3/5">
                            <span className={`text-sm font-bold rounded-full h-6 w-6 flex items-center justify-center mr-3 flex-shrink-0 text-blue-600 bg-blue-100`}>
                                {index + 1}
                            </span>
                            <span className="font-medium text-gray-700" title={item.name}>{item.name.slice(0, 15)}</span>
                        </div>
                        <div className="w-2/5 text-right">
                            {viewMode === 'quantity' ? (
                                <>
                                    <span className="font-semibold text-gray-800">{item.totalQuantity}</span>
                                    <span className="text-xs text-gray-500 ml-1">sold</span>
                                </>
                            ) : (
                                <span className="font-semibold text-gray-800">
                                    {item.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Top 5 Items Sold</CardTitle>
                <div className="flex items-center p-1 bg-gray-100 rounded-lg">
                    <button
                        onClick={() => setViewMode('amount')}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        Amt
                    </button>
                    <button
                        onClick={() => setViewMode('quantity')}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        Qty
                    </button>
                </div>
            </CardHeader>
            <CardContent>{renderContent()}</CardContent>
        </Card>
    );
};