import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
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
        // 1. Define References
        const invoiceRef = doc(db, 'companies', companyId, 'sales', invoiceId);
        const businessRef = doc(db, 'companies', companyId, 'business_info', companyId);
        const salesSettingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
        const billSettingsRef = doc(db, 'companies', companyId, 'settings', 'bill'); // Added this

        // 2. Fetch All Data
        const [invoiceSnap, businessSnap, salesSnap, billSnap] = await Promise.all([
          getDoc(invoiceRef),
          getDoc(businessRef),
          getDoc(salesSettingsRef),
          getDoc(billSettingsRef),
        ]);

        if (!invoiceSnap.exists()) {
          throw new Error('Invoice not found');
        }

        // 3. Extract Data
        const invoiceData = invoiceSnap.data();
        const businessInfo = businessSnap.exists() ? businessSnap.data() : {};
        const salesSettings = salesSnap.exists() ? salesSnap.data() : {};
        const billSettings = billSnap.exists() ? billSnap.data() : {};

        setStatus('generating');

        // 4. Map Items (Crucial for the PDF logic)
        const populatedItems = (invoiceData.items || []).map((item: any, index: number) => {
          // If finalPrice exists, we use that as the definitive 'amount'
          // This triggers the PDF logic to back-calculate tax/discount correctly
          const finalAmount = (item.finalPrice !== undefined && item.finalPrice !== null)
            ? Number(item.finalPrice)
            : (Number(item.mrp) * Number(item.quantity));

          return {
            sno: index + 1,
            name: item.name,
            hsn: item.hsnSac || "N/A",
            quantity: Number(item.quantity),
            unit: item.unit || "Pcs",
            listPrice: Number(item.mrp),
            gstPercent: Number(item.taxRate || item.tax || item.gstPercent || 0),
            discountAmount: Number(item.discount || 0),
            amount: finalAmount // Passing this ensures correct calculation in new PDF
          };
        });

        const addressParts = [businessInfo?.streetAddress, businessInfo?.city, businessInfo?.state, businessInfo?.postalCode].filter(Boolean).join(' ');
        const invoiceDateObj = invoiceData.createdAt?.toDate ? invoiceData.createdAt.toDate() : new Date(invoiceData.createdAt);
        const formattedDate = invoiceDateObj.toLocaleString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: 'numeric', minute: 'numeric', hour12: true
        });

        // 6. Construct PDF Data Object
        const pdfData: InvoiceData = {
          // Scheme & Tax Type (Required for calculation logic)
          gstScheme: salesSettings?.gstScheme || 'REGULAR',
          taxType: salesSettings?.taxType || 'EXCLUSIVE',

          // Company Details
          companyName: businessInfo?.businessName || 'Your Company',
          companyAddress: addressParts || '',
          companyContact: businessInfo?.phoneNumber || '',
          companyEmail: businessInfo?.email || '',
          companyGstin: businessInfo?.gstin || '',
          msmeNumber: billSettings.msmeNumber || '',

          // Signature
          signatureBase64: billSettings.signatureBase64 || '',

          // Bill To
          billTo: {
            name: invoiceData.partyName || 'Cash Sale',
            address: invoiceData.partyAddress || '',
            phone: invoiceData.partyNumber || '',
            gstin: invoiceData.partyGstin || '',
          },

          // Invoice Meta
          invoice: {
            number: invoiceData.invoiceNumber,
            date: formattedDate,
            billedBy: salesSettings?.enableSalesmanSelection ? (invoiceData.salesmanName || 'Admin') : '',
            roNumber: invoiceData.vehicleNumber || '', // Mapped correctly
          },

          // Items
          items: populatedItems,

          // Terms & Bank
          terms: billSettings.termsAndConditions || 'Goods once sold will not be taken back.',
          bankDetails: {
            accountName: billSettings.accountName || businessInfo?.accountHolderName,
            accountNumber: billSettings.accountNumber || businessInfo?.accountNumber,
            bankName: billSettings.bankName || businessInfo?.bankName,
            ifsc: billSettings.ifscCode || billSettings.ifsc || '',
            gstin: businessInfo?.gstin // Fallback to business GSTIN
          }
        };

        // 7. Generate
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