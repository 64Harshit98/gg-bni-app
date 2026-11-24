import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { Permissions } from '../enums';

// K bills ("exempt" series) are saved in their own Firestore collection,
// `exemptSales`, next to the regular `sales` collection.
//
// Pages that show sales figures let a permitted user cycle the K button:
//   'original' (default) → 'exempt' (K bills only) → 'all' (regular + K) → back.
export type BillSeriesMode = 'original' | 'exempt' | 'all';

export const REGULAR_SALES_COLLECTION = 'sales';
export const EXEMPT_SALES_COLLECTION = 'exemptSales';

export const nextBillSeriesMode = (mode: BillSeriesMode): BillSeriesMode =>
  mode === 'original' ? 'exempt' : mode === 'exempt' ? 'all' : 'original';

/** Sales collections to read for a series. */
export const salesCollectionsFor = (mode: BillSeriesMode): string[] =>
  mode === 'exempt'
    ? [EXEMPT_SALES_COLLECTION]
    : mode === 'all'
      ? [REGULAR_SALES_COLLECTION, EXEMPT_SALES_COLLECTION]
      : [REGULAR_SALES_COLLECTION];

/** The collection one saved bill lives in. */
export const salesCollectionOf = (bill: { isExemptBill?: boolean } | null | undefined): string =>
  bill?.isExemptBill ? EXEMPT_SALES_COLLECTION : REGULAR_SALES_COLLECTION;

export const BILL_SERIES_LABEL: Record<BillSeriesMode, string> = {
  original: 'Regular bills',
  exempt: 'K bills only',
  all: 'Regular + K bills',
};

/** Owners (by default) and staff the owner allowed may see K bills in reports. */
export const useCanViewKBills = (): boolean => {
  const { hasPermission } = useAuth();
  return hasPermission(Permissions.ViewKBills);
};

/**
 * Series state for a report page. Users without the permission are pinned to
 * the regular series, whatever the state says, so K figures never leak to them.
 */
export const useBillSeriesMode = (initial: BillSeriesMode = 'original') => {
  const canViewKBills = useCanViewKBills();
  const [mode, setMode] = useState<BillSeriesMode>(initial);
  return {
    billSeriesMode: canViewKBills ? mode : ('original' as BillSeriesMode),
    setBillSeriesMode: setMode,
    canViewKBills,
  };
};
