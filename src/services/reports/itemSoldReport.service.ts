import { collection, getDocs } from 'firebase/firestore';

import { db } from '../../lib/Firebase';

/**
 * Fetch a map of `itemGroupId -> group name` for a company, used to resolve
 * the category label of each sold line item in the Items Sold report.
 * Mirrors the query previously inlined in `ItemSoldReport.tsx`; logic/shape
 * is unchanged, only relocated here.
 */
export async function fetchItemGroupMap(
  companyId: string,
): Promise<Record<string, string>> {
  try {
    const groupsRef = collection(db, 'companies', companyId, 'itemGroups');
    const groupsSnap = await getDocs(groupsRef);

    const map: Record<string, string> = {};
    groupsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      map[docSnap.id] = data.name || data.groupName || 'Unknown Group';
    });

    return map;
  } catch (err) {
    console.error('[itemSoldReport.service] Error fetching item groups:', err);
    throw new Error('Failed to load item groups.');
  }
}

export const itemSoldReportService = { fetchItemGroupMap };
