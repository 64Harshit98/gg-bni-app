import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import type { MerchantProfile } from '../../Pages/Reports/TaxReportComponents/useTaxReport';

export type GstScheme = 'Regular' | 'Composition' | 'None';

/** A raw sales/purchase document as read from Firestore, keyed by field name. */
export interface TaxDocRecord {
  id: string;
  [field: string]: unknown;
}

export interface MerchantTaxSettings {
  gstScheme: GstScheme;
  merchantProfile: MerchantProfile;
}

const DEFAULT_MERCHANT_PROFILE: MerchantProfile = {
  gstin: '',
  homeStateCode: '09', // Default to UP
  compositionRate: 1,
  legalName: '',
  tradeName: '',
};

/**
 * Fetches the company profile doc + `settings/sales-settings` doc and derives
 * the effective GST scheme + merchant profile used across every tab/export in
 * the Tax Report. Defaults to `Regular` scheme if settings can't be read, to
 * match the previous inline behavior.
 */
export async function fetchMerchantTaxSettings(companyId: string): Promise<MerchantTaxSettings> {
  let scheme: GstScheme = 'Regular';
  const merchantProfile: MerchantProfile = { ...DEFAULT_MERCHANT_PROFILE };

  try {
    const [profileDoc, settingsDoc] = await Promise.all([
      getDoc(doc(db, 'companies', companyId)),
      getDoc(doc(db, 'companies', companyId, 'settings', 'sales-settings')),
    ]);

    if (profileDoc.exists()) {
      const pData = profileDoc.data();
      merchantProfile.gstin = pData.gstin || '';
      // Extract strict 2-digit state code from GSTIN if available, else default to UP
      merchantProfile.homeStateCode = pData.gstin ? String(pData.gstin).substring(0, 2) : '09';
      merchantProfile.legalName = pData.legalName || pData.ownerName || '';
      merchantProfile.tradeName = pData.tradeName || pData.companyName || pData.storeName || '';
    }

    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      if (data.gstScheme === 'composition') {
        scheme = 'Composition';
        merchantProfile.compositionRate = data.compositionRate || 1;
      } else if (data.gstScheme === 'none') {
        scheme = 'None';
      }
    }
  } catch (err) {
    console.warn('fetchMerchantTaxSettings: could not fetch settings, defaulting to Regular', err);
  }

  return { gstScheme: scheme, merchantProfile };
}

/**
 * Fetches all `sales` docs for a company within `[start, end]`, newest first.
 * Filtering happens on the backend (via Firestore `where`) instead of
 * downloading the whole collection.
 */
export async function fetchSalesInRange(
  companyId: string,
  start: Date,
  end: Date,
): Promise<TaxDocRecord[]> {
  const salesQuery = query(
    collection(db, 'companies', companyId, 'sales'),
    where('createdAt', '>=', start),
    where('createdAt', '<=', end),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(salesQuery);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetches ALL `purchases` docs for a company within `[start, end]`, newest
 * first. Both GST schemes need every invoice from a registered supplier
 * (Composition dealers need it for GSTR-4A — RCM and non-RCM alike), so
 * RCM-only filtering happens client-side per-report instead of here.
 */
export async function fetchPurchasesInRange(
  companyId: string,
  start: Date,
  end: Date,
): Promise<TaxDocRecord[]> {
  const purchaseQuery = query(
    collection(db, 'companies', companyId, 'purchases'),
    where('createdAt', '>=', start),
    where('createdAt', '<=', end),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(purchaseQuery);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
