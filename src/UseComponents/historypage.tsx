import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/Firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { ROUTES } from '../constants/routes.constants';
import { generatePdf } from './pdfGenerator';
import { getFirestoreOperations } from '../lib/ItemsFirebase';
import { Spinner } from '../constants/Spinner';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { useAuth } from '../context/auth-context';

const SalesHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [sales, setSales] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);

  // 1. Fetch Sales List
  useEffect(() => {
    if (!currentUser?.companyId) {
      setIsLoading(false);
      return;
    }

    const fetchSales = async () => {
      setIsLoading(true);
      try {
        const companyId = currentUser.companyId!;
        const salesCol = collection(db, 'companies', companyId, 'sales');
        const salesQuery = query(salesCol, orderBy('createdAt', 'desc'));
        const salesSnapshot = await getDocs(salesQuery);

        const salesList = salesSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          };
        });
        setSales(salesList);
      } catch (err) {
        console.error('Error fetching sales history:', err);
        setError('Failed to load sales history.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSales();
  }, [currentUser?.companyId]);

  // 2. Handle PDF Generation
  const handleDownloadPdf = async (sale: any) => {
    setPdfGenerating(sale.id);

    if (!currentUser?.companyId) {
      setModal({ message: 'User company ID missing.', type: State.ERROR });
      setPdfGenerating(null);
      return;
    }

    try {
      const dbOps = getFirestoreOperations(currentUser.companyId);

      const [businessInfo, fetchedItems] = await Promise.all([
        dbOps.getBusinessInfo(),
        dbOps.getItems(),
      ]);

      const populatedItems = sale.items.map((item: any, index: number) => {
        const fullItem = fetchedItems.find((fi: any) => fi.id === item.id);

        return {
          sno: index + 1,
          name: item.name,
          quantity: item.quantity,
          unit: fullItem?.unit || item.unit || "Pcs",
          listPrice: item.mrp,
          gstPercent: fullItem?.gst || item.gst || 0,
          hsn: fullItem?.hsnSac || item.hsnSac || "N/A",
          discountAmount: item.discount || 0,
          amount: (item.mrp * item.quantity)
        };
      });

      const dataForPdf = {
        companyName: businessInfo?.name || 'Your Company',
        companyAddress: businessInfo?.address || 'Your Address',
        companyContact: businessInfo?.phoneNumber || 'Your Phone',

        // FIX: Map email to 'companyEmail' (Standardized key)
        companyEmail: businessInfo?.email || '',

        billTo: {
          name: sale.partyName,
          address: sale.partyAddress || '',
          phone: sale.partyNumber || '',
        },

        invoice: {
          number: sale.voucherId || sale.invoiceNumber,
          date: sale.createdAt.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }), billedBy: sale.salesmanName || 'Admin',
        },

        items: populatedItems,
        terms: 'Goods once sold will not be taken back.',
        finalAmount: sale.totalAmount, // Ensure total amount is passed
      };

      await generatePdf(dataForPdf);
      setModal({ message: "Invoice downloaded successfully!", type: State.SUCCESS });

    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setModal({
        message: 'Failed to generate PDF. Please try again.',
        type: State.ERROR,
      });
    } finally {
      setPdfGenerating(null);
    }
  };

  // --- RENDER ---

  return (
    <div className="flex flex-col min-h-screen bg-white w-full">
      {modal && (
        <Modal
          message={modal.message}
          onClose={() => setModal(null)}
          type={modal.type}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <button
          onClick={() => navigate(ROUTES.HOME)}
          className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1 hover:text-gray-800 transition-colors"
        >
          &times;
        </button>
        <h1 className="text-xl font-bold text-gray-800">Sales History</h1>
        <div className="w-6"></div>
      </div>

      {/* Main Content */}
      <main className="flex-grow p-4 bg-gray-50 overflow-y-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gray-500 flex flex-col items-center">
              <Spinner />
              <p className="mt-4">Loading sales history...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-600 font-medium">
              {error}
            </div>
          ) : sales.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              No sales records found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left font-semibold text-gray-700">Invoice ID</th>
                    <th className="p-3 text-left font-semibold text-gray-700">Party Name</th>
                    <th className="p-3 text-right font-semibold text-gray-700">Amount</th>
                    <th className="p-3 text-left font-semibold text-gray-700">Date</th>
                    <th className="p-3 text-center font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-medium text-blue-600">{sale.voucherId || sale.invoiceNumber}</td>
                      <td className="p-3 text-gray-800">{sale.partyName}</td>
                      <td className="p-3 text-right font-bold text-green-600">
                        ₹{sale.totalAmount?.toFixed(2) || sale.amount?.toFixed(2) || '0.00'}
                      </td>
                      <td className="p-3 text-gray-500">
                        {sale.createdAt ? sale.createdAt.toLocaleDateString('en-IN') : 'N/A'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDownloadPdf(sale)}
                          disabled={pdfGenerating === sale.id}
                          className="bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center mx-auto gap-2"
                        >
                          {pdfGenerating === sale.id ? <Spinner /> : (
                            <>
                              <span>PDF</span>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                              </svg>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SalesHistoryPage;