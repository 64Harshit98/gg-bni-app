import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { useAuth } from '../../context/Authcontext';
// import { ROUTES } from '../../constants/routes.constants';
// import { NavLink } from 'react-router-dom';

// Define types for the sales data
interface SalesItem {
  name: string;
  mrp: number;
  quantity: number;
}

interface SaleRecord {
  id: string;
  partyName: string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: number; // Storing as a number for easier filtering
  items: SalesItem[];
}

// Function to format a numerical timestamp to a readable date string
const formatDate = (timestamp: any): string => {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp); // Correctly handle the numerical timestamp
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SalesReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [filteredSales, setFilteredSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Fetch sales data from Firestore on component mount
  useEffect(() => {
    const fetchSales = async () => {
      if (!currentUser) {
        setIsLoading(false);
        setError('You must be logged in to view sales reports.');
        return;
      }
      
      setIsLoading(true);
      setError(null);

      try {
        const salesCollection = collection(db, 'sales');
        const q = query(salesCollection, where('userId', '==', currentUser.uid));
        
        const querySnapshot = await getDocs(q);
        const fetchedSales: SaleRecord[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedSales.push({
            id: doc.id,
            partyName: data.partyName,
            totalAmount: data.totalAmount,
            paymentMethod: data.paymentMethod,
            createdAt: data.createdAt.toMillis(), // Convert Firestore Timestamp to number
            items: data.items,
          });
        });

        // Sort the sales data by creation date in descending order
        fetchedSales.sort((a, b) => b.createdAt - a.createdAt);
        
        setSales(fetchedSales);
        setFilteredSales(fetchedSales);
      } catch (err) {
        console.error('Failed to fetch sales data:', err);
        setError('Failed to load sales report. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSales();
  }, [currentUser]);

  // Apply filters whenever filter states change
  useEffect(() => {
    let newFilteredSales = sales;

    // Filter by search query (party name)
    if (searchQuery) {
      newFilteredSales = newFilteredSales.filter(sale =>
        sale.partyName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by date range (createdAt)
    if (startDate || endDate) {
      const startTimestamp = startDate ? new Date(startDate).getTime() : 0;
      const endTimestamp = endDate ? new Date(endDate).getTime() + 86399999 : Infinity;
    
      newFilteredSales = newFilteredSales.filter(sale => {
        const saleCreatedAt = sale.createdAt;
        return saleCreatedAt >= startTimestamp && saleCreatedAt <= endTimestamp;
      });
    }

    setFilteredSales(newFilteredSales);
  }, [searchQuery, startDate, endDate, sales]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-500">
        <p>Loading sales report...</p>
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
      {/* Top Bar with Title and Back Button */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-300 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Sales Report</h1>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-gray-200 p-2 text-gray-900 transition hover:bg-gray-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          {/* Search Input */}
          <div>
            <label htmlFor="searchQuery" className="block text-sm font-medium text-gray-700 mb-1">
              Search by Party Name
            </label>
            <input
              type="text"
              id="searchQuery"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., John Doe"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {/* Start Date */}
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

          {/* End Date */}
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

          {/* Clear Filters Button */}
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

      {/* Report Table Section */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice ID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Party Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Amount
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Method
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                {/* You can add a 'View Details' column here */}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSales.length > 0 ? (
                filteredSales.map(sale => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {sale.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.partyName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ₹{sale.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                      {sale.paymentMethod}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(sale.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    No sales found matching the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalesReport;
