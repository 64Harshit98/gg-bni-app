import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/auth-context';
import { formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import { type TaxReportRow } from '../../Pages/Reports/TaxReportComponents/taxReport.utils';
import { db } from '../../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  orderBy,
  Timestamp,
  doc,
  getDoc,
  where
} from 'firebase/firestore';
export default function useTaxReport() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const [salesData, setSalesData] = useState<TaxReportRow[]>([]);
  const [purchaseData, setPurchaseData] = useState<TaxReportRow[]>([]);
  const [gstScheme, setGstScheme] = useState<'Regular' | 'Composition' | 'None'>('None');
  const [compositionRate, setCompositionRate] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'Summary' | 'Sales' | 'Purchases'>('Summary');
  const [datePreset, setDatePreset] = useState<string>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [catalogueItemIds, setCatalogueItemIds] = useState<Set<string>>(new Set());
  const [appliedFilters, setAppliedFilters] = useState<{
    start: number;
    end: number;
  } | null>(null);

  useEffect(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    setCustomStartDate(formatDateForInput(start));
    setCustomEndDate(formatDateForInput(end));
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  useEffect(() => {
    if (authLoading || !appliedFilters) return;
    if (!currentUser?.companyId) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const companyId = currentUser.companyId;
        const startDate = new Date(appliedFilters.start);
        const endDate = new Date(appliedFilters.end);
        let scheme: 'Regular' | 'Composition' | 'None' = 'None';

        try {
          const settingsDoc = await getDoc(
            doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings')
          );
          if (settingsDoc.exists()) {
            const data = settingsDoc.data();

            const schemeValue = (data.gstScheme || '').toLowerCase();

            if (schemeValue === 'regular') {
              scheme = 'Regular';
            }
            else if (schemeValue === 'composition') {
              scheme = 'Composition';
            }
            else {
              scheme = 'None';
            }
          }
        } catch (e) {
          console.warn('Could not fetch GST settings', e);
        }

        setGstScheme(scheme);
        if (scheme === 'None') {
          setIsLoading(false);
          return;
        }

        const salesQ = query(
          collection(db, 'companies', companyId, 'Orders'),
          where('createdAt', '>=', Timestamp.fromDate(startDate)),
          where('createdAt', '<=', Timestamp.fromDate(endDate)),
          orderBy('createdAt', 'desc'),
        );
        const salesSnap = await getDocs(salesQ);
        const processedSales = processDocs(
          salesSnap.docs.filter(
            (doc) =>
              doc.data().status === 'Completed' ||
              doc.data().status === 'Paid'
          ),
          'Sale'
        );
        setSalesData(processedSales);

        const catalogueSnap = await getDocs(
          collection(db, 'companies', companyId, 'catalogue')
        );

        const ids = new Set<string>();

        catalogueSnap.forEach((doc) => {
          ids.add(doc.id);
        });

        setCatalogueItemIds(ids);

        const purchaseQ = query(
          collection(db, 'companies', companyId, 'purchases'),
          orderBy('createdAt', 'desc'),
        );
        const purchaseSnap = await getDocs(purchaseQ);
        const processedPurchases = processDocs(purchaseSnap.docs, 'Purchase', catalogueItemIds);
        setPurchaseData(processedPurchases);
      } catch (err) {
        console.error('Error fetching tax data:', err);
        setError('Failed to load tax data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [currentUser, authLoading, appliedFilters]);

  const processDocs = (
    docs: any[],
    type: 'Sale' | 'Purchase',
    catalogueItemIds?: Set<string>
  ): TaxReportRow[] => {
    return docs.map((doc) => {
      const data = doc.data();
      const isInterState = data.isInterState || false;

      let docTaxable = 0;
      let docTax = 0;

      (data.items || []).forEach((item: any) => {

        // Catalogue filter (yahi important hai)
        if (type === "Purchase" && catalogueItemIds && !catalogueItemIds.has(item.id)) {
          return;
        }

        const price = item.finalPrice || item.mrp || 0;
        const qty = item.quantity || 0;
        const gst = item.tax || item.taxRate || item.gst || 0;

        const taxable = price * qty;
        const tax = taxable * (gst / 100);

        docTaxable += taxable;
        docTax += tax;
      });

      const createdAtValue = data.createdAt;

      let createdAt = 0;

      if (createdAtValue instanceof Timestamp) {
        createdAt = createdAtValue.toMillis();
      }
      else if (typeof createdAtValue === "number") {
        createdAt = createdAtValue;
      }
      else if (typeof createdAtValue === "string") {
        createdAt = new Date(createdAtValue).getTime();
      }

      return {
        id: doc.id,
        type,
        date: createdAt,
        invoiceNumber: data.orderId || data.invoiceNumber || doc.id,
        partyName:
          data.userName ||
          data.partyName ||
          'Cash Sale',
        partyGstin: data.partyGstin || '-',
        taxableAmount: docTaxable,
        igst: isInterState ? docTax : 0,
        cgst: isInterState ? 0 : docTax / 2,
        sgst: isInterState ? 0 : docTax / 2,
        totalTax: docTax,
        totalAmount: data.totalAmount || 0,
      };
    });
  };
  return {
    navigate,
    salesData,
    purchaseData,
    gstScheme,
    compositionRate,
    setCompositionRate,
    isLoading,
    error,
    viewMode,
    setViewMode,
    datePreset,
    setDatePreset,
    customStartDate,
    customEndDate,
    appliedFilters,
    setCustomEndDate,
    setCustomStartDate,
    setAppliedFilters,
    authLoading,
  };
}
