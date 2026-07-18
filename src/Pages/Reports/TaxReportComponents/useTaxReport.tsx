import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import { db } from '../../../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  orderBy,
  doc,
  getDoc,
  where,
} from 'firebase/firestore';

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

  const [salesData, setSalesData] = useState<any[]>([]);
  const [purchaseData, setPurchaseData] = useState<any[]>([]);

  const [gstScheme, setGstScheme] = useState<'Regular' | 'Composition' | 'None'>('Regular');

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

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const companyId = currentUser.companyId;

        // 1. Fetch Merchant Settings & Profile Data
        let scheme: 'Regular' | 'Composition' | 'None' = 'Regular';
        const merchantData: MerchantProfile = { gstin: '', homeStateCode: '09', compositionRate: 1, legalName: '', tradeName: '' };

        try {
          const profileDoc = await getDoc(doc(db, 'companies', companyId));
          const settingsDoc = await getDoc(doc(db, 'companies', companyId, 'settings', 'sales-settings'));

          if (profileDoc.exists()) {
            const pData = profileDoc.data();
            merchantData.gstin = pData.gstin || '';
            // Extract strict 2-digit state code from GSTIN if available, else default to UP
            merchantData.homeStateCode = pData.gstin ? pData.gstin.substring(0, 2) : '09';
            merchantData.legalName = pData.legalName || pData.ownerName || '';
            merchantData.tradeName = pData.tradeName || pData.companyName || pData.storeName || '';
          }

          if (settingsDoc.exists()) {
            const data = settingsDoc.data();
            if (data.gstScheme === 'composition') {
              scheme = 'Composition';
              merchantData.compositionRate = data.compositionRate || 1;
            } else if (data.gstScheme === 'none') scheme = 'None';
          }
        } catch (e) {
          console.warn('Could not fetch settings, defaulting to Regular');
        }

        setGstScheme(scheme);
        setMerchantProfile(merchantData);

        if (scheme === 'None') {
          setIsLoading(false);
          return;
        }

        // 2. Optimized Date Query (Filters on backend instead of downloading everything)
        const startDate = new Date(appliedFilters.start);
        const endDate = new Date(appliedFilters.end);

        const salesQ = query(
          collection(db, 'companies', companyId, 'sales'),
          where('createdAt', '>=', startDate),
          where('createdAt', '<=', endDate),
          orderBy('createdAt', 'desc'),
        );
        const salesSnap = await getDocs(salesQ);
        setSalesData(salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        // 3. Purchases — fetch ALL purchases for both schemes. Composition dealers need
        // every invoice from a registered supplier for GSTR-4A (RCM and non-RCM alike),
        // not just RCM ones — RCM-only filtering happens client-side per-report instead.
        const purchaseQ = query(
          collection(db, 'companies', companyId, 'purchases'),
          where('createdAt', '>=', startDate),
          where('createdAt', '<=', endDate),
          orderBy('createdAt', 'desc'),
        );

        const purchaseSnap = await getDocs(purchaseQ);
        setPurchaseData(purchaseSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Error fetching tax data:', err);
        setError('Failed to load tax data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
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