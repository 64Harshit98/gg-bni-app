import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import { getTaxPresetRange } from './taxReport.utils';
import { stateCodeFromName } from './taxReportExport.utils';
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
  address: string;
}

const DEFAULT_PROFILE: MerchantProfile = {
  gstin: '',
  homeStateCode: '09', // Default to UP
  compositionRate: 1,
  legalName: '',
  tradeName: '',
  address: '',
};

const formatAddress = (b: any): string => {
  if (!b) return '';
  if (typeof b.fullAddress === 'string' && b.fullAddress.trim()) return b.fullAddress.trim();
  if (typeof b.address === 'string' && b.address.trim()) return b.address.trim();
  const parts = [b.streetAddress, b.city, b.state].filter((p) => typeof p === 'string' && p.trim());
  let out = parts.join(', ');
  const pin = b.postalCode || b.zipCode || b.pincode;
  if (pin) out += ` - ${pin}`;
  return out;
};

export default function useTaxReport() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [salesData, setSalesData] = useState<any[]>([]);
  const [purchaseData, setPurchaseData] = useState<any[]>([]);

  const [gstScheme, setGstScheme] = useState<'Regular' | 'Composition' | 'None'>('Regular');
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile>(DEFAULT_PROFILE);

  // isLoading = first load (full-page loader); isFetching = any load (dims the old data).
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<string>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const range = getTaxPresetRange('thisMonth')!;
    setCustomStartDate(formatDateForInput(range.start));
    setCustomEndDate(formatDateForInput(range.end));
    setAppliedFilters({ start: range.start.getTime(), end: range.end.getTime() });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.companyId || !appliedFilters) {
      if (!currentUser?.companyId) setIsLoading(false);
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const companyId = currentUser.companyId;

        // 1. Company details + GST scheme.
        // GSTIN, business name and address live in companies/{id}/business_info/{id}
        // (written by onboarding, Bill settings and the GST prompt in Sales settings).
        // The root companies/{id} doc is only a fallback for older accounts.
        let scheme: 'Regular' | 'Composition' | 'None' = 'Regular';
        const profile: MerchantProfile = { ...DEFAULT_PROFILE };

        try {
          const [businessSnap, companySnap, settingsSnap] = await Promise.all([
            getDoc(doc(db, 'companies', companyId, 'business_info', companyId)),
            getDoc(doc(db, 'companies', companyId)),
            getDoc(doc(db, 'companies', companyId, 'settings', 'sales-settings')),
          ]);
          const b: any = businessSnap.exists() ? businessSnap.data() : {};
          const c: any = companySnap.exists() ? companySnap.data() : {};

          const gstin = String(b.gstin || c.gstin || '').trim().toUpperCase();
          const name = String(b.businessName || b.name || c.businessName || c.companyName || c.storeName || '').trim();
          profile.gstin = gstin;
          profile.tradeName = String(b.tradeName || c.tradeName || name).trim();
          profile.legalName = String(b.legalName || c.legalName || b.ownerName || c.ownerName || name).trim();
          profile.address = formatAddress(b) || formatAddress(c);
          // Home state: GSTIN prefix is authoritative; else the state on the business address.
          profile.homeStateCode = /^\d{2}/.test(gstin)
            ? gstin.substring(0, 2)
            : stateCodeFromName(b.state || c.state) || DEFAULT_PROFILE.homeStateCode;

          if (settingsSnap.exists()) {
            const s: any = settingsSnap.data();
            if (s.gstScheme === 'composition') {
              scheme = 'Composition';
              profile.compositionRate = Number(s.compositionRate) || 1;
            } else if (s.gstScheme === 'none') scheme = 'None';
          }
        } catch (e) {
          console.warn('Could not fetch business info / settings, defaulting to Regular', e);
        }

        if (cancelled) return;
        setGstScheme(scheme);
        setMerchantProfile(profile);

        if (scheme === 'None') {
          setSalesData([]);
          setPurchaseData([]);
          return;
        }

        // 2. Sales + purchases for the period (all purchases: Composition needs every
        // registered-supplier invoice for GSTR-4A; RCM filtering happens per report).
        const startDate = new Date(appliedFilters.start);
        const endDate = new Date(appliedFilters.end);
        const rangeQuery = (col: string) =>
          query(
            collection(db, 'companies', companyId, col),
            where('createdAt', '>=', startDate),
            where('createdAt', '<=', endDate),
            orderBy('createdAt', 'desc'),
          );

        const [salesSnap, purchaseSnap] = await Promise.all([
          getDocs(rangeQuery('sales')),
          getDocs(rangeQuery('purchases')),
        ]);
        if (cancelled) return;
        setSalesData(salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setPurchaseData(purchaseSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Error fetching tax data:', err);
        if (!cancelled) setError('Failed to load tax data.');
      } finally {
        if (!cancelled) {
          setIsFetching(false);
          setIsLoading(false);
        }
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
    isFetching,
    error,
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
