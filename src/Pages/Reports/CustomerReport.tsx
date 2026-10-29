import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Filter,
  IndianRupee,
  MessageCircle,
  RefreshCw,
  Scale,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import useCustomerReport from './CustomerReportComponents/useCustomerReport';
import {
  buildCustomerRows,
  displayCustomerName,
  type CustomerSummaryRow,
} from './CustomerReportComponents/customerReport.utils';
import {
  DATE_PRESETS,
  formatCurrency,
  formatDateForInput,
  formatDayMonth,
  formatPhone,
  formatRangeLabel,
  getPresetRange,
  parseInputDate,
} from './SalesReportComponents/salesReport.utils';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import DetailPanel, { DetailRows, DetailSection } from './SalesReportComponents/DetailPanel';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useWhatsappProvider } from '../Additional/Whatsapp/useWhatsappProvider';
import { sendDueReminder } from '../Additional/Whatsapp/sendDueReminder';
import { loadCustomerNames, saveCustomerName } from './CustomerReportComponents/customerReportCache';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

type RowFilter = 'all' | 'dues' | 'noname';
type SortKey = 'name' | 'bills' | 'sales' | 'lastVisit' | 'due' | 'creditNote';

const DAY_MS = 24 * 60 * 60 * 1000;

const CustomerReport: React.FC = () => {
  const {
    currentUser,
    authLoading,
    datePreset,
    setDatePreset,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    appliedFilters,
    setAppliedFilters,
    sales,
    openingBalances,
    newCustomers,
    credits,
    isLoading,
    isFetching,
    lastUpdated,
    error,
    refresh,
  } = useCustomerReport();

  const navigate = useNavigate();
  const companyId = currentUser?.companyId;
  const { provider: whatsappProvider } = useWhatsappProvider(companyId);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [isListVisible, setIsListVisible] = useState(true);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  // Names from the customer list for bills saved with only a phone number.
  const [knownNames, setKnownNames] = useState<Record<string, string>>({});
  const [namingRow, setNamingRow] = useState<CustomerSummaryRow | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'sales',
    direction: 'desc',
  });
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: State.INFO, message: '' });
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    const fetchCompanyName = async () => {
      if (!currentUser?.companyId) return;
      try {
        const businessInfoRef = doc(
          db,
          'companies',
          currentUser.companyId,
          'business_info',
          currentUser.companyId,
        );
        const snap = await getDoc(businessInfoRef);
        if (snap.exists()) {
          setCompanyName(snap.data().businessName || '');
        }
      } catch (e) {
        console.error('Failed to fetch company name', e);
      }
    };
    fetchCompanyName();
  }, [currentUser?.companyId]);

  // Re-render every minute so the "Updated x min ago" label stays accurate.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const updatedLabel = useMemo(() => {
    if (!lastUpdated) return 'Refresh';
    const mins = Math.floor((now - lastUpdated) / 60_000);
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins} min ago`;
    return `Updated at ${new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  }, [lastUpdated, now]);

  /* ---------- DATE PRESET ---------- */
  const handleDatePresetChange = (preset: string) => {
    const range = getPresetRange(preset);
    if (!range) return;
    setDatePreset(preset);
    setIsRangeOpen(false);
    setStartDate(formatDateForInput(range.start));
    setEndDate(formatDateForInput(range.end));
    setAppliedFilters({ start: range.start.getTime(), end: range.end.getTime() });
  };

  const handleApplyCustomRange = (startValue: string, endValue: string) => {
    const start = parseInputDate(startValue);
    start.setHours(0, 0, 0, 0);
    const end = parseInputDate(endValue);
    end.setHours(23, 59, 59, 999);
    setDatePreset('custom');
    setStartDate(startValue);
    setEndDate(endValue);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
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
  const rows = useMemo(() => {
    if (!appliedFilters) return [];
    const inRange = (t: number) => t >= appliedFilters.start && t <= appliedFilters.end;
    const all = buildCustomerRows({
      sales: sales.filter((s) => inRange(s.createdAt)),
      openingBalances: openingBalances.filter((ob) => inRange(ob.createdAt)),
      newCustomers: newCustomers.filter((c) => inRange(c.createdAt)),
      credits,
    }).map((r) => (r.name || !knownNames[r.phone] ? r : { ...r, name: knownNames[r.phone] }));
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    const qDigits = q.replace(/\D/g, '');
    return all.filter(
      (r) => displayCustomerName(r).toLowerCase().includes(q) || (!!qDigits && r.phone.includes(qDigits)),
    );
  }, [appliedFilters, sales, openingBalances, newCustomers, credits, searchQuery, knownNames]);

  // Look up names for the unnamed phones on screen (each phone once per session).
  const unnamedPhones = useMemo(
    () => [...new Set(rows.filter((r) => !r.name && r.phone).map((r) => r.phone))].sort().join(','),
    [rows],
  );
  useEffect(() => {
    if (!companyId || !unnamedPhones) return;
    let cancelled = false;
    loadCustomerNames(companyId, unnamedPhones.split(','))
      .then((names) => {
        if (!cancelled && Object.keys(names).length) setKnownNames((prev) => ({ ...prev, ...names }));
      })
      .catch((err) => console.error('Failed to look up customer names', err));
    return () => { cancelled = true; };
  }, [companyId, unnamedPhones]);

  const openNaming = (row: CustomerSummaryRow) => {
    setNamingRow(row);
    setNameDraft('');
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!companyId || !namingRow?.phone || !name) return;
    setIsSavingName(true);
    try {
      await saveCustomerName(companyId, namingRow.phone, name);
      setKnownNames((prev) => ({ ...prev, [namingRow.phone]: name }));
      setNamingRow(null);
    } catch (err) {
      console.error('Failed to save customer name', err);
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to save the name. Try again.' });
    } finally {
      setIsSavingName(false);
    }
  };

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
      if (sortConfig.key === 'name') return displayCustomerName(a).localeCompare(displayCustomerName(b)) * dir;
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

  // Shape the export code below has always used.
  const customerRows = listRows.map((r) => ({
    customerName: r.name || (r.phone ? `No name (${formatPhone(r.phone)})` : 'Walk-in'),
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

  /* ---------- REMINDERS ---------- */
  const sendReminder = async (row: CustomerSummaryRow) => {
    if (!companyId) return;
    if (!row.phone) {
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'This customer has no phone number.' });
      return;
    }
    setSendingFor(row.key);
    try {
      const result = await sendDueReminder({
        companyId,
        provider: whatsappProvider,
        partyName: row.name || 'Customer',
        partyNumber: row.phone,
        totalDue: row.due,
        dueLines: row.dueEntries.map((e) => ({ label: e.label, amount: e.amount })),
      });
      if (result === 'needs_setup') navigate(ROUTES.WHATSAPP_PLAN);
      else if (result === 'sent')
        setFeedbackModal({
          isOpen: true,
          type: State.SUCCESS,
          message: `Reminder sent to ${displayCustomerName(row)} on WhatsApp.`,
        });
    } catch (err: any) {
      console.error('Customer reminder failed:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: err?.message ? `Failed to send reminder: ${err.message}` : 'Failed to send reminder.',
      });
    } finally {
      setSendingFor(null);
    }
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
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } },
      };
      const bblr = {
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } },
      };

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const periodLabel = appliedFilters
        ? `Period: ${startDate} – ${endDate}`
        : 'Period: All';

      // ── COLUMN DEFINITIONS ───────────────────────────────────────────
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

      // Row layout:
      // 0  → Title  (merged)
      // 1  → Meta   (merged)
      // 2  → blank spacer
      // 3  → Summary label (merged)
      // 4  → Summary values
      // 5  → blank spacer
      // 6  → Column headers
      // 7+ → Data rows
      // Last → Totals footer

      const dataStartRow = 7;
      const totalRows = dataStartRow + customerRows.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = companyName
        ? `Customer Report  —  ${companyName}`
        : 'Customer Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Customers: ${exportSummary.totalCustomers}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Customers: ${exportSummary.totalCustomers}   |   Total Sales: ₹${exportSummary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Total Due: ₹${exportSummary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Sale: ₹${Math.round(exportSummary.averageSalePerCustomer).toLocaleString('en-IN')}`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
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

      // Footer row
      const footerRow = dataStartRow + customerRows.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${customerRows.length} customers`;
      aoa[footerRow][3] = exportSummary.totalBills;
      aoa[footerRow][4] = Math.round(exportSummary.totalSales);
      aoa[footerRow][5] = Math.round(exportSummary.totalDue);
      aoa[footerRow][6] = Math.round(customerRows.reduce((sum, c) => sum + (c.creditNote || 0), 0));

      // ── BUILD WORKSHEET ─────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 8 }, // 2 spacer
        { hpt: 18 }, // 3 summary label
        { hpt: 22 }, // 4 summary values
        { hpt: 8 }, // 5 spacer
        { hpt: 28 }, // 6 headers
        ...customerRows.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // footer
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

      // ── APPLY STYLES ────────────────────────────────────────────────

      // Title (row 0)
      style('A1', s(
        { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('2563EB'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Meta (row 1)
      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '475569' } },
        solidFill('DBEAFE'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Summary label (row 3)
      style('A4', s(
        { sz: 10, bold: true, color: { rgb: '1D4ED8' } },
        solidFill('EFF6FF'),
        { horizontal: 'left', vertical: 'center' },
        allBorders,
      ));

      style('A5', s(
        { sz: 10, bold: true, color: { rgb: '166534' } },
        solidFill('DCFCE7'),
        { horizontal: 'center', vertical: 'center' },
        bblr,
      ));

      // Column headers (row 6)
      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill('1E40AF'),
          { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Currency column indices: 4 = Sales, 5 = Due, 6 = Credit Note
      const currencyCols = new Set([4, 5, 6]);

      // Data rows
      customerRows.forEach((_row, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isCurrency = currencyCols.has(ci);
          const isNumeric = ci === 3 || isCurrency; // Bills col too
          style(addr, s(
            { sz: 9, color: { rgb: '1E293B' } },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          if (worksheet[addr] && isCurrency) {
            worksheet[addr].t = 'n';
            worksheet[addr].z = '₹#,##0.00';
          }
        }
      });

      // Footer row
      for (let ci = 0; ci < colCount; ci++) {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: '1E293B' } },
          solidFill('E2E8F0'),
          { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        ));
        if ([4, 5, 6].includes(ci) && worksheet[addr]) {
          worksheet[addr].t = 'n';
          worksheet[addr].z = '₹#,##0.00';
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Report');
      XLSX.writeFile(workbook, `Customer-Report-${startDate}-to-${endDate}.xlsx`);

      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel downloaded successfully!',
      });
    } catch {
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Excel file.',
      });
    }
  };

  const downloadAsPdf = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      // ===== GENERATION TAG (drawn first, reserves space for logo) =====
      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);

      const textWidth = doc.getTextWidth(tagText);
      const paddingX = 2;
      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 5;

      const logoReservedWidth = 25; // space reserved for logo + gap, so tag never overlaps it
      const boxX = pageWidth - 14 - logoReservedWidth - boxWidth;
      const boxY = 10;

      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

      doc.setTextColor(80, 80, 80);
      doc.text(tagText, boxX + paddingX, boxY + 3.5);

      doc.setTextColor(0, 0, 0);

      // ===== LOGO (drawn after, in its own reserved slot at top-right corner) =====
      try {
        const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 15;
              const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
              const logoX = pageWidth - logoWidth - 14;
              doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      } catch {
        // Continue without logo
      }
      const pageHeight = doc.internal.pageSize.getHeight();

      // --- 1. BRAND ACCENT BAR ---
      doc.setFillColor(37, 99, 235); // blue-600
      doc.rect(0, 0, pageWidth, 6, 'F');

      // --- 2. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      const reportTitle = companyName
        ? `Customer Report — ${companyName}`
        : 'Customer Report';
      doc.text(reportTitle, 14, 24);

      // Dynamic Subtitle with Date Range
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      let subtitleText = `Generated on: ${generationDate}`;
      if (startDate && endDate) {
        subtitleText += `   |   Period: ${startDate} to ${endDate}`;
      }
      doc.text(subtitleText, 14, 31);

      // --- 3. AUTOTABLE GENERATION ---
      autoTable(doc, {
        startY: 38,
        head: [['CUSTOMER', 'PHONE', 'BILLS', 'SALES (Rs.)', 'DUE (Rs.)', 'CREDIT NOTE (Rs.)']],
        body: customerRows.map((c) => [
          c.customerName,
          c.customerNumber || 'N/A',
          c.totalBills.toString(),
          c.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          Math.max(0, c.totalDue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          (c.creditNote || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ]),
        foot: [
          [
            'TOTAL',
            '-',
            exportSummary.totalBills.toString(),
            exportSummary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            exportSummary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            customerRows
              .reduce((sum, c) => sum + (c.creditNote || 0), 0)
              .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ]
        ],
        showFoot: 'lastPage',
        theme: 'plain',
        styles: {
          font: 'helvetica',
          cellPadding: 7,
          fontSize: 10,
          textColor: [55, 65, 81], // gray-700
        },
        headStyles: {
          fillColor: [249, 250, 251], // gray-50
          textColor: [17, 24, 39], // gray-900
          fontStyle: 'bold',
          halign: 'center',
          lineWidth: { top: 1, bottom: 1 },
          lineColor: [229, 231, 235], // gray-200
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          halign: 'right',
          lineWidth: { top: 1, bottom: 2 }, // Thicker bottom line for totals
          lineColor: [17, 24, 39],
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252], // Extremely subtle zebra striping
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 'auto' },
          1: { halign: 'center', cellWidth: 35 },
          2: { halign: 'right', cellWidth: 25 },
          3: { halign: 'right', cellWidth: 34 },
          4: { halign: 'right', cellWidth: 30 },
          5: { halign: 'right', cellWidth: 36 },
        },
        // --- 4. CONDITIONAL FORMATTING ---
        didParseCell: function (data) {
          // Check body and foot rows for negative values in the 'Due' column
          if ((data.section === 'body' || data.section === 'foot') && data.column.index === 4) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
            if (rawVal < 0) {
              data.cell.styles.textColor = [220, 38, 38]; // red-600
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        // --- 5. PAGINATION FOOTER ---
        didDrawPage: function () {
          const pageCount = (doc.internal as any).getNumberOfPages();
          doc.setFontSize(9);
          doc.setTextColor(156, 163, 175); // gray-400
          // Draw page number at the bottom right
          doc.text(
            `Page ${pageCount}`,
            pageWidth - 14,
            pageHeight - 10,
            { align: 'right' }
          );
        },
      });

      doc.save(`Customer_Report_${startDate}_to_${endDate}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate PDF.',
      });
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
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-800 ${
            align === 'right' ? 'flex-row-reverse' : ''
          } ${isActive ? 'text-blue-700' : ''}`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  const renderAvatar = (row: CustomerSummaryRow) => (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
      {row.name ? row.name[0].toUpperCase() : row.phone ? '?' : 'W'}
    </span>
  );

  const renderRemindButton = (row: CustomerSummaryRow, compact = false) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        sendReminder(row);
      }}
      disabled={sendingFor === row.key || !row.phone}
      title={row.phone ? 'Send a payment reminder on WhatsApp' : 'No phone number'}
      className={`inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 ${
        compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
      }`}
    >
      <MessageCircle size={compact ? 12 : 14} className="text-green-600" />
      {sendingFor === row.key ? 'Sending…' : 'Remind'}
    </button>
  );

  // One customer, opened in the detail panel (side panel on desktop, bottom sheet on mobile).
  const renderCustomerPanel = (row: CustomerSummaryRow) => {
    const openingDues = row.dueEntries.filter((e) => e.isOpeningBalance);
    const phone = (row.phone || '').replace(/\D/g, '').slice(-10);
    return (
      <DetailPanel
        open
        onClose={() => setExpandedKey(null)}
        title={displayCustomerName(row)}
        subtitle={[row.phone && formatPhone(row.phone), plural(row.bills, 'bill'), row.lastVisit && `last visit ${formatDayMonth(row.lastVisit)}`]
          .filter(Boolean)
          .join(' · ')}
        footer={
          <div className="flex flex-wrap gap-2">
            {row.due > 0 && renderRemindButton(row)}
            {!row.name && row.phone && (
              <button
                onClick={() => {
                  setExpandedKey(null); // never stack a pop-up on the panel
                  openNaming(row);
                }}
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:border-slate-400"
              >
                + Add name
              </button>
            )}
            {phone.length === 10 && (
              <button
                onClick={() => navigate(ROUTES.PARTY_LEDGER, { state: { openParty: phone } })}
                className="ml-auto inline-flex items-center gap-1.5 rounded-sm bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Scale size={14} /> Party ledger
              </button>
            )}
          </div>
        }
      >
        <DetailSection title="This period">
          <DetailRows
            rows={[
              { label: 'Total sales', value: formatCurrency(row.sales), strong: true },
              { label: 'Bills', value: row.bills },
              { label: 'Share of sales', value: `${Math.round(shareOf(row.sales))}%` },
              { label: 'Due', value: row.due > 0 ? formatCurrency(row.due) : 'No due', tone: row.due > 0 ? 'text-amber-700' : 'text-green-700' },
              ...(row.creditNote > 0 ? [{ label: 'Credit note', value: formatCurrency(row.creditNote) }] : []),
            ]}
          />
        </DetailSection>

        <DetailSection title={`Bills · ${row.recentBills.length}`}>
          {row.recentBills.length === 0 ? (
            <p className="rounded-sm bg-sunken px-3 py-2.5 text-sm text-slate-500">No bills in this period.</p>
          ) : (
            <ul className="divide-y divide-line rounded-sm border border-line">
              {row.recentBills.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{b.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">{formatDayMonth(b.date)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-slate-900">{formatCurrency(b.amount)}</p>
                    {b.due > 0 && <p className="text-xs font-medium text-amber-700">due {formatCurrency(b.due)}</p>}
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
                tone: 'text-amber-700',
              }))}
            />
          </DetailSection>
        )}
      </DetailPanel>
    );
  };

  /* ---------- LOAD STATES ---------- */
  if (authLoading || isLoading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas text-sm text-slate-500">
        Loading customers...
      </div>
    );
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;

  const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';
  const rangeLabelShort = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end, false) : '';

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
      iconClass: 'bg-orange-50 text-orange-600',
      valueClass: summary.totalDue > 0 ? 'text-amber-700' : 'text-slate-900',
    },
    {
      label: 'Avg sale / customer',
      shortLabel: 'Avg / customer',
      value: formatCurrency(Math.round(summary.averageSalePerCustomer)),
      hint: `${formatCurrency(Math.round(summary.totalSales))} across ${summary.totalCustomers}`,
      icon: TrendingUp,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-blue-600',
    },
  ];

  const topDebtor = summary.debtors[0];
  const topDebtorSince = topDebtor ? Math.min(...topDebtor.dueEntries.map((e) => e.date)) : 0;
  const otherDebtors = summary.debtors.length - 1;

  // Old-range data stays on screen while a new range loads; dim it meanwhile.
  const fetchingClass = isFetching ? 'pointer-events-none opacity-50' : '';

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
    }`;

  const mobileSortValue = sortConfig.key;

  return (
    <div className="min-h-screen bg-canvas px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      {/* ADD NAME — saved on the customer's record, so every report shows it */}
      {namingRow && (
        <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/40 md:items-center md:px-4" onClick={() => setNamingRow(null)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
            className="w-full rounded-t-sm bg-white p-5 shadow-float md:max-w-sm md:rounded-sm"
          >
            <h2 className="text-base font-semibold text-slate-900">Add customer name</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              For {formatPhone(namingRow.phone)} — {plural(namingRow.bills, 'bill')} in this period
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Name
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
                placeholder="e.g. Ramesh Kumar"
                className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNamingRow(null)}
                className="rounded-sm border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!nameDraft.trim() || isSavingName}
                className="rounded-sm bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingName ? 'Saving…' : 'Save name'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* HEADER */}
      <header className="mb-4 flex items-center gap-2 md:gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-slate-200 md:border md:border-slate-300 md:bg-white"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Customer report</h1>
            <span className="hidden text-xs text-slate-500 md:inline">
              {plural(summary.totalCustomers, 'customer')} · {rangeLabelShort}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            <span className="truncate md:hidden">{rangeLabel} ·</span>
            <button
              onClick={refresh}
              disabled={isFetching}
              title="Fetch the latest bills and balances"
              className="inline-flex shrink-0 items-center gap-1 rounded-sm transition hover:text-slate-800 disabled:cursor-default"
            >
              <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
              {isFetching ? 'Updating…' : updatedLabel}
            </button>
          </div>
        </div>

        {/* Desktop search */}
        <div className="relative hidden w-72 md:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer name or phone"
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
            onClick={() => setShowSearch((s) => !s)}
            aria-label="Search"
            className="rounded-sm p-2 text-slate-700 transition hover:bg-slate-200"
          >
            <Search size={20} />
          </button>
          <DownloadMenu
            variant="icon"
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
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
          className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 md:inline-flex ${
            datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'
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

      <div className={`transition-opacity ${fetchingClass}`}>
        {/* SUMMARY — 2 cols on mobile, 4 cols on md+ */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
          {statCards.map(({ label, shortLabel, value, hint, icon: Icon, iconClass, valueClass }) => (
            <div key={label} className="min-w-0 rounded-sm border border-line bg-white shadow-card p-3 md:p-4">
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
          <div className="mb-3 flex items-center gap-3 rounded-sm border border-amber-200 bg-amber-50 p-3 md:hidden">
            <MessageCircle size={16} className="shrink-0 text-green-600" />
            <p className="min-w-0 flex-1 text-sm text-amber-800">
              <span className="font-medium">{displayCustomerName(topDebtor)}</span> owes{' '}
              {formatCurrency(Math.round(topDebtor.due))}
              {otherDebtors > 0 && <span className="text-xs"> · +{otherDebtors} more</span>}
            </p>
            {renderRemindButton(topDebtor)}
          </div>
        )}

        {/* INSIGHT CARDS (desktop) */}
        <div className="mb-4 hidden gap-4 md:grid md:grid-cols-2">
          <div className="rounded-sm border border-line bg-white shadow-card p-4">
            <h3 className="text-sm font-semibold text-slate-900">Who buys the most</h3>
            {topBuyers.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">No sales in this period.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {topBuyers.map((r) => (
                  <li key={r.key}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-slate-700">
                        {r.name || (r.phone ? `No name (${formatPhone(r.phone)})` : 'Walk-in')} · {plural(r.bills, 'bill')}
                      </span>
                      <span className="shrink-0 font-semibold text-slate-900">
                        {formatCurrency(r.sales)} · {Math.round(shareOf(r.sales))}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-slate-100">
                      <div className="h-full rounded-sm bg-blue-600" style={{ width: `${shareOf(r.sales)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col rounded-sm border border-line bg-white shadow-card p-4">
            <h3 className="text-sm font-semibold text-slate-900">Money to collect</h3>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Due 0–30 days</dt>
                <dd className={`font-semibold ${summary.due0to30 > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
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
              <div className="flex items-center gap-3 rounded-sm border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <MessageCircle size={14} className="shrink-0 text-green-600" />
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{displayCustomerName(topDebtor)}</span> owes{' '}
                  {formatCurrency(Math.round(topDebtor.due))} since {formatDayMonth(topDebtorSince)}.
                  {otherDebtors > 0 && ` ${plural(otherDebtors, 'more customer')} ${otherDebtors === 1 ? 'owes' : 'owe'} too.`}
                </p>
                <button
                  onClick={() => sendReminder(topDebtor)}
                  disabled={sendingFor === topDebtor.key || !topDebtor.phone}
                  className="shrink-0 rounded-sm border border-amber-300 bg-white px-3 py-1.5 font-semibold text-slate-800 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendingFor === topDebtor.key ? 'Sending…' : 'Send reminder'}
                </button>
              </div>
              </div>
            )}
          </div>
        </div>

        {/* REPORT DETAILS */}
        {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
        <section className="rounded-sm border border-line bg-white shadow-card">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                <span className="md:hidden">Customers</span>
                <span className="hidden md:inline">Report details</span>
              </h2>
              <span className="hidden rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 md:inline">
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
                  className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500"
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
                onExcel={() => runDownload(downloadAsExcel)}
                onPdf={() => runDownload(downloadAsPdf)}
              />
            </div>

            {/* Mobile sort */}
            <div className="relative md:hidden">
              <select
                value={mobileSortValue}
                onChange={(e) => setSortConfig({ key: e.target.value as SortKey, direction: e.target.value === 'name' ? 'asc' : 'desc' })}
                className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-blue-500"
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
                <thead className="bg-sunken text-[11px] text-blue-700/80">
                  <tr>
                    {renderSortHeader('Customer', 'name')}
                    {renderSortHeader('Bills', 'bills')}
                    {renderSortHeader('Total sales', 'sales', 'right')}
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Share</th>
                    {renderSortHeader('Last visit', 'lastVisit')}
                    {renderSortHeader('Total due', 'due', 'right')}
                    {renderSortHeader('Credit note', 'creditNote', 'right')}
                    <th className="w-32" />
                  </tr>
                </thead>
                <tbody>
                  {listRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                        No customers in this period. They appear here once a bill has their name or phone.
                      </td>
                    </tr>
                  )}
                  {listRows.map((row) => {
                    const isOpen = expandedKey === row.key;
                    const share = shareOf(row.sales);
                    return (
                      <React.Fragment key={row.key}>
                        <tr
                          onClick={() => setExpandedKey(row.key)}
                          className={`cursor-pointer border-t border-line transition ${isOpen ? 'bg-blue-50' : 'hover:bg-sunken'}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {renderAvatar(row)}
                              <div className="min-w-0">
                                <p className={`truncate font-semibold ${row.name ? 'text-slate-900' : 'text-slate-500'}`}>
                                  {displayCustomerName(row)}
                                  {!row.name && row.phone && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openNaming(row);
                                      }}
                                      className="ml-1.5 text-xs font-medium text-blue-600 hover:underline"
                                    >
                                      + Add name
                                    </button>
                                  )}
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
                                <div className="h-full rounded-sm bg-blue-600" style={{ width: `${share}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{Math.round(share)}%</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {row.lastVisit ? formatDayMonth(row.lastVisit) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <p className={`font-semibold ${row.due > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                              {formatCurrency(row.due)}
                            </p>
                            {row.hasOpeningDue && <p className="text-[11px] text-slate-500">Opening balance</p>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatCurrency(row.creditNote)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {row.due > 0 && renderRemindButton(row, true)}
                              <ChevronRight size={16} className="text-slate-400" />
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
                {listRows.length > 0 && (
                  <tfoot className="border-t border-line bg-sunken text-sm font-semibold text-slate-900">
                    <tr>
                      <td className="px-4 py-3">Total · {plural(listRows.length, 'customer')}</td>
                      <td className="px-4 py-3">{listTotals.bills}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(listTotals.sales)}</td>
                      <td />
                      <td />
                      <td className={`whitespace-nowrap px-4 py-3 text-right ${listTotals.due > 0 ? 'text-amber-700' : ''}`}>
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
              <li className="border-t border-line px-4 py-10 text-center text-sm text-slate-500">
                No customers in this period. They appear here once a bill has their name or phone.
              </li>
            )}
            {listRows.map((row) => (
              <li
                key={row.key}
                onClick={() => setExpandedKey(row.key)}
                className="cursor-pointer border-t border-line px-4 py-3 active:bg-sunken"
              >
                <div className="flex items-center gap-3">
                  {renderAvatar(row)}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-semibold ${row.name ? 'text-slate-900' : 'text-slate-500'}`}>
                      {displayCustomerName(row)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[row.phone && formatPhone(row.phone), plural(row.bills, 'bill'), row.lastVisit && `last ${formatDayMonth(row.lastVisit)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(row.sales)}</p>
                    <p className={`text-xs ${row.due > 0 ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                      {row.due > 0 ? `Due ${formatCurrency(row.due)}` : 'No due'}
                    </p>
                  </div>
                </div>
              </li>
            ))}
            {listRows.length > 0 && (
              <li className="flex items-center justify-between rounded-b-sm border-t border-line bg-sunken px-4 py-3 text-sm font-semibold text-slate-900">
                <span>Total · {listRows.length}</span>
                <span>
                  {formatCurrency(listTotals.sales)}
                  {listTotals.due > 0 && <span className="text-amber-700"> · due {formatCurrency(listTotals.due)}</span>}
                </span>
              </li>
            )}
          </ul>
        </section>
      </div>

      {(() => {
        const selected = expandedKey ? listRows.find((r) => r.key === expandedKey) : undefined;
        return selected ? renderCustomerPanel(selected) : null;
      })()}
    </div>
  );
};

export default CustomerReport;
