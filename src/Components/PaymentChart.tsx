import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from '../lib/utils';

interface PaymentMethod {
    name: string;
    amount: number;
    quantity: number;
}

interface PaymentChartProps {
    isDataVisible: boolean;
    data: PaymentMethod[];
}

export const PaymentChart: React.FC<PaymentChartProps> = ({ isDataVisible, data }) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

    const maxValue = Math.max(...data.map(d => viewMode === 'amount' ? d.amount : d.quantity), 1);

    return (
        <Card className="gap-3 rounded-2xl border border-border/70 border-t-2 border-t-info py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader className="flex flex-row items-start justify-between px-4">
                <CardTitle className="text-sm font-semibold text-foreground w-32 leading-tight">
                    Sales Payment Methods
                </CardTitle>
                <div className="flex rounded-full border border-border bg-muted p-0.5">
                    <button onClick={() => setViewMode('amount')} className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-all', viewMode === 'amount' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>Amt</button>
                    <button onClick={() => setViewMode('quantity')} className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-all', viewMode === 'quantity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>Qty</button>
                </div>
            </CardHeader>

            <CardContent className="space-y-3 px-4">
                {isDataVisible ? (
                    data.length > 0 ? (
                        data.map((item, index) => {
                            const val = viewMode === 'amount' ? item.amount : item.quantity;
                            return (
                                <div key={index} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-foreground font-medium">{item.name}</span>
                                        <span className="font-semibold text-foreground">
                                            {viewMode === 'amount' ? `₹${val.toLocaleString()}` : val}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="bg-gradient-brand h-full rounded-full"
                                            style={{ width: `${(val / maxValue) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                    )
                ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">Data hidden</div>
                )}
            </CardContent>
        </Card>
    );
};
