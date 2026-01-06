import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/Firebase';
import {
  collection,
  query,
  onSnapshot,
  Timestamp,
  QuerySnapshot,
  doc,
  type DocumentData,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { CustomToggle, CustomToggleItem } from '../Components/CustomToggle';
import { CustomCard } from '../Components/CustomCard';
import { CustomButton } from '../Components/CustomButton';
import { Variant, State, ACTION } from '../enums';
import { Spinner } from '../constants/Spinner';
import { ROUTES } from '../constants/routes.constants';
import { Modal, PaymentModal } from '../constants/Modal';

import { generatePdf } from '../UseComponents/pdfGenerator';
import { getFirestoreOperations } from '../lib/ItemsFirebase';
import { useSalesSettings } from '../context/SettingsContext';
import { IconChevronDown, IconClose, IconFilter, IconSearch, IconDownload, IconPrint } from '../constants/Icons';

interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  finalPrice: number;
  mrp: number;
  barcode?: string;
  stock?: number;
  gst?: number;
  taxRate?: number;
  hsnSac?: string;
  unit?: string;
  discount?: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  time: string;
  status: 'Paid' | 'Unpaid';
  type: 'Debit' | 'Credit';
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  partyGstin?: string;
  createdAt: Date;
  dueAmount?: number;
  items?: InvoiceItem[];
  paymentMethods?: DocumentData;
  salesmanId?: string | null;
  salesmanName?: string;
}

const formatDate = (date: Date): string => {
  if (!date) return 'N/A';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  });
};

const useJournalData = (companyId?: string) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setInvoices([]);
      return;
    }

    const salesQuery = query(collection(db, 'companies', companyId, 'sales'));
    const purchasesQuery = query(collection(db, 'companies', companyId, 'purchases'));

    const processSnapshot = (snapshot: QuerySnapshot, type: 'Credit' | 'Debit'): Invoice[] => {
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
        const paymentMethods = data.paymentMethods || {};
        const dueAmount = paymentMethods.due || 0;
        const status: 'Paid' | 'Unpaid' = dueAmount > 0 ? 'Unpaid' : 'Paid';

        const items = (data.items || []).map((item: any) => ({
          id: item.id || '',
          name: item.name || 'N/A',
          quantity: Number(item.quantity) || 0,
          finalPrice: type === 'Credit' ? (Number(item.finalPrice) || 0) : (Number(item.purchasePrice) || 0),
          mrp: Number(item.mrp) || 0,
          discount: item.discount || 0,
          purchasePrice: item.purchasePrice || 0,
          barcode: item.barcode || '',
          stock: item.stock ?? item.Stock ?? 0,
          gst: item.gst || 0,
          taxRate: item.taxRate || item.gstPercent || 0,
          hsnSac: item.hsnSac || '',
          unit: item.unit || 'Pcs',
        }));

        const calculatedTotal = Object.values(paymentMethods).reduce(
          (sum: number, value: any) => sum + (typeof value === 'number' ? value : 0),
          0
        );

        return {
          id: doc.id,
          invoiceNumber: data.invoiceNumber || `#${doc.id.slice(0, 6).toUpperCase()}`,
          amount: data.totalAmount || calculatedTotal || 0,
          time: formatDate(createdAt),
          status: status,
          type: type,
          partyName: data.partyName || 'N/A',
          partyNumber: data.partyNumber || '',
          partyAddress: data.partyAddress || '',
          partyGstin: data.partyGstin || '',
          salesmanId: data.salesmanId || null,
          salesmanName: data.salesmanName || '',
          createdAt,
          dueAmount: dueAmount,
          items: items,
          paymentMethods: paymentMethods,
        };
      });
    };

    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      const salesData = processSnapshot(snapshot, 'Credit');
      setInvoices((prev) => [...prev.filter((inv) => inv.type !== 'Credit'), ...salesData]);
      setLoading(false);
    }, () => {
      setError("Failed to load sales data.");
      setLoading(false);
    });

    const unsubscribePurchases = onSnapshot(purchasesQuery, (snapshot) => {
      const purchasesData = processSnapshot(snapshot, 'Debit');
      setInvoices((prev) => [...prev.filter((inv) => inv.type !== 'Debit'), ...purchasesData]);
      setLoading(false);
    },
      () => {
        setError("Failed to load purchase data.");
        setLoading(false);
      });

    return () => {
      unsubscribeSales();
      unsubscribePurchases();
    };
  }, [companyId]);

  const sortedInvoices = useMemo(() => {
    return invoices.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [invoices]);

  return { invoices: sortedInvoices, loading, error };
};

const Journal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Paid' | 'Unpaid'>('Paid');
  const [activeType, setActiveType] = useState<'Debit' | 'Credit'>('Credit');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const { salesSettings } = useSalesSettings();

  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);

  const { currentUser, loading: authLoading } = useAuth();
  const { invoices, loading: dataLoading, error } = useJournalData(currentUser?.companyId);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return invoices
      .filter((invoice) => {
        if (activeDateFilter === 'all') return true;
        const invoiceDate = invoice.createdAt;
        const daysAgo = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);
        switch (activeDateFilter) {
          case 'today': return invoiceDate >= today;
          case 'yesterday': return invoiceDate >= daysAgo(today, 1) && invoiceDate < today;
          case 'last7': return invoiceDate >= daysAgo(today, 7);
          case 'last15': return invoiceDate >= daysAgo(today, 15);
          case 'last30': return invoiceDate >= daysAgo(today, 30);
          default: return true;
        }
      })
      .filter((invoice) => {
        const lowerCaseQuery = searchQuery.toLowerCase();
        const matchesDetails =
          invoice.invoiceNumber.toLowerCase().includes(lowerCaseQuery) ||
          invoice.partyName.toLowerCase().includes(lowerCaseQuery) ||
          (invoice.partyNumber && invoice.partyNumber.includes(searchQuery));

        const matchesItems = invoice.items?.some(item =>
          item.name.toLowerCase().includes(lowerCaseQuery)
        );

        return matchesDetails || matchesItems;
      })
      .filter((invoice) => invoice.type === activeType && invoice.status === activeTab);
  }, [invoices, activeType, activeTab, searchQuery, activeDateFilter]);

  const selectedPeriodText = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const formatDate = (date: Date) => date.toLocaleDateString('en-IN', options);

    switch (activeDateFilter) {
      case 'today': return `Today, ${formatDate(today)}`;
      case 'yesterday': return `Yesterday, ${formatDate(new Date(today.setDate(today.getDate() - 1)))}`;
      case 'last7': return `${formatDate(new Date(today.setDate(today.getDate() - 6)))} - ${formatDate(now)}`;
      case 'last15': return `${formatDate(new Date(today.setDate(today.getDate() - 14)))} - ${formatDate(now)}`;
      case 'last30': return `${formatDate(new Date(today.setDate(today.getDate() - 29)))} - ${formatDate(now)}`;
      case 'all': return 'All Time';
      default: return 'Selected Period';
    }
  }, [activeDateFilter]);

  const dateFilters = [
    { label: 'All Time', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7' },
    { label: 'Last 15 Days', value: 'last15' },
    { label: 'Last 30 Days', value: 'last30' },
  ];

  const handleDateFilterSelect = (value: string) => {
    setActiveDateFilter(value);
    setIsFilterOpen(false);
  };

  const handleInvoiceClick = (invoiceId: string) => {
    setExpandedInvoiceId(prevId => (prevId === invoiceId ? null : invoiceId));
  };

  const handlePdfAction = async (invoice: Invoice, action: ACTION.DOWNLOAD | ACTION.PRINT) => {
    setInvoiceToPrint(null);
    setPdfGenerating(invoice.id);

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

      const populatedItems = (invoice.items || []).map((item: any, index: number) => {
        const fullItem = fetchedItems.find((fi: any) => fi.id === item.id);
        const finalTaxRate = item.taxRate || item.tax || item.gstPercent || fullItem?.tax || 0;
        const itemAmount = (item.finalPrice !== undefined && item.finalPrice !== null)
          ? item.finalPrice
          : (item.mrp * item.quantity);

        return {
          sno: index + 1,
          name: item.name,
          quantity: item.quantity,
          unit: fullItem?.unit || item.unit || "Pcs",
          listPrice: item.mrp,
          gstPercent: finalTaxRate,
          hsn: fullItem?.hsnSac || item.hsnSac || "N/A",
          discountAmount: item.discount || 0,
          amount: itemAmount
        };
      });

      const dataForPdf = {
        companyName: businessInfo?.name || 'Your Company',
        companyAddress: businessInfo?.address || 'Your Address',
        companyContact: businessInfo?.phoneNumber || 'Your Phone',
        companyEmail: businessInfo?.email || '',
        billTo: {
          name: invoice.partyName,
          address: invoice.partyAddress || '',
          phone: invoice.partyNumber || '',
          gstin: invoice.partyGstin || '',
        },
        invoice: {
          number: invoice.invoiceNumber,
          date: invoice.createdAt.toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: 'numeric', minute: 'numeric', hour12: true
          }),
          billedBy: salesSettings?.enableSalesmanSelection ? (invoice.salesmanName || 'Admin') : '',
        },
        items: populatedItems,
        terms: 'Goods once sold will not be taken back.',
        finalAmount: invoice.amount,
        bankDetails: {
          accountName: businessInfo?.accountHolderName,
          accountNumber: businessInfo?.accountNumber,
          bankName: businessInfo?.bankName,
          gstin: businessInfo?.gstin
        }
      };

      await generatePdf(dataForPdf, action);

    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setModal({ message: 'Failed to process PDF action.', type: State.ERROR });
    } finally {
      setPdfGenerating(null);
    }
  };
  const promptDeleteInvoice = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setModal({ message: "Are you sure you want to delete this invoice? This action cannot be undone and will restore item stock.", type: State.INFO });
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete || !invoiceToDelete.items) return;
    if (!currentUser?.companyId) {
      setModal({ message: "Error: No company ID found. Cannot delete.", type: State.ERROR });
      return;
    }
    const companyId = currentUser.companyId;
    const collectionName = invoiceToDelete.type === 'Credit' ? 'sales' : 'purchases';
    const invoiceDocRef = doc(db, 'companies', companyId, collectionName, invoiceToDelete.id);

    try {
      await runTransaction(db, async (transaction) => {
        for (const item of invoiceToDelete.items!) {
          if (item.id && item.quantity > 0) {
            const itemDocRef = doc(db, 'companies', companyId, 'items', item.id);
            const stockChange = invoiceToDelete.type === 'Credit' ? item.quantity : -item.quantity;
            transaction.update(itemDocRef, { stock: increment(stockChange) });
          }
        }
        transaction.delete(invoiceDocRef);
      });
      setModal({ message: "Invoice deleted and stock updated successfully.", type: State.SUCCESS });
    } catch (err) {
      console.error("Error in transaction: ", err);
      setModal({ message: `Failed to delete invoice: ${err instanceof Error ? err.message : 'Unknown error'}`, type: State.ERROR });
    } finally {
      setInvoiceToDelete(null);
      setTimeout(() => setModal(null), 3000);
    }
  };

  const cancelDelete = () => {
    setInvoiceToDelete(null);
    setModal(null);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    if (invoice.type === 'Credit') {
      navigate(ROUTES.SALES, { state: { invoiceData: invoice, isEditMode: true } });
    } else {
      navigate(ROUTES.PURCHASE, { state: { purchaseId: invoice.id, isEditMode: true } });
    }
  };

  const handleSalesReturn = (invoice: Invoice) => {
    navigate(`${ROUTES.SALES_RETURN}`, { state: { invoiceData: invoice } });
  };

  const handlePurchaseReturn = (invoice: Invoice) => {
    navigate(`${ROUTES.PURCHASE_RETURN}`, { state: { invoiceData: invoice } });
  };

  const openPaymentModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsModalOpen(true);
  };

  const handleSettlePayment = async (invoice: Invoice, amount: number, method: string) => {
    if (!currentUser?.companyId) { throw new Error("No company ID found. Cannot settle payment."); }
    const companyId = currentUser.companyId;
    const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
    const docRef = doc(db, 'companies', companyId, collectionName, invoice.id);
    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists()) throw "Document does not exist!";
      const data = sfDoc.data() as DocumentData;
      const currentPaymentMethods = data.paymentMethods || {};
      const currentDue = currentPaymentMethods.due || 0;
      const currentMethodTotal = currentPaymentMethods[method] || 0;
      const newDue = currentDue - amount;
      if (newDue < 0) throw 'Payment exceeds due amount.';
      const newPaymentMethods = { ...currentPaymentMethods, [method]: currentMethodTotal + amount, due: newDue, };
      transaction.update(docRef, { paymentMethods: newPaymentMethods });
    });
  };

  const handlePrintQr = (invoice: Invoice) => {
    if (!invoice.items || invoice.items.length === 0) {
      setModal({ message: "No items found in this invoice to print.", type: State.ERROR });
      return;
    }
    const cleanItems = invoice.items.map(item => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity),
      mrp: Number(item.mrp),
      barcode: item.barcode || '',
    }));
    navigate(ROUTES.PRINTQR, {
      state: { prefilledItems: cleanItems }
    });
  };
  const totalUnpaidAmount = useMemo(() => {
    if (activeTab !== 'Unpaid') return 0;

    return filteredInvoices.reduce((sum, invoice) => {
      return sum + (invoice.dueAmount || 0);
    }, 0);
  }, [filteredInvoices, activeTab]);

  const renderContent = () => {
    if (authLoading || dataLoading) return <Spinner />;
    if (error) return <p className="p-8 text-center text-red-500">{error}</p>;

    if (filteredInvoices.length > 0) {
      return filteredInvoices.map((invoice) => {
        const isExpanded = expandedInvoiceId === invoice.id;

        const paymentMethods = invoice.paymentMethods || {};
        const activeModes = Object.entries(paymentMethods)
          .filter(([key, value]) => key !== 'due' && Number(value) > 0);

        return (
          <CustomCard key={invoice.id} onClick={() => handleInvoiceClick(invoice.id)} className="cursor-pointer transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-slate-800">{invoice.invoiceNumber}</p>
                <p className="text-sm text-slate-500 mt-1">{invoice.partyName}</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  {invoice.status === 'Unpaid' && invoice.dueAmount && invoice.dueAmount > 0 ? (
                    <>
                      <p className="text-lg font-bold text-red-600">{invoice.dueAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                      <p className="text-xs text-slate-400">Total: {invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-slate-800">{invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                  )}
                  <p className="text-xs text-slate-500">{invoice.time}</p>
                </div>
                <IconChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {isExpanded && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide">Items</h4>
                <div className="space-y-2 text-sm">
                  {(invoice.items && invoice.items.length > 0) ? invoice.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center text-slate-700">
                      <div className="flex-1 pr-4">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-slate-400">MRP: {item.mrp.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{item.finalPrice.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                        <p className="text-xs text-slate-400">Qty: {item.quantity}</p>
                      </div>
                    </div>
                  )) : <p className="text-xs text-slate-400">No item details available.</p>}
                </div>

                {activeModes.length > 0 && (
                  <div className="flex justify-between items-start mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500">

                    {salesSettings?.enableSalesmanSelection ? (
                      <p className="text-left whitespace-nowrap mr-2">
                        Salesman: {invoice.salesmanName?.slice(0, 15) || 'N/A'}
                      </p>
                    ) : <div></div>}

                    <div className="flex flex-wrap justify-end gap-x-2 gap-y-1 text-right">
                      <span>Paid via:</span>
                      {activeModes.map(([key, val]) => (
                        <span key={key} className="font-medium text-slate-700 whitespace-nowrap">
                          {key === 'upi' ? 'UPI' : key.charAt(0).toUpperCase() + key.slice(1)}: {Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between gap-2 mt-4 pt-4 border-t border-slate-200">
                  {invoice.status === 'Unpaid' && (<button onClick={(e) => { e.stopPropagation(); openPaymentModal(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">Settle</button>)}
                  {invoice.status === 'Paid' && (<button onClick={(e) => { e.stopPropagation(); promptDeleteInvoice(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors">Delete</button>)}
                  <button onClick={(e) => { e.stopPropagation(); handleEditInvoice(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-gray-400 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors">Edit</button>

                  {invoice.type === 'Credit' && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleSalesReturn(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-sky-500 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">Return</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setInvoiceToPrint(invoice); }}
                        disabled={pdfGenerating === invoice.id}
                        className="px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {pdfGenerating === invoice.id ? <Spinner /> : 'Print'}
                      </button>
                    </>
                  )}

                  {invoice.type === 'Debit' && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handlePurchaseReturn(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-sky-500 rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors">Return</button>
                      <button onClick={(e) => { e.stopPropagation(); handlePrintQr(invoice); }} className="px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors flex items-center gap-2">Print</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </CustomCard>
        );
      });
    }
    return <p className="p-8 text-center text-base text-slate-500">No invoices found for this selection.</p>;
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-100 mb-10 ">
      {modal && <Modal message={modal.message} type={modal.type} onClose={cancelDelete} onConfirm={confirmDeleteInvoice} showConfirmButton={invoiceToDelete !== null} />}
      <PaymentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} invoice={selectedInvoice} onSubmit={handleSettlePayment} />

      {invoiceToPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setInvoiceToPrint(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4 shadow-xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Select Action</h3>
              <button onClick={() => setInvoiceToPrint(null)} className="text-gray-500 hover:text-gray-700">
                <IconClose />
              </button>
            </div>
            <p className="text-gray-600 mb-6">Do you want to download the PDF file or open the print dialog?</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => handlePdfAction(invoiceToPrint, ACTION.DOWNLOAD)} className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"><IconDownload /> Download PDF</button>
              <button onClick={() => handlePdfAction(invoiceToPrint, ACTION.PRINT)} className="w-full bg-white text-gray-700 border border-gray-300 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"><IconPrint /> Print Directly</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between p-2 px-2">
        <div className="flex flex-1 items-center">
          <button onClick={() => setShowSearch(!showSearch)} className="text-slate-500 hover:text-slate-800 transition-colors mr-4">
            {showSearch ? (
              <IconClose />) : (<IconSearch />)}
          </button>
          <div className="flex-1">
            {!showSearch ? (<div> <h1 className="text-4xl font-light text-slate-800">Transactions</h1> <p className='text-center justify-center text-lg font-light text-slate-600'>{selectedPeriodText}</p> </div>) : (<input type="text" placeholder="Search by Invoice, Name, or Phone..." className="w-full text-xl font-light p-1 border-b-2 border-slate-300 focus:border-slate-800 outline-none transition-colors" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />)}
          </div>
        </div>

        <div className="relative pl-4" ref={filterRef}>
          <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-slate-500 hover:text-slate-800 transition-colors">
            <IconFilter />
          </button>
          {isFilterOpen && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border">
              <ul className="py-1">
                {dateFilters.map((filter) => (<li key={filter.value}> <button onClick={() => handleDateFilterSelect(filter.value)} className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === filter.value ? 'bg-slate-100 text-slate-900' : 'text-slate-700'} hover:bg-slate-50`}>{filter.label}</button> </li>))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center border-b border-gray-500 p-2 mb-2">
        <CustomButton variant={Variant.Transparent} active={activeType === 'Credit'} onClick={() => setActiveType('Credit')}>Sales</CustomButton>
        <CustomButton variant={Variant.Transparent} active={activeType === 'Debit'} onClick={() => setActiveType('Debit')}>Purchase</CustomButton>
      </div>
      <CustomToggle>
        <CustomToggleItem className="mr-2" onClick={() => setActiveTab('Paid')} data-state={activeTab === 'Paid' ? 'on' : 'off'}>Paid</CustomToggleItem>
        <CustomToggleItem onClick={() => setActiveTab('Unpaid')} data-state={activeTab === 'Unpaid' ? 'on' : 'off'}>Unpaid</CustomToggleItem>
      </CustomToggle>

      {activeTab === 'Unpaid' && (
        <div className="mx-2 mt-2 p-2 bg-red-50 border border-red-200 rounded-sm flex justify-between items-center shadow-sm animate-in fade-in slide-in-from-top-2">
          <div>
            <p className="text-sm text-red-600 font-bold tracking-wider">
              {activeType === 'Credit' ? 'Total Receivables : ' : 'Total Payables : '}
              {totalUnpaidAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
            </p>
          </div>
        </div>
      )}
      <div className="flex-grow overflow-y-auto bg-slate-100 space-y-3 pt-4 pb-24">
        {renderContent()}
      </div>
    </div >
  );
};

export default Journal;