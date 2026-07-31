/**
 * Data-access layer for the User (staff performance) Report. Wraps the
 * Firestore reads that used to live inline in `useUserReport.ts` behind
 * small, typed functions. Field mapping/fallback logic is preserved exactly
 * as it was before extraction.
 */
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export interface StaffMember {
  uid: string;
  name: string;
  role: string;
}

export interface SaleItem {
  quantity: number;
  name?: string;
  price?: number;
  effectiveUnitPrice?: number;
}

export interface RawSale {
  id: string;
  totalAmount: number;
  paymentMethods: { cash?: number; upi?: number; card?: number };
  createdAt: number; // millis
  items: SaleItem[];
  salesmanId?: string; // UID of the cashier who made the sale
}

export interface RawAttendance {
  status: 'Checked In' | 'Checked Out';
  lastCheckInTime: number | null;
  totalElapsedTime: number; // milliseconds (not seconds!)
  log: { checkIn: number; checkOut: number | null }[];
}

/** Fetches the company's staff list (Owner excluded — owners review staff, not themselves). */
export async function fetchStaffList(companyId: string): Promise<StaffMember[]> {
  const snap = await getDocs(collection(db, 'companies', companyId, 'users'));
  return snap.docs
    .map((d) => ({
      uid: d.id,
      name: d.data().name || 'Unknown',
      role: d.data().role || 'Salesman',
    }))
    .filter((u) => u.role !== 'Owner');
}

/** Fetches every sale recorded for the company, newest first. */
export async function fetchAllSales(companyId: string): Promise<RawSale[]> {
  const q = query(
    collection(db, 'companies', companyId, 'sales'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      totalAmount: data.totalAmount || 0,
      paymentMethods: data.paymentMethods || {},
      createdAt:
        data.createdAt instanceof Timestamp
          ? data.createdAt.toMillis()
          : Number(data.createdAt) || Date.now(),
      items: data.items || [],
      salesmanId: data.salesmanId || '',
    };
  });
}

/**
 * Fetches and merges attendance documents (keyed `${userId}_${YYYY-MM-DD}`)
 * for every day in `[startMs, endMs]`. Returns `null` if no attendance
 * document exists for any day in the range.
 */
export async function fetchAttendanceForRange(
  companyId: string,
  userId: string,
  startMs: number,
  endMs: number,
): Promise<RawAttendance | null> {
  const dateStrings: string[] = [];
  const cursor = new Date(startMs);
  const endDay = new Date(endMs);
  cursor.setHours(0, 0, 0, 0);
  endDay.setHours(0, 0, 0, 0);

  while (cursor <= endDay) {
    const localDate = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    dateStrings.push(localDate);
    cursor.setDate(cursor.getDate() + 1);
  }

  const snaps = await Promise.all(
    dateStrings.map((dateStr) =>
      getDoc(doc(db, 'companies', companyId, 'attendance', `${userId}_${dateStr}`)),
    ),
  );

  const merged: RawAttendance = {
    status: 'Checked Out',
    lastCheckInTime: null,
    totalElapsedTime: 0,
    log: [],
  };

  let foundAny = false;
  snaps.forEach((snap) => {
    if (!snap.exists()) return;
    foundAny = true;
    const d = snap.data() as RawAttendance;
    merged.log.push(...(d.log ?? []));
    merged.totalElapsedTime += d.totalElapsedTime || 0;
    if (d.status === 'Checked In') merged.status = 'Checked In';
    if (d.lastCheckInTime) merged.lastCheckInTime = d.lastCheckInTime;
  });

  return foundAny ? merged : null;
}
