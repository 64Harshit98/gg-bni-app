import React, { useMemo } from 'react';
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from './ui/card';
import { useFilter } from './Filter';

// ── Props (data comes from HomePage, no internal fetch) ──────────────────────
interface CompletedSalesCardProps {
    isDataVisible: boolean;
    totalSalesAmount: number;
    totalSalesCount: number;
    loading: boolean;
}

export const CompletedSalesCard: React.FC<CompletedSalesCardProps> = ({
    isDataVisible,
    totalSalesAmount,
    totalSalesCount,
    loading,
}) => {
    const { filters } = useFilter();

    const selectedPeriodText = useMemo(() => {
        if (!filters.startDate || !filters.endDate) return 'for the selected period';
        const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
        const s = new Date(filters.startDate).toLocaleDateString('en-IN', opts);
        const e = new Date(filters.endDate).toLocaleDateString('en-IN', opts);
        return s === e ? `for ${s}` : `from ${s} to ${e}`;
    }, [filters.startDate, filters.endDate]);

    return (
        <Card>
            <CardHeader className='-mb-4'>
                <CardTitle>Completed Sales</CardTitle>
                <CardDescription>
                    {selectedPeriodText}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex h-20 items-center justify-center">
                        <Spinner />
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="text-4xl font-bold text-[#F97316]">
                            {isDataVisible ? `₹${totalSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '₹ ******'}
                        </p>
                        <p className="text-md text-gray-500 mt-2">
                            from {isDataVisible ? <strong>{totalSalesCount}</strong> : '**'} orders
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};