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
        <Card className="glow-primary bg-gradient-brand relative h-full gap-2 overflow-hidden border-0 py-4 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 size-40 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.12),transparent_55%)]" />

            <CardHeader className="relative -mb-2">
                <CardTitle className="text-sm font-medium text-white/80">Completed Sales</CardTitle>
                <CardDescription className="text-white/60">{selectedPeriodText}</CardDescription>
            </CardHeader>
            <CardContent className="relative flex flex-1 flex-col items-center justify-center py-3">
                {loading ? (
                    <div className="flex h-20 items-center justify-center">
                        <Spinner />
                    </div>
                ) : (
                    <>
                        <p className="text-3xl font-bold tracking-tight tabular-nums drop-shadow-sm">
                            {isDataVisible ? `₹${totalSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '₹ ••••••'}
                        </p>
                        <p className="mt-2 text-sm text-white/70">
                            from {isDataVisible ? <strong className="text-white">{totalSalesCount}</strong> : '••'} orders
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
