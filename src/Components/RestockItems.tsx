import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { FiArrowRight } from 'react-icons/fi'; // Added Alert icon for visual context

export const RestockAlertsCard: React.FC = () => {
    const navigate = useNavigate();

    return (
        <Card className="h-full">
            <CardHeader className="-mb-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                    Restock Alerts
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-gray-500 mb-4">
                    Check which items are below their minimum quantity threshold and need reordering.
                </p>

                <button
                    onClick={() => navigate('/reports/restock')}
                    className="w-full flex justify-center items-center gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 font-semibold py-2 px-4 rounded-lg transition-colors border border-blue-200"
                >
                    View Restock Report
                    <FiArrowRight />
                </button>
            </CardContent>
        </Card>
    );
};