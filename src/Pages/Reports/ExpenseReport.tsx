import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useExpenses, type Expense } from './ExpenseReport/useExpense';
import { ExpenseModal } from '../../Components/ExpenseModal';
import BackButton from '../../Components/BackButton';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { IconClose, IconSearch } from '../../constants/Icons';
import { Modal } from '../../constants/Modal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import ReportDateFilter from '../../Components/ReportDateFilter';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const formatDateForInput = (d: Date) => d.toISOString().split('T')[0];

const ExpenseReportPage: React.FC = () => {
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;
    const { expenses: posExpenses, loading: posLoading, addExpense, deleteExpense } = useExpenses(companyId, 'pos');
    const { expenses: catExpenses, loading: catLoading } = useExpenses(companyId, 'catalogue');
    const loading = posLoading || catLoading;
    const expenses = [...posExpenses, ...catExpenses];

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
    // --- filters ---
    const today = formatDateForInput(new Date());
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(() => {
        const s = new Date(); s.setHours(0, 0, 0, 0);
        const e = new Date(); e.setHours(23, 59, 59, 999);
        return { start: s.getTime(), end: e.getTime() };
    });
    const [datePreset, setDatePreset] = useState('today');

    // --- ui state ---
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isListVisible, setIsListVisible] = useState(true);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: State.INFO, message: '' });
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Expense; direction: 'asc' | 'desc' }>({
        key: 'date', direction: 'desc',
    });

    const handleDatePreset = (preset: string) => {
        setDatePreset(preset);
        const start = new Date();
        const end = new Date();
        switch (preset) {
            case 'yesterday': start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); break;
            case 'last7': start.setDate(start.getDate() - 6); break;
            case 'last30': start.setDate(start.getDate() - 29); break;
            case 'custom': return;
        }
        setStartDate(formatDateForInput(start));
        setEndDate(formatDateForInput(end));

        // Auto-apply when selecting a preset
        const s = new Date(start); s.setHours(0, 0, 0, 0);
        const e = new Date(end); e.setHours(23, 59, 59, 999);
        setAppliedFilters({ start: s.getTime(), end: e.getTime() });
    };
    const handleApply = () => {
        const s = new Date(startDate); s.setHours(0, 0, 0, 0);
        const e = new Date(endDate); e.setHours(23, 59, 59, 999);
        setAppliedFilters({ start: s.getTime(), end: e.getTime() });
    };

    const handleStartDateChange = (value: string) => {
        setStartDate(value);
        setDatePreset('custom');
    };
    const handleEndDateChange = (value: string) => {
        setEndDate(value);
        setDatePreset('custom');
    };

    const handleSort = (key: keyof Expense) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const { filtered, summary } = useMemo(() => {
        if (!appliedFilters) return { filtered: [], summary: { total: 0, count: 0, byCategory: {} as Record<string, number> } };

        let list = expenses.filter(e =>
            e.date >= appliedFilters.start && e.date <= appliedFilters.end
        );
        if (searchQuery) list = list.filter(e =>
            e.description.toLowerCase().includes(searchQuery.toLowerCase())
        );

        list.sort((a, b) => {
            const dir = sortConfig.direction === 'asc' ? 1 : -1;
            const va = a[sortConfig.key] ?? '';
            const vb = b[sortConfig.key] ?? '';
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
            return String(va).localeCompare(String(vb)) * dir;
        });

        const total = list.reduce((s, e) => s + e.amount, 0);
        return { filtered: list, summary: { total, count: list.length } };
    }, [expenses, appliedFilters, searchQuery, sortConfig]);

    // ---- PDF ----
    const downloadAsPdf = async () => {
        if (!appliedFilters) return;
        try {
            const doc = new jsPDF();
            const pw = doc.internal.pageSize.getWidth();
            const ph = doc.internal.pageSize.getHeight();
            doc.setFillColor(37, 99, 235); doc.rect(0, 0, pw, 6, 'F');
            doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39);
            const reportTitle = companyName
                ? `Expense Report — ${companyName}`
                : 'Expense Report';
            doc.text(reportTitle, 14, 24);
            doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
            doc.text(`Generated: ${formatDate(Date.now())}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`, 14, 31);
            // ===== GENERATION TAG (drawn first, reserves space for logo) =====
            const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);

            const textWidth = doc.getTextWidth(tagText);
            const paddingX = 2;
            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 5;

            const logoReservedWidth = 18; // space reserved for logo + gap, so tag never overlaps it
            const boxX = pw - 14 - logoReservedWidth - boxWidth;
            const boxY = 10;

            doc.setFillColor(245, 245, 245);
            doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

            doc.setTextColor(80, 80, 80);
            doc.text(tagText, boxX + paddingX, boxY + 3.5);

            doc.setTextColor(0, 0, 0);

            // ===== LOGO (drawn after, in its own reserved slot at top-right corner) =====
            try {
                const base64Logo = await resolveCompanyLogoBase64(companyId);
                if (base64Logo) {
                    const img = new Image();
                    img.src = base64Logo;
                    await new Promise<void>((resolve) => {
                        img.onload = () => {
                            const logoWidth = 13;
                            const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
                            const logoX = pw - logoWidth - 14;
                            doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
                            resolve();
                        };
                        img.onerror = () => resolve();
                    });
                }
            } catch { }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(17, 24, 39);

            autoTable(doc, {
                startY: 38,
                head: [['DATE', 'TITLE', 'DESCRIPTION', 'AMOUNT(Rs)']],
                body: filtered.map(e => [formatDate(e.date), e.title, e.description, e.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })]),
                foot: [['TOTAL', '', '', summary.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })]],
                theme: 'plain',
                styles: { font: 'helvetica', cellPadding: 7, fontSize: 10, textColor: [55, 65, 81] },
                headStyles: { fillColor: [249, 250, 251], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 1 }, lineColor: [229, 231, 235] },
                footStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 2 }, lineColor: [17, 24, 39] },
                alternateRowStyles: { fillColor: [252, 252, 252] },
                columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 30 }, 2: { cellWidth: 'auto' }, 3: { halign: 'right', cellWidth: 42 } },
                didDrawPage: () => {
                    doc.setFontSize(9); doc.setTextColor(156, 163, 175);
                    doc.text(`Page ${doc.getNumberOfPages()}`, pw - 14, ph - 10, { align: 'right' });
                },
            });
            doc.save(`Expense_Report_${startDate}_to_${endDate}.pdf`);
            setIsDownloadModalOpen(false);
        } catch (err) { console.error(err); }
    };

    // ---- Excel ----
    const downloadAsExcel = () => {
        if (!appliedFilters) return;
        try {
            const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
                font: { name: 'Arial', ...font }, fill: fill ?? {},
                alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true }, border: border ?? {},
            });
            const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
            const allBorders = { top: { style: 'thin', color: { rgb: 'CBD5E1' } }, bottom: { style: 'thin', color: { rgb: 'CBD5E1' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } };
            const bblr = { bottom: { style: 'thin', color: { rgb: 'CBD5E1' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } };

            const COLS = [{ header: '#', width: 6 }, { header: 'Date', width: 16 }, { header: 'Title', width: 20 }, { header: 'Description', width: 32 }, { header: 'Amount (₹)', width: 18 }];
            const colCount = COLS.length;
            const dataStartRow = 7;
            const totalRows = dataStartRow + filtered.length + 1;
            const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

            aoa[0][0] = companyName
                ? `Expense Report  —  ${companyName}`
                : 'Expense Report';
            aoa[1][0] = `Generated: ${formatDate(Date.now())}   |   Period: ${formatDate(appliedFilters.start)} → ${formatDate(appliedFilters.end)}`;
            aoa[3][0] = 'SUMMARY';
            aoa[4][0] = `Total Expenses: ₹${summary.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}   |   Entries: ${summary.count}`;
            COLS.forEach((c, i) => { aoa[6][i] = c.header; });
            filtered.forEach((exp, idx) => {
                const r = dataStartRow + idx;
                aoa[r] = [idx + 1, formatDate(exp.date), exp.title, exp.description, exp.amount];
            });
            const footerRow = dataStartRow + filtered.length;
            aoa[footerRow] = ['TOTAL', '', '', '', summary.total];

            const ws: any = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = COLS.map(c => ({ wch: c.width }));
            ws['!rows'] = [{ hpt: 36 }, { hpt: 20 }, { hpt: 8 }, { hpt: 18 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 }, ...filtered.map(() => ({ hpt: 20 })), { hpt: 24 }];
            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } }, { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } }];

            const styleCell = (addr: string, st: any) => { if (!ws[addr]) ws[addr] = { t: 's', v: '' }; ws[addr].s = st; };
            styleCell('A1', s({ sz: 16, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('2563EB'), { horizontal: 'center', vertical: 'center' }));
            styleCell('A2', s({ sz: 9, italic: true, color: { rgb: '475569' } }, solidFill('DBEAFE'), { horizontal: 'center', vertical: 'center' }));
            styleCell('A4', s({ sz: 10, bold: true, color: { rgb: '1D4ED8' } }, solidFill('EFF6FF'), { horizontal: 'left', vertical: 'center' }, allBorders));
            styleCell('A5', s({ sz: 10, bold: true, color: { rgb: '166534' } }, solidFill('DCFCE7'), { horizontal: 'center', vertical: 'center' }, bblr));
            COLS.forEach((_, i) => {
                const addr = XLSX.utils.encode_cell({ r: 6, c: i });
                styleCell(addr, s({ sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('1E40AF'), { horizontal: i <= 3 ? 'left' : 'center', vertical: 'center' }, allBorders));
            });
            filtered.forEach((_, idx) => {
                const r = dataStartRow + idx;
                const isAlt = idx % 2 === 1;
                for (let ci = 0; ci < colCount; ci++) {
                    const addr = XLSX.utils.encode_cell({ r, c: ci });
                    styleCell(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(isAlt ? 'F8FAFC' : 'FFFFFF'), { horizontal: ci === 4 ? 'center' : 'left', vertical: 'center' }, bblr));
                    if (ci === 4 && ws[addr]) { ws[addr].t = 'n'; ws[addr].z = '₹#,##0.00'; }
                }
            });
            for (let ci = 0; ci < colCount; ci++) {
                const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
                styleCell(addr, s({ sz: 10, bold: true, color: { rgb: '1E293B' } }, solidFill('E2E8F0'), { horizontal: ci <= 3 ? 'left' : 'center', vertical: 'center' }, { top: { style: 'medium', color: { rgb: '1E293B' } }, bottom: { style: 'medium', color: { rgb: '1E293B' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } }));
                if (ci === 4 && ws[addr]) { ws[addr].t = 'n'; ws[addr].z = '₹#,##0.00'; }
            }

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Expense Report');
            XLSX.writeFile(wb, `Expense_Report_${startDate}_to_${endDate}.xlsx`);
            setIsDownloadModalOpen(false);
            setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
        } catch {
            setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel.' });
        }
    };

    if (loading) return <div className="p-4 text-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-2 pb-16 md:p-6">
            {feedbackModal.isOpen && (
                <Modal type={feedbackModal.type} message={feedbackModal.message}
                    onClose={() => setFeedbackModal(p => ({ ...p, isOpen: false }))} showConfirmButton={false} />
            )}
            <DownloadChoiceModal isOpen={isDownloadModalOpen} onClose={() => setIsDownloadModalOpen(false)}
                onDownloadPdf={downloadAsPdf} onDownloadExcel={downloadAsExcel} />
            <ExpenseModal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onSave={data => addExpense(companyId!, data)}
            />

            {/* Delete confirm */}
            {deleteConfirm && (
                <Modal type={State.WARNING} message="Delete this expense?"
                    onClose={() => setDeleteConfirm(null)}
                    showConfirmButton={true}
                    onConfirm={async () => { await deleteExpense(companyId!, deleteConfirm); setDeleteConfirm(null); }}
                />
            )}

            {/* HEADER */}
            <div className="flex items-center justify-between pb-3 border-b mb-2 md:mb-4">
                <BackButton />
                <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl">Expense Report</h1>
                <button onClick={() => setShowSearch(true)} className="p-2"><IconSearch /></button>
            </div>

            {showSearch && (
                <div className="flex justify-center mb-2 px-2">
                    <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-[#F97316]">
                        <input type="text" placeholder="Search by description..." autoFocus
                            className="flex-1 text-base font-light p-2 outline-none bg-transparent text-center"
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        <button onClick={() => { setSearchQuery(''); setShowSearch(false); }} className="p-1 text-gray-500 hover:text-black">
                            <IconClose />
                        </button>
                    </div>
                </div>
            )}

            {/* FILTERS */}
            <ReportDateFilter
                datePreset={datePreset}
                startDate={startDate}
                endDate={endDate}
                onPresetChange={handleDatePreset}
                onStartDateChange={handleStartDateChange}
                onEndDateChange={handleEndDateChange}
                onApply={handleApply}
            />

            <div className="grid grid-cols-2 gap-2 mb-2 md:mb-4 md:gap-4">
                <CustomCard variant={CardVariant.Summary} title="Total Expenses" value={`₹${Math.round(summary.total).toLocaleString('en-IN')}`} />
                <CustomCard variant={CardVariant.Summary} title="Total Entries" value={summary.count.toString()} />
            </div>

            {/* REPORT DETAILS BAR */}
            <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-2">
                <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left w-full md:w-auto">Report Details</h2>
                <div className="flex justify-between w-full md:w-auto md:justify-end md:gap-3">
                    <button onClick={() => setIsListVisible(v => !v)}
                        className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition text-sm">
                        {isListVisible ? 'Hide List' : 'Show List'}
                    </button>
                    <button onClick={() => { filtered.length === 0 ? setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data to download.' }) : setIsDownloadModalOpen(true); }}
                        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md text-sm">
                        Download Report
                    </button>
                </div>
            </div>

            {/* TABLE */}
            {isListVisible && (
                <div className="bg-white rounded-lg shadow-md overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b">
                                {(['date', 'title', 'description', 'amount'] as (keyof Expense)[]).map(col => {
                                    const isSorted = sortConfig.key === col;
                                    const directionIcon = sortConfig.direction === 'asc' ? '∧' : '∨';

                                    return (
                                        <th key={col} onClick={() => handleSort(col)}
                                            className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none">
                                            <span className="inline-flex items-center gap-1">
                                                {col}
                                                <span className="w-4 inline-block">
                                                    {isSorted ? (
                                                        <span className="text-blue-600 text-xs font-bold">
                                                            {directionIcon}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3 opacity-50">
                                                            <span>∧</span>
                                                            <span className="-mt-1">∨</span>
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                        </th>
                                    );
                                })}
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-10 text-gray-400">No expenses found for selected period.</td></tr>
                            ) : filtered.map((exp, i) => (
                                <tr key={exp.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="px-4 py-3 text-gray-700">{formatDate(exp.date)}</td>
                                    <td className="px-4 py-3 text-gray-700">{exp.title}</td>
                                    <td className="px-4 py-3 text-gray-700">{exp.description}</td>
                                    <td className="px-4 py-3 font-semibold text-gray-800">₹{exp.amount.toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => setDeleteConfirm(exp.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ExpenseReportPage;