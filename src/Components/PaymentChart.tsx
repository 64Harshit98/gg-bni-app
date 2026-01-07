import React, { useMemo, useState } from 'react';
import { useDashboard } from '../context/DashboardContext'; // 1. Import Global Context
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from './ui/card';

// --- Types ---
export type ReportType = 'sales' | 'purchases';

interface PaymentStats {
    totalAmount: number;
    count: number;
}

interface PaymentChartProps {
    isDataVisible: boolean;
    type: ReportType; // We keep this prop, but currently Dashboard only provides Sales data
    filters: any; // Kept for compatibility, but ignored (Global Context handles filters)
}

export const PaymentChart: React.FC<PaymentChartProps> = ({ isDataVisible, type }) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

    // 1. Consume Global Data (0 Reads)
    const { salesData, loading, error } = useDashboard();

    // 2. Client-Side Aggregation (CPU Work)
    // We loop through the already-downloaded data to sum up payment methods.
    const paymentData = useMemo(() => {
        // If the component is asked for "purchases", but we only have "sales" data, 
        // we return empty to prevent showing wrong data.
        if (type === 'purchases') return {};
        if (!salesData) return {};

        return salesData.reduce((acc, sale) => {
            // Check if the sale document has payment methods
            if (sale.paymentMethods) {
                for (const method in sale.paymentMethods) {
                    const amount = sale.paymentMethods[method];

                    if (amount > 0) {
                        // Format Key: "creditCard" -> "Credit Card"
                        const formattedMethod = method
                            .replace(/([a-z])([A-Z])/g, '$1 $2')
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, c => c.toUpperCase());

                        const currentStats = acc[formattedMethod] || { totalAmount: 0, count: 0 };

                        acc[formattedMethod] = {
                            totalAmount: currentStats.totalAmount + amount,
                            count: currentStats.count + 1
                        };
                    }
                }
            }
            return acc;
        }, {} as { [key: string]: PaymentStats });

    }, [salesData, type]);

    const cardTitle = type === 'sales' ? 'Sales Payment Methods' : 'Purchase Payment Methods';

    // --- Rendering Logic (Standard) ---
    const renderContent = () => {
        if (loading) return <div className="flex h-[200px] items-center justify-center text-gray-400">Loading payments...</div>;
        if (error) return <p className="text-center text-red-500">{error}</p>;

        if (!isDataVisible) {
            return (
                <div className="flex flex-col items-center justify-center text-center text-gray-500 py-4 min-h-[150px]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-50"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Data is hidden
                </div>
            );
        }

        const dataToSort = Object.entries(paymentData);

        if (viewMode === 'amount') {
            dataToSort.sort(([, a], [, b]) => b.totalAmount - a.totalAmount);
        } else {
            dataToSort.sort(([, a], [, b]) => b.count - a.count);
        }

        if (dataToSort.length === 0) {
            return <p className="text-center text-gray-500 py-8">No data found for this period.</p>;
        }

        const maxValue = Math.max(...dataToSort.map(([, stats]) => viewMode === 'amount' ? stats.totalAmount : stats.count), 1);

        return (
            <div className="space-y-4">
                {dataToSort.map(([method, stats]) => (
                    <div key={method}>
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="font-medium text-gray-600">{method}</span>
                            {viewMode === 'amount' ? (
                                <span className="font-semibold text-gray-800">₹{stats.totalAmount.toLocaleString('en-IN')}</span>
                            ) : (
                                <span className="font-semibold text-gray-800">{stats.count}</span>
                            )}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${((viewMode === 'amount' ? stats.totalAmount : stats.count) / maxValue) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{cardTitle}</CardTitle>
                <div className="flex items-center p-1 bg-gray-100 rounded-lg">
                    <button onClick={() => setViewMode('amount')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-all ${viewMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Amt</button>
                    <button onClick={() => setViewMode('quantity')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-all ${viewMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Qty</button>
                </div>
            </CardHeader>
            <CardContent>{renderContent()}</CardContent>
        </Card>
    );
};