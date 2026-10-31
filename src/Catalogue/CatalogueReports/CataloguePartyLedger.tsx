import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    AlertTriangle,
    ArrowDownToLine,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ExternalLink,
    FileSpreadsheet,
    FileText,
    MessageCircle,
    MoreHorizontal,
    Pencil,
    Plus,
    Scale,
    Search,
    Trash2,
    Upload,
    UserPlus,
    Users,
    Wallet,
    X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { doc, getDoc, increment, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import {
    DATE_PRESETS,
    formatDateForInput,
    formatDayMonth,
    formatFullDate,
    formatPhone,
    formatRangeLabel,
    getPresetRange,
    parseInputDate,
} from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import CustomRangePanel from '../../Pages/Reports/SalesReportComponents/CustomRangePanel';
import DetailPanel, { DetailItems, DetailRows, DetailSection } from '../../Pages/Reports/SalesReportComponents/DetailPanel';
import useCataloguePartyLedger, {
    normalizePartyNumber,
    type BulkOpeningBalanceRow,
    type LedgerTransaction,
    type PartySummary,
    type PaymentRecord,
} from './useCataloguepartyledger';
import { Spinner } from '../../constants/Spinner';
import { PaymentModal } from '../../constants/Modal';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { OrderActionSheet, PrintSubMenuModal, QrCodeModal } from '../Orders/components';
import { useOrderCommunication } from '../Orders/hooks';
import type { Order } from '../Orders/orders.types';
import { botMasterService } from '../../Pages/Additional/Whatsapp/WhatsappApi';
import { ROUTES } from '../../constants/routes.constants';

/*
  Catalogue palette (SELLAR artifact `.cat`): primary #c2410c = orange-700, accent #f97316 = orange-500,
  soft #ffedd5 = orange-100, canvas #fff5ec, warning #a16207 = yellow-700 (never reads as brand).
*/

/* ---------- BALANCES ---------- */
// Catalogue parties are all customers: what they owe you = unpaid orders + "due" opening balances.
// An "advance" opening balance is money you owe them and is not part of the receivable.
const isAdvance = (t: LedgerTransaction) => !!t.isOpeningBalance && t.balanceType === 'advance';
const receivableTxns = (party: PartySummary) => party.transactions.filter((t) => t.dueAmount > 0 && !isAdvance(t));
const receivableOf = (party: PartySummary) => receivableTxns(party).reduce((s, t) => s + t.dueAmount, 0);
const partyKey = (party: Pick<PartySummary, 'partyNumber' | 'partyName'>) =>
    normalizePartyNumber(party.partyNumber) || party.partyName.trim().toLowerCase();
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
const modeLabel = (m: string) => (m ? (m.toLowerCase() === 'upi' ? 'UPI' : m.replace(/_/g, ' ').toUpperCase()) : '');
const orderLabel = (t: LedgerTransaction) => t.invoiceNumber || `#${t.id.slice(0, 6).toUpperCase()}`;

const CataloguePartyLedger: React.FC = () => {
    const {
        companyId, isLoading, authLoading, error,
        datePreset, setDatePreset,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        appliedFilters, setAppliedFilters, partySummaries,
        selectedPartyName, setSelectedPartyName,
        selectedPartyLedger,
        updateTransactionLocally,
        updateOpeningBalanceLocally,
        addOpeningBalance,
        addBulkOpeningBalances,
        deleteParty,
        deleteAllParties,
        updatePartyDetails,
    } = useCataloguePartyLedger();

    const navigate = useNavigate();
    const [sendingReminderFor, setSendingReminderFor] = useState<string | null>(null);

    // Bill action sheet (WhatsApp / Download / Print / QR), same as the Orders page
    const { currentUser } = useAuth();
    const { items: catalogueItems } = useCatalogueData();
    const [actionModal, setActionModal] = useState<{ message: string; type: State } | null>(null);
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [billSettings, setBillSettings] = useState<any>(null);
    const [catalogueWhatsappExtra, setCatalogueWhatsappExtra] = useState<string>('');

    useEffect(() => {
        const cid = currentUser?.companyId;
        if (!cid) return;
        (async () => {
            try {
                const companySnap = await getDoc(doc(db, 'companies', cid));
                if (companySnap.exists()) setCompanyInfo(companySnap.data());
                const billSnap = await getDoc(doc(db, 'companies', cid, 'settings', 'bill'));
                const data = billSnap.exists() ? billSnap.data() : {};
                setBillSettings(data);
                setCatalogueWhatsappExtra(data.catalogueWhatsappExtraMessage || '');
            } catch (err) {
                console.error('Bill settings fetch error:', err);
                setBillSettings({});
            }
        })();
    }, [currentUser?.companyId]);

    const {
        selectedOrderForAction, setSelectedOrderForAction,
        pdfLoadingOrderId, setPdfLoadingOrderId,
        showQrModal, setShowQrModal,
        sendingPdf,
        showPrintSubMenu, setShowPrintSubMenu,
        billType, setBillType,
        handlePdfAction,
        handleSendWhatsapp,
        handleSendWhatsappSnapto,
    } = useOrderCommunication({
        currentUser,
        companyInfo,
        availableItems: catalogueItems,
        catalogueWhatsappExtra,
        setModal: setActionModal,
    });

    const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
    const [isListVisible, setIsListVisible] = useState(true);
    const [isRangeOpen, setIsRangeOpen] = useState(false);
    const [pageMenuOpen, setPageMenuOpen] = useState(false);
    const [rowMenuKey, setRowMenuKey] = useState<string | null>(null);
    const [isRemindingAll, setIsRemindingAll] = useState(false);
    // Edit party (name / GSTIN / address); also opened by "Add name" and the GSTIN / Address "Add" links.
    const [partyToEdit, setPartyToEdit] = useState<PartySummary | null>(null);
    const [editForm, setEditForm] = useState({ name: '', gstNumber: '', address: '' });
    const [editFocus, setEditFocus] = useState<'name' | 'gstNumber' | 'address'>('name');
    const [isSavingParty, setIsSavingParty] = useState(false);
    // The opening-balance dialog doubles as "Add party" (editable name/number, amount optional).
    const [obMode, setObMode] = useState<'opening' | 'newParty'>('opening');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'settled'>('all');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isOBModalOpen, setIsOBModalOpen] = useState(false);
    const [availableCredit, setAvailableCredit] = useState<number>(0);
    const emptyObForm = { partyName: '', partyNumber: '', balanceType: 'due' as 'due' | 'advance', amount: '', note: '' };
    const [obForm, setObForm] = useState(emptyObForm);
    const [obLoading, setObLoading] = useState(false);

    // Bulk import
    const bulkFileInputRef = useRef<HTMLInputElement>(null);
    const [isBulkUploading, setIsBulkUploading] = useState(false);
    const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number } | null>(null);

    // Delete party / delete all
    const [partyToDelete, setPartyToDelete] = useState<PartySummary | null>(null);
    const [isDeletingParty, setIsDeletingParty] = useState(false);
    const [isSettlingAll, setIsSettlingAll] = useState(false);
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
    const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
    const [isDeletingAll, setIsDeletingAll] = useState(false);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const confirmDeleteParty = async () => {
        if (!partyToDelete) return;
        setIsDeletingParty(true);
        try {
            await deleteParty(partyToDelete);
            showToast(`${partyToDelete.partyName} deleted.`, 'success');
            setPartyToDelete(null);
        } catch (e: any) {
            showToast(e.message || 'Failed to delete party.', 'error');
        } finally {
            setIsDeletingParty(false);
        }
    };

    const confirmDeleteAll = async () => {
        setIsDeletingAll(true);
        try {
            await deleteAllParties();
            showToast('All parties deleted.', 'success');
            setIsDeleteAllModalOpen(false);
            setDeleteAllConfirmText('');
        } catch (e: any) {
            showToast(e.message || 'Failed to delete all parties.', 'error');
        } finally {
            setIsDeletingAll(false);
        }
    };

    /* ---------- WHATSAPP REMINDER ---------- */
    // One combined message listing every unpaid order / opening due.
    const sendReminderFor = async (party: PartySummary, silent = false): Promise<'sent' | 'needs_setup' | 'failed'> => {
        if (!party.partyNumber || party.partyNumber.trim() === '') {
            if (!silent) showToast('Party phone number is missing.', 'error');
            return 'failed';
        }
        if (!companyId) return 'failed';
        const owed = receivableTxns(party);
        if (owed.length === 0) {
            if (!silent) showToast('This party owes you nothing.', 'error');
            return 'failed';
        }

        setSendingReminderFor(party.partyNumber);
        try {
            const businessSnap = await getDoc(doc(db, 'companies', companyId, 'business_info', companyId));
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};
            if (!botMasterToken || !whatsappNumber) {
                navigate(ROUTES.WHATSAPP_PLAN);
                return 'needs_setup';
            }

            const money = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
            const lines = owed
                .map((t) => `• ${t.isOpeningBalance ? 'Opening Due' : orderLabel(t)}: ${money(t.dueAmount)}`)
                .join('\n');
            const total = owed.reduce((s, t) => s + t.dueAmount, 0);
            const message = `Dear ${party.partyName},\n\nThis is a gentle reminder that a total amount of ${money(total)} is due against the following invoice(s):\n\n${lines}\n\nKindly clear the due amount at your earliest convenience. Thank you!`;

            const response = await botMasterService.sendMessage(botMasterToken, whatsappNumber, party.partyNumber, message);
            let ok = false;
            if (Array.isArray(response) && response.length > 0) {
                const res = response[0];
                ok = res.status === 'sent' || res.status === 'delivered';
            } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
                ok = true;
            }
            if (!ok) throw new Error('API reported failure.');
            if (!silent) showToast('Reminder sent via WhatsApp!', 'success');
            return 'sent';
        } catch (err) {
            console.error('Catalogue Party Reminder Send Error:', err);
            if (!silent) showToast('Failed to send reminder.', 'error');
            return 'failed';
        } finally {
            setSendingReminderFor(null);
        }
    };

    const canRemind = (party: PartySummary) =>
        receivableOf(party) > 0 && normalizePartyNumber(party.partyNumber).length >= 10;

    useEffect(() => {
        setDatePreset('last30');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Period chips apply straight away — no Apply button.
    const handleDatePresetChange = (preset: string) => {
        const range = getPresetRange(preset);
        if (!range) return;
        setDatePreset(preset);
        setIsRangeOpen(false);
        setCustomStartDate(formatDateForInput(range.start));
        setCustomEndDate(formatDateForInput(range.end));
        setAppliedFilters({ start: range.start.getTime(), end: range.end.getTime() });
        setExpandedBillId(null);
    };

    const handleApplyCustomRange = (startValue: string, endValue: string) => {
        const start = parseInputDate(startValue);
        start.setHours(0, 0, 0, 0);
        const end = parseInputDate(endValue);
        end.setHours(23, 59, 59, 999);
        setDatePreset('custom');
        setCustomStartDate(startValue);
        setCustomEndDate(endValue);
        setAppliedFilters({ start: start.getTime(), end: end.getTime() });
        setIsRangeOpen(false);
        setExpandedBillId(null);
    };

    /* ---------- OPENING BALANCE / ADD PARTY ---------- */
    const openAddParty = () => {
        setObMode('newParty');
        setObForm(emptyObForm);
        setIsOBModalOpen(true);
    };

    const openAddOpeningBalance = (party: PartySummary) => {
        setObMode('opening');
        setObForm({ ...emptyObForm, partyName: party.partyName || '', partyNumber: party.partyNumber || '' });
        setIsOBModalOpen(true);
    };

    const handleAddOpeningBalance = async () => {
        const amount = Number(obForm.amount) || 0;
        if (obMode === 'newParty') {
            if (!obForm.partyName.trim()) return showToast('Enter the party name.', 'error');
            if (obForm.partyNumber.replace(/\D/g, '').length !== 10) return showToast('Enter a 10-digit phone number.', 'error');
            setObLoading(true);
            try {
                const result = await addBulkOpeningBalances([{
                    partyName: obForm.partyName.trim(),
                    partyNumber: obForm.partyNumber.trim(),
                    partyType: 'Customer',
                    amount,
                    balanceType: obForm.balanceType,
                    note: obForm.note.trim(),
                    date: Date.now(),
                }]);
                if (result.duplicates) showToast('That number already belongs to another party.', 'error');
                else if (result.failed) showToast('Failed to add the party.', 'error');
                else {
                    setIsOBModalOpen(false);
                    setObForm(emptyObForm);
                    showToast(`${obForm.partyName.trim()} added.`, 'success');
                }
            } catch {
                showToast('Failed to add the party.', 'error');
            } finally {
                setObLoading(false);
            }
            return;
        }

        if (!obForm.partyName.trim() || amount <= 0) return showToast('Please fill in party name and a valid amount.', 'error');
        setObLoading(true);
        try {
            const { credit } = await addOpeningBalance(
                obForm.partyName.trim(), obForm.partyNumber.trim(), 'Customer', amount, obForm.note.trim(), obForm.balanceType,
            );
            setIsOBModalOpen(false);
            setObForm(emptyObForm);
            if (credit === 'failed') showToast('Opening balance saved but credit update failed.', 'error');
            else if (credit === 'no_phone') showToast('Opening balance saved. No phone number, so credit was not linked.', 'error');
            else showToast('Opening balance added successfully!', 'success');
        } catch {
            showToast('Failed to add opening balance.', 'error');
        } finally {
            setObLoading(false);
        }
    };

    /* ---------- BULK IMPORT ---------- */
    const parseExcelDate = (val: any): number | undefined => {
        if (!val) return undefined;
        if (val instanceof Date) return val.getTime();
        const str = val.toString().trim();
        if (!str) return undefined;
        const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmy) {
            const day = parseInt(dmy[1], 10), month = parseInt(dmy[2], 10), year = parseInt(dmy[3], 10);
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const d = new Date(year, month - 1, day);
                if (!isNaN(d.getTime())) return d.getTime();
            }
        }
        const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (iso) {
            const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
            if (!isNaN(d.getTime())) return d.getTime();
        }
        const parsed = new Date(str);
        return isNaN(parsed.getTime()) ? undefined : parsed.getTime();
    };

    const handleBulkFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        executeBulkImport(file);
    };

    const executeBulkImport = async (file: File) => {
        if (!companyId) return;
        setIsBulkUploading(true);
        setBulkUploadProgress(null);
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(await file.arrayBuffer());
            const worksheet = workbook.worksheets[0];
            if (!worksheet) throw new Error('Excel file is empty.');

            const safeGetVal = (rowObj: any, colIdx: number) => {
                const val = rowObj.getCell(colIdx).value;
                if (val === null || val === undefined) return '';
                if (val instanceof Date) return val;
                if (typeof val === 'object' && 'richText' in val) return val.richText.map((rt: any) => rt.text).join('').trim();
                if (typeof val === 'object' && 'text' in val) return (val.text || '').toString().trim();
                return val.toString().trim();
            };

            let headerRowNum = 1;
            for (let r = 1; r <= Math.min(worksheet.rowCount, 15); r++) {
                const cell = (safeGetVal(worksheet.getRow(r), 3) as string).toLowerCase();
                if (cell && cell.includes('party name')) { headerRowNum = r; break; }
            }
            const dataStartRow = headerRowNum + 2;

            const rowsToImport: BulkOpeningBalanceRow[] = [];
            let skippedCount = 0;
            for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
                const row = worksheet.getRow(r);
                const partyName = (safeGetVal(row, 3) as string).trim();
                if (!partyName) continue;

                const dateVal = safeGetVal(row, 1);
                const typeVal = (safeGetVal(row, 2) as string).toLowerCase();
                const partyNumber = (safeGetVal(row, 4) as string).trim();
                const dueVal = parseFloat(safeGetVal(row, 5) as string) || 0;
                const advanceVal = parseFloat(safeGetVal(row, 6) as string) || 0;
                const narration = (safeGetVal(row, 7) as string).trim();
                const address = (safeGetVal(row, 8) as string).trim();
                const gstNumber = (safeGetVal(row, 9) as string).trim().toUpperCase();

                // Type must be explicitly Customer/Supplier; number must be a valid 10-digit phone.
                if (!typeVal || !(typeVal.startsWith('c') || typeVal.startsWith('s'))) { skippedCount++; continue; }
                if (partyNumber.replace(/\D/g, '').length !== 10) { skippedCount++; continue; }
                // Both filled is ambiguous; neither filled just adds the party.
                if (dueVal > 0 && advanceVal > 0) { skippedCount++; continue; }

                rowsToImport.push({
                    partyName,
                    partyNumber,
                    partyType: typeVal.startsWith('s') ? 'Supplier' : 'Customer',
                    amount: dueVal > 0 ? dueVal : advanceVal > 0 ? advanceVal : 0,
                    balanceType: dueVal > 0 ? 'due' : advanceVal > 0 ? 'advance' : 'due',
                    note: narration,
                    address: address || undefined,
                    gstNumber: gstNumber || undefined,
                    date: parseExcelDate(dateVal),
                });
            }
            if (rowsToImport.length === 0) {
                throw new Error('No valid rows found. Check Party Name and Credit/Debit Balance columns.');
            }

            setBulkUploadProgress({ current: 0, total: rowsToImport.length });
            const result = await addBulkOpeningBalances(rowsToImport, (current, total) => setBulkUploadProgress({ current, total }));

            const noteParts = [
                skippedCount ? `${skippedCount} skipped (missing type/number, or both balances filled)` : '',
                result.duplicates ? `${result.duplicates} skipped as duplicate number` : '',
            ].filter(Boolean).join(', ');
            if (result.failed > 0 || result.duplicates > 0) {
                showToast(`Imported ${result.success}, ${result.failed} failed${noteParts ? `, ${noteParts}` : ''}.`, 'error');
            } else {
                showToast(`Imported ${result.success} opening balances successfully!${noteParts ? ` (${noteParts})` : ''}`, 'success');
            }
        } catch (err: any) {
            showToast(err.message || 'Failed to import file.', 'error');
        } finally {
            setIsBulkUploading(false);
            setBulkUploadProgress(null);
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
        }
    };

    const handleDownloadBulkSample = () => {
        const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
            font: { name: 'Arial', ...font },
            fill: fill ?? {},
            alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
            border: border ?? {},
        });
        const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
        const thinBorder = (sides: ('top' | 'bottom' | 'left' | 'right')[]) => {
            const b: any = {};
            sides.forEach((side) => { b[side] = { style: 'thin', color: { rgb: 'FED7AA' } }; });
            return b;
        };
        const allBorders = thinBorder(['top', 'bottom', 'left', 'right']);
        const bblr = thinBorder(['bottom', 'left', 'right']);

        const COLS = [
            { header: '● Date', note: 'DD/MM/YYYY (Optional, defaults to today)', width: 14 },
            { header: '★ Type', note: 'Customer or Supplier', width: 14 },
            { header: '★ Party Name', note: 'Full party name', width: 22 },
            { header: '★ Party Number', note: 'Phone number (Required)', width: 16 },
            { header: '● Due Amount', note: 'They owe you (₹) — leave blank if none', width: 16 },
            { header: '● Advance Amount', note: 'You owe them (₹) — leave both blank to just add the party', width: 16 },
            { header: '● Narration', note: 'Optional note / description', width: 26 },
            { header: '● Party Address', note: 'Optional — full address', width: 26 },
            { header: '● GST Number', note: 'Optional — GSTIN', width: 18 },
        ];
        const REQ = { bg: 'FEE2E2', txt: 'DC2626' };
        const OPT = { bg: 'DCFCE7', txt: '15803D' };
        const colCount = COLS.length;
        const legendRows = [
            { bg: REQ.bg, txt: REQ.txt, marker: '★  Required', desc: 'Must be filled in – row will be skipped if missing' },
            { bg: OPT.bg, txt: OPT.txt, marker: '●  Optional', desc: 'Leave blank if not applicable' },
        ];
        const sampleRows = [
            ['01/04/2024', 'Customer', 'Ramesh Traders', '9876543210', 5000, '', 'Pending from last year', 'Shop 12, MG Road, Lucknow', '09ABCDE1234F1Z5'],
            ['15/03/2024', 'Supplier', 'Sharma Distributors', '9123456780', '', 3000, 'Advance paid for stock', 'Plot 4, Industrial Area, Kanpur', '09XYZAB5678G1Z2'],
        ];

        const aoa: any[][] = Array.from({ length: 11 }, () => Array(colCount).fill(null));
        aoa[0][0] = 'SELLAR  ·  Old Invoices / Opening Balance Import Template';
        aoa[1][0] = 'Fill in the rows below and upload this file in Party Ledger → Bulk Import. Do NOT rename column headers. Fill only ONE of Due Amount or Advance Amount per row.';
        aoa[3][0] = 'LEGEND';
        legendRows.forEach((l, i) => { aoa[4 + i][0] = l.marker; aoa[4 + i][1] = l.desc; });
        COLS.forEach((c, i) => { aoa[7][i] = c.header; aoa[8][i] = c.note; });
        sampleRows.forEach((row, ri) => row.forEach((val, ci) => { aoa[9 + ri][ci] = val; }));

        const ws: any = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = COLS.map((c) => ({ wch: c.width }));
        ws['!rows'] = [{ hpt: 34 }, { hpt: 24 }, { hpt: 8 }, { hpt: 20 }, { hpt: 18 }, { hpt: 8 }, { hpt: 30 }, { hpt: 22 }];
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
            ...legendRows.map((_, i) => ({ s: { r: 4 + i, c: 1 }, e: { r: 4 + i, c: 3 } })),
        ];
        const style = (addr: string, st: any) => {
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            ws[addr].s = st;
        };
        style('A1', s({ sz: 15, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('EA580C'), { horizontal: 'center', vertical: 'center' }));
        style('A2', s({ sz: 9, italic: true, color: { rgb: '7C2D12' } }, solidFill('FFEDD5'), { horizontal: 'center', vertical: 'center', wrapText: true }));
        style('A4', s({ sz: 10, bold: true, color: { rgb: 'C2410C' } }, solidFill('FFF7ED'), { horizontal: 'left', vertical: 'center' }, allBorders));
        legendRows.forEach((l, i) => {
            const row = 5 + i;
            style(`A${row}`, s({ sz: 9, bold: true, color: { rgb: l.txt } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
            style(`B${row}`, s({ sz: 9, color: { rgb: '334155' } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
            ['C', 'D'].forEach((col) => {
                const addr = `${col}${row}`;
                if (!ws[addr]) ws[addr] = { t: 's', v: '' };
                ws[addr].s = s({ sz: 9 }, solidFill(l.bg), {}, bblr);
            });
        });
        COLS.forEach((c, i) => {
            const { bg, txt } = c.header.startsWith('★') ? REQ : OPT;
            style(XLSX.utils.encode_cell({ r: 7, c: i }), s({ sz: 9, bold: true, color: { rgb: txt } }, solidFill(bg), { horizontal: 'center', vertical: 'center', wrapText: true }, allBorders));
            style(XLSX.utils.encode_cell({ r: 8, c: i }), s({ sz: 7, italic: true, color: { rgb: '64748B' } }, solidFill('F8FAFC'), { horizontal: 'center', vertical: 'center', wrapText: true }, bblr));
        });
        sampleRows.forEach((row, ri) => {
            const altBg = ri % 2 === 1 ? 'FFF7ED' : 'FFFFFF';
            row.forEach((_v, ci) => style(XLSX.utils.encode_cell({ r: 9 + ri, c: ci }), s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr)));
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'OpeningBalances');
        XLSX.writeFile(wb, 'Sellar_OpeningBalances_Import_Template.xlsx');
    };

    /* ---------- SETTLE PAYMENT ---------- */
    // One order or opening balance. Credit-note payments reduce the customer's creditBalance
    // (applied after the payment itself succeeded).
    const handleSettlePayment = async (
        invoice: any,
        amount: number,
        method: string,
        paymentDate: string,
        chequeNumber?: string,
        chequeDate?: string,
    ) => {
        try {
            if (!companyId) throw new Error('Company ID not found. Please log in again.');
            if (amount <= 0) throw new Error('Payment amount must be greater than 0.');
            if (!invoice.id) throw new Error('Invalid invoice data.');

            const paymentRecord: PaymentRecord = {
                amount,
                method: method.toLowerCase(),
                date: new Date(paymentDate).toISOString(),
                timestamp: Date.now(),
                ...(method.toUpperCase() === 'PDC' && { chequeNumber: chequeNumber || '', chequeDate: chequeDate || '' }),
            };

            if (invoice.isOpeningBalance) {
                const obRef = doc(db, 'companies', companyId, 'openingBalances', invoice.id);
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(obRef);
                    if (!sfDoc.exists()) throw new Error('Opening balance record not found.');
                    const data = sfDoc.data();
                    const currentDue = data.dueAmount ?? data.amount ?? 0;
                    if (amount > currentDue) throw new Error(`Amount (₹${amount}) exceeds due (₹${currentDue}).`);
                    transaction.update(obRef, {
                        dueAmount: Math.max(0, currentDue - amount),
                        paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                    });
                });
                updateOpeningBalanceLocally(invoice.id, amount, paymentRecord);
            } else {
                const orderRef = doc(db, 'companies', companyId, 'Orders', invoice.id);
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(orderRef);
                    if (!sfDoc.exists()) throw new Error('Order not found in database.');
                    const data = sfDoc.data();
                    const currentPaid = Number(data.paidAmount || 0);
                    const currentTotal = Number(data.totalAmount || 0);
                    const currentDue = currentTotal - currentPaid;
                    if (amount > currentDue) throw new Error(`Payment amount (₹${amount}) exceeds due amount (₹${currentDue.toFixed(0)}).`);
                    const newPaid = currentPaid + amount;
                    transaction.update(orderRef, {
                        paidAmount: newPaid,
                        paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                        status: newPaid >= currentTotal ? 'Paid' : data.status,
                        updatedAt: new Date(),
                    });
                });
                updateTransactionLocally(invoice.id, amount, paymentRecord);
            }

            const isCredit = ['CREDIT NOTE', 'CREDIT'].includes(method.toUpperCase());
            const phone = normalizePartyNumber(invoice.partyNumber);
            if (isCredit && phone) {
                await setDoc(
                    doc(db, 'companies', companyId, 'customers', phone),
                    { creditBalance: increment(-amount), updatedAt: serverTimestamp() },
                    { merge: true },
                );
                setAvailableCredit((prev) => Math.max(0, prev - amount));
            }

            setIsPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
            showToast(
                invoice.isOpeningBalance
                    ? `Opening balance payment of ₹${amount} settled via ${method}!`
                    : `Payment of ₹${amount} settled successfully!`,
                'success',
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error occurred';
            showToast(`Failed to settle payment: ${message}`, 'error');
            throw err;
        }
    };

    // The same PaymentModal is reused for "Settle all": the amount is spread over the
    // party's unpaid entries, oldest first, via handleSettlePayment.
    const handleSettleAllPayment = async (
        invoice: any,
        amount: number,
        method: string,
        paymentDate: string,
        chequeNumber?: string,
        chequeDate?: string,
    ) => {
        const party: PartySummary | undefined = invoice?.partyRef;
        if (!party) return showToast('Party details missing for settle-all.', 'error');

        const unpaid = receivableTxns(party).sort((a, b) => a.createdAt - b.createdAt);
        if (unpaid.length === 0) return showToast('No due bills found for this party.', 'error');
        if (amount <= 0) return showToast('Payment amount must be greater than 0.', 'error');
        const totalDue = unpaid.reduce((s, t) => s + t.dueAmount, 0);
        if (amount > totalDue) return showToast(`Amount (₹${amount}) exceeds total due (₹${totalDue}).`, 'error');

        setIsSettlingAll(true);
        let remaining = amount;
        let successCount = 0;
        let failCount = 0;
        for (const txn of unpaid) {
            if (remaining <= 0) break;
            const portion = Math.min(remaining, txn.dueAmount);
            try {
                await handleSettlePayment(
                    { ...txn, partyNumber: party.partyNumber },
                    portion, method, paymentDate, chequeNumber, chequeDate,
                );
                remaining -= portion;
                successCount++;
            } catch {
                failCount++;
            }
        }
        setIsSettlingAll(false);
        setIsPaymentModalOpen(false);
        setSelectedInvoiceForPayment(null);
        setAvailableCredit(0);
        if (failCount > 0) showToast(`Settled ${successCount} bill(s), ${failCount} failed.`, 'error');
        else showToast(`₹${amount} settled across ${successCount} bill(s)!`, 'success');
    };

    // Credit notes the customer already holds, offered in the payment modal.
    const loadAvailableCredit = async (partyNumber: string) => {
        const phone = normalizePartyNumber(partyNumber);
        if (!phone || !companyId) return setAvailableCredit(0);
        try {
            const snap = await getDoc(doc(db, 'companies', companyId, 'customers', phone));
            setAvailableCredit(snap.exists() ? Number(snap.data().creditBalance || 0) : 0);
        } catch {
            setAvailableCredit(0);
        }
    };

    const openSettleForTxn = async (party: PartySummary, txn: LedgerTransaction) => {
        setSelectedInvoiceForPayment({
            id: txn.id,
            invoiceNumber: txn.invoiceNumber,
            type: 'sale',
            totalAmount: txn.totalAmount,
            dueAmount: txn.dueAmount,
            partyName: party.partyName,
            partyNumber: party.partyNumber,
            createdAt: txn.createdAt,
            isOpeningBalance: txn.isOpeningBalance === true,
            balanceType: txn.balanceType || 'due',
        });
        await loadAvailableCredit(party.partyNumber);
        setIsPaymentModalOpen(true);
    };

    const openSettleAll = async (party: PartySummary) => {
        const txns = receivableTxns(party);
        const total = txns.reduce((s, t) => s + t.dueAmount, 0);
        if (total <= 0) return showToast('Nothing due for this party.', 'error');
        setSelectedInvoiceForPayment({
            isSettleAll: true,
            partyRef: { ...party, transactions: txns, totalDue: total },
            id: `settle-all-${partyKey(party)}`,
            invoiceNumber: 'All dues',
            type: 'sale',
            totalAmount: total,
            dueAmount: total,
            partyName: party.partyName,
            partyNumber: party.partyNumber,
            isOpeningBalance: false,
        });
        await loadAvailableCredit(party.partyNumber);
        setIsPaymentModalOpen(true);
    };

    /* ---------- LIST: FILTERS + COUNTS ---------- */
    const parties = useMemo(
        () => partySummaries.map((p) => ({
            party: p,
            receivable: receivableOf(p),
            lastEntry: Math.max(0, ...p.transactions.map((t) => t.createdAt)),
        })),
        [partySummaries],
    );

    const totals = useMemo(() => {
        const owing = parties.filter((p) => p.receivable > 0);
        return {
            toCollect: owing.reduce((s, p) => s + p.receivable, 0),
            collectCount: owing.length,
            billed: parties.reduce((s, p) => s + p.party.totalBilled, 0),
            due: owing.length,
            settled: parties.length - owing.length,
        };
    }, [parties]);

    const filteredParties = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return parties
            .filter(({ party, receivable }) => {
                const matchesSearch = !q || party.partyName.toLowerCase().includes(q) || party.partyNumber.toLowerCase().includes(q);
                const matchesStatus = statusFilter === 'all' || (statusFilter === 'due' ? receivable > 0 : receivable === 0);
                return matchesSearch && matchesStatus;
            })
            .sort((a, b) => b.receivable - a.receivable || a.party.partyName.localeCompare(b.party.partyName));
    }, [parties, searchQuery, statusFilter]);

    const remindableParties = parties.filter((p) => canRemind(p.party));

    const remindAll = async () => {
        if (remindableParties.length === 0) return;
        setIsRemindingAll(true);
        let sent = 0;
        for (const p of remindableParties) {
            const result = await sendReminderFor(p.party, true);
            if (result === 'needs_setup') break;
            if (result === 'sent') sent += 1;
        }
        setIsRemindingAll(false);
        showToast(
            sent === remindableParties.length ? `Reminders sent to ${sent} parties.` : `Sent ${sent} of ${remindableParties.length} reminders.`,
            sent === remindableParties.length ? 'success' : 'error',
        );
    };

    /* ---------- SINGLE PARTY: STATEMENT ---------- */
    interface StatementEntry {
        key: string;
        date: number;
        title: string;
        sub: string;
        mode: string;
        /** Effect on "they owe you": + raises it, − lowers it. */
        effect: number;
        isPayment: boolean;
        txn: LedgerTransaction;
    }

    const statement = useMemo(() => {
        if (!selectedPartyLedger) return null;
        const entries: StatementEntry[] = [];
        selectedPartyLedger.transactions.forEach((t) => {
            const advance = isAdvance(t);
            entries.push({
                key: `b-${t.id}`,
                date: t.createdAt,
                title: t.isOpeningBalance ? (advance ? 'Advance (you owe them)' : 'Opening balance') : orderLabel(t),
                sub: t.isOpeningBalance ? (t.note ? `Note: ${t.note}` : '') : `Order${t.items?.length ? ` · ${t.items.length} items` : ''}`,
                mode: '',
                effect: advance ? -t.totalAmount : t.totalAmount,
                isPayment: false,
                txn: t,
            });
            (t.paymentHistory || []).forEach((p, i) => {
                const when = p.timestamp || Date.parse(p.date) || t.createdAt;
                entries.push({
                    key: `p-${t.id}-${i}`,
                    date: when,
                    title: advance ? 'Advance adjusted' : 'Payment received',
                    sub: t.isOpeningBalance ? 'against opening balance' : `against ${orderLabel(t)}`,
                    mode: modeLabel(p.method || ''),
                    effect: advance ? p.amount : -p.amount,
                    isPayment: true,
                    txn: t,
                });
            });
        });
        // Oldest first; a bill before its own payments on the same moment.
        entries.sort((a, b) => a.date - b.date || Number(a.isPayment) - Number(b.isPayment));
        let running = 0;
        const rows = entries.map((e) => {
            running += e.effect;
            return { ...e, balance: running };
        });
        const received = entries.filter((e) => e.isPayment && e.effect < 0).reduce((s, e) => s - e.effect, 0);
        const receivableBilled = entries.filter((e) => !e.isPayment && e.effect > 0).reduce((s, e) => s + e.effect, 0);
        const payments = entries.filter((e) => e.isPayment);
        const lastPayment = payments.length ? payments[payments.length - 1] : null;
        const receivable = receivableOf(selectedPartyLedger);
        const oldestDue = receivableTxns(selectedPartyLedger).reduce((min, t) => Math.min(min, t.createdAt), Infinity);
        return {
            rows,
            closing: running,
            received,
            receivableBilled,
            payments,
            lastPayment,
            modes: [...new Set(payments.map((p) => p.mode).filter(Boolean))],
            firstEntry: entries.length ? entries[0].date : 0,
            oldestDue: Number.isFinite(oldestDue) ? oldestDue : 0,
            receivable,
        };
    }, [selectedPartyLedger]);

    const balanceWords = (net: number) =>
        net > 0 ? { label: 'They owe you', value: inr(net), cls: 'text-yellow-700' }
            : { label: 'Balance', value: 'Settled ✓', cls: 'text-green-700' };

    const daysSince = (t: number) => Math.max(0, Math.floor((Date.now() - t) / 86_400_000));

    const downloadStatementPdf = () => {
        if (!selectedPartyLedger || !statement) return;
        try {
            const pdf = new jsPDF();
            const pw = pdf.internal.pageSize.getWidth();
            pdf.setFillColor(249, 115, 22);
            pdf.rect(0, 0, pw, 6, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(20);
            pdf.setTextColor(17, 24, 39);
            pdf.text(`Statement — ${selectedPartyLedger.partyName}`, 14, 22);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(107, 114, 128);
            pdf.text(
                [
                    selectedPartyLedger.partyNumber ? `Phone: ${formatPhone(selectedPartyLedger.partyNumber)}` : '',
                    appliedFilters ? `Period: ${formatRangeLabel(appliedFilters.start, appliedFilters.end)}` : '',
                    `Generated: ${formatFullDate(Date.now())}`,
                ].filter(Boolean).join('   |   '),
                14,
                29,
            );
            const money = (n: number) => `Rs. ${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
            autoTable(pdf, {
                startY: 36,
                head: [['DATE', 'ENTRY', 'MODE', 'BILLED', 'PAID', 'BALANCE']],
                body: statement.rows.map((r) => [
                    formatFullDate(r.date),
                    r.title + (r.sub ? `\n${r.sub}` : ''),
                    r.mode || '-',
                    r.isPayment ? '' : `${r.effect < 0 ? '- ' : ''}${money(r.effect)}`,
                    r.isPayment ? `${r.effect < 0 ? '+ ' : '- '}${money(r.effect)}` : '',
                    `${money(r.balance)}${r.balance > 0 ? ' due to you' : r.balance < 0 ? ' you owe' : ''}`,
                ]),
                foot: [[
                    'Closing balance', '', '', '', '',
                    statement.closing === 0 ? 'Settled' : `${money(statement.closing)}${statement.closing > 0 ? ' due to you' : ' you owe'}`,
                ]],
                showFoot: 'lastPage',
                theme: 'plain',
                styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, textColor: [55, 65, 81] },
                headStyles: { fillColor: [255, 247, 237], textColor: [17, 24, 39], fontStyle: 'bold' },
                footStyles: { textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1 }, lineColor: [17, 24, 39] },
                columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
            });
            pdf.save(`Statement_${selectedPartyLedger.partyName.replace(/[^\w]+/g, '_')}_${formatDateForInput(new Date())}.pdf`);
        } catch (err) {
            console.error('Statement PDF failed:', err);
            showToast('Failed to create the statement PDF.', 'error');
        }
    };

    /* ---------- RENDER HELPERS ---------- */
    const avatar = (name: string, size = 'h-9 w-9') => (
        <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-700`}>
            {name && name !== 'N/A' ? name[0].toUpperCase() : '?'}
        </span>
    );

    const openParty = (party: PartySummary) => {
        // Parties without a phone are found by name instead.
        setSelectedPartyName(party.partyNumber ? party.partyNumber : party.partyName);
        setExpandedBillId(null);
        setRowMenuKey(null);
    };

    const hasPhone = (party: PartySummary) => normalizePartyNumber(party.partyNumber).length === 10;

    // Opens the same action sheet the Orders page opens for an order.
    const openBillActions = async (t: LedgerTransaction) => {
        if (!companyId) return;
        try {
            // Full order document, so the PDF gets the same fields as on the Orders page
            const snap = await getDoc(doc(db, 'companies', companyId, 'Orders', t.id));
            if (!snap.exists()) throw new Error('Order not found.');
            setSelectedOrderForAction({ ...snap.data(), id: t.id } as unknown as Order);
        } catch (err) {
            console.error('Open bill failed:', err);
            showToast('Could not load the bill. Please try again.', 'error');
        }
    };
    const hasRealName = (party: PartySummary) => !!party.partyName && party.partyName !== 'N/A' && party.partyName !== 'Unknown';

    const openEditParty = (party: PartySummary, focus: 'name' | 'gstNumber' | 'address' = 'name') => {
        setRowMenuKey(null);
        setPartyToEdit(party);
        setEditFocus(focus);
        setEditForm({ name: hasRealName(party) ? party.partyName : '', gstNumber: party.gstNumber || '', address: party.address || '' });
    };

    const saveParty = async () => {
        if (!partyToEdit) return;
        const gst = editForm.gstNumber.trim();
        if (gst && !/^[0-9]{2}[A-Z0-9]{13}$/i.test(gst)) return showToast('GSTIN should be 15 characters, e.g. 09ABCDE1234F1Z5.', 'error');
        setIsSavingParty(true);
        try {
            await updatePartyDetails(partyToEdit, editForm);
            showToast('Party details saved.', 'success');
            setPartyToEdit(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not save. Try again.', 'error');
        } finally {
            setIsSavingParty(false);
        }
    };

    const chipClass = (active: boolean) =>
        `shrink-0 whitespace-nowrap rounded-sm border px-3 py-1.5 text-sm font-medium transition ${active
            ? 'border-orange-700 bg-orange-700 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300'
        }`;
    const segClass = (active: boolean) =>
        `whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-orange-700 text-white' : 'text-slate-600 hover:bg-white'}`;
    const inputClass = 'mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100';
    const primaryBtn = 'rounded-sm bg-orange-700 font-semibold text-white transition hover:bg-orange-800 disabled:opacity-50';

    const rowMenu = (party: PartySummary, key: string) => (
        <div className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); setRowMenuKey((k) => (k === key ? null : key)); }}
                aria-label="More actions"
                className="rounded-sm p-1.5 text-slate-500 transition hover:bg-orange-50"
            >
                <MoreHorizontal size={16} />
            </button>
            {rowMenuKey === key && (
                <>
                    <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setRowMenuKey(null); }} />
                    <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-sm border border-orange-100 bg-white p-1 shadow-float">
                        {key !== 'detail' && (
                            <button onClick={(e) => { e.stopPropagation(); openParty(party); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-orange-50">
                                <FileText size={14} /> Open statement
                            </button>
                        )}
                        {hasPhone(party) && (
                            <button onClick={(e) => { e.stopPropagation(); openEditParty(party); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-orange-50">
                                <Pencil size={14} /> Edit party
                            </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setRowMenuKey(null); openAddOpeningBalance(party); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-orange-50">
                            <Plus size={14} /> Add opening balance
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setRowMenuKey(null); setPartyToDelete(party); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                            <Trash2 size={14} /> Delete party
                        </button>
                    </div>
                </>
            )}
        </div>
    );

    if (authLoading || (isLoading && partySummaries.length === 0)) return <Spinner />;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';
    const dimClass = isLoading ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity';

    /* ---------- MODALS (shared by both views) ---------- */
    const modals = (
        <>
            {/* Opening balance / Add party */}
            {isOBModalOpen && (
                <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/40 md:items-center md:px-4" onClick={() => setIsOBModalOpen(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-sm bg-white shadow-float md:max-w-md md:rounded-sm">
                        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 md:hidden" />
                        <div className="flex items-start gap-3 border-b border-orange-100 px-5 py-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-orange-100 text-orange-700">
                                {obMode === 'newParty' ? <UserPlus size={18} /> : <Scale size={18} />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-semibold text-slate-900">{obMode === 'newParty' ? 'Add party' : 'Add opening balance'}</h2>
                                <p className="text-xs text-slate-500">{obMode === 'newParty' ? 'A customer, with any old balance' : obForm.partyName}</p>
                            </div>
                            <button onClick={() => setIsOBModalOpen(false)} aria-label="Close" className="rounded-sm p-1 text-slate-400 hover:bg-orange-50 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-4 px-5 py-4">
                            {obMode === 'newParty' && (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_9rem]">
                                    <label className="block text-xs font-medium text-slate-600">
                                        Party name <span className="text-red-500">*</span>
                                        <input value={obForm.partyName} onChange={(e) => setObForm((f) => ({ ...f, partyName: e.target.value }))} autoFocus placeholder="e.g. Ramesh Traders" className={inputClass} />
                                    </label>
                                    <label className="block text-xs font-medium text-slate-600">
                                        Phone <span className="text-red-500">*</span>
                                        <input value={obForm.partyNumber} inputMode="numeric" maxLength={10} onChange={(e) => setObForm((f) => ({ ...f, partyNumber: e.target.value.replace(/\D/g, '') }))} placeholder="10 digits" className={inputClass} />
                                    </label>
                                </div>
                            )}
                            <div>
                                <p className="text-xs font-medium text-slate-600">{obMode === 'newParty' ? 'Old balance' : 'Balance type'}</p>
                                <div className="mt-1 flex gap-1 rounded-sm bg-orange-50 p-1">
                                    <button onClick={() => setObForm((f) => ({ ...f, balanceType: 'due' }))} className={`flex-1 ${segClass(obForm.balanceType === 'due')}`}>They owe you</button>
                                    <button onClick={() => setObForm((f) => ({ ...f, balanceType: 'advance' }))} className={`flex-1 ${segClass(obForm.balanceType === 'advance')}`}>You owe them</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-[9rem_1fr]">
                                <label className="block text-xs font-medium text-slate-600">
                                    Amount (₹) {obMode === 'opening' ? <span className="text-red-500">*</span> : <span className="font-normal text-slate-400">· optional</span>}
                                    <input type="number" value={obForm.amount} onChange={(e) => setObForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" className={inputClass} />
                                </label>
                                <label className="block text-xs font-medium text-slate-600">
                                    Note <span className="font-normal text-slate-400">· optional</span>
                                    <input value={obForm.note} onChange={(e) => setObForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Pending from last year" className={inputClass} />
                                </label>
                            </div>
                        </div>
                        <div className="flex gap-2 border-t border-orange-100 px-5 py-4 md:justify-end">
                            <button onClick={() => setIsOBModalOpen(false)} className="hidden rounded-sm px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-orange-50 md:block">Cancel</button>
                            <button onClick={handleAddOpeningBalance} disabled={obLoading} className={`w-full px-4 py-3 text-sm md:w-auto md:py-2 ${primaryBtn}`}>
                                {obLoading ? 'Saving…' : obMode === 'newParty' ? 'Add party' : 'Save opening balance'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit party */}
            {partyToEdit && (
                <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/40 md:items-center md:px-4" onClick={() => !isSavingParty && setPartyToEdit(null)}>
                    <form
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={(e) => { e.preventDefault(); saveParty(); }}
                        className="w-full rounded-t-sm bg-white shadow-float md:max-w-md md:rounded-sm"
                    >
                        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 md:hidden" />
                        <div className="flex items-start gap-3 border-b border-orange-100 px-5 py-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-orange-100 text-orange-700"><Pencil size={18} /></span>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-semibold text-slate-900">Edit party</h2>
                                <p className="text-xs text-slate-500">{formatPhone(partyToEdit.partyNumber)}</p>
                            </div>
                            <button type="button" onClick={() => setPartyToEdit(null)} aria-label="Close" className="rounded-sm p-1 text-slate-400 hover:bg-orange-50 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-4 px-5 py-4">
                            <label className="block text-xs font-medium text-slate-600">
                                Party name
                                <input value={editForm.name} autoFocus={editFocus === 'name'} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ramesh Traders" className={inputClass} />
                                <span className="mt-1 block font-normal text-slate-500">Shown in the ledger and on new bills. Old orders keep the name they were placed with.</span>
                            </label>
                            <label className="block text-xs font-medium text-slate-600">
                                GSTIN <span className="font-normal text-slate-400">· optional</span>
                                <input value={editForm.gstNumber} autoFocus={editFocus === 'gstNumber'} maxLength={15} onChange={(e) => setEditForm((f) => ({ ...f, gstNumber: e.target.value.toUpperCase() }))} placeholder="09ABCDE1234F1Z5" className={`${inputClass} font-mono uppercase`} />
                            </label>
                            <label className="block text-xs font-medium text-slate-600">
                                Address <span className="font-normal text-slate-400">· optional</span>
                                <textarea value={editForm.address} autoFocus={editFocus === 'address'} rows={2} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} placeholder="Shop no., street, city" className={`${inputClass} resize-none`} />
                            </label>
                            <p className="text-xs text-slate-500">The phone number can't be changed here — every order is filed under it.</p>
                        </div>
                        <div className="flex gap-2 border-t border-orange-100 px-5 py-4 md:justify-end">
                            <button type="button" onClick={() => setPartyToEdit(null)} className="hidden rounded-sm px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-orange-50 md:block">Cancel</button>
                            <button type="submit" disabled={isSavingParty} className={`w-full px-4 py-3 text-sm md:w-auto md:py-2 ${primaryBtn}`}>
                                {isSavingParty ? 'Saving…' : 'Save details'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Delete one party */}
            {partyToDelete && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 px-4" onClick={() => !isDeletingParty && setPartyToDelete(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-sm bg-white p-5 shadow-float">
                        <div className="mb-2 flex items-center gap-2 text-red-600">
                            <AlertTriangle size={18} />
                            <h2 className="text-base font-semibold">Delete {partyToDelete.partyName}?</h2>
                        </div>
                        <p className="text-sm text-slate-600">This permanently deletes their orders and opening balance records. It can't be undone.</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setPartyToDelete(null)} disabled={isDeletingParty} className="rounded-sm border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50">Cancel</button>
                            <button onClick={async () => { await confirmDeleteParty(); }} disabled={isDeletingParty} className="inline-flex items-center gap-2 rounded-sm bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                                {isDeletingParty ? <Spinner /> : 'Delete party'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete all parties — type DELETE */}
            {isDeleteAllModalOpen && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 px-4" onClick={() => !isDeletingAll && setIsDeleteAllModalOpen(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-sm bg-white p-5 shadow-float">
                        <div className="mb-2 flex items-center gap-2 text-red-600">
                            <AlertTriangle size={18} />
                            <h2 className="text-base font-semibold">Delete all parties?</h2>
                        </div>
                        <p className="text-sm text-slate-600">This permanently deletes every order and opening balance record for your catalogue. It can't be undone.</p>
                        <label className="mt-4 block text-xs font-medium text-slate-600">
                            Type <span className="font-mono font-bold text-slate-900">DELETE</span> to confirm
                            <input value={deleteAllConfirmText} onChange={(e) => setDeleteAllConfirmText(e.target.value)} autoFocus className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500" />
                        </label>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => { setIsDeleteAllModalOpen(false); setDeleteAllConfirmText(''); }} disabled={isDeletingAll} className="rounded-sm border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50">Cancel</button>
                            <button onClick={confirmDeleteAll} disabled={deleteAllConfirmText !== 'DELETE' || isDeletingAll} className="inline-flex items-center gap-2 rounded-sm bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
                                {isDeletingAll ? <Spinner /> : 'Delete everything'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(isSettlingAll || isRemindingAll) && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
                    <div className="flex w-72 flex-col items-center gap-3 rounded-sm bg-white p-8 text-center shadow-float">
                        <Spinner />
                        <p className="text-sm font-semibold text-slate-700">{isSettlingAll ? 'Settling all due bills…' : 'Sending reminders…'}</p>
                    </div>
                </div>
            )}

            {bulkUploadProgress && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
                    <div className="w-80 rounded-sm bg-white p-8 text-center shadow-float">
                        <h3 className="mb-4 text-base font-semibold text-slate-900">Importing old balances…</h3>
                        <div className="mb-2 h-3 w-full overflow-hidden rounded-sm bg-orange-50">
                            <div className="h-3 rounded-sm bg-orange-500 transition-all duration-100" style={{ width: `${(bulkUploadProgress.current / bulkUploadProgress.total) * 100}%` }} />
                        </div>
                        <p className="font-mono text-sm text-slate-600">{bulkUploadProgress.current} / {bulkUploadProgress.total} processed</p>
                    </div>
                </div>
            )}

            {toast && (
                <div className={`fixed left-1/2 top-4 z-[9500] -translate-x-1/2 rounded-sm px-5 py-3 text-sm font-semibold text-white shadow-float ${toast.type === 'success' ? 'bg-slate-900' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}

            {selectedOrderForAction && (
                <OrderActionSheet
                    selectedOrderForAction={selectedOrderForAction}
                    setSelectedOrderForAction={setSelectedOrderForAction}
                    setShowPrintSubMenu={setShowPrintSubMenu}
                    billType={billType}
                    setBillType={setBillType}
                    handleSendWhatsapp={handleSendWhatsapp}
                    handleSendWhatsappSnapto={handleSendWhatsappSnapto}
                    companyId={companyId}
                    sendingPdf={sendingPdf}
                    pdfLoadingOrderId={pdfLoadingOrderId}
                    setPdfLoadingOrderId={setPdfLoadingOrderId}
                    handlePdfAction={handlePdfAction}
                    setShowQrModal={setShowQrModal}
                />
            )}
            {showPrintSubMenu && selectedOrderForAction && (
                <PrintSubMenuModal
                    selectedOrderForAction={selectedOrderForAction}
                    setSelectedOrderForAction={setSelectedOrderForAction}
                    setShowPrintSubMenu={setShowPrintSubMenu}
                    setPdfLoadingOrderId={setPdfLoadingOrderId}
                    handlePdfAction={handlePdfAction}
                    _billSettings={billSettings}
                />
            )}
            {showQrModal && (
                <QrCodeModal
                    showQrModal={showQrModal}
                    setShowQrModal={setShowQrModal}
                    companyId={companyId}
                />
            )}
            {actionModal && (
                <Modal message={actionModal.message} type={actionModal.type} onClose={() => setActionModal(null)} theme="catalogue" />
            )}

            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => {
                    setIsPaymentModalOpen(false);
                    setSelectedInvoiceForPayment(null);
                    setAvailableCredit(0);
                }}
                invoice={selectedInvoiceForPayment}
                availableCredit={availableCredit}
                onSubmit={selectedInvoiceForPayment?.isSettleAll ? handleSettleAllPayment : handleSettlePayment}
                theme="catalogue"
            />
            {/* Hidden file input shared by every "Upload Excel" trigger */}
            <input type="file" ref={bulkFileInputRef} onChange={handleBulkFileSelected} className="hidden" accept=".xlsx, .xls" />
        </>
    );

    /* =====================================================================
       VIEW 2 — SINGLE PARTY
       ===================================================================== */
    if (selectedPartyName && selectedPartyLedger && statement) {
        const party = selectedPartyLedger;
        const words = balanceWords(statement.receivable);
        const progressBilled = statement.receivableBilled;
        const progressPaid = statement.received;
        const progressPct = progressBilled > 0 ? Math.min(100, (progressPaid / progressBilled) * 100) : 0;
        const hasDue = statement.receivable > 0;
        const showRemind = canRemind(party);

        // One order / opening balance from the statement, in the detail panel.
        const openTxn = expandedBillId ? party.transactions.find((t) => t.id === expandedBillId) : undefined;
        const billPanel = openTxn && (() => {
            const t = openTxn;
            const advance = isAdvance(t);
            const canSettle = t.dueAmount > 0 && !advance;
            const paid = Math.max(t.totalAmount - t.dueAmount, 0);
            const time = new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
            const paidVia = Object.entries(t.paymentMethods || {}).filter(([k, v]) => k !== 'due' && Number(v) > 0);
            return (
                <DetailPanel
                    open
                    onClose={() => setExpandedBillId(null)}
                    title={t.isOpeningBalance ? (advance ? 'Advance (you owe them)' : 'Opening balance') : orderLabel(t)}
                    badge={canSettle
                        ? <span className="rounded-sm bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-700">Unpaid</span>
                        : undefined}
                    subtitle={`${formatFullDate(t.createdAt)}, ${time} · ${t.isOpeningBalance ? 'Opening balance' : 'Order'}`}
                    footer={(canSettle || !t.isOpeningBalance) ? (
                        <div className="flex gap-2">
                            {canSettle && (
                                <button onClick={() => { setExpandedBillId(null); openSettleForTxn(party, t); }} className={`inline-flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm ${primaryBtn}`}>
                                    <Check size={15} /> Settle {inr(t.dueAmount)}
                                </button>
                            )}
                            {!t.isOpeningBalance && (
                                <button
                                    type="button"
                                    onClick={() => { setExpandedBillId(null); openBillActions(t); }}
                                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-orange-300"
                                >
                                    <ExternalLink size={15} /> View bill
                                </button>
                            )}
                        </div>
                    ) : undefined}
                >
                    {t.note && <p className="rounded-sm bg-orange-50 px-3 py-2.5 text-sm text-slate-600">Note: {t.note}</p>}

                    {!t.isOpeningBalance && (
                        <DetailSection title={`Items · ${(t.items || []).length}`}>
                            <DetailItems
                                items={(t.items || []).map((item: any) => {
                                    const qty = Number(item.quantity) || 0;
                                    // Net unit price, same rule the old ledger used.
                                    const net = item.taxableAmount && qty > 0
                                        ? item.taxableAmount / qty
                                        : item.effectiveUnitPrice
                                            ? item.effectiveUnitPrice
                                            : qty > 0 ? (item.finalPrice || 0) / qty : 0;
                                    return { name: String(item.name ?? ''), quantity: qty, unitPrice: Number(net) || Number(item.mrp) || 0 };
                                })}
                            />
                        </DetailSection>
                    )}

                    <DetailSection title="Payments">
                        {(t.paymentHistory || []).length === 0 ? (
                            <p className="rounded-sm bg-orange-50 px-3 py-2.5 text-sm text-slate-500">No payments recorded against this yet.</p>
                        ) : (
                            <ul className="divide-y divide-orange-100 rounded-sm border border-orange-100">
                                {(t.paymentHistory || []).map((p, i) => {
                                    const when = p.timestamp || Date.parse(p.date) || t.createdAt;
                                    return (
                                        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                                            <div>
                                                <p className="font-medium text-slate-800">{formatFullDate(when)}</p>
                                                <p className="text-xs text-slate-500">
                                                    {new Date(when).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                                                    {p.method ? ` · ${modeLabel(p.method)}` : ''}
                                                </p>
                                            </div>
                                            <span className="font-semibold text-green-700">{inr(p.amount)}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {paidVia.length > 0 && (
                            <p className="mt-2 text-xs text-slate-500">
                                Paid via: {paidVia.map(([k, v]) => `${modeLabel(k)} ${inr(Number(v))}`).join(' · ')}
                            </p>
                        )}
                    </DetailSection>

                    <DetailSection title="Total">
                        <DetailRows
                            rows={[
                                { label: t.isOpeningBalance ? 'Amount' : 'Order total', value: inr(t.totalAmount) },
                                { label: advance ? 'Adjusted' : 'Received', value: inr(paid), tone: 'text-green-700' },
                                { label: 'Pending', value: t.dueAmount > 0 ? inr(t.dueAmount) : 'Settled ✓', tone: t.dueAmount > 0 ? 'text-yellow-700' : 'text-green-700', strong: true },
                            ]}
                        />
                    </DetailSection>
                </DetailPanel>
            );
        })();

        const kpis = [
            { label: 'Total billed', value: inr(party.totalBilled), hint: `${party.transactions.length} ${party.transactions.length === 1 ? 'entry' : 'entries'}${party.totalTransactions === 0 ? ' · opening balance' : ''}`, icon: FileText, iconClass: 'bg-orange-100 text-orange-700', valueClass: 'text-slate-900' },
            { label: 'Received', value: inr(statement.received), hint: `${statement.payments.length} ${statement.payments.length === 1 ? 'payment' : 'payments'}${statement.modes.length ? ` · ${statement.modes.join(', ').toLowerCase()}` : ''}`, icon: Wallet, iconClass: 'bg-green-50 text-green-600', valueClass: 'text-slate-900' },
            { label: 'Pending', value: statement.receivable === 0 ? '₹0' : inr(statement.receivable), hint: statement.receivable > 0 ? `they owe you${statement.oldestDue ? ` · ${daysSince(statement.oldestDue)} days` : ''}` : 'settled', icon: Scale, iconClass: 'bg-yellow-50 text-yellow-700', valueClass: statement.receivable > 0 ? 'text-yellow-700' : 'text-slate-900' },
            { label: 'Last payment', value: statement.lastPayment ? formatDayMonth(statement.lastPayment.date) : '—', hint: statement.lastPayment ? `${inr(statement.lastPayment.effect)} · ${daysSince(statement.lastPayment.date)} days ago` : 'no payments yet', icon: CalendarDays, iconClass: 'bg-orange-100 text-orange-700', valueClass: 'text-slate-900' },
        ];

        return (
            <div className="min-h-screen bg-[#fff5ec] px-3 pb-28 pt-3 md:px-6 md:pb-8 md:pt-5">
                {modals}
                {billPanel}

                {/* HEADER */}
                <header className="mb-4 flex items-center gap-2 md:gap-3">
                    <button onClick={() => { setSelectedPartyName(null); setExpandedBillId(null); }} aria-label="Back to party list" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-orange-100 md:border md:border-slate-300 md:bg-white">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="hidden md:block">{avatar(party.partyName)}</span>
                    <div className="min-w-0 flex-1">
                        <p className="hidden text-xs text-slate-500 md:block">Party ledger /</p>
                        <h1 className="truncate text-lg font-bold text-slate-900 md:text-xl">{hasRealName(party) ? party.partyName : 'No name'}</h1>
                        <p className="truncate text-xs text-slate-500 md:hidden">
                            {party.partyNumber ? formatPhone(party.partyNumber) : 'Customer'}
                        </p>
                    </div>
                    <div className="hidden items-center gap-2 md:flex">
                        <button onClick={downloadStatementPdf} className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-orange-300">
                            <ArrowDownToLine size={15} /> Statement PDF
                        </button>
                        {showRemind && (
                            <button onClick={() => sendReminderFor(party)} disabled={sendingReminderFor === party.partyNumber} className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-orange-300 disabled:opacity-50">
                                <MessageCircle size={15} className="text-green-600" /> {sendingReminderFor === party.partyNumber ? 'Sending…' : 'Remind on WhatsApp'}
                            </button>
                        )}
                        {hasDue && (
                            <button onClick={() => openSettleAll(party)} className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm shadow-sm ${primaryBtn}`}>
                                <Check size={15} /> Settle payment
                            </button>
                        )}
                    </div>
                    <button onClick={downloadStatementPdf} aria-label="Statement PDF" className="rounded-sm p-2 text-slate-700 hover:bg-orange-100 md:hidden">
                        <ArrowDownToLine size={20} />
                    </button>
                    {rowMenu(party, 'detail')}
                </header>

                <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] ${dimClass}`}>
                    <div className="min-w-0 space-y-4">
                        {/* MOBILE: balance first */}
                        <div className="rounded-sm border border-orange-100 bg-white p-4 shadow-card md:hidden">
                            <p className="text-xs text-slate-600">{words.label}</p>
                            <p className={`mt-1 text-3xl font-bold ${words.cls}`}>{words.value}</p>
                            {progressBilled > 0 && (
                                <>
                                    <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-orange-50">
                                        <div className="h-full rounded-sm bg-green-600" style={{ width: `${progressPct}%` }} />
                                    </div>
                                    <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                                        <span>Paid {inr(progressPaid)} of {inr(progressBilled)}</span>
                                        {statement.oldestDue > 0 && <span>since {formatDayMonth(statement.oldestDue)}</span>}
                                    </div>
                                </>
                            )}
                        </div>
                        {(showRemind || hasDue) && (
                            <div className="grid grid-cols-2 gap-2.5 md:hidden">
                                {showRemind ? (
                                    <button onClick={() => sendReminderFor(party)} disabled={sendingReminderFor === party.partyNumber} className="flex items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
                                        <MessageCircle size={16} className="text-green-600" /> Remind
                                    </button>
                                ) : <span />}
                                {hasDue && (
                                    <button onClick={() => openSettleAll(party)} className={`flex items-center justify-center gap-2 py-3 text-sm ${primaryBtn}`}>
                                        <Check size={16} /> Settle
                                    </button>
                                )}
                            </div>
                        )}

                        {/* DESKTOP: KPIs + progress */}
                        <div className="hidden grid-cols-4 gap-4 md:grid">
                            {kpis.map(({ label, value, hint, icon: Icon, iconClass, valueClass }) => (
                                <div key={label} className="min-w-0 rounded-sm border border-orange-100 bg-white p-4 shadow-card">
                                    <div className="flex items-center gap-2">
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm ${iconClass}`}><Icon size={14} /></span>
                                        <span className="truncate text-sm font-medium text-slate-700">{label}</span>
                                    </div>
                                    <p className={`mt-2 truncate text-2xl font-bold ${valueClass}`}>{value}</p>
                                    <p title={hint} className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>
                                </div>
                            ))}
                        </div>
                        {progressBilled > 0 && (
                            <div className="hidden rounded-sm border border-orange-100 bg-white p-4 shadow-card md:block">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600">Paid <strong className="text-slate-900">{inr(progressPaid)}</strong> of {inr(progressBilled)}</span>
                                    {progressPaid < progressBilled && (
                                        <span className="font-semibold text-yellow-700">
                                            {inr(progressBilled - progressPaid)} left · {Math.round(progressPct)}%
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-sm bg-orange-50">
                                    <div className="h-full rounded-sm bg-green-600" style={{ width: `${progressPct}%` }} />
                                </div>
                            </div>
                        )}

                        {/* STATEMENT */}
                        <section className="rounded-sm border border-orange-100 bg-white shadow-card">
                            <div className="flex flex-wrap items-center gap-3 border-b border-orange-100 px-4 py-3">
                                <h2 className="text-sm font-semibold text-slate-900">Statement</h2>
                                <span className="hidden text-xs text-slate-500 md:inline">{rangeLabel} · running balance</span>
                                <div className="ml-auto flex gap-2">
                                    <button onClick={() => openAddOpeningBalance(party)} className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-orange-300">
                                        <Plus size={13} /> Opening balance
                                    </button>
                                </div>
                            </div>

                            {statement.rows.length === 0 && (
                                <p className="px-6 py-10 text-center text-sm text-slate-500">No entries in this period. Pick a longer period from the party list, or add an opening balance.</p>
                            )}

                            {/* Desktop table */}
                            {statement.rows.length > 0 && (
                                <div className="hidden overflow-x-auto md:block">
                                    <table className="w-full text-sm">
                                        <thead className="bg-orange-50 text-[11px] uppercase tracking-wide text-orange-800">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold">Date</th>
                                                <th className="px-4 py-3 text-left font-semibold">Entry</th>
                                                <th className="px-4 py-3 text-left font-semibold">Mode</th>
                                                <th className="px-4 py-3 text-right font-semibold">Billed</th>
                                                <th className="px-4 py-3 text-right font-semibold">Paid</th>
                                                <th className="px-4 py-3 text-right font-semibold">Balance</th>
                                                <th className="w-24" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {statement.rows.map((r) => {
                                                const t = r.txn;
                                                const canSettle = !r.isPayment && t.dueAmount > 0 && !isAdvance(t);
                                                return (
                                                    <tr key={r.key} onClick={() => setExpandedBillId(t.id)} className={`cursor-pointer border-t border-orange-100 ${expandedBillId === t.id ? 'bg-orange-100' : 'hover:bg-orange-50'}`}>
                                                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                                            {formatFullDate(r.date)}
                                                            {r.isPayment && <span className="block text-xs text-slate-400">{new Date(r.date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`font-medium ${r.isPayment ? 'text-slate-700' : 'text-slate-900'}`}>{r.title}</span>
                                                            {t.isOpeningBalance && !r.isPayment && (
                                                                <span className="ml-2 rounded-sm bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-700">{isAdvance(t) ? 'Advance' : 'Opening'}</span>
                                                            )}
                                                            {r.sub && <span className="block text-xs text-slate-500">{r.sub}</span>}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {r.mode ? <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{r.mode}</span> : <span className="text-slate-400">—</span>}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                                                            {r.isPayment ? <span className="text-slate-400">—</span> : `${r.effect < 0 ? '− ' : ''}${inr(r.effect)}`}
                                                        </td>
                                                        <td className={`whitespace-nowrap px-4 py-3 text-right ${r.effect < 0 ? 'text-green-700' : 'text-slate-700'}`}>
                                                            {r.isPayment ? `${r.effect < 0 ? '+ ' : '− '}${inr(r.effect)}` : <span className="text-slate-400">—</span>}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                                                            {inr(r.balance)}
                                                            {r.balance !== 0 && <span className="block text-[11px] font-normal text-slate-500">{r.balance > 0 ? 'they owe' : 'you owe'}</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            {canSettle && (
                                                                <button onClick={(e) => { e.stopPropagation(); openSettleForTxn(party, t); }} className="rounded-sm px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100">
                                                                    Settle
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="border-t border-orange-100 bg-orange-50 text-sm font-semibold text-slate-900">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-3">Closing balance · {statement.closing > 0 ? 'they owe you' : statement.closing < 0 ? 'you owe' : 'settled'}</td>
                                                <td className="px-4 py-3 text-right">{inr(statement.receivableBilled)}</td>
                                                <td className="px-4 py-3 text-right">{inr(statement.received)}</td>
                                                <td className={`px-4 py-3 text-right ${statement.closing > 0 ? 'text-yellow-700' : statement.closing === 0 ? 'text-green-700' : ''}`}>{statement.closing === 0 ? 'Settled ✓' : inr(statement.closing)}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {/* Mobile rows */}
                            {statement.rows.length > 0 && (
                                <ul className="md:hidden">
                                    {statement.rows.map((r, idx) => {
                                        const t = r.txn;
                                        const canSettle = !r.isPayment && t.dueAmount > 0 && !isAdvance(t);
                                        return (
                                            <li key={r.key} onClick={() => setExpandedBillId(t.id)} className={`flex cursor-pointer items-center gap-3 px-4 py-3 active:bg-orange-50 ${idx > 0 ? 'border-t border-orange-100' : ''}`}>
                                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${r.isPayment ? 'bg-green-50 text-green-600' : t.isOpeningBalance ? 'bg-yellow-50 text-yellow-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {r.isPayment ? <Wallet size={16} /> : <FileText size={16} />}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                                                    <p className="truncate text-xs text-slate-500">
                                                        {formatDayMonth(r.date)}{r.isPayment ? ` · ${new Date(r.date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}{r.mode ? ` · ${r.mode}` : ''}{!r.isPayment && r.sub ? ` · ${r.sub}` : ''}
                                                    </p>
                                                    {canSettle && (
                                                        <button onClick={(e) => { e.stopPropagation(); openSettleForTxn(party, t); }} className="mt-1 text-xs font-semibold text-orange-700">Settle this</button>
                                                    )}
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className={`text-sm font-semibold ${r.isPayment && r.effect < 0 ? 'text-green-700' : 'text-slate-900'}`}>
                                                        {r.isPayment ? `${r.effect < 0 ? '+ ' : '− '}${inr(r.effect)}` : `${r.effect < 0 ? '− ' : ''}${inr(r.effect)}`}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">bal {inr(r.balance)}</p>
                                                </div>
                                            </li>
                                        );
                                    })}
                                    <li className="flex items-center justify-between rounded-b-sm border-t border-orange-100 bg-orange-50 px-4 py-3 text-sm font-semibold">
                                        <span className="text-slate-900">Closing balance</span>
                                        <span className={statement.closing > 0 ? 'text-yellow-700' : statement.closing === 0 ? 'text-green-700' : 'text-slate-900'}>
                                            {statement.closing === 0 ? 'Settled ✓' : `${inr(statement.closing)} ${statement.closing > 0 ? 'due' : 'you owe'}`}
                                        </span>
                                    </li>
                                </ul>
                            )}
                        </section>
                    </div>

                    {/* RIGHT: party details */}
                    <aside className="space-y-4">
                        <div className="rounded-sm border border-orange-100 bg-white p-4 shadow-card">
                            <h3 className="text-sm font-semibold text-slate-900">Party details</h3>
                            <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-y-2 text-sm">
                                <dt className="text-slate-500">Phone</dt>
                                <dd className="text-slate-900">{party.partyNumber ? formatPhone(party.partyNumber) : '—'}</dd>
                                <dt className="text-slate-500">GSTIN</dt>
                                <dd className="text-slate-900">
                                    {party.gstNumber || (hasPhone(party)
                                        ? <button onClick={() => openEditParty(party, 'gstNumber')} className="font-medium text-orange-700 hover:underline">Add</button>
                                        : <span className="text-slate-400">Not added</span>)}
                                </dd>
                                <dt className="text-slate-500">Address</dt>
                                <dd className="text-slate-900">
                                    {party.address || (hasPhone(party)
                                        ? <button onClick={() => openEditParty(party, 'address')} className="font-medium text-orange-700 hover:underline">Add</button>
                                        : <span className="text-slate-400">Not added</span>)}
                                </dd>
                                {statement.firstEntry > 0 && (
                                    <>
                                        <dt className="text-slate-500">First entry</dt>
                                        <dd className="text-slate-900">{formatFullDate(statement.firstEntry)}</dd>
                                    </>
                                )}
                            </dl>
                        </div>

                        {showRemind && (
                            <div className="hidden rounded-sm border border-orange-100 bg-white p-4 shadow-card md:block">
                                <h3 className="text-sm font-semibold text-slate-900">Reminder</h3>
                                <p className="mt-1 text-xs text-slate-500">The WhatsApp message lists each unpaid order and the total.</p>
                                <p className="mt-3 rounded-sm bg-orange-50 px-3 py-2.5 text-xs text-orange-900">
                                    "Dear {party.partyName}, this is a gentle reminder that a total amount of {inr(statement.receivable)} is due…"
                                </p>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        );
    }

    /* =====================================================================
       VIEW 1 — PARTY LIST
       ===================================================================== */
    const kpis = [
        { label: 'To collect', value: inr(totals.toCollect), hint: totals.collectCount ? `${totals.collectCount} ${totals.collectCount === 1 ? 'party owes' : 'parties owe'} you` : 'nobody owes you', icon: Wallet, iconClass: 'bg-yellow-50 text-yellow-700', valueClass: totals.toCollect > 0 ? 'text-yellow-700' : 'text-slate-900' },
        { label: 'Total billed', value: inr(totals.billed), hint: 'orders + opening balances', icon: FileText, iconClass: 'bg-orange-100 text-orange-700', valueClass: 'text-slate-900' },
        { label: 'Parties', value: parties.length.toLocaleString('en-IN'), hint: 'in this period', icon: Users, iconClass: 'bg-orange-100 text-orange-700', valueClass: 'text-slate-900' },
        { label: 'Settled', value: totals.settled.toLocaleString('en-IN'), hint: 'no balance', icon: Check, iconClass: 'bg-green-50 text-green-600', valueClass: 'text-slate-900' },
    ];

    const statusSegments: { value: typeof statusFilter; label: string; count?: number }[] = [
        { value: 'all', label: 'Any balance' },
        { value: 'due', label: 'Due', count: totals.due },
        { value: 'settled', label: 'Settled', count: totals.settled },
    ];

    const partyActions = (p: (typeof filteredParties)[number], compact: boolean) => {
        const { party } = p;
        const key = `${compact ? 'm' : 'd'}-${partyKey(party)}`;
        const hasDue = p.receivable > 0;
        const showRemind = canRemind(party);
        const btn = compact ? 'py-2 text-xs' : 'px-3 py-1.5 text-xs';
        return (
            <div className={compact ? 'grid grid-cols-[1fr_1fr_auto] gap-2' : 'flex items-center justify-end gap-1.5'}>
                {showRemind ? (
                    <button onClick={(e) => { e.stopPropagation(); sendReminderFor(party); }} disabled={sendingReminderFor === party.partyNumber} className={`inline-flex items-center justify-center gap-1.5 ${primaryBtn} ${btn}`}>
                        <MessageCircle size={13} /> {sendingReminderFor === party.partyNumber ? 'Sending…' : 'Remind'}
                    </button>
                ) : compact && hasDue ? <span /> : null}
                {hasDue ? (
                    <button onClick={(e) => { e.stopPropagation(); openSettleAll(party); }} className={`rounded-sm border border-slate-300 bg-white font-medium text-slate-700 hover:border-orange-300 ${btn}`}>
                        Settle
                    </button>
                ) : (
                    <button onClick={(e) => { e.stopPropagation(); openParty(party); }} className={`rounded-sm border border-slate-300 bg-white font-medium text-slate-700 hover:border-orange-300 ${btn} ${compact ? 'col-span-2' : ''}`}>
                        Statement
                    </button>
                )}
                {rowMenu(party, key)}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#fff5ec] px-3 pb-28 pt-3 md:px-6 md:pb-8 md:pt-5">
            {modals}

            {/* HEADER */}
            <header className="mb-4 flex items-center gap-2 md:gap-3">
                <button onClick={() => navigate(-1)} aria-label="Back" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-orange-100 md:border md:border-slate-300 md:bg-white">
                    <ChevronLeft size={20} />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
                    <div className="flex items-baseline gap-3">
                        <h1 className="text-lg font-bold text-slate-900 md:text-xl">Party ledger</h1>
                        <span className="hidden text-xs text-slate-500 md:inline">Every customer's balance</span>
                    </div>
                    <p className="text-xs text-slate-500 md:hidden">{parties.length} {parties.length === 1 ? 'party' : 'parties'} · {rangeLabel}</p>
                </div>
                <button onClick={openAddParty} className={`hidden shrink-0 items-center gap-1.5 px-4 py-2 text-sm shadow-sm md:inline-flex ${primaryBtn}`}>
                    <UserPlus size={15} /> Add party
                </button>

                {/* Mobile: import + more */}
                <button onClick={() => bulkFileInputRef.current?.click()} disabled={isBulkUploading} aria-label="Import old balances from Excel" className="rounded-sm p-2 text-slate-700 hover:bg-orange-100 md:hidden">
                    <Upload size={20} />
                </button>
                <div className="relative md:hidden">
                    <button onClick={() => setPageMenuOpen((o) => !o)} aria-label="More actions" className="rounded-sm p-2 text-slate-700 hover:bg-orange-100">
                        <MoreHorizontal size={20} />
                    </button>
                    {pageMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setPageMenuOpen(false)} />
                            <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-sm border border-orange-100 bg-white p-1 shadow-float">
                                <button onClick={() => { setPageMenuOpen(false); handleDownloadBulkSample(); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-orange-50">
                                    <FileSpreadsheet size={14} /> Import template
                                </button>
                                {remindableParties.length > 0 && (
                                    <button onClick={() => { setPageMenuOpen(false); remindAll(); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-orange-50">
                                        <MessageCircle size={14} /> Remind all due ({remindableParties.length})
                                    </button>
                                )}
                                <button onClick={() => { setPageMenuOpen(false); setIsDeleteAllModalOpen(true); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                                    <Trash2 size={14} /> Delete all parties…
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </header>

            <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] ${dimClass}`}>
                <div className="min-w-0 space-y-4">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
                        {kpis.map(({ label, value, hint, icon: Icon, iconClass, valueClass }) => (
                            <div key={label} className="min-w-0 rounded-sm border border-orange-100 bg-white p-3 shadow-card md:p-4">
                                <div className="flex items-center gap-2">
                                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}><Icon size={14} /></span>
                                    <span className="truncate text-xs font-medium text-slate-700 md:text-sm">{label}</span>
                                </div>
                                <p className={`mt-2 truncate text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
                                <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
                            </div>
                        ))}
                    </div>

                    {/* FILTERS */}
                    <div className="relative space-y-3 md:rounded-sm md:border md:border-orange-100 md:bg-white md:p-4 md:shadow-card">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search party by name or number" className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                                )}
                            </div>
                            <div className="relative shrink-0">
                                <CalendarDays size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <select
                                    value={datePreset}
                                    onChange={(e) => (e.target.value === 'custom' ? setIsRangeOpen(true) : handleDatePresetChange(e.target.value))}
                                    className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none hover:border-orange-300 focus:border-orange-500"
                                    aria-label="Period"
                                >
                                    {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    <option value="custom">{datePreset === 'custom' ? rangeLabel : 'Custom…'}</option>
                                </select>
                                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            </div>
                        </div>
                        {isRangeOpen && (
                            <div className="absolute right-0 top-14 z-30 w-full md:right-4 md:w-80">
                                <CustomRangePanel initialStart={customStartDate} initialEnd={customEndDate} onApply={handleApplyCustomRange} onCancel={() => setIsRangeOpen(false)} />
                            </div>
                        )}
                        {/* Desktop segments */}
                        <div className="hidden flex-wrap gap-3 md:flex">
                            <div className="flex gap-1 rounded-sm bg-orange-50 p-1">
                                {statusSegments.map((s) => (
                                    <button key={s.value} onClick={() => setStatusFilter(s.value)} className={segClass(statusFilter === s.value)}>{s.label}{s.count !== undefined ? ` ${s.count}` : ''}</button>
                                ))}
                            </div>
                        </div>
                        {/* Mobile chips */}
                        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
                            <button onClick={() => setStatusFilter('all')} className={chipClass(statusFilter === 'all')}>All {parties.length}</button>
                            <button onClick={() => setStatusFilter(statusFilter === 'due' ? 'all' : 'due')} className={chipClass(statusFilter === 'due')}>Due {totals.due}</button>
                            <button onClick={() => setStatusFilter(statusFilter === 'settled' ? 'all' : 'settled')} className={chipClass(statusFilter === 'settled')}>Settled {totals.settled}</button>
                        </div>
                    </div>

                    {/* PARTY LIST */}
                    <section className="rounded-sm border border-orange-100 bg-white shadow-card">
                        <div className="flex items-center gap-3 border-b border-orange-100 px-4 py-3">
                            <h2 className="text-sm font-semibold text-slate-900">Parties</h2>
                            <span className="text-xs text-slate-500">Sorted by amount due</span>
                            <button onClick={() => setIsListVisible((v) => !v)} className="ml-auto hidden rounded-sm px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-orange-50 md:block">
                                {isListVisible ? 'Hide list' : 'Show list'}
                            </button>
                        </div>
                        {filteredParties.length === 0 && (
                            <p className="px-6 py-10 text-center text-sm text-slate-500">
                                {parties.length === 0 ? 'No parties in this period. Pick a longer period, add a party or import old balances.' : 'No parties match these filters.'}
                            </p>
                        )}
                        {filteredParties.length > 0 && (
                            <ul className={isListVisible ? '' : 'md:hidden'}>
                                {filteredParties.map((p, idx) => {
                                    const { party } = p;
                                    const words = balanceWords(p.receivable);
                                    const meta = [
                                        party.partyNumber ? formatPhone(party.partyNumber) : '',
                                        `${party.totalTransactions} ${party.totalTransactions === 1 ? 'order' : 'orders'}`,
                                        party.totalTransactions === 0 && party.transactions.some((t) => t.isOpeningBalance) ? 'opening balance' : '',
                                        party.gstNumber ? `GSTIN ${party.gstNumber}` : '',
                                    ].filter(Boolean).join(' · ');
                                    return (
                                        <li key={partyKey(party)} onClick={() => openParty(party)} className={`cursor-pointer px-4 py-3.5 transition hover:bg-orange-50 ${idx > 0 ? 'border-t border-orange-100' : ''}`}>
                                            <div className="flex items-center gap-3">
                                                {avatar(party.partyName)}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className={`truncate text-sm font-semibold ${hasRealName(party) ? 'text-slate-900' : 'text-slate-500'}`}>
                                                            {hasRealName(party) ? party.partyName : 'No name'}
                                                        </span>
                                                        {!hasRealName(party) && hasPhone(party) && (
                                                            <button onClick={(e) => { e.stopPropagation(); openEditParty(party, 'name'); }} className="shrink-0 text-xs font-medium text-orange-700 hover:underline">
                                                                Add name
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="truncate text-xs text-slate-500">{meta}</p>
                                                    <p className="hidden text-xs text-slate-500 md:block">
                                                        Billed <strong className="font-semibold text-slate-700">{inr(party.totalBilled)}</strong>
                                                        {p.lastEntry > 0 && <> · last entry {formatDayMonth(p.lastEntry)}</>}
                                                    </p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="text-[11px] text-slate-500">{words.label}</p>
                                                    <p className={`text-base font-semibold ${words.cls}`}>{words.value}</p>
                                                </div>
                                                <div className="hidden w-56 shrink-0 md:block">{partyActions(p, false)}</div>
                                            </div>
                                            {p.receivable > 0 && <div className="mt-3 md:hidden">{partyActions(p, true)}</div>}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </div>

                {/* RIGHT COLUMN (desktop) */}
                <aside className="hidden space-y-4 lg:block">
                    <div className="rounded-sm border border-orange-100 bg-white p-4 shadow-card">
                        <div className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-orange-100 text-orange-700"><FileSpreadsheet size={16} /></span>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900">Bring in old balances</h3>
                                <p className="mt-0.5 text-xs text-slate-500">Upload Excel — old dues and advances are added as opening balances.</p>
                            </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => bulkFileInputRef.current?.click()} disabled={isBulkUploading} className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-orange-300 disabled:opacity-50">
                                {isBulkUploading ? <Spinner /> : <><Upload size={13} /> Upload Excel</>}
                            </button>
                            <button onClick={handleDownloadBulkSample} disabled={isBulkUploading} className="rounded-sm px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-orange-50">Template</button>
                        </div>
                    </div>

                    <div className="rounded-sm border border-orange-100 bg-white p-4 shadow-card">
                        <h3 className="text-sm font-semibold text-slate-900">Reminders</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Send every customer who owes you a WhatsApp message with their balance.</p>
                        <button onClick={remindAll} disabled={remindableParties.length === 0 || isRemindingAll} className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-orange-300 disabled:opacity-50">
                            <MessageCircle size={13} className="text-green-600" /> Remind all due ({remindableParties.length})
                        </button>
                    </div>

                    <div className="rounded-sm border border-red-100 bg-white p-4 shadow-card">
                        <h3 className="text-sm font-semibold text-slate-900">Danger zone</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Permanently delete every party, order and opening balance. You'll be asked to type DELETE.</p>
                        <button onClick={() => setIsDeleteAllModalOpen(true)} className="mt-3 rounded-sm px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Delete all parties…</button>
                    </div>
                </aside>
            </div>

            {/* Mobile: Add party pinned above the bottom navigation */}
            <div className="sticky bottom-3 z-10 mt-4 md:hidden">
                <button onClick={openAddParty} className={`flex w-full items-center justify-center gap-2 py-3.5 text-sm shadow-float ${primaryBtn}`}>
                    <UserPlus size={17} /> Add party
                </button>
            </div>
        </div>
    );
};

export default CataloguePartyLedger;