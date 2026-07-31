import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from '../lib/utils';

interface EntityItem {
    name: string;
    amount: number;
    quantity: number;
}

interface TopEntitiesListProps {
    isDataVisible: boolean;
    titleOverride?: string;
    items: EntityItem[];
}

export const TopEntitiesList: React.FC<TopEntitiesListProps> = ({ isDataVisible, titleOverride, items }) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

    return (
        <Card className="gap-3 rounded-2xl border border-border/70 border-t-2 border-t-warning py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between px-4">
                <CardTitle className="text-sm font-semibold text-foreground">{titleOverride || 'Top Entities'}</CardTitle>
                <div className="flex rounded-full border border-border bg-muted p-0.5">
                    <button onClick={() => setViewMode('amount')} className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-all', viewMode === 'amount' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>Amt</button>
                    <button onClick={() => setViewMode('quantity')} className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-all', viewMode === 'quantity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>Qty</button>
                </div>
            </CardHeader>
            <CardContent className="space-y-2.5 px-4">
                {isDataVisible ? (
                    items.length > 0 ? (
                        items.map((item, index) => (
                            <div key={index} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 h-5 w-5 rounded-full bg-gradient-to-br from-warning to-destructive text-white shadow-sm flex items-center justify-center text-[10px] font-bold">
                                        {index + 1}
                                    </div>
                                    <span className="text-xs text-foreground">{item.name}</span>
                                </div>
                                <span className="text-xs font-semibold text-foreground">
                                    {viewMode === 'amount'
                                        ? `₹${item.amount.toLocaleString()}`
                                        : `${item.quantity}`}
                                </span>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                    )
                ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">Data hidden</div>
                )}
            </CardContent>
        </Card>
    );
};
