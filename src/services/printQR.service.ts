import type { Item } from '../constants/models';
import { getFirestoreOperations } from '../lib/ItemsFirebase';

export interface PrintQRData {
  items: Item[];
  companyName: string;
}

/**
 * Loads every item that has a non-empty barcode, plus the company display
 * name used on the printed label header.
 */
export async function fetchPrintQRData(companyId: string): Promise<PrintQRData> {
  try {
    const dbOperations = getFirestoreOperations(companyId);
    const [fetchedItems, businessInfo] = await Promise.all([
      dbOperations.syncItems(),
      dbOperations.getBusinessInfo(),
    ]);

    return {
      items: fetchedItems.filter((item) => item.barcode && item.barcode.trim() !== ''),
      companyName: businessInfo.name || 'Your Company',
    };
  } catch (err) {
    console.error('fetchPrintQRData failed:', err);
    throw err instanceof Error ? err : new Error('Failed to load items for printing.');
  }
}

/** Refetches just the business name, used right before generating the print job. */
export async function fetchCompanyBusinessInfo(companyId: string) {
  const dbOperations = getFirestoreOperations(companyId);
  return dbOperations.getBusinessInfo();
}
