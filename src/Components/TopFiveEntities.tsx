import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

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
        <Card className="shadow-sm border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-semibold text-gray-900">{titleOverride || 'Top Entities'}</CardTitle>
                <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
                    <button onClick={() => setViewMode('amount')} className={`px-2 py-1 text-xs font-medium rounded-md ${viewMode === 'amount' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Amt</button>
                    <button onClick={() => setViewMode('quantity')} className={`px-2 py-1 text-xs font-medium rounded-md ${viewMode === 'quantity' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Qty</button>
                </div>
            </CardHeader>
            <CardContent className="pt-2 space-y-4">
                {isDataVisible ? (
                    items.length > 0 ? (
                        items.map((item, index) => (
                            <div key={index} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                        {index + 1}
                                    </div>
                                    <span className="text-sm text-gray-700">{item.name}</span>
                                </div>
                                <span className="text-sm font-semibold text-gray-900">
                                    {viewMode === 'amount'
                                        ? `₹${item.amount.toLocaleString()}`
                                        : `${item.quantity}`}
                                </span>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-4">No data available</p>
                    )
                ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">Data hidden</div>
                )}
            </CardContent>
        </Card>
    );
};