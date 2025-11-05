// import React, { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { db } from '../lib/firebase';
// import { collection, query, getDocs } from 'firebase/firestore';
// import { ROUTES } from '../constants/routes.constants';
// import { generatePdf } from './pdfGenerator';
// import { getItems } from '../lib/items_firebase';
// import { Spinner } from '../constants/Spinner';
// import { Modal } from '../constants/Modal';
// import { State } from '../enums';


// const SalesHistoryPage: React.FC = () => {
//     const navigate = useNavigate();
//     const [sales, setSales] = useState<any[]>([]);
//     const [isLoading, setIsLoading] = useState(true);
//     const [error, setError] = useState<string | null>(null);
//     const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
//     const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);

//     useEffect(() => {
//         const fetchSales = async () => {
//             setIsLoading(true);
//             try {
//                 const salesCol = collection(db, 'sales');
//                 const salesSnapshot = await getDocs(query(salesCol));
//                 const salesList = salesSnapshot.docs.map(doc => ({
//                     id: doc.id,
//                     ...doc.data(),
//                     createdAt: doc.data().createdAt?.toDate()
//                 }));
//                 setSales(salesList);
//             } catch (err) {
//                 console.error("Error fetching sales history:", err);
//                 setError('Failed to load sales history.');
//             } finally {
//                 setIsLoading(false);
//             }
//         };

//         fetchSales();
//     }, []);

//     const handleDownloadPdf = async (sale: any) => {
//         setPdfGenerating(sale.id);

//         try {
//             const fetchedItems = await getItems();
//             const populatedItems = sale.items.map((item: any, index: number) => {
//                 const fullItem = fetchedItems.find((fi: any) => fi.id === item.id);
//                 return {
//                     sno: index + 1,
//                     name: item.name,
//                     hsn: fullItem?.hsnSac,
//                     quantity: item.quantity,
//                     unit: fullItem?.unit,
//                     listPrice: item.mrp,
//                     gstPercent: fullItem?.gst,
//                     discountAmount: item.discount,
//                 };
//             });

//             const dataForPdf = {
//                 companyName: "Giftinguru.com",
//                 companyAddress: "Shop no. 59, Gaur Siddhartham, Siddharth Vihar, Ghaziabad - 201009",
//                 companyContact: "+91 9625796622",
//                 companyEmail: "giftingurusiddharthvihar@gmail.com",
//                 billTo: {
//                     name: sale.partyName,
//                     address: "420, Kavya enclave, Indraprost, New Delhi - 443567",
//                     phone: sale.partyNumber,
//                 },
//                 invoice: {
//                     number: sale.voucherId,
//                     date: sale.createdAt ? sale.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
//                     billedBy: "Bhavesh Agrawal",
//                 },
//                 items: populatedItems,
//                 paymentInfo: {
//                     account: "1234234534561",
//                     accountName: "Bhavesh Agrawal",
//                     bankDetails: "HDFC",
//                     gstin: "09ABHR1644A1ZJ",
//                 },
//                 terms: "This is a computer-generated invoice. Terms and conditions apply.",
//             };

//             generatePdf(dataForPdf);

//         } catch (err) {
//             console.error("Failed to generate PDF:", err);
//             setModal({ message: "Failed to generate PDF. Please try again.", type: State.ERROR });
//         } finally {
//             setPdfGenerating(null);
//         }
//     };

//     return (
//         <div className="flex flex-col min-h-screen bg-white w-full">
//             {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

//             <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
//                 <button onClick={() => navigate(ROUTES.HOME)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">&times;</button>
//                 <h1 className="text-xl font-bold text-gray-800">Sales History</h1>
//                 <div className="w-6"></div>
//             </div>

//             <main className="flex-grow p-4 bg-gray-50 overflow-y-auto">
//                 <div className="bg-white rounded-lg shadow-md overflow-hidden">
//                     {isLoading ? (
//                         <div className="p-6 text-center text-gray-500">
//                             <Spinner />
//                             <p className="mt-2">Loading sales history...</p>
//                         </div>
//                     ) : error ? (
//                         <div className="p-6 text-center text-red-600 font-medium">{error}</div>
//                     ) : sales.length === 0 ? (
//                         <div className="p-6 text-center text-gray-500">No sales records found.</div>
//                     ) : (
//                         <table className="min-w-full divide-y divide-gray-200 text-sm">
//                             <thead className="bg-gray-50">
//                                 <tr>
//                                     <th className="p-3 text-left font-semibold text-gray-700">Invoice ID</th>
//                                     <th className="p-3 text-left font-semibold text-gray-700">Party Name</th>
//                                     <th className="p-3 text-right font-semibold text-gray-700">Amount</th>
//                                     <th className="p-3 text-left font-semibold text-gray-700">Date</th>
//                                     <th className="p-3 text-left font-semibold text-gray-700">Actions</th>
//                                 </tr>
//                             </thead>
//                             <tbody className="bg-white divide-y divide-gray-200">
//                                 {sales.map((sale) => (
//                                     <tr key={sale.id} className="hover:bg-gray-100 transition-colors">
//                                         <td className="p-3 font-medium text-blue-600">{sale.voucherId}</td>
//                                         <td className="p-3 text-gray-800">{sale.partyName}</td>
//                                         <td className="p-3 text-right font-bold text-green-600">₹{sale.totalAmount?.toFixed(2) || '0.00'}</td>
//                                         <td className="p-3 text-gray-500">{sale.createdAt ? sale.createdAt.toLocaleDateString() : 'N/A'}</td>
//                                         <td className="p-3">
//                                             <button
//                                                 onClick={() => handleDownloadPdf(sale)}
//                                                 disabled={pdfGenerating === sale.id}
//                                                 className="bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
//                                             >
//                                                 {pdfGenerating === sale.id ? <Spinner /> : 'Download PDF'}
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 ))}
//                             </tbody>
//                         </table>
//                     )}
//                 </div>
//             </main>
//         </div>
//     );
// };

// export default SalesHistoryPage;