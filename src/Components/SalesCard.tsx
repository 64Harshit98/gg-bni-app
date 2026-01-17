import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface SalesCardProps {
  isDataVisible: boolean;
  totalSales: number;
  percentageChange?: number;
}

export const SalesCard: React.FC<SalesCardProps> = ({
  isDataVisible,
  totalSales,
  percentageChange = 0
}) => {
  const isPositive = percentageChange >= 0;

  return (

    <Card>
      <CardHeader className='-mb-4'>
        <CardTitle>Total Sales</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center">
          <p className="text-4xl font-bold text-blue-600 mt-4">
            {isDataVisible ? `₹${totalSales.toLocaleString('en-IN')}` : '₹ ******'}
          </p>
          <p className="text-md text-gray-500 mt-2">
            <span className={`font-bold ${isDataVisible ? (isPositive ? 'text-green-600' : 'text-red-600') : 'text-gray-500'}`}>
              {isDataVisible ? `${percentageChange.toFixed(1)}%` : '**.*%'}
            </span>{' '}
            vs. previous period
          </p>
        </div>
      </CardContent>
    </Card>
  );
};