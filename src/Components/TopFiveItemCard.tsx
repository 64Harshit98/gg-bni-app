import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface TopItem {
  name: string;
  amount: number;
  quantity: number;
}

interface TopSoldItemsCardProps {
  isDataVisible: boolean;
  items: TopItem[];
}

export const TopSoldItemsCard: React.FC<TopSoldItemsCardProps> = ({ isDataVisible, items }) => {
  const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

  const sortedItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    const sorted = [...items].sort((a, b) => {
      if (viewMode === 'amount') {
        return (b.amount || 0) - (a.amount || 0); 
      } else {
        return (b.quantity || 0) - (a.quantity || 0); 
      }
    });

    return sorted.slice(0, 5); 
  }, [items, viewMode]);

  return (
    <Card className="shadow-sm border-gray-200">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold text-gray-900">Top 5 Items</CardTitle>
        <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
           <button 
             onClick={() => setViewMode('amount')} 
             className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'amount' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
           >
             Amt
           </button>
           <button 
             onClick={() => setViewMode('quantity')} 
             className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'quantity' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
           >
             Qty
           </button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-2 space-y-4">
        {isDataVisible ? (
          sortedItems.length > 0 ? (
            sortedItems.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="text-sm text-gray-700 truncate max-w-[150px]" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                   {viewMode === 'amount' 
                     ? `₹${item.amount.toLocaleString('en-IN')}` 
                     : `${item.quantity} units`}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
               <p className="text-sm text-gray-500">No items sold</p>
            </div>
          )
        ) : (
           <div className="text-center py-8 text-gray-400 text-sm">Data hidden</div>
        )}
      </CardContent>
    </Card>
  );
};