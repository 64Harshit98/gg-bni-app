import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getItems } from '../../lib/items_firebase'; // Assuming getItems fetches all items
import type { Item } from '../../constants/models'; // Assuming your Item type is here
// FIX: Add imports for PDF generation
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Helper Functions ---
const formatDate = (timestamp: number | null): string => {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// FIX: New reusable component for summary cards
const SummaryCard: React.FC<{ title: string; value: string }> = ({
  title,
  value,
}) => (
  <div className="bg-white p-6 rounded-xl shadow">
    <h3 className="text-sm font-medium text-gray-500">{title}</h3>
    <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
  </div>
);

const ItemReport: React.FC = () => {
  const navigate = useNavigate();

  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    const fetchAllItems = async () => {
      try {
        setIsLoading(true);
        const fetchedItems = await getItems();
        setItems(fetchedItems);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch items:', err);
        setError('Failed to load item data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllItems();
  }, []);

  // FIX: Refactored filtering and summary logic into a useMemo hook for efficiency
  const { filteredItems, summary } = useMemo(() => {
    let newFilteredItems = items;

    if (searchQuery) {
      newFilteredItems = newFilteredItems.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (startDate || endDate) {
      const startTimestamp = startDate
        ? new Date(startDate).setHours(0, 0, 0, 0)
        : 0;
      const endTimestamp = endDate
        ? new Date(endDate).setHours(23, 59, 59, 999)
        : Infinity;

      newFilteredItems = newFilteredItems.filter((item) => {
        const itemCreatedAt = item.createdAt;
        if (!itemCreatedAt) return false;
        return itemCreatedAt >= startTimestamp && itemCreatedAt <= endTimestamp;
      });
    }

    // Calculate summary statistics
    const totalItems = newFilteredItems.length;
    const totalMrp = newFilteredItems.reduce(
      (sum, item) => sum + (item.mrp || 0),
      0
    );
    const totalPurchasePrice = newFilteredItems.reduce(
      (sum, item) => sum + (item.purchasePrice || 0),
      0
    );

    const averageMrp = totalItems > 0 ? totalMrp / totalItems : 0;
    const averagePurchasePrice =
      totalItems > 0 ? totalPurchasePrice / totalItems : 0;

    return {
      filteredItems: newFilteredItems,
      summary: {
        totalItems,
        averageMrp,
        averagePurchasePrice,
      },
    };
  }, [searchQuery, startDate, endDate, items]);

  // FIX: New function to handle PDF download
  const downloadAsPdf = () => {
    const doc = new jsPDF();
    doc.text('Item Report', 20, 10);

    autoTable(doc, {
      head: [
        ['Item Name', 'MRP', 'Purchase Price', 'Tax (%)', 'Created At'],
      ],
      body: filteredItems.map((item) => [
        item.name,
        `₹${item.mrp?.toFixed(2) || 'N/A'}`,
        `₹${item.purchasePrice?.toFixed(2) || 'N/A'}`,
        `${item.tax || '0'}%`,
        formatDate(item.createdAt || null),
      ]),
    });

    doc.save('item_report.pdf');
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-500">
        <p>Loading report data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-300 mb-6">
        <h1 className="flex-1 text-2xl text-center sm:text-3xl font-bold text-gray-800">
          Item Report
        </h1>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-gray-200 p-2 text-gray-900 transition hover:bg-gray-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* FIX: Summary Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <SummaryCard
          title="Total Items (Filtered)"
          value={summary.totalItems.toString()}
        />
        <SummaryCard
          title="Average MRP (Filtered)"
          value={`₹${summary.averageMrp.toFixed(2)}`}
        />
        <SummaryCard
          title="Avg. Purchase Price (Filtered)"
          value={`₹${summary.averagePurchasePrice.toFixed(2)}`}
        />
      </div>

      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
        {/* FIX: Added Download PDF Button */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-700">Filters</h2>
          <button
            onClick={downloadAsPdf}
            disabled={filteredItems.length === 0}
            className="bg-blue-600 text-white font-semibold rounded-md py-2 px-4 shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download PDF
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label htmlFor="searchQuery" className="block text-sm font-medium text-gray-700 mb-1">
              Search by Item Name
            </label>
            <input
              type="text"
              id="searchQuery"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., Laptop"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="md:col-span-1 lg:col-span-1">
            <button
              onClick={handleClearFilters}
              className="w-full bg-gray-500 text-white rounded-md py-2 px-4 shadow-sm hover:bg-gray-600 transition"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>
      {/* FIX: The detailed table has been removed. The data is now available in the PDF. */}
    </div>
  );
};

export default ItemReport;