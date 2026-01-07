import React, { useState, useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext'; // 1. Import Global Context
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from './ui/card';

// --- Types ---
export type EntityType = 'sales' | 'purchases';

interface EntityStats {
    name: string;
    amount: number;
    quantity: number; // Represents "Count of Bills"
}

interface TopEntitiesListProps {
    isDataVisible: boolean;
    type: EntityType;
    filters: any; // Filters are handled globally now
    titleOverride?: string;
}

// --- Helper: Rank Circle ---
const RankCircle: React.FC<{ rank: number }> = ({ rank }) => (
    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full font-bold text-sm mr-4">
        {rank}
    </div>
);

// --- Main Component ---
export const TopEntitiesList: React.FC<TopEntitiesListProps> = ({ isDataVisible, type, titleOverride }) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

    // 1. Consume Global Data (0 Reads)
    const { salesData, loading, error } = useDashboard();

    const defaultTitle = type === 'sales' ? 'Top 5 Customers' : 'Top 5 Suppliers';
    const title = titleOverride || defaultTitle;

    // 2. Client-Side Aggregation (CPU Work)
    const top5 = useMemo(() => {
        // If the component asks for 'purchases', we return empty because 
        // the Dashboard Context currently only holds Sales data.
        if (type !== 'sales' || !salesData) return [];

        const aggMap: { [key: string]: EntityStats } = {};

        salesData.forEach((sale: any) => {
            // Ensure we use the correct field name for the customer/party name
            // Adjust 'partyName' or 'customerName' based on your exact Firestore field
            const name = sale.partyName || sale.customerName || 'Unknown';
            const amount = sale.totalAmount || 0;

            if (!aggMap[name]) {
                aggMap[name] = { name, amount: 0, quantity: 0 };
            }

            aggMap[name].amount += amount;
            aggMap[name].quantity += 1; // Count 1 bill
        });

        // Convert to Array
        const allEntities = Object.values(aggMap);

        // Sort based on View Mode
        const sorted = allEntities.sort((a, b) => {
            if (viewMode === 'amount') {
                return b.amount - a.amount;
            }
            return b.quantity - a.quantity;
        });

        // Slice Top 5
        return sorted.slice(0, 5);
    }, [salesData, type, viewMode]);

    // --- Rendering Logic ---
    const renderContent = () => {
        if (loading) return <Spinner />;
        if (error) return <p className="text-center text-red-500">{error}</p>;

        if (!isDataVisible) {
            return (
                <div className="flex flex-col items-center justify-center text-center text-gray-500 py-8">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1 opacity-50"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                    Data is hidden
                </div>
            );
        }

        if (top5.length === 0) {
            return <p className="text-center text-gray-500 py-8">No data found for this period.</p>;
        }

        return (
            <div className="space-y-4">
                {top5.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center">
                            <RankCircle rank={index + 1} />
                            <p className="font-medium text-gray-700 truncate max-w-[120px]" title={item.name}>
                                {item.name}
                            </p>
                        </div>
                        <div className="text-right font-semibold text-gray-800">
                            {viewMode === 'amount'
                                ? `₹${item.amount.toLocaleString('en-IN')}`
                                : `${item.quantity.toLocaleString('en-IN')} Bills`
                            }
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{title}</CardTitle>
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
            <CardContent>
                {renderContent()}
            </CardContent>
        </Card>
    );
};