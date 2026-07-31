import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import {
  fetchMerchantTaxSettings,
  fetchPurchasesInRange,
  fetchSalesInRange,
  type GstScheme,
  type TaxDocRecord,
} from '../../../services/reports/taxReport.service';

export interface MerchantProfile {
  gstin: string;
  homeStateCode: string;
  compositionRate: number;
  legalName: string;
  tradeName: string;
}

export default function useTaxReport() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [salesData, setSalesData] = useState<TaxDocRecord[]>([]);
  const [purchaseData, setPurchaseData] = useState<TaxDocRecord[]>([]);

  const [gstScheme, setGstScheme] = useState<GstScheme>('Regular');

  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile>({
    gstin: '',
    homeStateCode: '09', // Default to UP
    compositionRate: 1,
    legalName: '',
    tradeName: '',
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'Summary' | 'Sales' | 'Purchases'>('Summary');
  const [datePreset, setDatePreset] = useState<string>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    setCustomStartDate(formatDateForInput(start));
    setCustomEndDate(formatDateForInput(end));
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.companyId || !appliedFilters) {
      if (!authLoading && !currentUser?.companyId) setIsLoading(false);
      return;
    }

    const companyId = currentUser.companyId;
    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Merchant settings & profile
        const { gstScheme: scheme, merchantProfile: merchantData } =
          await fetchMerchantTaxSettings(companyId);

        if (cancelled) return;
        setGstScheme(scheme);
        setMerchantProfile(merchantData);

        if (scheme === 'None') {
          setIsLoading(false);
          return;
        }

        // 2. Sales + purchases for the applied date range
        const startDate = new Date(appliedFilters.start);
        const endDate = new Date(appliedFilters.end);

        const [sales, purchases] = await Promise.all([
          fetchSalesInRange(companyId, startDate, endDate),
          fetchPurchasesInRange(companyId, startDate, endDate),
        ]);

        if (cancelled) return;
        setSalesData(sales);
        setPurchaseData(purchases);
      } catch (err) {
        console.error('Error fetching tax data:', err);
        if (!cancelled) setError('Failed to load tax data.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [currentUser, authLoading, appliedFilters]);

  return {
    navigate,
    salesData,
    purchaseData,
    gstScheme,
    merchantProfile,
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
