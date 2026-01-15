import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface Salesman {
  name: string;
  amount: number;
  quantity: number;
}

interface TopSalespersonCardProps {
  isDataVisible: boolean;
  salesmen: Salesman[];
}

export const TopSalespersonCard: React.FC<TopSalespersonCardProps> = ({ isDataVisible, salesmen }) => {
  const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

  return (
    <Card className="shadow-sm border-gray-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold text-gray-900">Top 5 Salespeople</CardTitle>
        <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
          <button onClick={() => setViewMode('amount')} className={`px-2 py-1 text-xs font-medium rounded-md ${viewMode === 'amount' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Amt</button>
          <button onClick={() => setViewMode('quantity')} className={`px-2 py-1 text-xs font-medium rounded-md ${viewMode === 'quantity' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Qty</button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isDataVisible ? (
          salesmen.length > 0 ? (
            salesmen.map((person, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="text-sm text-gray-700">{person.name}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {viewMode === 'amount'
                    ? `₹${person.amount.toLocaleString()}`
                    : `${person.quantity} sales`}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No data found.</p>
            </div>
          )
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">Data hidden</div>
        )}
      </CardContent>
    </Card>
  );
};