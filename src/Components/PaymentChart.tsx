import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

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
        <Card className="shadow-sm border-gray-200">
            <CardHeader className="flex flex-row items-start justify-between ">
                <CardTitle className="text-base font-semibold text-gray-900 w-32 leading-tight">
                    Sales Payment Methods
                </CardTitle>
                <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
                    <button onClick={() => setViewMode('amount')} className={`px-2 py-1 text-xs font-medium rounded-md ${viewMode === 'amount' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Amt</button>
                    <button onClick={() => setViewMode('quantity')} className={`px-2 py-1 text-xs font-medium rounded-md ${viewMode === 'quantity' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Qty</button>
                </div>
            </CardHeader>

            <CardContent className="space-y-5">
                {isDataVisible ? (
                    data.length > 0 ? (
                        data.map((item, index) => {
                            const val = viewMode === 'amount' ? item.amount : item.quantity;
                            return (
                                <div key={index} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-700 font-medium">{item.name}</span>
                                        <span className="font-semibold text-gray-900">
                                            {viewMode === 'amount' ? `₹${val.toLocaleString()}` : val}
                                        </span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-600 rounded-full"
                                            style={{ width: `${(val / maxValue) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-4">No data</p>
                    )
                ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">Data hidden</div>
                )}
            </CardContent>
        </Card>
    );
};