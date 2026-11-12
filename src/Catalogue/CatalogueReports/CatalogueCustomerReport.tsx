import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import BackButton from '../../Components/BackButton';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Filter,
  IndianRupee,
  Scale,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { collection, onSnapshot, query, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { Modal } from '../../constants/Modal';
import { customerBelongsTo, customerSourceFields, type CustomerSourceFields } from '../../constants/customerSource';
import { State } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import useCustomerReport from '../hooks/useCustomerReport';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import sellarLogo from '../../assets/sellar-logo.png';
import {
  DATE_PRESETS,
  formatCurrency,
  formatDateForInput,
  formatDayMonth,
  formatPhone,
  formatRangeLabel,
  getPresetRange,
  parseInputDate,
} from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import DownloadMenu from '../../Pages/Reports/SalesReportComponents/DownloadMenu';
import CustomRangePanel from '../../Pages/Reports/SalesReportComponents/CustomRangePanel';
import DetailPanel, {
  DetailRows,
  DetailSection,
} from '../../Pages/Reports/SalesReportComponents/DetailPanel';

type RowFilter = 'all' | 'dues' | 'noname';
type SortKey = 'name' | 'bills' | 'sales' | 'lastVisit' | 'due' | 'creditNote';

interface BillLine {
  id: string;
  invoiceNumber: string;
  date: number;
  amount: number;
  due: number;
}

interface DueEntry {
  date: number;
  amount: number;
  isOpeningBalance: boolean;
}

interface CustomerRow {
  key: string;
  name: string;
  phone: string;
  bills: number;
  sales: number;
  due: number;
  creditNote: number;
  lastVisit: number;
  dueEntries: DueEntry[];
  recentBills: BillLine[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const displayName = (r: { name: string; phone: string }) =>
  r.name || (r.phone ? `No name (${formatPhone(r.phone)})` : 'Walk-in');

/* ---------- PDF HELPERS (same look as Sales Report PDF, catalogue orange) ---------- */
type RGB = [number, number, number];
const PDF_RADIUS = 0.5; // ≈ Tailwind rounded-sm

const toDataUrl = async (src: string): Promise<string | null> => {
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const drawGradientRect = (pdf: jsPDF, x: number, y: number, w: number, h: number, from: RGB, to: RGB) => {
  const steps = 120;
  const sw = w / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    pdf.setFillColor(
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    );
    pdf.rect(x + i * sw, y, sw + 0.3, h, 'F');
  }
};

const fmtDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
};

const fmt2 = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CatalogueCustomerReport: React.FC = () => {
  const {
    navigate,
    sales,
    loading,
    error,
    authLoading,
    datePreset,
    setDatePreset,
    startDate,
    endDate,
    appliedFilters,
    setAppliedFilters,
    isListVisible,
    setIsListVisible,
    feedbackModal,
    setFeedbackModal,
    currentUser,
    setStartDate,
    setEndDate,
  } = useCustomerReport();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [customerCreditMap, setCustomerCreditMap] = useState<Record<string, number>>({});
  // Customers master list: a customer whose only order was deleted still shows up
  // if their customer record was created inside the applied date range.
  const [customersMasterList, setCustomersMasterList] = useState<
    ({ name: string; number: string; createdAt?: number } & CustomerSourceFields)[]
  >([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'sales',
    direction: 'desc',
  });

  useEffect(() => {
    const fetchCompanyName = async () => {
      if (!currentUser?.companyId) return;
      try {
        const ref = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
        const snap = await getDoc(ref);
        if (snap.exists()) setCompanyName(snap.data().businessName || '');
      } catch (e) {
        console.error('Failed to fetch company name', e);
      }
    };
    fetchCompanyName();
  }, [currentUser?.companyId]);

  useEffect(() => {
    if (!currentUser?.companyId) {
      setCustomerCreditMap({});
      return;
    }
    const customersRef = collection(db, 'companies', currentUser.companyId, 'customers');
    const unsubscribe = onSnapshot(
      query(customersRef),
      (snapshot) => {
        const nextMap: Record<string, number> = {};
        const nextMasterList: ({ name: string; number: string; createdAt?: number } & CustomerSourceFields)[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const credit = Number(data.creditBalance || 0);
          const numberKey = String(data.number || '').trim();
          const nameKey = String(data.name || '').trim().toLowerCase();

          if (numberKey) nextMap[`num:${numberKey}`] = Number.isFinite(credit) ? credit : 0;
          if (nameKey) nextMap[`name:${nameKey}`] = Number.isFinite(credit) ? credit : 0;

          const createdAtValue = data.createdAt as { toMillis?: () => number } | undefined;
          nextMasterList.push({
            name: String(data.name || 'Unknown'),
            number: numberKey || docSnap.id,
            createdAt: typeof createdAtValue?.toMillis === 'function' ? createdAtValue.toMillis() : undefined,
            ...customerSourceFields(data),
          });
        });
        setCustomerCreditMap(nextMap);
        setCustomersMasterList(nextMasterList);
      },
      () => {
        setCustomerCreditMap({});
        setCustomersMasterList([]);
      },
    );
    return unsubscribe;
  }, [currentUser?.companyId]);

  // Re-render every minute so "days overdue" stays accurate.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /* ---------- RANGE ---------- */
  const rangeStartMs = appliedFilters.start ? new Date(appliedFilters.start).getTime() : 0;
  const rangeEndMs = appliedFilters.end ? new Date(appliedFilters.end).getTime() : Infinity;
  const labelStartMs = appliedFilters.start
    ? new Date(appliedFilters.start).getTime()
    : parseInputDate(startDate).getTime();
  const labelEndMs = appliedFilters.end
    ? new Date(appliedFilters.end).getTime()
    : parseInputDate(endDate).getTime();

  const handleDatePresetChange = (preset: string) => {
    const range = getPresetRange(preset);
    if (!range) return;
    setDatePreset(preset);
    setIsRangeOpen(false);
    setStartDate(formatDateForInput(range.start));
    setEndDate(formatDateForInput(range.end));
    setAppliedFilters({ start: range.start.toISOString(), end: range.end.toISOString() });
  };

  const handleApplyCustomRange = (startValue: string, endValue: string) => {
    const start = parseInputDate(startValue);
    start.setHours(0, 0, 0, 0);
    const end = parseInputDate(endValue);
    end.setHours(23, 59, 59, 999);
    setDatePreset('custom');
    setStartDate(startValue);
    setEndDate(endValue);
    setAppliedFilters({ start: start.toISOString(), end: end.toISOString() });
    setIsRangeOpen(false);
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  /* ---------- ROWS + SUMMARY ---------- */
  // Date range + search: drives the summary cards and the two insight cards.
  const rows: CustomerRow[] = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    const blank = (key: string, name: string, phone: string): CustomerRow => ({
      key,
      name,
      phone,
      bills: 0,
      sales: 0,
      due: 0,
      creditNote: 0,
      lastVisit: 0,
      dueEntries: [],
      recentBills: [],
    });

    // POS customers share the customers collection; only catalogue customers are listed here
    customersMasterList
      .filter((c) => c.createdAt !== undefined && c.createdAt >= rangeStartMs && c.createdAt <= rangeEndMs && customerBelongsTo('catalogue', c))
      .forEach((c) => {
        const key = `${c.name}-${c.number}`;
        map.set(key, blank(key, c.name, c.number || ''));
      });

    sales.forEach((sale) => {
      const t = sale.createdAt.getTime();
      if (t < rangeStartMs || t > rangeEndMs) return;

      const key = `${sale.partyName}-${sale.partyNumber}`;
      if (!map.has(key)) map.set(key, blank(key, sale.partyName || '', sale.partyNumber || ''));
      const row = map.get(key)!;

      const isOpening = !!(sale as any).isOpeningBalance;
      const due = sale.dueAmount || 0;

      if (!isOpening) {
        row.bills += 1;
        row.sales += sale.totalAmount;
        row.lastVisit = Math.max(row.lastVisit, t);
        row.recentBills.push({
          id: String((sale as any).id ?? `${key}-${t}`),
          invoiceNumber: String((sale as any).invoiceNumber ?? (sale as any).orderId ?? '—'),
          date: t,
          amount: sale.totalAmount,
          due: due > 0 ? due : 0,
        });
      }
      if (due > 0) {
        row.due += due;
        row.dueEntries.push({ date: t, amount: due, isOpeningBalance: isOpening });
      }
    });

    let result = Array.from(map.values()).map((row) => {
      const byNumber = customerCreditMap[`num:${row.phone}`];
      const byName = customerCreditMap[`name:${row.name.toLowerCase()}`];
      const creditNote = byNumber ?? byName ?? 0;
      return {
        ...row,
        creditNote: Math.max(0, Number(creditNote || 0)),
        recentBills: [...row.recentBills].sort((a, b) => b.date - a.date),
      };
    });

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const qDigits = q.replace(/\D/g, '');
      result = result.filter(
        (r) =>
          displayName(r).toLowerCase().includes(q) || (!!qDigits && r.phone.replace(/\D/g, '').includes(qDigits)),
      );
    }
    return result;
  }, [sales, customersMasterList, customerCreditMap, rangeStartMs, rangeEndMs, searchQuery]);

  const summary = useMemo(() => {
    const totalSales = rows.reduce((s, r) => s + r.sales, 0);
    const totalBills = rows.reduce((s, r) => s + r.bills, 0);
    const totalDue = rows.reduce((s, r) => s + r.due, 0);
    const totalCredit = rows.reduce((s, r) => s + r.creditNote, 0);
    const buying = rows.filter((r) => r.bills > 0).length;
    const duesOnly = rows.filter((r) => r.bills === 0 && r.due > 0).length;
    const debtors = rows.filter((r) => r.due > 0).sort((a, b) => b.due - a.due);
    const dueEntries = rows.flatMap((r) => r.dueEntries);
    const ageDays = (t: number) => Math.max(0, Math.floor((now - t) / DAY_MS));
    const oldestDays = dueEntries.length ? Math.max(...dueEntries.map((e) => ageDays(e.date))) : 0;
    return {
      totalCustomers: rows.length,
      totalSales,
      totalBills,
      totalDue,
      totalCredit,
      buying,
      duesOnly,
      debtors,
      oldestDays,
      due0to30: dueEntries.filter((e) => ageDays(e.date) <= 30).reduce((s, e) => s + e.amount, 0),
      due30plus: dueEntries.filter((e) => ageDays(e.date) > 30).reduce((s, e) => s + e.amount, 0),
      averageSalePerCustomer: rows.length > 0 ? totalSales / rows.length : 0,
    };
  }, [rows, now]);

  const topBuyers = useMemo(
    () => rows.filter((r) => r.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 4),
    [rows],
  );

  // Row filter + sort: drives the list and the downloads.
  const listRows = useMemo(() => {
    const list = rows.filter((r) =>
      rowFilter === 'dues' ? r.due > 0 : rowFilter === 'noname' ? !r.name : true,
    );
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortConfig.key === 'name') return displayName(a).localeCompare(displayName(b)) * dir;
      return (a[sortConfig.key] - b[sortConfig.key]) * dir;
    });
    return list;
  }, [rows, rowFilter, sortConfig]);

  const listTotals = useMemo(
    () => ({
      bills: listRows.reduce((s, r) => s + r.bills, 0),
      sales: listRows.reduce((s, r) => s + r.sales, 0),
      due: listRows.reduce((s, r) => s + r.due, 0),
      credit: listRows.reduce((s, r) => s + r.creditNote, 0),
    }),
    [listRows],
  );

  // Shape the export code below uses.
  const customerRows = listRows.map((r) => ({
    customerName: displayName(r),
    customerNumber: r.phone ? formatPhone(r.phone) : 'N/A',
    totalBills: r.bills,
    totalSales: r.sales,
    totalDue: r.due,
    creditNote: r.creditNote,
  }));
  const exportSummary = {
    totalCustomers: listRows.length,
    totalBills: listTotals.bills,
    totalSales: listTotals.sales,
    totalDue: listTotals.due,
    averageSalePerCustomer: listRows.length > 0 ? listTotals.sales / listRows.length : 0,
  };

  /* ---------- EXPORT HELPERS ---------- */
  const downloadAsExcel = () => {
    try {
      const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
        font: { name: 'Arial', ...font },
        fill: fill ?? {},
        alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
        border: border ?? {},
      });
      const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
      const allBorders = {
        top: { style: 'thin', color: { rgb: 'FED7AA' } },
        bottom: { style: 'thin', color: { rgb: 'FED7AA' } },
        left: { style: 'thin', color: { rgb: 'FED7AA' } },
        right: { style: 'thin', color: { rgb: 'FED7AA' } },
      };
      const bblr = {
        bottom: { style: 'thin', color: { rgb: 'FED7AA' } },
        left: { style: 'thin', color: { rgb: 'FED7AA' } },
        right: { style: 'thin', color: { rgb: 'FED7AA' } },
      };

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const periodLabel = `Period: ${startDate} – ${endDate}`;

      const COLS = [
        { header: '#', width: 6 },
        { header: 'Customer', width: 24 },
        { header: 'Phone', width: 20 },
        { header: 'Bills', width: 16 },
        { header: 'Sales (₹)', width: 28 },
        { header: 'Due (₹)', width: 26 },
        { header: 'Credit Note (₹)', width: 26 },
      ];
      const colCount = COLS.length;

      // 0 Title | 1 Meta | 2 spacer | 3 Summary label | 4 Summary values | 5 spacer | 6 Headers | 7+ Data | Last: Totals
      const dataStartRow = 7;
      const totalRows = dataStartRow + customerRows.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      aoa[0][0] = companyName ? `Customer Report  —  ${companyName}` : 'Customer Report';
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Customers: ${exportSummary.totalCustomers}`;
      aoa[3][0] = 'SUMMARY';
      aoa[4][0] = `Total Customers: ${exportSummary.totalCustomers}   |   Total Sales: ₹${exportSummary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Total Due: ₹${exportSummary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Sale: ₹${Math.round(exportSummary.averageSalePerCustomer).toLocaleString('en-IN')}`;

      COLS.forEach((c, i) => {
        aoa[6][i] = c.header;
      });

      customerRows.forEach((row, idx) => {
        const r = dataStartRow + idx;
        aoa[r][0] = idx + 1;
        aoa[r][1] = row.customerName;
        aoa[r][2] = row.customerNumber || 'N/A';
        aoa[r][3] = row.totalBills;
        aoa[r][4] = Math.round(row.totalSales);
        aoa[r][5] = Math.round(Math.max(0, row.totalDue));
        aoa[r][6] = Math.round(row.creditNote || 0);
      });

      const footerRow = dataStartRow + customerRows.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${customerRows.length} customers`;
      aoa[footerRow][3] = exportSummary.totalBills;
      aoa[footerRow][4] = Math.round(exportSummary.totalSales);
      aoa[footerRow][5] = Math.round(exportSummary.totalDue);
      aoa[footerRow][6] = Math.round(customerRows.reduce((sum, c) => sum + (c.creditNote || 0), 0));

      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map((c) => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 },
        { hpt: 20 },
        { hpt: 8 },
        { hpt: 18 },
        { hpt: 22 },
        { hpt: 8 },
        { hpt: 28 },
        ...customerRows.map(() => ({ hpt: 20 })),
        { hpt: 24 },
      ];
      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
        { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 2 } },
      ];

      const style = (addr: string, st: any) => {
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
        worksheet[addr].s = st;
      };

      style('A1', s({ sz: 16, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('EA580C'), { horizontal: 'center', vertical: 'center' }));
      style('A2', s({ sz: 9, italic: true, color: { rgb: '7C2D12' } }, solidFill('FFEDD5'), { horizontal: 'center', vertical: 'center' }));
      style('A4', s({ sz: 10, bold: true, color: { rgb: 'C2410C' } }, solidFill('FFF7ED'), { horizontal: 'left', vertical: 'center' }, allBorders));
      style('A5', s({ sz: 10, bold: true, color: { rgb: '9A3412' } }, solidFill('FFF7ED'), { horizontal: 'center', vertical: 'center' }, bblr));

      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s({ sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('C2410C'), { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' }, allBorders));
      });

      const currencyCols = new Set([4, 5, 6]);

      customerRows.forEach((_row, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'FFF7ED' : 'FFFFFF');
        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isCurrency = currencyCols.has(ci);
          const isNumeric = ci === 3 || isCurrency;
          style(addr, s({ sz: 9, color: { rgb: '1E293B' } }, rowBg, { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' }, bblr));
          if (worksheet[addr] && isCurrency) {
            worksheet[addr].t = 'n';
            worksheet[addr].z = '₹#,##0.00';
          }
        }
      });

      for (let ci = 0; ci < colCount; ci++) {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: '1E293B' } },
          solidFill('FED7AA'),
          { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'FED7AA' } },
            right: { style: 'thin', color: { rgb: 'FED7AA' } },
          },
        ));
        if (currencyCols.has(ci) && worksheet[addr]) {
          worksheet[addr].t = 'n';
          worksheet[addr].z = '₹#,##0.00';
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Report');
      XLSX.writeFile(workbook, `Customer-Report-${startDate}-to-${endDate}.xlsx`);

      setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
    } catch {
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel file.' });
    }
  };

  const downloadAsPdf = async () => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const M = 14;
      const PAD = 4;
      const brandRight = pageWidth - M;
      const contentW = pageWidth - M * 2;
      const company = companyName || 'Your Business';
      const customerWord = (n: number) => (n === 1 ? 'customer' : 'customers');
      const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

      const generatedAtText = `Generated ${new Date().toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })}`;
      const periodText = `${fmtDay(labelStartMs)} – ${fmtDay(labelEndMs)}`;
      const periodDays = Math.max(1, Math.round((labelEndMs - labelStartMs) / 86400000));

      const totalCredit = customerRows.reduce((sum, c) => sum + (c.creditNote || 0), 0);
      const owingCount = customerRows.filter((c) => c.totalDue > 0).length;

      // ---------- ASSETS ----------
      const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId).catch(() => null);
      const sellarImg = await toDataUrl(sellarLogo);

      const drawCompanyTile = (x: number, y: number, size: number, onDark: boolean) => {
        let drawn = false;
        if (base64Logo) {
          try {
            const props = pdf.getImageProperties(base64Logo);
            const maxSide = size - size * 0.22;
            const scale = Math.min(maxSide / props.width, maxSide / props.height);
            const w = props.width * scale;
            const h = props.height * scale;
            pdf.setFillColor(255, 255, 255);
            if (onDark) {
              pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'F');
            } else {
              pdf.setDrawColor(229, 231, 235);
              pdf.setLineWidth(0.3);
              pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'FD');
            }
            pdf.addImage(base64Logo, props.fileType, x + (size - w) / 2, y + (size - h) / 2, w, h);
            drawn = true;
          } catch {
            // invalid logo -> initial fallback
          }
        }
        if (!drawn) {
          if (onDark) pdf.setFillColor(154, 52, 18);
          else pdf.setFillColor(194, 65, 12);
          pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(size * 0.9);
          pdf.text((companyName.trim().charAt(0) || 'S').toUpperCase(), x + size / 2, y + size / 2, { align: 'center', baseline: 'middle' });
        }
      };

      // ---------- 1. HEADER (gradient) ----------
      drawGradientRect(pdf, 0, 0, pageWidth, 64, [194, 65, 12], [249, 115, 22]);
      drawCompanyTile(M, 11, 14, true);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(255, 237, 213);
      pdf.text('Prepared for', 32, 15);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(255, 255, 255);
      pdf.text(company, 32, 22);

      // SELLAR logo + text (top-right, white pill)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      const brandTextW = pdf.getTextWidth('SELLAR') + 5 * 0.3;
      const sellarLh = 5;
      let sellarLw = 0;
      if (sellarImg) {
        try {
          const lp = pdf.getImageProperties(sellarImg);
          sellarLw = (lp.width / lp.height) * sellarLh;
        } catch {
          // continue without SELLAR logo
        }
      }
      const pillPadX = 3;
      const pillW = brandTextW + (sellarLw ? sellarLw + 2 : 0) + pillPadX * 2;
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(brandRight - pillW, 7.5, pillW, 8, PDF_RADIUS, PDF_RADIUS, 'F');
      if (sellarImg && sellarLw) {
        pdf.addImage(sellarImg, 'PNG', brandRight - pillPadX - brandTextW - sellarLw - 2, 9, sellarLw, sellarLh);
      }
      pdf.setTextColor(0, 0, 0);
      pdf.text('SELLAR', brandRight - pillPadX, 12.6, { align: 'right', charSpace: 0.3 });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(255, 237, 213);
      pdf.text(generatedAtText, brandRight, 21, { align: 'right' });

      // Title block (left): icon tile + title + subtitle
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(M, 31, 14, 14, PDF_RADIUS, PDF_RADIUS, 'F');
      const ix = M + 3.5;
      const iy = 31 + 3.5;
      const k = 7 / 24;
      const seg = (pts: [number, number][]) => {
        for (let i = 0; i < pts.length - 1; i++) {
          pdf.line(ix + pts[i][0] * k, iy + pts[i][1] * k, ix + pts[i + 1][0] * k, iy + pts[i + 1][1] * k);
        }
      };
      pdf.setDrawColor(194, 65, 12);
      pdf.setLineWidth(0.5);
      pdf.setLineCap('round');
      pdf.setLineJoin('round');
      seg([[15, 2], [6, 2], [4, 4], [4, 20], [6, 22], [18, 22], [20, 20], [20, 7], [15, 2]]);
      seg([[14, 2], [14, 6], [16, 8], [20, 8]]);
      seg([[10, 9], [8, 9]]);
      seg([[16, 13], [8, 13]]);
      seg([[16, 17], [8, 17]]);
      pdf.setLineCap('butt');
      pdf.setLineJoin('miter');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(26);
      pdf.setTextColor(255, 255, 255);
      pdf.text('Customer Report', 32, 38);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(255, 237, 213);
      pdf.text('Sales, dues and credit notes by customer', 32, 44.5);

      // Report period (right)
      pdf.setFontSize(9);
      pdf.text('Report period', brandRight, 34, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(255, 255, 255);
      pdf.text(periodText, brandRight, 40.5, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(255, 237, 213);
      pdf.text(`${periodDays} days`, brandRight, 45.5, { align: 'right' });

      // ---------- 2. SUMMARY CARDS ----------
      const cardY = 50;
      const cardH = 32;
      const kpiPad = 6;
      const cardsData = [
        {
          label: 'Total sales',
          value: rs(exportSummary.totalSales),
          hint: `${exportSummary.totalBills} ${exportSummary.totalBills === 1 ? 'bill' : 'bills'}`,
        },
        {
          label: 'Customers',
          value: String(exportSummary.totalCustomers),
          hint: `avg ${rs(exportSummary.averageSalePerCustomer)} each`,
        },
        {
          label: 'Total due',
          value: rs(exportSummary.totalDue),
          hint: exportSummary.totalDue > 0 ? `${owingCount} ${customerWord(owingCount)} owe you` : 'nothing to collect',
        },
        {
          label: 'Credit notes',
          value: rs(totalCredit),
          hint: 'you owe customers',
        },
      ];
      const cardW = contentW / cardsData.length;

      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'F');
      pdf.setFillColor(255, 237, 213);
      pdf.roundedRect(M, cardY, cardW, cardH, PDF_RADIUS, PDF_RADIUS, 'F');
      pdf.rect(M + cardW - 2, cardY, 2, cardH, 'F');
      pdf.setDrawColor(254, 215, 170);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'S');
      for (let i = 1; i < cardsData.length; i++) {
        pdf.line(M + cardW * i, cardY, M + cardW * i, cardY + cardH);
      }

      cardsData.forEach((c, i) => {
        const cx = M + cardW * i + kpiPad;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9.5);
        pdf.setTextColor(100, 110, 135);
        pdf.text(c.label, cx, cardY + 9);

        // shrink the value font so it fits inside the card
        pdf.setFont('helvetica', 'bold');
        let vSize = 15;
        pdf.setFontSize(vSize);
        const maxW = cardW - kpiPad * 2;
        const vw = pdf.getTextWidth(c.value);
        if (vw > maxW) {
          vSize = (vSize * maxW) / vw;
          pdf.setFontSize(vSize);
        }
        if (i === 0) pdf.setTextColor(194, 65, 12);
        else if (i === 2 && exportSummary.totalDue > 0) pdf.setTextColor(161, 98, 7);
        else pdf.setTextColor(17, 24, 39);
        pdf.text(c.value, cx, cardY + 20);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(120, 128, 150);
        pdf.text(c.hint, cx, cardY + 27);
      });

      // ---------- 3. CUSTOMERS TABLE ----------
      const tableTitleY = cardY + cardH + 14;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(17, 24, 39);
      pdf.text('Customers', M, tableTitleY);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text(`${customerRows.length} ${customerWord(customerRows.length)}`, brandRight, tableTitleY, { align: 'right' });

      // Customer | Phone | Bills | Sales | Due | Credit  (total = contentW = 182mm)
      const COLW = [42, 32, 20, 32, 28, 28];
      const numStart = 2;

      autoTable(pdf, {
        startY: tableTitleY + 4,
        margin: { top: 26, bottom: 22, left: M, right: M },
        head: [['Customer', 'Phone', 'Bills', 'Sales (Rs.)', 'Due (Rs.)', 'Credit (Rs.)']],
        body: customerRows.map((c) => [
          { content: c.customerName, styles: { fontStyle: 'bold' } },
          c.customerNumber || 'N/A',
          String(c.totalBills),
          fmt2(c.totalSales),
          {
            content: fmt2(Math.max(0, c.totalDue)),
            styles: { textColor: c.totalDue > 0 ? ([161, 98, 7] as RGB) : ([17, 24, 39] as RGB) },
          },
          fmt2(c.creditNote || 0),
        ]),
        foot: [[
          'Total',
          `${customerRows.length} ${customerWord(customerRows.length)}`,
          String(exportSummary.totalBills),
          fmt2(exportSummary.totalSales),
          fmt2(exportSummary.totalDue),
          fmt2(totalCredit),
        ]],
        showFoot: 'lastPage',
        theme: 'plain',
        styles: {
          font: 'helvetica',
          fontSize: 10,
          cellPadding: { top: 3.4, bottom: 3.4, left: PAD, right: PAD },
          textColor: [17, 24, 39],
          lineWidth: 0,
          overflow: 'linebreak',
        },
        headStyles: { fillColor: [255, 247, 237], textColor: [154, 52, 18], fontStyle: 'bold', fontSize: 9.5 },
        footStyles: { fillColor: [255, 247, 237], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 10 },
        columnStyles: Object.fromEntries(
          COLW.map((w, i) => [i, i >= numStart ? { cellWidth: w, halign: 'right' } : { cellWidth: w }]),
        ),
        didParseCell: (data) => {
          data.cell.styles.valign = 'middle';

          // Header and Total row: numeric columns right-aligned, same as body
          if (data.section !== 'body' && data.column.index >= numStart) {
            data.cell.styles.halign = 'right';
          }

          // Phone: keep on one line, shrink font if it is still too wide
          if (data.section === 'body' && data.column.index === 1) {
            const base = Number(data.cell.styles.fontSize) || 10;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(base);
            const w = pdf.getTextWidth(data.cell.text.join(' '));
            const avail = COLW[1] - PAD * 2;
            if (w > avail) data.cell.styles.fontSize = Math.max((base * avail) / w, 6);
          }

          // Footer count text is lighter, like the other report PDFs
          if (data.section === 'foot' && data.column.index === 1) {
            data.cell.styles.fontStyle = 'normal';
            data.cell.styles.textColor = [107, 114, 128];
          }

          // Very long total -> shrink the font so it doesn't wrap
          if (data.section === 'foot' && data.column.index >= 3) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            const w = pdf.getTextWidth(data.cell.text.join(' '));
            const avail = COLW[data.column.index] - PAD * 2;
            if (w > avail) data.cell.styles.fontSize = (10 * avail) / w;
          }
        },
        didDrawCell: (data) => {
          const { x, y, width, height } = data.cell;

          // Vertical column lines (grid)
          pdf.setDrawColor(254, 215, 170);
          pdf.setLineWidth(0.2);
          pdf.line(x + width, y, x + width, y + height);
          if (data.column.index === 0) pdf.line(x, y, x, y + height);

          // Horizontal lines
          if (data.section === 'head') {
            pdf.setDrawColor(194, 65, 12);
            pdf.setLineWidth(0.5);
            pdf.line(x, y + height, x + width, y + height);
          }
          if (data.section === 'body') {
            pdf.setDrawColor(254, 215, 170);
            pdf.setLineWidth(0.2);
            pdf.line(x, y + height, x + width, y + height);
          }
          if (data.section === 'foot') {
            pdf.setDrawColor(17, 24, 39);
            pdf.setLineWidth(0.5);
            pdf.line(x, y, x + width, y);
            pdf.line(x, y + height, x + width, y + height);
          }
        },
      });

      // ---------- 4. PAGE 2+ MINI HEADER + FOOTER (every page) ----------
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);

        if (i > 1) {
          drawCompanyTile(M, 9, 9, false);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(17, 24, 39);
          pdf.text(company, M + 12, 15.4);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          pdf.text(`Customer Report | ${periodText}`, brandRight, 15.4, { align: 'right' });
        }

        // FOOTER: SELLAR logo + SELLAR text + generated time + page number
        const fy = pageHeight - 12;
        let fx = M;
        if (sellarImg) {
          try {
            const lp = pdf.getImageProperties(sellarImg);
            const lh = 5;
            const lw = (lp.width / lp.height) * lh;
            pdf.addImage(sellarImg, 'PNG', fx, fy - 3.8, lw, lh);
            fx += lw + 2;
          } catch {
            // continue without footer logo
          }
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        pdf.text('SELLAR', fx, fy, { charSpace: 0.3 });
        fx += pdf.getTextWidth('SELLAR') + 5 * 0.3 + 4;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(generatedAtText, fx, fy);
        pdf.text(`${company} | Customer Report | Page ${i} of ${totalPages}`, brandRight, fy, { align: 'right' });
      }

      pdf.save(`Customer_Report_${startDate}_to_${endDate}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate PDF.' });
    }
  };

  /* ---------- DOWNLOAD / SHARE ---------- */
  const runDownload = (action: () => void) => {
    if (customerRows.length === 0) {
      setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data available to download.' });
      return;
    }
    action();
  };

  /* ---------- RENDER HELPERS ---------- */
  const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
  const shareOf = (value: number) => (summary.totalSales > 0 ? (value / summary.totalSales) * 100 : 0);

  const renderSortHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
    const isActive = sortConfig.key === key;
    const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => handleSort(key)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-orange-800 ${align === 'right' ? 'flex-row-reverse' : ''
            } ${isActive ? 'text-orange-800' : ''}`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  const renderAvatar = (row: CustomerRow) => (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-800">
      {row.name ? row.name[0].toUpperCase() : row.phone ? '?' : 'W'}
    </span>
  );

  // One customer, opened in the detail panel (side panel on desktop, bottom sheet on mobile).
  const renderCustomerPanel = (row: CustomerRow) => {
    const openingDues = row.dueEntries.filter((e) => e.isOpeningBalance);
    return (
      <DetailPanel
        open
        onClose={() => setExpandedKey(null)}
        title={displayName(row)}
        subtitle={[
          row.phone && formatPhone(row.phone),
          plural(row.bills, 'bill'),
          row.lastVisit > 0 && `last visit ${formatDayMonth(row.lastVisit)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        footer={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CATALOGUE_PARTY_LEDGER}`)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-sm bg-orange-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-800"
            >
              <Scale size={14} /> Party ledger
            </button>
          </div>
        }
      >
        <DetailSection title="This period">
          <DetailRows
            rows={[
              { label: 'Total sales', value: formatCurrency(row.sales), strong: true },
              { label: 'Bills', value: row.bills },
              { label: 'Share of sales', value: `${Math.round(shareOf(row.sales))}%` },
              {
                label: 'Due',
                value: row.due > 0 ? formatCurrency(row.due) : 'No due',
                tone: row.due > 0 ? 'text-yellow-700' : 'text-green-700',
              },
              ...(row.creditNote > 0 ? [{ label: 'Credit note', value: formatCurrency(row.creditNote) }] : []),
            ]}
          />
        </DetailSection>

        <DetailSection title={`Bills · ${row.recentBills.length}`}>
          {row.recentBills.length === 0 ? (
            <p className="rounded-sm bg-[#fff8f2] px-3 py-2.5 text-sm text-slate-500">No bills in this period.</p>
          ) : (
            <ul className="divide-y divide-[#f6e1d0] rounded-sm border border-[#f6e1d0]">
              {row.recentBills.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{b.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">{formatDayMonth(b.date)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-slate-900">{formatCurrency(b.amount)}</p>
                    {b.due > 0 && <p className="text-xs font-medium text-yellow-700">due {formatCurrency(b.due)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        {openingDues.length > 0 && (
          <DetailSection title="Opening balance">
            <DetailRows
              rows={openingDues.map((e, i) => ({
                label: `${formatDayMonth(e.date)}${openingDues.length > 1 ? ` (${i + 1})` : ''}`,
                value: `due ${formatCurrency(e.amount)}`,
                tone: 'text-yellow-700',
              }))}
            />
          </DetailSection>
        )}
      </DetailPanel>
    );
  };

  /* ---------- LOAD STATES ---------- */
  if (authLoading || loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#fff5ec] text-sm text-slate-500">
        Loading customers...
      </div>
    );
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  if (!currentUser) {
    navigate('/login');
    return null;
  }

  const rangeLabel = formatRangeLabel(labelStartMs, labelEndMs);
  const rangeLabelShort = formatRangeLabel(labelStartMs, labelEndMs, false);

  const perBuying = summary.buying > 0 ? Number((summary.totalBills / summary.buying).toFixed(1)) : 0;
  const statCards = [
    {
      label: 'Total customers',
      shortLabel: 'Customers',
      value: summary.totalCustomers.toString(),
      hint: `${summary.buying} bought${summary.duesOnly ? ` · ${summary.duesOnly} only ${summary.duesOnly === 1 ? 'has' : 'have'} dues` : ''}`,
      icon: Users,
      iconClass: 'bg-pink-50 text-pink-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Total bills',
      shortLabel: 'Bills',
      value: summary.totalBills.toString(),
      hint: `${perBuying} per buying customer`,
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Total due',
      shortLabel: 'Total due',
      value: formatCurrency(Math.round(summary.totalDue)),
      hint: summary.debtors.length
        ? `${plural(summary.debtors.length, 'customer')} · oldest ${plural(summary.oldestDays, 'day')}`
        : 'Nothing to collect',
      icon: IndianRupee,
      iconClass: 'bg-yellow-100 text-yellow-700',
      valueClass: summary.totalDue > 0 ? 'text-yellow-700' : 'text-slate-900',
    },
    {
      label: 'Avg sale / customer',
      shortLabel: 'Avg / customer',
      value: formatCurrency(Math.round(summary.averageSalePerCustomer)),
      hint: `${formatCurrency(Math.round(summary.totalSales))} across ${summary.totalCustomers}`,
      icon: TrendingUp,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-orange-700',
    },
  ];

  const topDebtor = summary.debtors[0];
  const topDebtorSince = topDebtor ? Math.min(...topDebtor.dueEntries.map((e) => e.date)) : 0;
  const otherDebtors = summary.debtors.length - 1;

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
      ? 'border-slate-900 bg-slate-900 text-white'
      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
    }`;

  return (
    <div className="min-h-full bg-[#fff5ec] px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
          theme="catalogue"
        />
      )}

      {/* HEADER */}
      <header className="mb-4 flex items-center gap-2 md:gap-3">
        <div className="flex-shrink-0">
          <BackButton />
        </div>

        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Customer report</h1>
            <span className="hidden text-xs text-slate-500 md:inline">
              {plural(summary.totalCustomers, 'customer')} · {rangeLabelShort}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500 md:hidden">{rangeLabel}</p>
        </div>

        {/* Desktop search */}
        <div className="relative hidden w-72 md:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer name or phone"
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Mobile actions */}
        <div className="flex items-center md:hidden">
          <button
            onClick={() => setShowSearch((v) => !v)}
            aria-label="Search"
            className="rounded-sm p-2 text-slate-700 transition hover:bg-slate-200"
          >
            <Search size={20} />
          </button>
          <DownloadMenu
            variant="icon"
            theme="catalogue"
            onExcel={() => runDownload(downloadAsExcel)}
            onPdf={() => runDownload(downloadAsPdf)}
          />
        </div>
      </header>

      {showSearch && (
        <div className="relative mb-3 md:hidden">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer name or phone"
            autoFocus
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
          />
          <button
            onClick={() => {
              setSearchQuery('');
              setShowSearch(false);
            }}
            aria-label="Close search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* DATE FILTERS */}
      <div className="relative mb-4 flex items-center gap-3">
        <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DATE_PRESETS.map((p) => (
            <button key={p.value} onClick={() => handleDatePresetChange(p.value)} className={chipClass(datePreset === p.value)}>
              <span className="md:hidden">{p.shortLabel}</span>
              <span className="hidden md:inline">{p.label}</span>
            </button>
          ))}
          <button onClick={() => setIsRangeOpen((o) => !o)} className={`md:hidden ${chipClass(datePreset === 'custom')}`}>
            Custom
          </button>
        </div>

        <button
          onClick={() => setIsRangeOpen((o) => !o)}
          className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 md:inline-flex ${datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'
            }`}
        >
          <CalendarDays size={15} className="text-slate-500" />
          {rangeLabel}
          <ChevronDown size={15} className="text-slate-500" />
        </button>

        {isRangeOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-full md:w-80">
            <CustomRangePanel
              initialStart={startDate}
              initialEnd={endDate}
              onApply={handleApplyCustomRange}
              onCancel={() => setIsRangeOpen(false)}
            />
          </div>
        )}
      </div>

      {/* SUMMARY — 2 cols on mobile, 4 cols on md+ */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        {statCards.map(({ label, shortLabel, value, hint, icon: Icon, iconClass, valueClass }) => (
          <div key={label} className="min-w-0 rounded-sm border border-[#f6e1d0] bg-white shadow-card p-3 md:p-4">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                <Icon size={14} />
              </span>
              <span className="truncate text-xs font-medium text-slate-700 md:text-sm">
                <span className="md:hidden">{shortLabel}</span>
                <span className="hidden md:inline">{label}</span>
              </span>
            </div>
            <p className={`mt-2 truncate text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
            <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
          </div>
        ))}
      </div>

      {/* MOBILE: who owes the most */}
      {topDebtor && (
        <div className="mb-3 rounded-sm border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 md:hidden">
          <span className="font-medium">{displayName(topDebtor)}</span> owes {formatCurrency(Math.round(topDebtor.due))}
          {otherDebtors > 0 && <span className="text-xs"> · +{otherDebtors} more</span>}
        </div>
      )}

      {/* INSIGHT CARDS (desktop) */}
      <div className="mb-4 hidden gap-4 md:grid md:grid-cols-2">
        <div className="rounded-sm border border-[#f6e1d0] bg-white shadow-card p-4">
          <h3 className="text-sm font-semibold text-slate-900">Who buys the most</h3>
          {topBuyers.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">No sales in this period.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {topBuyers.map((r) => (
                <li key={r.key}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-slate-700">
                      {displayName(r)} · {plural(r.bills, 'bill')}
                    </span>
                    <span className="shrink-0 font-semibold text-slate-900">
                      {formatCurrency(r.sales)} · {Math.round(shareOf(r.sales))}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-slate-100">
                    <div className="h-full rounded-sm bg-orange-500" style={{ width: `${shareOf(r.sales)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col rounded-sm border border-[#f6e1d0] bg-white shadow-card p-4">
          <h3 className="text-sm font-semibold text-slate-900">Money to collect</h3>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Due 0–30 days</dt>
              <dd className={`font-semibold ${summary.due0to30 > 0 ? 'text-yellow-700' : 'text-slate-900'}`}>
                {formatCurrency(Math.round(summary.due0to30))}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Due 30+ days</dt>
              <dd className={`font-semibold ${summary.due30plus > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {formatCurrency(Math.round(summary.due30plus))}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Credit notes you owe</dt>
              <dd className="font-semibold text-slate-900">{formatCurrency(Math.round(summary.totalCredit))}</dd>
            </div>
          </dl>
          {topDebtor && (
            <div className="mt-auto pt-4">
              <p className="rounded-sm border border-yellow-200 bg-yellow-50 p-2.5 text-xs text-yellow-800">
                <span className="font-medium">{displayName(topDebtor)}</span> owes{' '}
                {formatCurrency(Math.round(topDebtor.due))} since {formatDayMonth(topDebtorSince)}.
                {otherDebtors > 0 &&
                  ` ${plural(otherDebtors, 'more customer')} ${otherDebtors === 1 ? 'owes' : 'owe'} too.`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* REPORT DETAILS */}
      {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
      <section className="rounded-sm border border-[#f6e1d0] bg-white shadow-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              <span className="md:hidden">Customers</span>
              <span className="hidden md:inline">Report details</span>
            </h2>
            <span className="hidden rounded-sm bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 md:inline">
              {plural(listRows.length, 'customer')}
            </span>
          </div>

          {/* Desktop controls */}
          <div className="hidden items-center gap-2 md:flex">
            <div className="relative">
              <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={rowFilter}
                onChange={(e) => setRowFilter(e.target.value as RowFilter)}
                className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-orange-600"
              >
                <option value="all">All customers</option>
                <option value="dues">With dues</option>
                <option value="noname">No name</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
            <button
              onClick={() => setIsListVisible(!isListVisible)}
              className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {isListVisible ? <EyeOff size={15} /> : <Eye size={15} />}
              {isListVisible ? 'Hide list' : 'Show list'}
            </button>
            <DownloadMenu
              theme="catalogue"
              onExcel={() => runDownload(downloadAsExcel)}
              onPdf={() => runDownload(downloadAsPdf)}
            />
          </div>

          {/* Mobile sort */}
          <div className="relative md:hidden">
            <select
              value={sortConfig.key}
              onChange={(e) =>
                setSortConfig({
                  key: e.target.value as SortKey,
                  direction: e.target.value === 'name' ? 'asc' : 'desc',
                })
              }
              className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-orange-600"
            >
              <option value="sales">Top sales</option>
              <option value="due">Most due</option>
              <option value="lastVisit">Recent visit</option>
              <option value="bills">Most bills</option>
              <option value="name">Name A–Z</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>

        {/* Desktop table */}
        {isListVisible && (
          <div className="hidden overflow-x-auto rounded-b-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-[#fff8f2] text-[11px] text-orange-800/80">
                <tr>
                  {renderSortHeader('Customer', 'name')}
                  {renderSortHeader('Bills', 'bills')}
                  {renderSortHeader('Total sales', 'sales', 'right')}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Share</th>
                  {renderSortHeader('Last visit', 'lastVisit')}
                  {renderSortHeader('Total due', 'due', 'right')}
                  {renderSortHeader('Credit note', 'creditNote', 'right')}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {listRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No customers in this period. They appear here once an order has their name or phone.
                    </td>
                  </tr>
                )}
                {listRows.map((row) => {
                  const isOpen = expandedKey === row.key;
                  const share = shareOf(row.sales);
                  return (
                    <tr
                      key={row.key}
                      onClick={() => setExpandedKey(row.key)}
                      className={`cursor-pointer border-t border-[#f6e1d0] transition ${isOpen ? 'bg-orange-100' : 'hover:bg-[#fff8f2]'
                        }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {renderAvatar(row)}
                          <div className="min-w-0">
                            <p className={`truncate font-semibold ${row.name ? 'text-slate-900' : 'text-slate-500'}`}>
                              {displayName(row)}
                            </p>
                            {row.phone && <p className="text-xs text-slate-500">{formatPhone(row.phone)}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.bills}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(row.sales)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-slate-100">
                            <div className="h-full rounded-sm bg-orange-500" style={{ width: `${share}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{Math.round(share)}%</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {row.lastVisit ? formatDayMonth(row.lastVisit) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <p className={`font-semibold ${row.due > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                          {formatCurrency(row.due)}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {formatCurrency(row.creditNote)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <ChevronRight size={16} className="inline text-slate-400" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {listRows.length > 0 && (
                <tfoot className="border-t border-[#f6e1d0] bg-[#fff8f2] text-sm font-semibold text-slate-900">
                  <tr>
                    <td className="px-4 py-3">Total · {plural(listRows.length, 'customer')}</td>
                    <td className="px-4 py-3">{listTotals.bills}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(listTotals.sales)}</td>
                    <td />
                    <td />
                    <td className={`whitespace-nowrap px-4 py-3 text-right ${listTotals.due > 0 ? 'text-yellow-700' : ''}`}>
                      {formatCurrency(listTotals.due)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(listTotals.credit)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Mobile list */}
        <ul className="md:hidden">
          {listRows.length === 0 && (
            <li className="border-t border-[#f6e1d0] px-4 py-10 text-center text-sm text-slate-500">
              No customers in this period. They appear here once an order has their name or phone.
            </li>
          )}
          {listRows.map((row) => (
            <li
              key={row.key}
              onClick={() => setExpandedKey(row.key)}
              className="cursor-pointer border-t border-[#f6e1d0] px-4 py-3 active:bg-[#fff8f2]"
            >
              <div className="flex items-center gap-3">
                {renderAvatar(row)}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${row.name ? 'text-slate-900' : 'text-slate-500'}`}>
                    {displayName(row)}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {[
                      row.phone && formatPhone(row.phone),
                      plural(row.bills, 'bill'),
                      row.lastVisit > 0 && `last ${formatDayMonth(row.lastVisit)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(row.sales)}</p>
                  <p className={`text-xs ${row.due > 0 ? 'font-medium text-yellow-700' : 'text-slate-500'}`}>
                    {row.due > 0 ? `Due ${formatCurrency(row.due)}` : 'No due'}
                  </p>
                </div>
              </div>
            </li>
          ))}
          {listRows.length > 0 && (
            <li className="flex items-center justify-between rounded-b-sm border-t border-[#f6e1d0] bg-[#fff8f2] px-4 py-3 text-sm font-semibold text-slate-900">
              <span>Total · {listRows.length}</span>
              <span>
                {formatCurrency(listTotals.sales)}
                {listTotals.due > 0 && <span className="text-yellow-700"> · due {formatCurrency(listTotals.due)}</span>}
              </span>
            </li>
          )}
        </ul>
      </section>

      {(() => {
        const selected = expandedKey ? listRows.find((r) => r.key === expandedKey) : undefined;
        return selected ? renderCustomerPanel(selected) : null;
      })()}
    </div>
  );
};

export default CatalogueCustomerReport;