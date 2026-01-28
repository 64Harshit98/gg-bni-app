import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import { type TaxReportRow } from './taxReport.utils';
import { db } from '../../../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  orderBy,
  Timestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
export default function useTaxReport() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [salesData, setSalesData] = useState<TaxReportRow[]>([]);
  const [purchaseData, setPurchaseData] = useState<TaxReportRow[]>([]);

  const [gstScheme, setGstScheme] = useState<
    'Regular' | 'Composition' | 'None'
  >('Regular');
  const [compositionRate, setCompositionRate] = useState<number>(1);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'Summary' | 'Sales' | 'Purchases'>(
    'Summary',
  );
  const [datePreset, setDatePreset] = useState<string>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
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
    if (authLoading) return;
    if (!currentUser?.companyId) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const companyId = currentUser.companyId;

        let scheme: 'Regular' | 'Composition' | 'None' = 'Regular';
        try {
          const settingsDoc = await getDoc(
            doc(db, 'companies', companyId, 'settings', 'sales-settings'),
          );
          if (settingsDoc.exists()) {
            const data = settingsDoc.data();
            if (data.gstScheme === 'composition') scheme = 'Composition';
            else if (data.gstScheme === 'none') scheme = 'None';
          }
        } catch (e) {
          console.warn('Could not fetch settings, defaulting to Regular');
        }
        setGstScheme(scheme);

        if (scheme === 'None') {
          setIsLoading(false);
          return;
        }

        const salesQ = query(
          collection(db, 'companies', companyId, 'sales'),
          orderBy('createdAt', 'desc'),
        );
        const salesSnap = await getDocs(salesQ);
        const processedSales = processDocs(salesSnap.docs, 'Sale');
        setSalesData(processedSales);

        const purchaseQ = query(
          collection(db, 'companies', companyId, 'purchases'),
          orderBy('createdAt', 'desc'),
        );
        const purchaseSnap = await getDocs(purchaseQ);
        const processedPurchases = processDocs(purchaseSnap.docs, 'Purchase');
        setPurchaseData(processedPurchases);
      } catch (err) {
        console.error('Error fetching tax data:', err);
        setError('Failed to load tax data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [currentUser, authLoading]);

  const processDocs = (
    docs: any[],
    type: 'Sale' | 'Purchase',
  ): TaxReportRow[] => {
    return docs.map((doc) => {
      const data = doc.data();
      const isInterState = data.isInterState || false;

      const docTaxable = data.taxableAmount || 0;
      const docTax = data.taxAmount || 0;

      return {
        id: doc.id,
        type,
        date:
          data.createdAt instanceof Timestamp
            ? data.createdAt.toMillis()
            : Date.now(),
        invoiceNumber: data.invoiceNumber || data.billNumber || '---',
        partyName:
          data.partyName ||
          data.vendorName ||
          (type === 'Sale' ? 'Cash Sale' : 'Cash Purchase'),
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
