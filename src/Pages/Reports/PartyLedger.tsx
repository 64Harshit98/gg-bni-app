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
import {
    DATE_PRESETS,
    formatDateForInput,
    formatDayMonth,
    formatFullDate,
    formatPhone,
    formatRangeLabel,
    getPresetRange,
    parseInputDate,
} from './SalesReportComponents/salesReport.utils';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import DetailPanel, { DetailItems, DetailRows, DetailSection } from './SalesReportComponents/DetailPanel';
import usePartyLedger, { type LedgerTransaction, type PartySummary, type PaymentRecord, normalizePartyNumber } from './PartyLedger/usePartyLedger';
import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { Spinner } from '../../constants/Spinner';
import { PaymentModal } from '../../constants/Modal';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearSalesReportCache } from './SalesReportComponents/salesReportCache';
import { clearPurchaseReportCache } from './PurchaseReportComponents/purchaseReportCache';
import { clearOpeningBalanceCache } from './CustomerReportComponents/customerReportCache';
import { sendDueReminder } from '../Additional/Whatsapp/sendDueReminder';
import { useWhatsappProvider, type WhatsappProvider } from '../Additional/Whatsapp/useWhatsappProvider';
import { ROUTES } from '../../constants/routes.constants';
import { doc as fsDocRef, getDoc as fsGetDoc } from 'firebase/firestore';
import { db as firebaseDb } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { useSalesSettings } from '../../context/SettingsContext';
import { State, PLANS } from '../../enums';
import { normalizePlan } from '../../context/Plan';
import { Modal } from '../../constants/Modal';
import { useInvoiceCommunication } from '../Journal/hooks'
import { InvoiceActionSheet, PrintSubMenuModal, QrCodeModal } from '../Journal/components';
import type { Invoice } from '../Journal/journal.types';

interface BulkOpeningBalanceRow {
    partyName: string;
    partyNumber: string;
    partyType: 'Customer' | 'Supplier';
    amount: number;
    balanceType: 'due' | 'advance';
    note: string;
    address?: string;    // NEW
    gstNumber?: string;  // NEW
    date?: number;
}
/* ---------- BALANCES ---------- */

type LedgerTxn = LedgerTransaction & { balanceType?: 'due' | 'advance' };

const isAdvance = (t: LedgerTxn) => !!t.isOpeningBalance && t.balanceType === 'advance';

// What a party owes you: unpaid sale bills + "due" opening balances (an opening
// due on a supplier still means they owe you — see the warning in the detail view).
const receivableTxns = (party: PartySummary) =>
    (party.transactions as LedgerTxn[]).filter(
        (t) => t.dueAmount > 0 && (t.isOpeningBalance ? !isAdvance(t) : t.type === 'sale'),
    );

// What you owe a party: unpaid purchase bills.
const payableTxns = (party: PartySummary) =>
    (party.transactions as LedgerTxn[]).filter((t) => t.dueAmount > 0 && !t.isOpeningBalance && t.type === 'purchase');

const balanceOf = (party: PartySummary) => {
    const receivable = receivableTxns(party).reduce((s, t) => s + t.dueAmount, 0);
    const payable = payableTxns(party).reduce((s, t) => s + t.dueAmount, 0);
    return { receivable, payable, net: receivable - payable };
};

const partyKey = (party: Pick<PartySummary, 'partyNumber' | 'partyName'>) =>
    normalizePartyNumber(party.partyNumber) || party.partyName.trim().toLowerCase();

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

const PartyLedger: React.FC = () => {
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
    } = usePartyLedger();

    //const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { provider: whatsappProvider } = useWhatsappProvider(companyId);
    const [sendingReminderFor, setSendingReminderFor] = useState<string | null>(null);

    // Bill action sheet (WhatsApp / Download / Print / QR), same as the Transactions page
    const { currentUser } = useAuth();
    const { salesSettings } = useSalesSettings();
    const [actionModal, setActionModal] = useState<{ message: string; type: State } | null>(null);
    const [isPosBasicPlan, setIsPosBasicPlan] = useState(false);
    useEffect(() => {
        const fetchPlan = async () => {
            if (!currentUser?.companyId) return;
            const snap = await fsGetDoc(fsDocRef(firebaseDb, 'companies', currentUser.companyId));
            if (snap.exists()) {
                const plan = normalizePlan(snap.data().pack);
                setIsPosBasicPlan(plan === PLANS.POS_BASIC || plan === PLANS.CALC_CATALOG);
            }
        };
        fetchPlan();
    }, [currentUser?.companyId]);

    const {
        invoiceToPrint, setInvoiceToPrint,
        showQrModal, setShowQrModal,
        sendingPdf,
        showPrintSubMenu, setShowPrintSubMenu,
        enableTriplicate,
        billType, setBillType,
        handlePdfAction,
        handleSendWhatsapp,
        handleSendWhatsappSnapto,
        handleShowQr,
    } = useInvoiceCommunication({ currentUser, salesSettings, isPosBasicPlan, setModal: setActionModal });

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
    // The opening-balance dialog doubles as "Add party" (editable name/number/type, amount optional).
    const [obMode, setObMode] = useState<'opening' | 'newParty'>('opening');
    const [searchQuery, setSearchQuery] = useState('');
    const [partyTypeFilter, setPartyTypeFilter] = useState<'all' | 'Customer' | 'Supplier' | 'Both'>('all');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'settled'>('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isOBModalOpen, setIsOBModalOpen] = useState(false);
    const [availableCredit, setAvailableCredit] = useState<number>(0);
    const [obForm, setObForm] = useState({
        partyName: '',
        partyNumber: '',
        partyType: 'Customer' as 'Customer' | 'Supplier',
        balanceType: 'due' as 'due' | 'advance', // 'due' = they owe you, 'advance' = you owe them
        amount: '',
        note: ''
    });
    const [obLoading, setObLoading] = useState(false);

    // NEW: bulk import state
    const bulkFileInputRef = useRef<HTMLInputElement>(null);
    const [isBulkUploading, setIsBulkUploading] = useState(false);
    const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number } | null>(null);

    // NEW: delete-party / delete-all state
    const [partyToDelete, setPartyToDelete] = useState<PartySummary | null>(null);
    const [isDeletingParty, setIsDeletingParty] = useState(false);
    // NEW: shows a lightweight overlay while a "Settle All" submission is looping through bills
    const [isSettlingAll, setIsSettlingAll] = useState(false);
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
    const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
    const [isDeletingAll, setIsDeletingAll] = useState(false);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // NEW: delete a single party (their sales, purchases, opening balances, and master record)
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

    // NEW: wipe every party's data for the company
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

    // Send a combined WhatsApp due-reminder for a party, listing all unpaid
    // invoice numbers. The sending itself (BotMaster free text, or the cloud
    // 'snapto'/'sellar' reminder template) lives in sendDueReminder, shared
    // with the Customer report.
    // Send a combined WhatsApp due-reminder for a party, listing what they owe
    // you (sale bills + "due" opening balances — never purchase bills, which are
    // money you owe them). The sending itself lives in sendDueReminder, shared
    // with the Customer report. Returns true when a reminder went out.
    const sendReminderFor = async (party: PartySummary, provider: WhatsappProvider, silent = false) => {
        if (!party.partyNumber || party.partyNumber === 'N/A') {
            if (!silent) showToast('Party phone number is missing.', 'error');
            return false;
        }
        if (!companyId) return false;

        const owedToYou = receivableTxns(party);
        if (owedToYou.length === 0) {
            if (!silent) showToast('This party owes you nothing.', 'error');
            return false;
        }

        setSendingReminderFor(party.partyNumber);
        try {
            const result = await sendDueReminder({
                companyId,
                provider,
                partyName: party.partyName,
                partyNumber: party.partyNumber,
                totalDue: owedToYou.reduce((s, t) => s + t.dueAmount, 0),
                dueLines: owedToYou.map((t) => ({
                    label: t.isOpeningBalance ? 'Opening Due' : (t.invoiceNumber || `#${t.id.slice(0, 6).toUpperCase()}`),
                    amount: Number(t.dueAmount),
                })),
            });
            if (result === 'needs_setup') {
                navigate(ROUTES.WHATSAPP_PLAN);
                return false;
            }
            if (result === 'sent' && !silent) showToast('Reminder sent via WhatsApp!', 'success');
            return result === 'sent';
        } catch (err: any) {
            console.error('Party Reminder Send Error:', err);
            if (!silent) showToast(err?.message ? `Failed to send reminder: ${err.message}` : 'Failed to send reminder.', 'error');
            return false;
        } finally {
            setSendingReminderFor(null);
        }
    };
    // Reminder sirf Customer / Both ko jayega — pure Supplier ko nahi.
    // Only what they owe you (sale dues + opening due) counts, not purchase dues you owe them.
    const canRemind = (party: PartySummary) =>
        party.partyType !== 'Supplier' &&
        balanceOf(party).receivable > 0 &&
        !!normalizePartyNumber(party.partyNumber);

    useEffect(() => {
        // The hook loads the last 30 days; show that preset as selected.
        setDatePreset('last30');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // "Party ledger" buttons on other reports open that party straight away (state.openParty = phone).
    const location = useLocation();
    const openPartyFromState = (location.state as { openParty?: string } | null)?.openParty;
    const handledOpenParty = useRef(false);
    useEffect(() => {
        if (!openPartyFromState || handledOpenParty.current || isLoading) return;
        const match = partySummaries.find((p) => normalizePartyNumber(p.partyNumber) === openPartyFromState);
        if (match) {
            handledOpenParty.current = true;
            setSelectedPartyName(match.partyNumber);
            setSearchQuery('');
        } else {
            // Not loaded yet, or outside the period: show the list searched to that number
            // (a longer period can then be picked). Opens the party if it turns up.
            setSearchQuery(openPartyFromState);
        }
    }, [openPartyFromState, isLoading, partySummaries, setSelectedPartyName]);

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

    const emptyObForm = { partyName: '', partyNumber: '', partyType: 'Customer' as const, balanceType: 'due' as const, amount: '', note: '' };

    const openAddParty = () => {
        setObMode('newParty');
        setObForm(emptyObForm);
        setIsOBModalOpen(true);
    };

    const openAddOpeningBalance = (party: PartySummary) => {
        setObMode('opening');
        setObForm({
            partyName: party.partyName || '',
            partyNumber: party.partyNumber || '',
            partyType: party.partyType === 'Supplier' ? 'Supplier' : 'Customer',
            balanceType: 'due',
            amount: '',
            note: '',
        });
        setIsOBModalOpen(true);
    };

    const handleAddOpeningBalance = async () => {
        const amount = Number(obForm.amount) || 0;
        if (obMode === 'newParty') {
            // A new party: name + 10-digit number required, opening balance optional.
            if (!obForm.partyName.trim()) return showToast('Enter the party name.', 'error');
            if (obForm.partyNumber.replace(/\D/g, '').length !== 10) return showToast('Enter a 10-digit phone number.', 'error');
            setObLoading(true);
            try {
                const result = await addBulkOpeningBalances([{
                    partyName: obForm.partyName.trim(),
                    partyNumber: obForm.partyNumber.trim(),
                    partyType: obForm.partyType,
                    amount,
                    balanceType: obForm.balanceType,
                    note: obForm.note.trim(),
                    date: Date.now(),
                }]);
                if (result.duplicates) {
                    showToast('That number already belongs to another party.', 'error');
                } else if (result.failed) {
                    showToast('Failed to add the party.', 'error');
                } else {
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

        if (!obForm.partyName.trim() || amount <= 0) {
            showToast('Please fill in party name and a valid amount.', 'error');
            return;
        }
        setObLoading(true);
        try {
            await addOpeningBalance(
                obForm.partyName.trim(),
                obForm.partyNumber.trim(),
                obForm.partyType,
                amount,
                obForm.note.trim(),
                obForm.balanceType  // ✅ pass balanceType
            );
            setIsOBModalOpen(false);
            setObForm(emptyObForm);
            showToast('Opening balance added successfully!', 'success');
        } catch (e) {
            showToast('Failed to add opening balance.', 'error');
        } finally {
            setObLoading(false);
        }
    };
    // NEW: parses an uploaded Excel file and bulk-creates opening balances
    const parseExcelDate = (val: any): number | undefined => {
        if (!val) return undefined;
        if (val instanceof Date) return val.getTime();
        const str = val.toString().trim();
        if (!str) return undefined;

        // ✅ Explicitly parse DD/MM/YYYY or DD-MM-YYYY (your template's format)
        const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10);
            const year = parseInt(dmyMatch[3], 10);
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const d = new Date(year, month - 1, day);
                if (!isNaN(d.getTime())) return d.getTime();
            }
        }

        // ISO fallback: YYYY-MM-DD
        const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (isoMatch) {
            const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
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
            const arrayBuffer = await file.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);

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

            // Locate the header row (looks for "Party Name" in column 3)
            let headerRowNum = 1;
            for (let r = 1; r <= Math.min(worksheet.rowCount, 15); r++) {
                const cell = (safeGetVal(worksheet.getRow(r), 3) as string).toLowerCase();
                if (cell && cell.includes('party name')) { headerRowNum = r; break; }
            }
            const dataStartRow = headerRowNum + 2; // header row + notes row, then data

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
                const address = (safeGetVal(row, 8) as string).trim();                 // NEW
                const gstNumber = (safeGetVal(row, 9) as string).trim().toUpperCase(); // NEW

                // ✅ Type must be explicitly "Customer"/"Supplier" — no silent default anymore
                if (!typeVal || !(typeVal.startsWith('c') || typeVal.startsWith('s'))) { skippedCount++; continue; }

                // ✅ Party Number is mandatory AND must be a valid 10-digit phone number
                const partyNumberDigits = partyNumber.replace(/\D/g, '');
                if (!partyNumber || partyNumberDigits.length !== 10) { skippedCount++; continue; }

                const partyType: 'Customer' | 'Supplier' = typeVal.startsWith('s') ? 'Supplier' : 'Customer';

                // ✅ Rows with no balance are now allowed through — they still onboard the
                // party (name/number/type) into customers/suppliers, just with no opening
                // due/advance attached. Only reject when BOTH columns are filled (ambiguous).
                if (dueVal > 0 && advanceVal > 0) { skippedCount++; continue; }

                rowsToImport.push({
                    partyName,
                    partyNumber,
                    partyType,
                    amount: dueVal > 0 ? dueVal : (advanceVal > 0 ? advanceVal : 0),
                    balanceType: dueVal > 0 ? 'due' : (advanceVal > 0 ? 'advance' : 'due'),
                    note: narration,
                    address: address || undefined,       // NEW
                    gstNumber: gstNumber || undefined,    // NEW
                    date: parseExcelDate(dateVal),
                });
            }

            if (rowsToImport.length === 0) {
                throw new Error('No valid rows found. Check Party Name and Credit/Debit Balance columns.');
            }

            setBulkUploadProgress({ current: 0, total: rowsToImport.length });
            const result = await addBulkOpeningBalances(rowsToImport, (current, total) => {
                setBulkUploadProgress({ current, total });
            });

            const noteParts = [
                skippedCount ? `${skippedCount} skipped (both due & advance filled)` : '',
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

    // NEW: generates and downloads the sample Excel template (same styling pattern as Item bulk import)
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
            sides.forEach(side => { b[side] = { style: 'thin', color: { rgb: 'CBD5E1' } }; });
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
            { header: '● Party Address', note: 'Optional — full address', width: 26 },   // NEW
            { header: '● GST Number', note: 'Optional — GSTIN', width: 18 },             // NEW
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

        const totalRows = 11;
        const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

        aoa[0][0] = 'SELLAR  ·  Old Invoices / Opening Balance Import Template';
        aoa[1][0] = 'Fill in the rows below and upload this file in Party Ledger → Bulk Import. Do NOT rename column headers. Fill only ONE of Due Amount or Advance Amount per row.';
        aoa[3][0] = 'LEGEND';
        legendRows.forEach((l, i) => { aoa[4 + i][0] = l.marker; aoa[4 + i][1] = l.desc; });

        COLS.forEach((c, i) => { aoa[7][i] = c.header; });
        COLS.forEach((c, i) => { aoa[8][i] = c.note; });
        sampleRows.forEach((row, ri) => { row.forEach((val, ci) => { aoa[9 + ri][ci] = val; }); });

        const ws: any = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = COLS.map(c => ({ wch: c.width }));
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

        style('A1', s({ sz: 15, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('0369A1'), { horizontal: 'center', vertical: 'center' }));
        style('A2', s({ sz: 9, italic: true, color: { rgb: '475569' } }, solidFill('DBEAFE'), { horizontal: 'center', vertical: 'center', wrapText: true }));
        style('A4', s({ sz: 10, bold: true, color: { rgb: '0369A1' } }, solidFill('E0F2FE'), { horizontal: 'left', vertical: 'center' }, allBorders));

        legendRows.forEach((l, i) => {
            const row = 5 + i;
            style(`A${row}`, s({ sz: 9, bold: true, color: { rgb: l.txt } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
            style(`B${row}`, s({ sz: 9, color: { rgb: '334155' } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
            ['C', 'D'].forEach(col => {
                const addr = `${col}${row}`;
                if (!ws[addr]) ws[addr] = { t: 's', v: '' };
                ws[addr].s = s({ sz: 9 }, solidFill(l.bg), {}, bblr);
            });
        });

        COLS.forEach((c, i) => {
            const isReq = c.header.startsWith('★');
            const { bg, txt } = isReq ? REQ : OPT;
            const addr = XLSX.utils.encode_cell({ r: 7, c: i });
            style(addr, s({ sz: 9, bold: true, color: { rgb: txt } }, solidFill(bg), { horizontal: 'center', vertical: 'center', wrapText: true }, allBorders));
        });

        COLS.forEach((_c, i) => {
            const addr = XLSX.utils.encode_cell({ r: 8, c: i });
            style(addr, s({ sz: 7, italic: true, color: { rgb: '64748B' } }, solidFill('F8FAFC'), { horizontal: 'center', vertical: 'center', wrapText: true }, bblr));
        });

        sampleRows.forEach((row, ri) => {
            const altBg = ri % 2 === 1 ? 'F1F5F9' : 'FFFFFF';
            row.forEach((_val, ci) => {
                const addr = XLSX.utils.encode_cell({ r: 9 + ri, c: ci });
                style(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr));
            });
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'OpeningBalances');
        XLSX.writeFile(wb, 'Sellar_OpeningBalances_Import_Template.xlsx');
    };

    // ✅ FIXED: Complete rewrite of handleSettlePayment
    const handleSettlePayment = async (
        invoice: any,
        amount: number,
        method: string,
        paymentDate: string,
        chequeNumber?: string,
        chequeDate?: string
    ) => {
        try {
            // ✅ Validation: Check companyId exists
            if (!companyId) {
                throw new Error('Company ID not found. Please log in again.');
            }
            // Handle opening balance settlement separately
            if (invoice.isOpeningBalance) {
                const { db } = await import('../../lib/Firebase');
                const { doc, runTransaction } = await import('firebase/firestore');
                const obRef = doc(db, 'companies', companyId, 'openingBalances', invoice.id);
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(obRef);
                    if (!sfDoc.exists()) throw new Error('Opening balance record not found.');
                    const data = sfDoc.data();
                    const currentDue = data.dueAmount ?? data.amount ?? 0;
                    if (amount > currentDue) throw new Error(`Amount (₹${amount}) exceeds due (₹${currentDue}).`);
                    const paymentRecord = {
                        amount, method: method.toLowerCase(), date: new Date(paymentDate).toISOString(), timestamp: Date.now(),
                        ...(method.toUpperCase() === 'PDC' && { chequeNumber: chequeNumber || '', chequeDate: chequeDate || '' }),
                    };
                    transaction.update(obRef, {
                        dueAmount: Math.max(0, currentDue - amount),
                        paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                    });

                    const obBalanceType = data.balanceType || 'due';
                    const partyNum = (data.partyNumber || '').trim();
                    const partyType = data.partyType || 'Customer';
                    const { doc: firestoreDoc, increment } = await import('firebase/firestore');

                    // Advance OB settle: creditBalance/debitBalance kam karo
                    if (partyNum.length >= 3 && obBalanceType === 'advance') {
                        const collectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
                        const balanceField = partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
                        const partyRef = firestoreDoc(db, 'companies', companyId, collectionName, partyNum);
                        transaction.update(partyRef, {
                            [balanceField]: increment(-amount),
                        });
                    }

                    // ✅ NEW: Due OB settle: dueBalance kam karo on the customers/suppliers
                    // master doc too, so it stays in sync with what bulk-import/opening
                    // balance writes there — otherwise it would only ever go up.
                    if (partyNum.length >= 3 && obBalanceType === 'due') {
                        const collectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
                        const partyRef = firestoreDoc(db, 'companies', companyId, collectionName, partyNum);
                        transaction.set(partyRef, {
                            dueBalance: increment(-amount),
                        }, { merge: true });
                    }

                    const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
                    const isCreditNote = normalizedMethod === 'credit' || normalizedMethod === 'creditnote';
                    const isDebitNote = normalizedMethod === 'debit' || normalizedMethod === 'debitnote'; // NEW: debit note bhi cover karo
                    if ((isCreditNote || isDebitNote) && partyNum.length >= 3 && obBalanceType === 'due') {
                        const collectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
                        const balanceField = partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
                        const partyRef = firestoreDoc(db, 'companies', companyId, collectionName, partyNum);
                        transaction.set(partyRef, {
                            [balanceField]: increment(-amount),
                        }, { merge: true });
                    }
                });
                clearOpeningBalanceCache(companyId);
                const paymentRecord: PaymentRecord = {
                    amount, method: method.toLowerCase(), date: new Date(paymentDate).toISOString(), timestamp: Date.now(),
                    ...(method.toUpperCase() === 'PDC' && { chequeNumber: chequeNumber || '', chequeDate: chequeDate || '' }),
                };
                updateOpeningBalanceLocally(invoice.id, amount, paymentRecord);
                setIsPaymentModalOpen(false);
                setSelectedInvoiceForPayment(null);
                showToast(`Opening balance payment of ₹${amount} settled via ${method}!`, 'success');
                return;
            }
            // ✅ Validation: Check amount is valid
            if (amount <= 0) {
                throw new Error('Payment amount must be greater than 0.');
            }

            // ✅ Validation: Check invoice has required fields
            if (!invoice.id || !invoice.type) {
                throw new Error('Invalid invoice data.');
            }

            const { db } = await import('../../lib/Firebase');
            const { doc, runTransaction } = await import('firebase/firestore');

            // ✅ Use correct collection based on invoice type
            const collectionName = invoice.type === 'sale' ? 'sales' : 'purchases';
            const docRef = doc(db, 'companies', companyId, collectionName, invoice.id);

            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);

                // ✅ Verify document exists
                if (!sfDoc.exists()) {
                    throw new Error('Invoice not found in database.');
                }

                const data = sfDoc.data();

                // ✅ Safely get current due amount from multiple sources
                const currentPaymentMethods = data.paymentMethods || {};
                const currentDue = currentPaymentMethods.due || data.dueAmount || 0;

                // ✅ Prevent overpayment
                if (amount > currentDue) {
                    throw new Error(`Payment amount (₹${amount}) exceeds due amount (₹${currentDue}).`);
                }

                const newDue = currentDue - amount;

                // ✅ Build new payment methods object
                const newPaymentMethods = {
                    ...currentPaymentMethods,
                    [method.toLowerCase()]: (currentPaymentMethods[method.toLowerCase()] || 0) + amount,
                    due: Math.max(0, newDue), // Ensure due never goes negative
                };
                const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
                const isCreditNote = normalizedMethod === 'credit' || normalizedMethod === 'creditnote';
                const isDebitNote = normalizedMethod === 'debit' || normalizedMethod === 'debitnote';

                if ((isCreditNote || isDebitNote) && invoice.partyNumber) {
                    const partyNum = (invoice.partyNumber || '').replace(/\D/g, '').slice(-10);
                    if (partyNum) {
                        const { doc: fsDoc, increment: fsIncrement } = await import('firebase/firestore');

                        if (invoice.type === 'purchase' && isDebitNote) {
                            // ✅ NEW: supplier ka debitBalance update karo
                            const supplierRef = fsDoc(db, 'companies', companyId, 'suppliers', partyNum);
                            transaction.set(supplierRef, {
                                debitBalance: fsIncrement(-amount),
                            }, { merge: true }); // set + merge, taaki doc na hone par bhi crash na ho
                        } else if (isCreditNote) {
                            const customerRef = fsDoc(db, 'companies', companyId, 'customers', partyNum);
                            transaction.set(customerRef, {
                                creditBalance: fsIncrement(-amount),
                            }, { merge: true });
                        }

                        setAvailableCredit(prev => Math.max(0, prev - amount));
                    }
                }

                // ✅ Create payment record with proper structure
                const paymentRecord = {
                    amount,
                    method: method.toLowerCase(), // Normalize method name
                    date: new Date(paymentDate).toISOString(),
                    timestamp: Date.now(),
                    ...(method.toUpperCase() === 'PDC' && {
                        chequeNumber: chequeNumber || '',
                        chequeDate: chequeDate || '',
                    }),
                };

                // ✅ Update document with new payment info
                transaction.update(docRef, {
                    paymentMethods: newPaymentMethods,
                    dueAmount: Math.max(0, newDue), // Also update dueAmount field for consistency
                    paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                });
            });
            if (collectionName === 'sales') clearSalesReportCache(companyId);
            else clearPurchaseReportCache(companyId);

            // ✅ Update local state immediately — no refresh needed
            const paymentRecord: PaymentRecord = {
                amount,
                method: method.toLowerCase(),
                date: new Date(paymentDate).toISOString(),
                timestamp: Date.now(),
                ...(method.toUpperCase() === 'PDC' && {
                    chequeNumber: chequeNumber || '',
                    chequeDate: chequeDate || '',
                }),
            };
            updateTransactionLocally(invoice.id, amount, paymentRecord);

            setIsPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
            showToast(`Payment of ₹${amount} settled successfully via ${method}!`, 'success');

        } catch (error) {
            console.error('Error settling payment:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            showToast(`Failed to settle payment: ${errorMessage}`, 'error');
            throw error;
        }
    };

    // NEW: Fired by the SAME PaymentModal used for individual bills, when the invoice
    // passed to it is a "Settle All" pseudo-invoice (see the list's Settle button below).
    // Distributes the amount entered in the modal across the party's unpaid bills
    // (oldest first), settling each one via the EXACT SAME handleSettlePayment used
    // for individual bills — so per-bill Firestore/local-state logic stays untouched.
    const handleSettleAllPayment = async (
        invoice: any,
        amount: number,
        method: string,
        paymentDate: string,
        chequeNumber?: string,
        chequeDate?: string
    ) => {
        const party: PartySummary | undefined = invoice?.partyRef;
        if (!party) {
            showToast('Party details missing for settle-all.', 'error');
            return;
        }

        const unpaidTxns = party.transactions
            .filter((t: any) => t.dueAmount > 0 && !(t.isOpeningBalance && t.balanceType === 'advance'))
            .sort((a, b) => a.createdAt - b.createdAt); // oldest dues first

        if (unpaidTxns.length === 0) {
            showToast('No due bills found for this party.', 'error');
            return;
        }
        if (amount <= 0) {
            showToast('Payment amount must be greater than 0.', 'error');
            return;
        }
        if (amount > party.totalDue) {
            showToast(`Amount (₹${amount}) exceeds total due (₹${party.totalDue}).`, 'error');
            return;
        }

        setIsSettlingAll(true);

        let remaining = amount;
        let successCount = 0;
        let failCount = 0;

        for (const txn of unpaidTxns) {
            if (remaining <= 0) break;
            const portion = Math.min(remaining, txn.dueAmount);
            try {
                await handleSettlePayment(txn, portion, method, paymentDate, chequeNumber, chequeDate);
                remaining -= portion;
                successCount++;
            } catch (e) {
                failCount++;
            }
        }

        setIsSettlingAll(false);
        setIsPaymentModalOpen(false);
        setSelectedInvoiceForPayment(null);
        setAvailableCredit(0);

        if (failCount > 0) {
            showToast(`Settled ${successCount} bill(s), ${failCount} failed.`, 'error');
        } else {
            showToast(`₹${amount} settled across ${successCount} bill(s)!`, 'success');
        }
    };
    /* ---------- LIST: FILTERS + COUNTS ---------- */
    const parties = useMemo(
        () => partySummaries.map((p) => ({ party: p, ...balanceOf(p), lastEntry: Math.max(0, ...p.transactions.map((t) => t.createdAt)) })),
        [partySummaries],
    );

    const totals = useMemo(() => {
        const owing = parties.filter((p) => p.net > 0);
        const owed = parties.filter((p) => p.net < 0);
        return {
            toCollect: owing.reduce((s, p) => s + p.net, 0),
            collectCount: owing.length,
            toPay: owed.reduce((s, p) => s - p.net, 0),
            payCount: owed.length,
            customers: parties.filter((p) => p.party.partyType === 'Customer').length,
            suppliers: parties.filter((p) => p.party.partyType === 'Supplier').length,
            both: parties.filter((p) => p.party.partyType === 'Both').length,
            due: parties.filter((p) => p.receivable > 0 || p.payable > 0).length,
            settled: parties.filter((p) => p.receivable === 0 && p.payable === 0).length,
        };
    }, [parties]);

    const filteredParties = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return parties
            .filter(({ party, receivable, payable }) => {
                const matchesSearch = !q || party.partyName.toLowerCase().includes(q) || party.partyNumber.toLowerCase().includes(q);
                const matchesType = partyTypeFilter === 'all' || party.partyType === partyTypeFilter;
                const hasBalance = receivable > 0 || payable > 0;
                const matchesStatus = statusFilter === 'all' || (statusFilter === 'due' ? hasBalance : !hasBalance);
                return matchesSearch && matchesType && matchesStatus;
            })
            // Biggest balance first, then by name.
            .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.party.partyName.localeCompare(b.party.partyName));
    }, [parties, searchQuery, partyTypeFilter, statusFilter]);

    const canBulkRemind = whatsappProvider === 'botmaster' || whatsappProvider === 'snapto' || whatsappProvider === 'sellar';
    const remindableParties = parties.filter((p) => canRemind(p.party));

    /* ---------- PAYMENTS ---------- */
    // Credit / debit notes the party already holds, offered in the payment modal.
    const loadAvailableCredit = async (partyNumber: string, isSupplier: boolean) => {
        const partyNum = (partyNumber || '').replace(/\D/g, '').slice(-10);
        if (!partyNum || !companyId) return setAvailableCredit(0);
        try {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('../../lib/Firebase');
            const snap = await getDoc(doc(db, 'companies', companyId, isSupplier ? 'suppliers' : 'customers', partyNum));
            setAvailableCredit(snap.exists() ? Number(snap.data()[isSupplier ? 'debitBalance' : 'creditBalance'] || 0) : 0);
        } catch {
            setAvailableCredit(0);
        }
    };

    // One bill or opening balance.
    const openSettleForTxn = async (party: PartySummary, txn: LedgerTxn) => {
        setSelectedInvoiceForPayment({
            id: txn.id,
            invoiceNumber: txn.invoiceNumber,
            type: txn.type,
            totalAmount: txn.totalAmount,
            dueAmount: txn.dueAmount,
            partyName: party.partyName,
            partyNumber: txn.partyNumber,
            createdAt: txn.createdAt,
            isOpeningBalance: txn.isOpeningBalance === true,
            balanceType: txn.balanceType || 'due',
        });
        await loadAvailableCredit(txn.partyNumber, txn.type === 'purchase');
        setIsPaymentModalOpen(true);
    };

    // Every due of one direction at once — what they owe you, or (if nothing) what you owe them.
    // Reuses handleSettleAllPayment, which spreads the amount oldest-first.
    const openSettleAll = async (party: PartySummary) => {
        const owedToYou = receivableTxns(party);
        const direction = owedToYou.length ? 'receive' : 'pay';
        const txns = direction === 'receive' ? owedToYou : payableTxns(party);
        const total = txns.reduce((s, t) => s + t.dueAmount, 0);
        if (total <= 0) return showToast('Nothing due for this party.', 'error');
        setSelectedInvoiceForPayment({
            isSettleAll: true,
            partyRef: { ...party, transactions: txns, totalDue: total },
            id: `settle-all-${partyKey(party)}`,
            invoiceNumber: direction === 'receive' ? 'All dues' : 'All bills to pay',
            type: direction === 'receive' ? 'sale' : 'purchase',
            totalAmount: total,
            dueAmount: total,
            partyName: party.partyName,
            partyNumber: party.partyNumber,
            isOpeningBalance: false,
        });
        await loadAvailableCredit(party.partyNumber, direction === 'pay');
        setIsPaymentModalOpen(true);
    };

    const remindAll = async () => {
        if (!canBulkRemind || remindableParties.length === 0) return;
        setIsRemindingAll(true);
        let sent = 0;
        for (const p of remindableParties) {
            if (await sendReminderFor(p.party, whatsappProvider, true)) sent += 1;
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
        txn: LedgerTxn;
    }

    const modeLabel = (m: string) => (m.toLowerCase() === 'upi' ? 'UPI' : m.replace(/_/g, ' ').toUpperCase());

    const statement = useMemo(() => {
        if (!selectedPartyLedger) return null;
        const entries: StatementEntry[] = [];
        (selectedPartyLedger.transactions as LedgerTxn[]).forEach((t) => {
            const advance = isAdvance(t);
            const purchase = !t.isOpeningBalance && t.type === 'purchase';
            entries.push({
                key: `b-${t.id}`,
                date: t.createdAt,
                title: t.isOpeningBalance ? (advance ? 'Advance (you owe them)' : 'Opening balance') : t.invoiceNumber || `#${t.id.slice(0, 6).toUpperCase()}`,
                sub: t.isOpeningBalance ? (t.note ? `Note: ${t.note}` : '') : purchase ? 'Purchase bill' : `Sale${t.items?.length ? ` · ${t.items.length} items` : ''}`,
                mode: '',
                effect: advance || purchase ? -t.totalAmount : t.totalAmount,
                isPayment: false,
                txn: t,
            });
            (t.paymentHistory || []).forEach((p, i) => {
                const when = p.timestamp || Date.parse(p.date) || t.createdAt;
                entries.push({
                    key: `p-${t.id}-${i}`,
                    date: when,
                    title: advance ? 'Advance adjusted' : purchase ? 'Payment made' : 'Payment received',
                    sub: t.isOpeningBalance ? 'against opening balance' : `against ${t.invoiceNumber || 'bill'}`,
                    mode: modeLabel(p.method || ''),
                    // Received money lowers what they owe; money you paid out raises it back.
                    effect: advance || purchase ? p.amount : -p.amount,
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
        const paidOut = entries.filter((e) => e.isPayment && e.effect > 0).reduce((s, e) => s + e.effect, 0);
        const receivableBilled = entries.filter((e) => !e.isPayment && e.effect > 0).reduce((s, e) => s + e.effect, 0);
        const payableBilled = entries.filter((e) => !e.isPayment && e.effect < 0).reduce((s, e) => s - e.effect, 0);
        const payments = entries.filter((e) => e.isPayment);
        const lastPayment = payments.length ? payments[payments.length - 1] : null;
        const bal = balanceOf(selectedPartyLedger);
        const oldestDue = [...receivableTxns(selectedPartyLedger), ...payableTxns(selectedPartyLedger)].reduce(
            (min, t) => Math.min(min, t.createdAt),
            Infinity,
        );
        return {
            rows,
            closing: running,
            received,
            paidOut,
            receivableBilled,
            payableBilled,
            payments,
            lastPayment,
            modes: [...new Set(payments.map((p) => p.mode).filter(Boolean))],
            firstEntry: entries.length ? entries[0].date : 0,
            oldestDue: Number.isFinite(oldestDue) ? oldestDue : 0,
            ...bal,
        };
    }, [selectedPartyLedger]);

    const balanceWords = (net: number) =>
        net > 0 ? { label: 'They owe you', value: inr(net), cls: 'text-amber-700' }
            : net < 0 ? { label: 'You owe', value: inr(net), cls: 'text-slate-900' }
                : { label: 'Balance', value: 'Settled ✓', cls: 'text-green-700' };

    const daysSince = (t: number) => Math.max(0, Math.floor((Date.now() - t) / 86_400_000));

    const downloadStatementPdf = () => {
        if (!selectedPartyLedger || !statement) return;
        try {
            const pdf = new jsPDF();
            const pw = pdf.internal.pageSize.getWidth();
            pdf.setFillColor(21, 93, 252);
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
                    selectedPartyLedger.partyNumber && selectedPartyLedger.partyNumber !== 'N/A' ? `Phone: ${formatPhone(selectedPartyLedger.partyNumber)}` : '',
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
                headStyles: { fillColor: [245, 247, 255], textColor: [17, 24, 39], fontStyle: 'bold' },
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
    const typeBadge = (type: PartySummary['partyType']) => {
        const cls = type === 'Customer' ? 'bg-blue-50 text-blue-700' : type === 'Supplier' ? 'bg-pink-50 text-pink-700' : 'bg-amber-50 text-amber-700';
        return <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{type}</span>;
    };

    const avatar = (name: string, size = 'h-9 w-9') => (
        <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700`}>
            {name && name !== 'N/A' ? name[0].toUpperCase() : '?'}
        </span>
    );

    const openParty = (party: PartySummary) => {
        // Parties without a phone share 'N/A', so those are found by name instead.
        setSelectedPartyName(party.partyNumber && party.partyNumber !== 'N/A' ? party.partyNumber : party.partyName);
        setExpandedBillId(null);
        setRowMenuKey(null);
    };

    const hasPhone = (party: PartySummary) => normalizePartyNumber(party.partyNumber).length === 10;

    // Opens the same action sheet the Transactions page opens on "Print".
        const openBillActions = async (party: PartySummary, t: LedgerTxn) => {
        if (!companyId) return;
        try {
            // Full sale document, so the PDF gets tax, discount, expenses, GST etc. like on the Transactions page
            const snap = await fsGetDoc(fsDocRef(firebaseDb, 'companies', companyId, 'sales', t.id));
            const data: any = snap.exists() ? snap.data() : {};
            setInvoiceToPrint({
                ...data,
                id: t.id,
                type: 'Credit', // Journal uses 'Credit' for sale bills
                invoiceNumber: data.invoiceNumber ?? t.invoiceNumber,
                partyName: data.partyName || party.partyName,
                partyNumber: data.partyNumber || party.partyNumber,
                amount: data.totalAmount ?? t.totalAmount,
                dueAmount: t.dueAmount,
                status: t.dueAmount > 0 ? 'Unpaid' : 'Paid',
                items: data.items || t.items || [],
                paymentMethods: data.paymentMethods || t.paymentMethods || {},
                paymentHistory: data.paymentHistory || t.paymentHistory || [],
                time: new Date(t.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
            } as unknown as Invoice);
        } catch (err) {
            console.error('Open bill failed:', err);
            setActionModal({ message: 'Could not load the bill. Please try again.', type: State.ERROR });
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

    // New sale for a customer, new purchase for a supplier; "Both" defaults to a sale.
    const addBill = (party: PartySummary) => {
        const prefillParty = { name: hasRealName(party) ? party.partyName : '', number: hasPhone(party) ? normalizePartyNumber(party.partyNumber) : '' };
        navigate(party.partyType === 'Supplier' ? ROUTES.PURCHASE : ROUTES.SALES, { state: { prefillParty } });
    };

    const chipClass = (active: boolean) =>
        `shrink-0 whitespace-nowrap rounded-sm border px-3 py-1.5 text-sm font-medium transition ${active
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
        }`;
    const segClass = (active: boolean) =>
        `whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'}`;

    const rowMenu = (party: PartySummary, key: string) => (
        <div className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); setRowMenuKey((k) => (k === key ? null : key)); }}
                aria-label="More actions"
                className="rounded-sm p-1.5 text-slate-500 transition hover:bg-slate-100"
            >
                <MoreHorizontal size={16} />
            </button>
            {rowMenuKey === key && (
                <>
                    <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setRowMenuKey(null); }} />
                    <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-sm border border-line bg-white p-1 shadow-float">
                        {key !== 'detail' && (
                            <button onClick={(e) => { e.stopPropagation(); openParty(party); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-sunken">
                                <FileText size={14} /> Open statement
                            </button>
                        )}
                        {hasPhone(party) && (
                            <button onClick={(e) => { e.stopPropagation(); openEditParty(party); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-sunken">
                                <Pencil size={14} /> Edit party
                            </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setRowMenuKey(null); addBill(party); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-sunken">
                            <FileText size={14} /> Add bill
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setRowMenuKey(null); openAddOpeningBalance(party); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-sunken">
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
                        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-blue-600">
                                {obMode === 'newParty' ? <UserPlus size={18} /> : <Scale size={18} />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-semibold text-slate-900">{obMode === 'newParty' ? 'Add party' : 'Add opening balance'}</h2>
                                <p className="text-xs text-slate-500">
                                    {obMode === 'newParty' ? 'A customer or supplier, with any old balance' : `${obForm.partyName} · ${obForm.partyType}`}
                                </p>
                            </div>
                            <button onClick={() => setIsOBModalOpen(false)} aria-label="Close" className="rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-4 px-5 py-4">
                            {obMode === 'newParty' && (
                                <>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_9rem]">
                                        <label className="block text-xs font-medium text-slate-600">
                                            Party name <span className="text-red-500">*</span>
                                            <input value={obForm.partyName} onChange={(e) => setObForm((f) => ({ ...f, partyName: e.target.value }))} autoFocus placeholder="e.g. Ramesh Traders" className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                                        </label>
                                        <label className="block text-xs font-medium text-slate-600">
                                            Phone <span className="text-red-500">*</span>
                                            <input value={obForm.partyNumber} inputMode="numeric" maxLength={10} onChange={(e) => setObForm((f) => ({ ...f, partyNumber: e.target.value.replace(/\D/g, '') }))} placeholder="10 digits" className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                                        </label>
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-slate-600">Type</p>
                                        <div className="mt-1 flex gap-1 rounded-sm bg-sunken p-1">
                                            {(['Customer', 'Supplier'] as const).map((t) => (
                                                <button key={t} onClick={() => setObForm((f) => ({ ...f, partyType: t }))} className={`flex-1 ${segClass(obForm.partyType === t)}`}>{t}</button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                            <div>
                                <p className="text-xs font-medium text-slate-600">{obMode === 'newParty' ? 'Old balance' : 'Balance type'}</p>
                                <div className="mt-1 flex gap-1 rounded-sm bg-sunken p-1">
                                    <button onClick={() => setObForm((f) => ({ ...f, balanceType: 'due' }))} className={`flex-1 ${segClass(obForm.balanceType === 'due')}`}>They owe you</button>
                                    <button onClick={() => setObForm((f) => ({ ...f, balanceType: 'advance' }))} className={`flex-1 ${segClass(obForm.balanceType === 'advance')}`}>You owe them</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-[9rem_1fr]">
                                <label className="block text-xs font-medium text-slate-600">
                                    Amount (₹) {obMode === 'opening' ? <span className="text-red-500">*</span> : <span className="font-normal text-slate-400">· optional</span>}
                                    <input type="number" value={obForm.amount} onChange={(e) => setObForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                                </label>
                                <label className="block text-xs font-medium text-slate-600">
                                    Note <span className="font-normal text-slate-400">· optional</span>
                                    <input value={obForm.note} onChange={(e) => setObForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Pending from last year" className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                                </label>
                            </div>
                        </div>
                        <div className="flex gap-2 border-t border-line px-5 py-4 md:justify-end">
                            <button onClick={() => setIsOBModalOpen(false)} className="hidden rounded-sm px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 md:block">Cancel</button>
                            <button onClick={handleAddOpeningBalance} disabled={obLoading} className="w-full rounded-sm bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 md:w-auto md:py-2">
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
                        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-blue-600"><Pencil size={18} /></span>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-semibold text-slate-900">Edit party</h2>
                                <p className="text-xs text-slate-500">{partyToEdit.partyType} · {formatPhone(partyToEdit.partyNumber)}</p>
                            </div>
                            <button type="button" onClick={() => setPartyToEdit(null)} aria-label="Close" className="rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-4 px-5 py-4">
                            <label className="block text-xs font-medium text-slate-600">
                                Party name
                                <input value={editForm.name} autoFocus={editFocus === 'name'} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ramesh Traders" className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                                <span className="mt-1 block font-normal text-slate-500">Shown in the ledger and on new bills. Old bills keep the name they were printed with.</span>
                            </label>
                            <label className="block text-xs font-medium text-slate-600">
                                GSTIN <span className="font-normal text-slate-400">· optional</span>
                                <input value={editForm.gstNumber} autoFocus={editFocus === 'gstNumber'} maxLength={15} onChange={(e) => setEditForm((f) => ({ ...f, gstNumber: e.target.value.toUpperCase() }))} placeholder="09ABCDE1234F1Z5" className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                            </label>
                            <label className="block text-xs font-medium text-slate-600">
                                Address <span className="font-normal text-slate-400">· optional</span>
                                <textarea value={editForm.address} autoFocus={editFocus === 'address'} rows={2} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} placeholder="Shop no., street, city" className="mt-1 w-full resize-none rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                            </label>
                            <p className="text-xs text-slate-500">The phone number can't be changed here — every bill is filed under it.</p>
                        </div>
                        <div className="flex gap-2 border-t border-line px-5 py-4 md:justify-end">
                            <button type="button" onClick={() => setPartyToEdit(null)} className="hidden rounded-sm px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 md:block">Cancel</button>
                            <button type="submit" disabled={isSavingParty} className="w-full rounded-sm bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 md:w-auto md:py-2">
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
                        <p className="text-sm text-slate-600">This permanently deletes their sales, purchases and opening balance records. It can't be undone.</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setPartyToDelete(null)} disabled={isDeletingParty} className="rounded-sm border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50">Cancel</button>
                            <button onClick={async () => { const wasOpen = selectedPartyName; await confirmDeleteParty(); if (wasOpen) setSelectedPartyName(null); }} disabled={isDeletingParty} className="inline-flex items-center gap-2 rounded-sm bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
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
                        <p className="text-sm text-slate-600">This permanently deletes every sale, purchase, opening balance, customer and supplier record for your company. It can't be undone.</p>
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
                        <div className="mb-2 h-3 w-full overflow-hidden rounded-sm bg-slate-100">
                            <div className="h-3 rounded-sm bg-blue-600 transition-all duration-100" style={{ width: `${(bulkUploadProgress.current / bulkUploadProgress.total) * 100}%` }} />
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

            {actionModal && (
                <Modal message={actionModal.message} type={actionModal.type} onClose={() => setActionModal(null)} onConfirm={() => setActionModal(null)} showConfirmButton={false} />
            )}
            {invoiceToPrint && (
                <InvoiceActionSheet
                    invoiceToPrint={invoiceToPrint}
                    setInvoiceToPrint={setInvoiceToPrint}
                    setShowPrintSubMenu={setShowPrintSubMenu}
                    isPosBasicPlan={isPosBasicPlan}
                    billType={billType}
                    setBillType={setBillType}
                    sendingPdf={sendingPdf}
                    companyId={currentUser?.companyId}
                    handleSendWhatsapp={handleSendWhatsapp}
                    handleSendWhatsappSnapto={handleSendWhatsappSnapto}
                    handlePdfAction={handlePdfAction}
                    handleShowQr={handleShowQr}
                />
            )}
            {!isPosBasicPlan && showPrintSubMenu && invoiceToPrint && (
                <PrintSubMenuModal
                    invoiceToPrint={invoiceToPrint}
                    setInvoiceToPrint={setInvoiceToPrint}
                    setShowPrintSubMenu={setShowPrintSubMenu}
                    billType={billType}
                    enableTriplicate={enableTriplicate}
                    handlePdfAction={handlePdfAction}
                />
            )}
            {showQrModal && (
                <QrCodeModal
                    showQrModal={showQrModal}
                    setShowQrModal={setShowQrModal}
                    companyId={currentUser?.companyId}
                />
            )}

            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => {
                    setIsPaymentModalOpen(false);
                    setSelectedInvoiceForPayment(null);
                    setAvailableCredit(0);
                }}
                invoice={selectedInvoiceForPayment}
                onSubmit={selectedInvoiceForPayment?.isSettleAll ? handleSettleAllPayment : handleSettlePayment}
                availableCredit={availableCredit}
                isDebitNote={selectedInvoiceForPayment?.type === 'purchase'}
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
        const words = balanceWords(statement.net);
        const side = statement.net < 0 || (statement.net === 0 && statement.receivableBilled === 0 && statement.payableBilled > 0) ? 'pay' : 'receive';
        const progressBilled = side === 'receive' ? statement.receivableBilled : statement.payableBilled;
        const progressPaid = side === 'receive' ? statement.received : statement.paidOut;
        const progressPct = progressBilled > 0 ? Math.min(100, (progressPaid / progressBilled) * 100) : 0;
        const hasDue = statement.receivable > 0 || statement.payable > 0;
        const showRemind = canRemind(party);
        const supplierOwesYou = party.partyType === 'Supplier' && statement.receivable > 0;

        // One bill / opening balance from the statement, in the detail panel.
        const openTxn = expandedBillId ? (party.transactions as LedgerTxn[]).find((t) => t.id === expandedBillId) : undefined;
        const billPanel = openTxn && (() => {
            const t = openTxn;
            const advance = isAdvance(t);
            const purchase = !t.isOpeningBalance && t.type === 'purchase';
            const canSettle = t.dueAmount > 0 && !advance;
            const paid = Math.max(t.totalAmount - t.dueAmount, 0);
            const time = new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
            return (
                <DetailPanel
                    open
                    onClose={() => setExpandedBillId(null)}
                    title={t.isOpeningBalance ? (advance ? 'Advance (you owe them)' : 'Opening balance') : t.invoiceNumber || `#${t.id.slice(0, 6).toUpperCase()}`}
                    badge={t.dueAmount > 0 && !advance
                        ? <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Unpaid</span>
                        : undefined}
                    subtitle={`${formatFullDate(t.createdAt)}, ${time} · ${t.isOpeningBalance ? 'Opening balance' : purchase ? 'Purchase' : 'Sale'}`}
                    footer={(canSettle || (!t.isOpeningBalance && !purchase && companyId)) ? (
                        <div className="flex gap-2">
                            {canSettle && (
                                <button onClick={() => { setExpandedBillId(null); openSettleForTxn(party, t); }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                                    <Check size={15} /> Settle {inr(t.dueAmount)}
                                </button>
                            )}
                            {!t.isOpeningBalance && !purchase && companyId && (
    <button
        type="button"
        onClick={() => { setExpandedBillId(null); openBillActions(party, t); }}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-400"
    >
        <ExternalLink size={15} /> View bill
    </button>
)}
                        </div>
                    ) : undefined}
                >
                    {t.note && <p className="rounded-sm bg-sunken px-3 py-2.5 text-sm text-slate-600">Note: {t.note}</p>}

                    {!t.isOpeningBalance && (
                        <DetailSection title={`Items · ${(t.items || []).length}`}>
                            <DetailItems
                                items={(t.items || []).map((item) => {
                                    const raw = item as unknown as Record<string, unknown>;
                                    const unit = Number(purchase ? raw.purchasePrice : raw.mrp) || Number(raw.mrp) || 0;
                                    return { name: String(raw.name ?? ''), quantity: Number(raw.quantity) || 0, unitPrice: unit };
                                })}
                            />
                        </DetailSection>
                    )}

                    <DetailSection title="Payments">
                        {(t.paymentHistory || []).length === 0 ? (
                            <p className="rounded-sm bg-sunken px-3 py-2.5 text-sm text-slate-500">No payments recorded against this yet.</p>
                        ) : (
                            <ul className="divide-y divide-line rounded-sm border border-line">
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
                    </DetailSection>

                    <DetailSection title="Total">
                        <DetailRows
                            rows={[
                                { label: t.isOpeningBalance ? 'Amount' : 'Bill total', value: inr(t.totalAmount) },
                                { label: purchase || advance ? 'Paid' : 'Received', value: inr(paid), tone: 'text-green-700' },
                                { label: 'Pending', value: t.dueAmount > 0 ? inr(t.dueAmount) : 'Settled ✓', tone: t.dueAmount > 0 ? 'text-amber-700' : 'text-green-700', strong: true },
                            ]}
                        />
                    </DetailSection>
                </DetailPanel>
            );
        })();

        const kpis = [
            { label: 'Total billed', value: inr(party.totalBilled), hint: `${party.transactions.length} ${party.transactions.length === 1 ? 'entry' : 'entries'}${party.totalTransactions === 0 ? ' · opening balance' : ''}`, icon: FileText, iconClass: 'bg-blue-50 text-blue-600', valueClass: 'text-slate-900' },
            { label: side === 'receive' ? 'Received' : 'Paid', value: inr(side === 'receive' ? statement.received : statement.paidOut), hint: `${statement.payments.length} ${statement.payments.length === 1 ? 'payment' : 'payments'}${statement.modes.length ? ` · ${statement.modes.join(', ').toLowerCase()}` : ''}`, icon: Wallet, iconClass: 'bg-green-50 text-green-600', valueClass: 'text-slate-900' },
            { label: 'Pending', value: statement.net === 0 ? '₹0' : inr(statement.net), hint: statement.net > 0 ? `they owe you${statement.oldestDue ? ` · ${daysSince(statement.oldestDue)} days` : ''}` : statement.net < 0 ? 'you owe them' : 'settled', icon: Scale, iconClass: 'bg-amber-50 text-amber-600', valueClass: statement.net > 0 ? 'text-amber-700' : 'text-slate-900' },
            { label: 'Last payment', value: statement.lastPayment ? formatDayMonth(statement.lastPayment.date) : '—', hint: statement.lastPayment ? `${inr(statement.lastPayment.effect)} · ${daysSince(statement.lastPayment.date)} days ago` : 'no payments yet', icon: CalendarDays, iconClass: 'bg-blue-50 text-blue-600', valueClass: 'text-slate-900' },
        ];

        return (
            <div className="min-h-screen bg-canvas px-3 pb-28 pt-3 md:px-6 md:pb-8 md:pt-5">
                {modals}
                {billPanel}

                {/* HEADER */}
                <header className="mb-4 flex items-center gap-2 md:gap-3">
                    <button onClick={() => { setSelectedPartyName(null); setExpandedBillId(null); }} aria-label="Back to party list" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-slate-200 md:border md:border-slate-300 md:bg-white">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="hidden md:block">{avatar(party.partyName)}</span>
                    <div className="min-w-0 flex-1">
                        <p className="hidden text-xs text-slate-500 md:block">Party ledger /</p>
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="truncate text-lg font-bold text-slate-900 md:text-xl">{hasRealName(party) ? party.partyName : 'No name'}</h1>
                            <span className="hidden md:inline">{typeBadge(party.partyType)}</span>
                        </div>
                        <p className="truncate text-xs text-slate-500 md:hidden">
                            {party.partyType}{party.partyNumber && party.partyNumber !== 'N/A' ? ` · ${formatPhone(party.partyNumber)}` : ''}
                        </p>
                    </div>
                    <div className="hidden items-center gap-2 md:flex">
                        <button onClick={downloadStatementPdf} className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">
                            <ArrowDownToLine size={15} /> Statement PDF
                        </button>
                        {showRemind && (
                            <button onClick={() => sendReminderFor(party, whatsappProvider)} disabled={sendingReminderFor === party.partyNumber} className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50">
                                <MessageCircle size={15} className="text-green-600" /> {sendingReminderFor === party.partyNumber ? 'Sending…' : 'Remind on WhatsApp'}
                            </button>
                        )}
                        {hasDue && (
                            <button onClick={() => openSettleAll(party)} className="inline-flex items-center gap-1.5 rounded-sm bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                                <Check size={15} /> Settle payment
                            </button>
                        )}
                    </div>
                    <button onClick={downloadStatementPdf} aria-label="Statement PDF" className="rounded-sm p-2 text-slate-700 hover:bg-slate-200 md:hidden">
                        <ArrowDownToLine size={20} />
                    </button>
                    {rowMenu(party, 'detail')}
                </header>

                <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] ${dimClass}`}>
                    <div className="min-w-0 space-y-4">
                        {/* MOBILE: balance first */}
                        <div className="rounded-sm border border-line bg-white p-4 shadow-card md:hidden">
                            <p className="text-xs text-slate-600">{words.label}</p>
                            <p className={`mt-1 text-3xl font-bold ${words.cls}`}>{words.value}</p>
                            {progressBilled > 0 && (
                                <>
                                    <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-slate-100">
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
                                    <button onClick={() => sendReminderFor(party, whatsappProvider)} disabled={sendingReminderFor === party.partyNumber} className="flex items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
                                        <MessageCircle size={16} className="text-green-600" /> Remind
                                    </button>
                                ) : <span />}
                                {hasDue && (
                                    <button onClick={() => openSettleAll(party)} className="flex items-center justify-center gap-2 rounded-sm bg-blue-600 py-3 text-sm font-semibold text-white">
                                        <Check size={16} /> Settle
                                    </button>
                                )}
                            </div>
                        )}

                        {/* DESKTOP: KPIs + progress */}
                        <div className="hidden grid-cols-4 gap-4 md:grid">
                            {kpis.map(({ label, value, hint, icon: Icon, iconClass, valueClass }) => (
                                <div key={label} className="min-w-0 rounded-sm border border-line bg-white p-4 shadow-card">
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
                            <div className="hidden rounded-sm border border-line bg-white p-4 shadow-card md:block">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600">Paid <strong className="text-slate-900">{inr(progressPaid)}</strong> of {inr(progressBilled)}</span>
                                    {progressPaid < progressBilled && (
                                        <span className={side === 'receive' ? 'font-semibold text-amber-700' : 'font-semibold text-slate-700'}>
                                            {inr(progressBilled - progressPaid)} left · {Math.round(progressPct)}%
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-sm bg-slate-100">
                                    <div className="h-full rounded-sm bg-green-600" style={{ width: `${progressPct}%` }} />
                                </div>
                            </div>
                        )}

                        {/* STATEMENT */}
                        <section className="rounded-sm border border-line bg-white shadow-card">
                            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                                <h2 className="text-sm font-semibold text-slate-900">Statement</h2>
                                <span className="hidden text-xs text-slate-500 md:inline">{rangeLabel} · running balance</span>
                                <div className="ml-auto flex gap-2">
                                    <button onClick={() => openAddOpeningBalance(party)} className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400">
                                        <Plus size={13} /> Opening balance
                                    </button>
                                    <button onClick={() => addBill(party)} className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400">
                                        <Plus size={13} /> Add bill
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
                                        <thead className="bg-sunken text-[11px] uppercase tracking-wide text-blue-700/80">
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
                                                    <React.Fragment key={r.key}>
                                                        <tr onClick={() => setExpandedBillId(t.id)} className={`cursor-pointer border-t border-line ${expandedBillId === t.id ? 'bg-blue-50' : 'hover:bg-sunken'}`}>
                                                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                                                {formatFullDate(r.date)}
                                                                {r.isPayment && <span className="block text-xs text-slate-400">{new Date(r.date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className={`font-medium ${r.isPayment ? 'text-slate-700' : 'text-slate-900'}`}>{r.title}</span>
                                                                {t.isOpeningBalance && !r.isPayment && (
                                                                    <span className="ml-2 rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{isAdvance(t) ? 'Advance' : 'Opening'}</span>
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
                                                                    <button onClick={(e) => { e.stopPropagation(); openSettleForTxn(party, t); }} className="rounded-sm px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50">
                                                                        Settle
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="border-t border-line bg-sunken text-sm font-semibold text-slate-900">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-3">Closing balance · {statement.closing > 0 ? 'they owe you' : statement.closing < 0 ? 'you owe' : 'settled'}</td>
                                                <td className="px-4 py-3 text-right">{inr(statement.receivableBilled)}{statement.payableBilled > 0 && <span className="block text-xs font-normal text-slate-500">− {inr(statement.payableBilled)}</span>}</td>
                                                <td className="px-4 py-3 text-right">{inr(statement.received)}{statement.paidOut > 0 && <span className="block text-xs font-normal text-slate-500">− {inr(statement.paidOut)}</span>}</td>
                                                <td className={`px-4 py-3 text-right ${statement.closing > 0 ? 'text-amber-700' : statement.closing === 0 ? 'text-green-700' : ''}`}>{statement.closing === 0 ? 'Settled ✓' : inr(statement.closing)}</td>
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
                                            <li key={r.key} onClick={() => setExpandedBillId(t.id)} className={`flex cursor-pointer items-center gap-3 px-4 py-3 active:bg-sunken ${idx > 0 ? 'border-t border-line' : ''}`}>
                                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${r.isPayment ? 'bg-green-50 text-green-600' : t.isOpeningBalance ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {r.isPayment ? <Wallet size={16} /> : <FileText size={16} />}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                                                    <p className="truncate text-xs text-slate-500">
                                                        {formatDayMonth(r.date)}{r.isPayment ? ` · ${new Date(r.date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}{r.mode ? ` · ${r.mode}` : ''}{!r.isPayment && r.sub ? ` · ${r.sub}` : ''}
                                                    </p>
                                                    {canSettle && (
                                                        <button onClick={(e) => { e.stopPropagation(); openSettleForTxn(party, t); }} className="mt-1 text-xs font-semibold text-blue-600">Settle this</button>
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
                                    <li className="flex items-center justify-between rounded-b-sm border-t border-line bg-sunken px-4 py-3 text-sm font-semibold">
                                        <span className="text-slate-900">Closing balance</span>
                                        <span className={statement.closing > 0 ? 'text-amber-700' : statement.closing === 0 ? 'text-green-700' : 'text-slate-900'}>
                                            {statement.closing === 0 ? 'Settled ✓' : `${inr(statement.closing)} ${statement.closing > 0 ? 'due' : 'you owe'}`}
                                        </span>
                                    </li>
                                </ul>
                            )}
                        </section>
                    </div>

                    {/* RIGHT: party details */}
                    <aside className="space-y-4">
                        <div className="rounded-sm border border-line bg-white p-4 shadow-card">
                            <h3 className="text-sm font-semibold text-slate-900">Party details</h3>
                            <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-y-2 text-sm">
                                <dt className="text-slate-500">Phone</dt>
                                <dd className="text-slate-900">{party.partyNumber && party.partyNumber !== 'N/A' ? formatPhone(party.partyNumber) : '—'}</dd>
                                <dt className="text-slate-500">Type</dt>
                                <dd className="text-slate-900">{party.partyType}</dd>
                                <dt className="text-slate-500">GSTIN</dt>
                                <dd className="text-slate-900">
                                    {party.gstNumber || (hasPhone(party)
                                        ? <button onClick={() => openEditParty(party, 'gstNumber')} className="font-medium text-blue-600 hover:underline">Add</button>
                                        : <span className="text-slate-400">Not added</span>)}
                                </dd>
                                <dt className="text-slate-500">Address</dt>
                                <dd className="text-slate-900">
                                    {party.address || (hasPhone(party)
                                        ? <button onClick={() => openEditParty(party, 'address')} className="font-medium text-blue-600 hover:underline">Add</button>
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
                            <div className="hidden rounded-sm border border-line bg-white p-4 shadow-card md:block">
                                <h3 className="text-sm font-semibold text-slate-900">Reminder</h3>
                                <p className="mt-1 text-xs text-slate-500">The WhatsApp message lists each unpaid bill and the total.</p>
                                <p className="mt-3 rounded-sm bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
                                    "Dear {party.partyName}, this is a gentle reminder that a total amount of {inr(statement.receivable)} is due…"
                                </p>
                            </div>
                        )}

                        {supplierOwesYou && (
                            <div className="flex gap-2 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                                <p>{party.partyName} is a <strong>supplier</strong> but owes you money — check the opening balance direction if this looks wrong.</p>
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
        { label: 'To collect', value: inr(totals.toCollect), hint: totals.collectCount ? `${totals.collectCount} ${totals.collectCount === 1 ? 'party owes' : 'parties owe'} you` : 'nobody owes you', icon: Wallet, iconClass: 'bg-amber-50 text-amber-600', valueClass: totals.toCollect > 0 ? 'text-amber-700' : 'text-slate-900' },
        { label: 'To pay', value: inr(totals.toPay), hint: totals.payCount ? `you owe ${totals.payCount} ${totals.payCount === 1 ? 'party' : 'parties'}` : 'you owe nobody', icon: ArrowDownToLine, iconClass: 'bg-red-50 text-red-600', valueClass: 'text-slate-900' },
        { label: 'Parties', value: parties.length.toLocaleString('en-IN'), hint: `${totals.customers} customers · ${totals.suppliers} suppliers · ${totals.both} both`, icon: Users, iconClass: 'bg-pink-50 text-pink-600', valueClass: 'text-slate-900' },
        { label: 'Settled', value: totals.settled.toLocaleString('en-IN'), hint: 'no balance', icon: Check, iconClass: 'bg-green-50 text-green-600', valueClass: 'text-slate-900' },
    ];

    const typeSegments: { value: typeof partyTypeFilter; label: string; count: number }[] = [
        { value: 'all', label: 'All', count: parties.length },
        { value: 'Customer', label: 'Customers', count: totals.customers },
        { value: 'Supplier', label: 'Suppliers', count: totals.suppliers },
        { value: 'Both', label: 'Both', count: totals.both },
    ];
    const statusSegments: { value: typeof statusFilter; label: string; count?: number }[] = [
        { value: 'all', label: 'Any balance' },
        { value: 'due', label: 'Due', count: totals.due },
        { value: 'settled', label: 'Settled', count: totals.settled },
    ];

    const partyActions = (p: (typeof filteredParties)[number], compact: boolean) => {
        const { party } = p;
        const key = `${compact ? 'm' : 'd'}-${partyKey(party)}-${party.partyType}`;
        const hasDue = p.receivable > 0 || p.payable > 0;
        const showRemind = canRemind(party);
        const btn = compact ? 'py-2 text-xs' : 'px-3 py-1.5 text-xs';
        return (
            <div className={compact ? 'grid grid-cols-[1fr_1fr_auto] gap-2' : 'flex items-center justify-end gap-1.5'}>
                {showRemind ? (
                    <button onClick={(e) => { e.stopPropagation(); sendReminderFor(party, whatsappProvider); }} disabled={sendingReminderFor === party.partyNumber} className={`inline-flex items-center justify-center gap-1.5 rounded-sm bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 ${btn}`}>
                        <MessageCircle size={13} /> {sendingReminderFor === party.partyNumber ? 'Sending…' : 'Remind'}
                    </button>
                ) : compact && hasDue ? <span /> : null}
                {hasDue ? (
                    <button onClick={(e) => { e.stopPropagation(); openSettleAll(party); }} className={`rounded-sm border border-slate-300 bg-white font-medium text-slate-700 hover:border-slate-400 ${btn}`}>
                        Settle
                    </button>
                ) : (
                    <button onClick={(e) => { e.stopPropagation(); openParty(party); }} className={`rounded-sm border border-slate-300 bg-white font-medium text-slate-700 hover:border-slate-400 ${btn} ${compact ? 'col-span-2' : ''}`}>
                        Statement
                    </button>
                )}
                {rowMenu(party, key)}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-canvas px-3 pb-28 pt-3 md:px-6 md:pb-8 md:pt-5">
            {modals}

            {/* HEADER */}
            <header className="mb-4 flex items-center gap-2 md:gap-3">
                <button onClick={() => navigate(-1)} aria-label="Back" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-slate-200 md:border md:border-slate-300 md:bg-white">
                    <ChevronLeft size={20} />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
                    <div className="flex items-baseline gap-3">
                        <h1 className="text-lg font-bold text-slate-900 md:text-xl">Party ledger</h1>
                        <span className="hidden text-xs text-slate-500 md:inline">Every customer's and supplier's balance</span>
                    </div>
                    <p className="text-xs text-slate-500 md:hidden">{parties.length} {parties.length === 1 ? 'party' : 'parties'} · {rangeLabel}</p>
                </div>
                <button onClick={openAddParty} className="hidden shrink-0 items-center gap-1.5 rounded-sm bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 md:inline-flex">
                    <UserPlus size={15} /> Add party
                </button>

                {/* Mobile: import + more */}
                <button onClick={() => bulkFileInputRef.current?.click()} disabled={isBulkUploading} aria-label="Import old balances from Excel" className="rounded-sm p-2 text-slate-700 hover:bg-slate-200 md:hidden">
                    <Upload size={20} />
                </button>
                <div className="relative md:hidden">
                    <button onClick={() => setPageMenuOpen((o) => !o)} aria-label="More actions" className="rounded-sm p-2 text-slate-700 hover:bg-slate-200">
                        <MoreHorizontal size={20} />
                    </button>
                    {pageMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setPageMenuOpen(false)} />
                            <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-sm border border-line bg-white p-1 shadow-float">
                                <button onClick={() => { setPageMenuOpen(false); handleDownloadBulkSample(); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-sunken">
                                    <FileSpreadsheet size={14} /> Import template
                                </button>
                                {canBulkRemind && remindableParties.length > 0 && (
                                    <button onClick={() => { setPageMenuOpen(false); remindAll(); }} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-sunken">
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
                            <div key={label} className="min-w-0 rounded-sm border border-line bg-white p-3 shadow-card md:p-4">
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
                    <div className="relative space-y-3 md:rounded-sm md:border md:border-line md:bg-white md:p-4 md:shadow-card">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search party by name or number" className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                                )}
                            </div>
                            <div className="relative shrink-0">
                                <CalendarDays size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <select
                                    value={datePreset}
                                    onChange={(e) => (e.target.value === 'custom' ? setIsRangeOpen(true) : handleDatePresetChange(e.target.value))}
                                    className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none hover:border-slate-400 focus:border-blue-500"
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
                            <div className="flex gap-1 rounded-sm bg-sunken p-1">
                                {typeSegments.map((s) => (
                                    <button key={s.value} onClick={() => setPartyTypeFilter(s.value)} className={segClass(partyTypeFilter === s.value)}>{s.label} {s.count}</button>
                                ))}
                            </div>
                            <div className="flex gap-1 rounded-sm bg-sunken p-1">
                                {statusSegments.map((s) => (
                                    <button key={s.value} onClick={() => setStatusFilter(s.value)} className={segClass(statusFilter === s.value)}>{s.label}{s.count !== undefined ? ` ${s.count}` : ''}</button>
                                ))}
                            </div>
                        </div>
                        {/* Mobile chips */}
                        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
                            <button onClick={() => { setPartyTypeFilter('all'); setStatusFilter('all'); }} className={chipClass(partyTypeFilter === 'all' && statusFilter === 'all')}>All {parties.length}</button>
                            <button onClick={() => setStatusFilter(statusFilter === 'due' ? 'all' : 'due')} className={chipClass(statusFilter === 'due')}>Due {totals.due}</button>
                            <button onClick={() => setStatusFilter(statusFilter === 'settled' ? 'all' : 'settled')} className={chipClass(statusFilter === 'settled')}>Settled {totals.settled}</button>
                            {(['Customer', 'Supplier', 'Both'] as const).map((t) => (
                                <button key={t} onClick={() => setPartyTypeFilter(partyTypeFilter === t ? 'all' : t)} className={chipClass(partyTypeFilter === t)}>
                                    {t === 'Both' ? 'Both' : `${t}s`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* PARTY LIST */}
                    <section className="rounded-sm border border-line bg-white shadow-card">
                        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                            <h2 className="text-sm font-semibold text-slate-900">Parties</h2>
                            <span className="text-xs text-slate-500">Sorted by amount due</span>
                            <button onClick={() => setIsListVisible((v) => !v)} className="ml-auto hidden rounded-sm px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 md:block">
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
                                    const words = balanceWords(p.net);
                                    const meta = [
                                        party.partyNumber && party.partyNumber !== 'N/A' ? formatPhone(party.partyNumber) : '',
                                        `${party.totalTransactions} ${party.totalTransactions === 1 ? 'bill' : 'bills'}`,
                                        party.totalTransactions === 0 && party.transactions.some((t) => t.isOpeningBalance) ? 'opening balance' : '',
                                        party.gstNumber ? `GSTIN ${party.gstNumber}` : '',
                                    ].filter(Boolean).join(' · ');
                                    return (
                                        <li key={`${partyKey(party)}-${party.partyType}`} onClick={() => openParty(party)} className={`cursor-pointer px-4 py-3.5 transition hover:bg-sunken ${idx > 0 ? 'border-t border-line' : ''}`}>
                                            <div className="flex items-center gap-3">
                                                {avatar(party.partyName)}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className={`truncate text-sm font-semibold ${hasRealName(party) ? 'text-slate-900' : 'text-slate-500'}`}>
                                                            {hasRealName(party) ? party.partyName : 'No name'}
                                                        </span>
                                                        {!hasRealName(party) && hasPhone(party) && (
                                                            <button onClick={(e) => { e.stopPropagation(); openEditParty(party, 'name'); }} className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
                                                                Add name
                                                            </button>
                                                        )}
                                                        {typeBadge(party.partyType)}
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
                                            {(p.receivable > 0 || p.payable > 0) && <div className="mt-3 md:hidden">{partyActions(p, true)}</div>}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </div>

                {/* RIGHT COLUMN (desktop) */}
                <aside className="hidden space-y-4 lg:block">
                    <div className="rounded-sm border border-line bg-white p-4 shadow-card">
                        <div className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-blue-600"><FileSpreadsheet size={16} /></span>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900">Bring in old balances</h3>
                                <p className="mt-0.5 text-xs text-slate-500">Upload Excel — old dues and advances are added as opening balances.</p>
                            </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => bulkFileInputRef.current?.click()} disabled={isBulkUploading} className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50">
                                {isBulkUploading ? <Spinner /> : <><Upload size={13} /> Upload Excel</>}
                            </button>
                            <button onClick={handleDownloadBulkSample} disabled={isBulkUploading} className="rounded-sm px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Template</button>
                        </div>
                    </div>

                    <div className="rounded-sm border border-line bg-white p-4 shadow-card">
                        <h3 className="text-sm font-semibold text-slate-900">Reminders</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {canBulkRemind
                                ? 'Send every party who owes you a WhatsApp message with their balance.'
                                : 'Connect WhatsApp to remind everyone at once. Single reminders open WhatsApp with the message ready.'}
                        </p>
                        {canBulkRemind && (
                            <button onClick={remindAll} disabled={remindableParties.length === 0 || isRemindingAll} className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50">
                                <MessageCircle size={13} className="text-green-600" /> Remind all due ({remindableParties.length})
                            </button>
                        )}
                    </div>

                    <div className="rounded-sm border border-red-100 bg-white p-4 shadow-card">
                        <h3 className="text-sm font-semibold text-slate-900">Danger zone</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Permanently delete every party, invoice and opening balance. You'll be asked to type DELETE.</p>
                        <button onClick={() => setIsDeleteAllModalOpen(true)} className="mt-3 rounded-sm px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Delete all parties…</button>
                    </div>
                </aside>
            </div>

            {/* Mobile: Add party pinned above the bottom navigation */}
            <div className="sticky bottom-3 z-10 mt-4 md:hidden">
                <button onClick={openAddParty} className="flex w-full items-center justify-center gap-2 rounded-sm bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-float active:bg-blue-700">
                    <UserPlus size={17} /> Add party
                </button>
            </div>
        </div>
    );
};

export default PartyLedger;
