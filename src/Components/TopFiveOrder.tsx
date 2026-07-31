import React, { useState } from 'react';
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from './ui/card';
import { cn } from '../lib/utils';

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
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

    const renderContent = () => {
        if (loading) {
            return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
        }
        if (!isDataVisible) {
            return (
                <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-8 h-40">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                    Data is hidden
                </div>
            );
        }

        const itemsToDisplay = viewMode === 'quantity' ? topByQuantity : topByAmount;

        if (itemsToDisplay.length === 0) {
            return <p className="text-center text-muted-foreground py-8 h-40 text-xs">No items sold in this period.</p>;
        }

        return (
            <ul className="space-y-2.5">
                {itemsToDisplay.map((item, index) => (
                    <li key={item.id} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="bg-gradient-brand flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm">
                                {index + 1}
                            </div>
                            <span className="truncate text-xs text-foreground" title={item.name}>
                                {item.name}
                            </span>
                        </div>
                        <div className="shrink-0 text-right">
                            {viewMode === 'quantity' ? (
                                <span className="text-xs font-semibold text-foreground">
                                    {item.totalQuantity} <span className="text-muted-foreground font-normal">sold</span>
                                </span>
                            ) : (
                                <span className="text-xs font-semibold text-foreground">
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
        <Card className="gap-3 rounded-2xl border border-border/70 border-t-2 border-t-primary py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between px-4">
                <CardTitle className="text-sm font-semibold text-foreground">Top 5 Items Sold</CardTitle>
                <div className="flex rounded-full border border-border bg-muted p-0.5">
                    <button
                        onClick={() => setViewMode('amount')}
                        className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-all', viewMode === 'amount' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
                    >
                        Amt
                    </button>
                    <button
                        onClick={() => setViewMode('quantity')}
                        className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-all', viewMode === 'quantity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
                    >
                        Qty
                    </button>
                </div>
            </CardHeader>
            <CardContent className="px-4">{renderContent()}</CardContent>
        </Card>
    );
};
