import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { generatePdf, type InvoiceData } from '../../UseComponents/pdfGenerator';
import { ACTION } from '../../enums';
import { Spinner } from '../../constants/Spinner';
import { IconDownload, IconScanCircle } from '../../constants/Icons';

const DownloadBill: React.FC = () => {
  const { companyId, invoiceId } = useParams<{ companyId: string; invoiceId: string }>();
  const [status, setStatus] = useState<'loading' | 'generating' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const fetchAndDownload = async () => {
      if (!companyId || !invoiceId) {
        setStatus('error');
        setErrorMessage('Invalid Link');
        return;
      }

      try {
        // --- 1. MANUALLY CONSTRUCT QUERIES (Based on your helper) ---
        
        // A. Invoice Reference
        // Path: companies/{companyId}/sales/{invoiceId}
        const invoiceRef = doc(db, 'companies', companyId, 'sales', invoiceId);

        // B. Business Info Reference
        // Path: companies/{companyId}/business_info/{companyId}  <-- Crucial: Doc ID is companyId
        const businessRef = doc(db, 'companies', companyId, 'business_info', companyId);

        // C. Sales Settings Reference
        // Path: companies/{companyId}/settings/sales-settings
        const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');

        // D. Items Collection (for Master Data lookup)
        // Path: companies/{companyId}/items
        const itemsRef = collection(db, 'companies', companyId, 'items');

        // --- 2. FETCH ALL DATA IN PARALLEL ---
        const [invoiceSnap, businessSnap, settingsSnap, itemsSnap] = await Promise.all([
          getDoc(invoiceRef),
          getDoc(businessRef),
          getDoc(settingsRef),
          getDocs(itemsRef)
        ]);

        if (!invoiceSnap.exists()) {
          throw new Error('Invoice not found');
        }

        // --- 3. EXTRACT DATA ---
        const invoiceData = invoiceSnap.data();
        const businessInfo = businessSnap.exists() ? businessSnap.data() : {};
        const salesSettings = settingsSnap.exists() ? settingsSnap.data() : {};
        
        // Create a lookup map for Master Items
        const masterItemsMap = new Map(itemsSnap.docs.map(d => [d.id, d.data()]));

        setStatus('generating');

        // --- 4. PREPARE INVOICE ITEMS ---
        const populatedItems = (invoiceData.items || []).map((item: any, index: number) => {
          // Find master item to fallback for missing details
          const fullItem = masterItemsMap.get(item.id) || {};
          
          // Logic: Use saved finalPrice, or calculate from MRP
          const itemAmount = (item.finalPrice !== undefined && item.finalPrice !== null)
            ? item.finalPrice
            : (item.mrp * item.quantity);

          // Logic: Fallback to master item tax if invoice item lacks it
          const finalTaxRate = item.taxRate || item.tax || item.gstPercent || fullItem?.tax || 0;

          return {
            sno: index + 1,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit || fullItem.unit || "Pcs",
            listPrice: item.mrp,
            gstPercent: finalTaxRate,
            hsn: item.hsnSac || fullItem.hsnSac || "N/A",
            discountAmount: item.discount || 0,
            amount: itemAmount
          };
        });

        // --- 5. HANDLE SALESMAN VISIBILITY ---
        const showSalesman = salesSettings.enableSalesmanSelection ?? true; 
        const billedBy = showSalesman ? (invoiceData.salesmanName || 'Admin') : '';

        // --- 6. HANDLE DATE ---
        const invoiceDate = invoiceData.createdAt?.toDate 
          ? invoiceData.createdAt.toDate().toLocaleDateString('en-IN') 
          : new Date(invoiceData.createdAt).toLocaleDateString('en-IN');

        const pdfData: InvoiceData = {
          companyName: businessInfo.businessName || businessInfo.name || 'Company Name',
          companyAddress: businessInfo.address || '',
          companyContact: businessInfo.phoneNumber || '',
          companyEmail: businessInfo.email || '',
          billTo: {
            name: invoiceData.partyName || 'Cash Customer',
            address: invoiceData.partyAddress || '',
            phone: invoiceData.partyNumber || '',
            gstin: invoiceData.partyGstin || '',
          },
          invoice: {
            number: invoiceData.invoiceNumber,
            date: invoiceDate,
            billedBy: billedBy,
          },
          items: populatedItems,
          terms: 'Goods once sold will not be taken back.',
          finalAmount: invoiceData.totalAmount || invoiceData.amount,
          bankDetails: {
            accountName: businessInfo.accountHolderName,
            accountNumber: businessInfo.accountNumber,
            bankName: businessInfo.bankName,
            gstin: businessInfo.gstin
          }
        };

        // --- 7. GENERATE PDF ---
        await generatePdf(pdfData, ACTION.DOWNLOAD);
        setStatus('success');

      } catch (err: any) {
        console.error("Download Error: ", err);
        setStatus('error');
        setErrorMessage(err.message || 'Failed to download bill');
      }
    };

    fetchAndDownload();
  }, [companyId, invoiceId]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full text-center">
        
        {status === 'loading' || status === 'generating' ? (
          <>
            <Spinner />
            <h2 className="text-xl font-bold text-gray-800 mt-4">
              {status === 'loading' ? 'Fetching Bill...' : 'Generating PDF...'}
            </h2>
            <p className="text-gray-500 mt-2 text-sm">Please wait while we prepare your invoice.</p>
          </>
        ) : status === 'success' ? (
          <>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600">
                <IconScanCircle width={32} height={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Download Started!</h2>
            <p className="text-gray-500 mt-2 text-sm mb-6">Your bill has been downloaded successfully.</p>
            <button onClick={() => window.close()} className="text-blue-600 font-medium hover:underline">
              Close Window
            </button>
          </>
        ) : (
          <>
             <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                <IconDownload width={32} height={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Unable to Download</h2>
            <p className="text-red-500 mt-2 text-sm font-medium">{errorMessage}</p>
            <p className="text-gray-400 mt-4 text-xs">If this issue persists, please contact the store.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default DownloadBill;