import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface StaffMember {
  uid: string;
  name: string;
  role: string;
}

interface SaleItem {
  quantity: number;
  name?: string;
  price?: number;
  effectiveUnitPrice?: number;
}

interface RawSale {
  id: string;
  totalAmount: number;
  paymentMethods: { cash?: number; upi?: number; card?: number };
  createdAt: number; // millis
  items: SaleItem[];
  salesmanId?: string; // UID of the cashier who made the sale
}

interface RawAttendance {
  status: 'Checked In' | 'Checked Out';
  lastCheckInTime: number | null;
  totalElapsedTime: number; // milliseconds (not seconds!)
  log: { checkIn: number; checkOut: number | null }[];
}

export interface UserReportSummary {
  // Sales
  totalSales: number;
  totalOrders: number;
  avgOrderValue: number;
  itemsSold: number;
  payments: { cash: number; upi: number; card: number };
  paymentTotal: number;
  discounts: number;
  refunds: number;
  returns: number;
  salesPerHr: number;
  ordersPerHr: number;

  // Attendance
  clockIn: string;
  clockOut: string;
  workingHours: string;
  attendancePct: number;
  lateLogin: boolean;
  activeTime: string;

  // Derived
  efficiencyScore: number;
  efficiencyPct: number;
}

export interface AppliedFilters {
  start: number; // ms timestamp
  end: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatDateForInput = (date: Date): string =>
  date.toISOString().split('T')[0];

const secondsToHm = (totalSeconds: number): string => {
  if (totalSeconds <= 0) return '0s';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
};

const tsToTime = (ms: number | null): string => {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// Scheduled shift start — adjust to match your business rules
const SHIFT_START_HOUR = 9; // 9:00 AM
const SHIFT_START_MINUTE = 0;
const LATE_THRESHOLD_MINUTES = 10;

// ─── Main Hook ─────────────────────────────────────────────────────────────────

export default function useUserReport() {
  const { currentUser, loading: authLoading } = useAuth();

  // ── Staff list ──
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [staffLoading, setStaffLoading] = useState(true);

  // ── Raw data ──
  const [allSales, setAllSales] = useState<RawSale[]>([]);
  const [attendance, setAttendance] = useState<RawAttendance | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Date filter (mirrors PurchaseReport) ──
  const [datePreset, setDatePreset] = useState('today');
  const [customStartDate, setCustomStartDate] = useState(
    formatDateForInput(new Date()),
  );
  const [customEndDate, setCustomEndDate] = useState(
    formatDateForInput(new Date()),
  );
  const [appliedFilters, setAppliedFilters] =
    useState<AppliedFilters | null>(null);

  // ── 1. Fetch staff list once ──────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser?.companyId) return;

    const fetchStaff = async () => {
      setStaffLoading(true);
      try {
        const snap = await getDocs(
          collection(db, 'companies', currentUser.companyId, 'users'),
        );
        const list: StaffMember[] = snap.docs
          .map((d) => ({
            uid: d.id,
            name: d.data().name || 'Unknown',
            role: d.data().role || 'Salesman',
          }))
          // ── Exclude Owner from the dropdown — owners review staff, not themselves
          .filter((u) => u.role !== 'Owner');

        setStaffList(list);
        // Default to first staff member
        setSelectedUserId(list[0]?.uid ?? '');
      } catch (e) {
        console.error('useUserReport: failed to fetch staff', e);
        setError('Failed to load staff list.');
      } finally {
        setStaffLoading(false);
      }
    };

    fetchStaff();
  }, [authLoading, currentUser]);

  // ── 2. Fetch all sales for company once ───────────────────────────────────
  useEffect(() => {
    if (authLoading || !currentUser?.companyId) return;

    const fetchSales = async () => {
      try {
        const q = query(
          collection(db, 'companies', currentUser.companyId, 'sales'),
          orderBy('createdAt', 'desc'),
        );
        const snap = await getDocs(q);
        const fetched: RawSale[] = snap.docs.map((d) => {
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
        setAllSales(fetched);
        // DEBUG — remove once data is confirmed correct
        console.log('[useUserReport] total sales fetched:', fetched.length);
        if (fetched[0]) console.log('[useUserReport] sample sale:', JSON.stringify(fetched[0]));
      } catch (e) {
        console.error('useUserReport: failed to fetch sales', e);
        setError('Failed to load sales data.');
      }
    };

    fetchSales();
  }, [authLoading, currentUser]);

  // ── 3. Fetch attendance for selected user + applied date range ────────────
  useEffect(() => {
    if (
      !currentUser?.companyId ||
      !selectedUserId ||
      !appliedFilters
    )
      return;

    const fetchAttendance = async () => {
      setDataLoading(true);
      try {
        // Build list of all YYYY-MM-DD strings in the selected range
        const dateStrings: string[] = [];
        const cursor = new Date(appliedFilters.start);
        const endDay = new Date(appliedFilters.end);
        cursor.setHours(0, 0, 0, 0);
        endDay.setHours(0, 0, 0, 0);

        while (cursor <= endDay) {
          // Use local date string to avoid UTC/IST midnight shift
          const localDate = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
          dateStrings.push(localDate);
          cursor.setDate(cursor.getDate() + 1);
        }

        // Fetch all attendance docs for the range and merge logs
        const snaps = await Promise.all(
          dateStrings.map((dateStr) =>
            getDoc(
              doc(db, 'companies', currentUser.companyId, 'attendance', `${selectedUserId}_${dateStr}`)
            )
          )
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

        setAttendance(foundAny ? merged : null);
      } catch (e) {
        console.error('useUserReport: failed to fetch attendance', e);
        setAttendance(null);
      } finally {
        setDataLoading(false);
      }
    };

    fetchAttendance();
  }, [currentUser, selectedUserId, appliedFilters]);

  // ── 4. Compute summary from filtered sales + attendance ───────────────────
  const summary = useMemo((): UserReportSummary | null => {
    if (!appliedFilters) return null;

    const filtered = allSales.filter((s) => {
      const inRange =
        s.createdAt >= appliedFilters.start &&
        s.createdAt <= appliedFilters.end;
      const byUser = s.salesmanId === selectedUserId;
      return inRange && byUser;
    });

    // DEBUG — remove once confirmed correct
    console.log('[useUserReport] selectedUserId:', selectedUserId);
    console.log('[useUserReport] allSales:', allSales.length, '| filtered:', filtered.length);
    console.log('[useUserReport] range:', new Date(appliedFilters.start).toDateString(), '→', new Date(appliedFilters.end).toDateString());

    // Sales KPIs
    const totalSales = filtered.reduce((a, s) => a + s.totalAmount, 0);
    const totalOrders = filtered.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const itemsSold = filtered.reduce(
      (a, s) => a + s.items.reduce((b, i) => b + (i.quantity || 0), 0),
      0,
    );

    // Payment breakdown
    const payments = filtered.reduce(
      (acc, s) => {
        acc.cash += s.paymentMethods.cash || 0;
        acc.upi += s.paymentMethods.upi || 0;
        acc.card += s.paymentMethods.card || 0;
        return acc;
      },
      { cash: 0, upi: 0, card: 0 },
    );
    const paymentTotal = payments.cash + payments.upi + payments.card;

    // Discounts / refunds / returns — extend if your schema stores these
    const discounts = 0;
    const refunds = 0;
    const returns = 0;

    // Attendance
    let clockIn = '—';
    let clockOut = '—';
    let workingSeconds = 0;
    let lateLogin = false;
    let attendancePct = 0;

    if (attendance) {
      // Calculate from log entries directly (more accurate for short/active sessions)
      const now = Date.now();
      let computedSeconds = 0;
      (attendance.log ?? []).forEach((entry) => {
        const checkIn = entry.checkIn;
        const checkOut = entry.checkOut ?? (attendance.status === 'Checked In' ? now : null);
        if (checkIn && checkOut) {
          computedSeconds += Math.floor((checkOut - checkIn) / 1000);
        }
      });
      workingSeconds = computedSeconds > 0
        ? computedSeconds
        : Math.floor((attendance.totalElapsedTime || 0) / 1000);

      // First check-in of the day
      const firstLog = attendance.log?.[0];
      if (firstLog?.checkIn) {
        const ciDate = new Date(firstLog.checkIn);
        clockIn = tsToTime(firstLog.checkIn);

        // Late login check
        const shiftStart = new Date(ciDate);
        shiftStart.setHours(
          SHIFT_START_HOUR,
          SHIFT_START_MINUTE,
          0,
          0,
        );
        const diffMin =
          (ciDate.getTime() - shiftStart.getTime()) / 60000;
        lateLogin = diffMin > LATE_THRESHOLD_MINUTES;
      }

      // Last check-out of the day
      const lastLog = attendance.log?.[attendance.log.length - 1];
      if (lastLog?.checkOut) {
        clockOut = tsToTime(lastLog.checkOut);
      } else if (attendance.status === 'Checked In') {
        clockOut = 'Active';
      }

      const startDay = new Date(appliedFilters.start);
      startDay.setHours(0, 0, 0, 0);
      const endDay = new Date(appliedFilters.end);
      endDay.setHours(0, 0, 0, 0);

      const totalDaysInRange =
        Math.round((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const presentDays = new Set(
        (attendance?.log ?? [])
          .filter((entry) => entry.checkIn)
          .map((entry) => {
            const d = new Date(entry.checkIn);
            return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          })
      ).size;

      attendancePct = totalDaysInRange > 0
        ? Math.round((presentDays / totalDaysInRange) * 100)
        : 0;
    }

    const workingHours = secondsToHm(workingSeconds);
    const activeTime = workingHours;

    // Velocity (based on working hours; fallback to 8h)
    const hoursWorked = workingSeconds > 0 ? workingSeconds / 3600 : 8;
    const salesPerHr =
      hoursWorked > 0 ? Math.round(totalSales / hoursWorked) : 0;
    const ordersPerHr =
      hoursWorked > 0 ? Math.round(totalOrders / hoursWorked) : 0;

    // Efficiency score: simple heuristic (extend with your own logic)
    const efficiencyPct =
      workingSeconds > 0
        ? Math.min(
          100,
          Math.round((workingSeconds / (8 * 3600)) * 100 * 0.8 +
            Math.min(totalSales / 5000, 1) * 20),
        )
        : 0;
    const efficiencyScore = Math.min(100, Math.round(efficiencyPct * 0.95 + 5));

    return {
      totalSales,
      totalOrders,
      avgOrderValue,
      itemsSold,
      payments,
      paymentTotal: paymentTotal > 0 ? paymentTotal : totalSales,
      discounts,
      refunds,
      returns,
      salesPerHr,
      ordersPerHr,
      clockIn,
      clockOut,
      workingHours,
      attendancePct,
      lateLogin,
      activeTime,
      efficiencyScore,
      efficiencyPct,
    };
  }, [allSales, appliedFilters, selectedUserId, attendance]);

  // ── 5. Top items from filtered sales ─────────────────────────────────────
  const topItems = useMemo(() => {
    if (!appliedFilters) return [];

    const filtered = allSales.filter((s) => {
      const inRange =
        s.createdAt >= appliedFilters.start &&
        s.createdAt <= appliedFilters.end;
      const byUser = s.salesmanId === selectedUserId;
      return inRange && byUser;
    });

    const map: Record<string, { qty: number; revenue: number }> = {};
    filtered.forEach((s) => {
      s.items.forEach((item) => {
        const name = item.name || 'Unknown Item';
        if (!map[name]) map[name] = { qty: 0, revenue: 0 };
        map[name].qty += item.quantity || 0;
        map[name].revenue += (item.effectiveUnitPrice ?? item.price ?? 0) * (item.quantity || 0);
      });
    });

    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [allSales, appliedFilters, selectedUserId]);

  // ── Expose ────────────────────────────────────────────────────────────────
  return {
    // Auth
    currentUser,
    authLoading,

    // Staff
    staffList,
    selectedUserId,
    setSelectedUserId,
    staffLoading,

    // Date filter
    datePreset,
    setDatePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    appliedFilters,
    setAppliedFilters,

    // Data
    summary,
    topItems,
    isLoading: dataLoading || staffLoading,
    error,

    // Helpers exposed for component use
    formatDateForInput,
  };
}
