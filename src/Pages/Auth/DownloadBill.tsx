import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { generatePdf } from '../../UseComponents/pdfGenerator';
import { ACTION, PLANS } from '../../enums';
import { normalizePlan } from '../../context/Plan';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import type { PdfData } from '../Journal/journal.types';
import { Spinner } from '../../constants/Spinner';
import { IconDownload, IconScanCircle } from '../../constants/Icons';

// NOTE: adjust the PdfData import path above if journal.types.ts lives elsewhere.

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
        // 1. References
        const invoiceRef = doc(db, 'companies', companyId, 'sales', invoiceId);
        const businessRef = doc(db, 'companies', companyId, 'business_info', companyId);
        const salesSettingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
        const billSettingsRef = doc(db, 'companies', companyId, 'settings', 'bill');
        const companyRef = doc(db, 'companies', companyId);

        // 2. Fetch everything (logo failure must never break the bill)
        const [invoiceSnap, businessSnap, salesSnap, billSnap, companySnap, companyLogoBase64] =
          await Promise.all([
            getDoc(invoiceRef),
            getDoc(businessRef),
            getDoc(salesSettingsRef),
            getDoc(billSettingsRef),
            getDoc(companyRef),
            resolveCompanyLogoBase64(companyId).catch(() => ''),
          ]);

        if (!invoiceSnap.exists()) throw new Error('Invoice not found');

        const invoiceData: any = invoiceSnap.data();
        const businessInfo: any = businessSnap.exists() ? businessSnap.data() : {};
        const salesSettings: any = salesSnap.exists() ? salesSnap.data() : {};
        const billSettings: any = billSnap.exists() ? billSnap.data() : {};

        // 3. Plan -> same rule as Journal (POS_BASIC / CALC_CATALOG force thermal)
        const normalizedPlan = companySnap.exists() ? normalizePlan(companySnap.data().pack) : null;
        const isPosBasicPlan = normalizedPlan === PLANS.POS_BASIC || normalizedPlan === PLANS.CALC_CATALOG;

        // 4. Print format — SAME logic as preparePdfData (this was the "always A4" bug)
        const isThermalFormat =
          billSettings.posPrintFormat === 'THERMAL58' || billSettings.posPrintFormat === 'THERMAL80';
        const printFormat: 'A4' | 'THERMAL58' | 'THERMAL80' = isPosBasicPlan
          ? (isThermalFormat ? billSettings.posPrintFormat : 'THERMAL58')
          : (billSettings.posPrintFormat || 'A4');

        setStatus('generating');

        // 5. Previous balance + credit note (wrapped: if rules block them, they become 0)
        let previousBalance = 0;
        const partyNumber = invoiceData.partyNumber;
        if (partyNumber) {
          try {
            const salesSnapAll = await getDocs(
              query(collection(db, 'companies', companyId, 'sales'), where('partyNumber', '==', partyNumber))
            );
            salesSnapAll.forEach((d) => {
              if (d.id !== invoiceId) previousBalance += Number(d.data().paymentMethods?.due ?? 0);
            });
            const obSnap = await getDocs(
              query(collection(db, 'companies', companyId, 'openingBalances'), where('partyNumber', '==', partyNumber))
            );
            obSnap.forEach((d) => {
              const data: any = d.data();
              if ((data.balanceType ?? 'due') === 'due') {
                previousBalance += Number(data.dueAmount ?? data.amount ?? 0);
              }
            });
          } catch {
            previousBalance = 0;
          }
        }

        let creditNoteBalance = 0;
        if (partyNumber) {
          try {
            const phone = String(partyNumber).replace(/\D/g, '').slice(-10);
            if (phone) {
              const cSnap = await getDoc(doc(db, 'companies', companyId, 'customers', phone));
              creditNoteBalance = cSnap.exists() ? Number(cSnap.data().creditBalance || 0) : 0;
            }
          } catch {
            creditNoteBalance = 0;
          }
        }

        // 6. Items — same mapping as preparePdfData (sales bill)
        const resolvedInvoiceTaxType = invoiceData.taxType || salesSettings?.taxType || '';
        const populatedItems = (invoiceData.items || []).map((item: any, index: number) => {
          const finalTaxRate = item.taxRate || item.tax || item.gstPercent || 0;
          const resolvedTaxType = item.taxType || resolvedInvoiceTaxType;

          let itemAmount = 0;
          if (resolvedTaxType === 'Exclusive' && item.taxableAmount) {
            itemAmount = item.taxableAmount;
          } else if (item.effectiveUnitPrice && item.effectiveUnitPrice > 0) {
            itemAmount = item.effectiveUnitPrice * (Number(item.quantity) || 1);
          } else if (item.finalPrice !== undefined && item.finalPrice !== null && item.finalPrice > 0) {
            itemAmount = item.finalPrice;
          } else {
            itemAmount = (Number(item.mrp) || 0) * (Number(item.quantity) || 1);
          }

          const qty = Number(item.quantity) || 1;
          const actualMrp = Number(item.mrp) || 0;
          const basePrice = actualMrp > 0 ? actualMrp : (Number(item.salesPrice) || 0);

          let absoluteDiscount = basePrice * qty - itemAmount;
          if (absoluteDiscount < 0) absoluteDiscount = 0;

          const d1Pct = Number(item.discount || item.discountPercentage) || 0;
          const d2Pct = Number(item.discount2) || 0;
          const priceAfterD1 = basePrice * (1 - d1Pct / 100);
          const priceAfterD2 = priceAfterD1 * (1 - d2Pct / 100);
          const discount1Amount = (basePrice - priceAfterD1) * qty;
          let discount2Amount = (priceAfterD1 - priceAfterD2) * qty;
          if (d2Pct === 0 && itemAmount > 0) {
            const totalDiscountAmt = basePrice * qty - itemAmount;
            discount2Amount = Math.max(0, totalDiscountAmt - discount1Amount);
          }

          return {
            sno: index + 1,
            name: item.name,
            quantity: qty,
            unit: item.unit || 'Pcs',
            hsn: item.hsnSac || 'N/A',
            listPrice: actualMrp,
            price: basePrice,
            discountAmount: absoluteDiscount,
            discount1Amount,
            discount2Amount,
            discount1Percent: d1Pct,
            discount2Percent: d2Pct,
            amount: itemAmount,
            taxType: resolvedTaxType,
            taxAmount: item.taxAmount || 0,
            taxableAmount: item.taxableAmount || 0,
            gstPercent: finalTaxRate,
            taxRate: finalTaxRate,
            imageBase64: undefined as string | undefined,
          };
        });

        // 7. Dates / address
        const addressParts = [businessInfo?.streetAddress, businessInfo?.city, businessInfo?.state, businessInfo?.postalCode]
          .filter(Boolean)
          .join(' ');
        const invoiceDateObj = invoiceData.createdAt?.toDate
          ? invoiceData.createdAt.toDate()
          : new Date(invoiceData.createdAt);
        const formattedDate = invoiceDateObj.toLocaleString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: 'numeric', minute: 'numeric', hour12: true,
        });

        // 8. Amount paid / balance due (this fixes "Balance Due = full bill amount")
        const pm = invoiceData.paymentMethods || {};
        const advance = Object.entries(pm)
          .filter(([k]) => k !== 'due')
          .reduce((s, [, v]) => s + (Number(v) || 0), 0);
        const due = Number(invoiceData.dueAmount ?? pm.due ?? 0);
        const finalAmount = Number(invoiceData.amount ?? invoiceData.totalAmount ?? invoiceData.finalAmount ?? 0);

        // 9. Full PdfData — mirrors preparePdfData field-for-field
        const pdfData: PdfData = {
          printFormat,
          enableTriplicate: billSettings.enableTriplicate || false,
          enableItemImages: false, // item photos need item master; skipped on public page
          gstScheme: salesSettings?.gstScheme || '',
          taxType: resolvedInvoiceTaxType,

          companyName: businessInfo?.businessName || businessInfo?.name || '',
          companyAddress: addressParts || businessInfo?.address || '',
          companyContact: businessInfo?.phoneNumber || '',
          companyEmail: businessInfo?.email || '',
          companyLogoBase64: companyLogoBase64 || undefined,
          signatureBase64: billSettings.signatureBase64 || '',
          companyGstin: billSettings.companyGstin || businessInfo?.gstin || '',
          msmeNumber: businessInfo?.msmeNumber || billSettings.msmeNumber || '',
          panNumber: businessInfo?.panNumber || '',
          companyState: businessInfo?.state || '',
          placeOfSupply: invoiceData.placeOfSupply || '',

          billDiscount: invoiceData.manualDiscount || 0,
          discountDisplayFormat: billSettings?.discountDisplayFormat || 'amount',
          enableDiscount2: salesSettings?.enableDiscount2 || false,
          upiId: billSettings.upiId || '',

          billTo: {
            name: invoiceData.partyName || 'Cash Sale',
            address: invoiceData.partyAddress || '',
            phone: invoiceData.partyNumber || '',
            gstin: invoiceData.partyGstin || '',
          },
          shipTo: {
            name: invoiceData.shippingName || '',
            address: invoiceData.shippingAddress || '',
            phone: invoiceData.shippingNumber || '',
            gstin: invoiceData.shippingGST || '',
          },

          expenses: invoiceData.expenses || [],
          extraExpenseName: invoiceData.extraExpenseName || '',
          extraExpenseAmount: invoiceData.extraExpenseAmount || 0,
          narration: invoiceData.narration || '',
          transportDetails: invoiceData.transportDetails || undefined,

          invoice: {
            number: invoiceData.invoiceNumber,
            date: formattedDate,
            billedBy: salesSettings?.enableSalesmanSelection ? (invoiceData.salesmanName || 'N/A') : '',
            roNumber: '',
          },

          advance: advance > 0 ? advance : 0,
          due,
          previousBalance,
          creditNoteBalance,
          items: populatedItems,
          terms: billSettings.posTermsAndConditions || '',
          finalAmount,
          isEstimate: false,
          bankDetails: {
            accountName: businessInfo?.accountHolderName || billSettings.accountName,
            accountNumber: businessInfo?.accountNumber || billSettings.accountNumber,
            bankName: businessInfo?.bankName || billSettings.bankName,
            ifsc: businessInfo?.ifscCode || billSettings.ifscCode || billSettings.ifsc || '',
          },
        };

        // 10. Generate
        await generatePdf(pdfData, ACTION.DOWNLOAD);
        setStatus('success');
      } catch (err: any) {
        console.error('Download Error: ', err);
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