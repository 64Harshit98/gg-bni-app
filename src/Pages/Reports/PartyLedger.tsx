import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Users } from 'lucide-react';
import { formatDateForInput } from './SalesReportComponents/salesReport.utils';
import usePartyLedger, { type LedgerTransaction, type PaymentRecord } from './PartyLedger/usePartyLedger';
import ExcelJS from 'exceljs';
import { Spinner } from '../../Components/ui/spinner';
import { PaymentModal } from '../../constants/Modal';
import BackButton from '../../Components/BackButton';
import { useNavigate } from 'react-router-dom';
import { botMasterService } from '../Additional/Whatsapp/WhatsappApi';
import { ROUTES } from '../../constants/routes.constants';
import {
  fetchBusinessWhatsappConfig,
  fetchPartyBalance,
  settleInvoicePayment,
  settleOpeningBalancePayment,
} from '../../services/reports/partyLedger.service';
import {
  generateBulkImportTemplate,
  parseBulkImportWorkbook,
  type BulkOpeningBalanceRow,
} from './PartyLedger/partyLedgerBulkImport.utils';
import OpeningBalanceModal, { type OpeningBalanceFormState } from './PartyLedger/OpeningBalanceModal';
import BulkImportPanel from './PartyLedger/BulkImportPanel';
import PartyFilterBar from './PartyLedger/PartyFilterBar';
import PartyListView from './PartyLedger/PartyListView';
import PartyDetailView from './PartyLedger/PartyDetailView';

const PartyLedger: React.FC = () => {
    const {
        companyId, isLoading, authLoading, error,
        datePreset, setDatePreset,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        setAppliedFilters, partySummaries,
        selectedPartyName, setSelectedPartyName,
        selectedPartyLedger,
        updateTransactionLocally,
        updateOpeningBalanceLocally,
        addOpeningBalance,
        addBulkOpeningBalances,
    } = usePartyLedger();

    const navigate = useNavigate();
    const [sendingReminderFor, setSendingReminderFor] = useState<string | null>(null);

    const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
    const [showTransactionList, setShowTransactionList] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [partyTypeFilter, setPartyTypeFilter] = useState<'all' | 'Customer' | 'Supplier' | 'Both'>('all');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'settled'>('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isOBModalOpen, setIsOBModalOpen] = useState(false);
    const [availableCredit, setAvailableCredit] = useState<number>(0);
    const [obForm, setObForm] = useState<OpeningBalanceFormState>({
        partyName: '',
        partyNumber: '',
        partyType: 'Customer',
        balanceType: 'due', // 'due' = they owe you, 'advance' = you owe them
        amount: '',
        note: '',
    });
    const [obLoading, setObLoading] = useState(false);

    // Bulk import state
    const bulkFileInputRef = useRef<HTMLInputElement>(null);
    const [isBulkUploading, setIsBulkUploading] = useState(false);
    const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Sends a combined WhatsApp due-reminder for a party, listing all unpaid invoice numbers
    const handleSendPartyReminder = async (party: typeof partySummaries[number]) => {
        if (!party.partyNumber || party.partyNumber === 'N/A') {
            showToast('Party phone number is missing.', 'error');
            return;
        }
        if (!companyId) return;

        setSendingReminderFor(party.partyNumber);

        try {
            const { botMasterToken, whatsappNumber } = await fetchBusinessWhatsappConfig(companyId);

            if (!botMasterToken || !whatsappNumber) {
                setSendingReminderFor(null);
                navigate(ROUTES.WHATSAPP_PLAN);
                return;
            }

            // Build list of unpaid (due > 0) transactions, excluding advance opening balances
            const partyTxns = party.transactions as (LedgerTransaction & { balanceType?: 'due' | 'advance' })[];
            const unpaidTxns = partyTxns.filter(
                (t) => t.dueAmount > 0 && !(t.isOpeningBalance && t.balanceType === 'advance')
            );

            if (unpaidTxns.length === 0) {
                showToast('No due invoices found for this party.', 'error');
                setSendingReminderFor(null);
                return;
            }

            const invoiceLines = unpaidTxns
                .map((t) => {
                    const label = t.isOpeningBalance ? 'Opening Due' : (t.invoiceNumber || `#${t.id.slice(0, 6).toUpperCase()}`);
                    const due = Number(t.dueAmount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
                    return `• ${label}: ${due}`;
                })
                .join('\n');

            const totalDueStr = party.totalDue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

            const message = `Dear ${party.partyName},\n\nThis is a gentle reminder that a total amount of ${totalDueStr} is due against the following invoice(s):\n\n${invoiceLines}\n\nKindly clear the due amount at your earliest convenience. Thank you!`;

            const response = await botMasterService.sendMessage(
                botMasterToken,
                whatsappNumber,
                party.partyNumber,
                message
            );

            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                const res = response[0];
                if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
            } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                showToast('Reminder sent via WhatsApp!', 'success');
            } else {
                throw new Error('API reported failure.');
            }
        } catch (err) {
            console.error('Party Reminder Send Error:', err);
            showToast('Failed to send reminder.', 'error');
        } finally {
            setSendingReminderFor(null);
        }
    };

    useEffect(() => {
        // Set default to last 30 days (acts as last month)
        handleDatePresetChange('last30');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleBillExpansion = (billId: string) => {
        setExpandedBillId(prev => prev === billId ? null : billId);
    };

    const handleDatePresetChange = (preset: string) => {
        setDatePreset(preset);
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                break;
            case 'yesterday':
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;
            case 'last7':
                start.setDate(start.getDate() - 6);
                break;
            case 'last30':
                start.setDate(start.getDate() - 29);
                break;
            case 'thisMonth':
                start.setDate(1);
                end.setFullYear(end.getFullYear(), end.getMonth() + 1, 0);
                break;
            case 'custom':
                return;
        }

        setCustomStartDate(formatDateForInput(start));
        setCustomEndDate(formatDateForInput(end));
    };

    const handleApplyFilters = () => {
        const start = customStartDate ? new Date(customStartDate) : new Date(0);
        start.setHours(0, 0, 0, 0);
        const end = customEndDate ? new Date(customEndDate) : new Date();
        end.setHours(23, 59, 59, 999);

        setAppliedFilters({ start: start.getTime(), end: end.getTime() });
        setSelectedPartyName(null);
        setExpandedBillId(null);
        setShowTransactionList(false);
    };

    const handleAddOpeningBalance = async () => {
        if (!obForm.partyName.trim() || !obForm.amount || Number(obForm.amount) <= 0) {
            showToast('Please fill in party name and a valid amount.', 'error');
            return;
        }
        setObLoading(true);
        try {
            await addOpeningBalance(
                obForm.partyName.trim(),
                obForm.partyNumber.trim(),
                obForm.partyType,
                Number(obForm.amount),
                obForm.note.trim(),
                obForm.balanceType
            );
            setIsOBModalOpen(false);
            setObForm({ partyName: '', partyNumber: '', partyType: 'Customer', balanceType: 'due', amount: '', note: '' });
            showToast('Opening balance added successfully!', 'success');
        } catch {
            showToast('Failed to add opening balance.', 'error');
        } finally {
            setObLoading(false);
        }
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

            const { rows: rowsToImport, skippedCount }: { rows: BulkOpeningBalanceRow[]; skippedCount: number } =
                parseBulkImportWorkbook(worksheet);

            if (rowsToImport.length === 0) {
                throw new Error('No valid rows found. Check Party Name and Credit/Debit Balance columns.');
            }

            setBulkUploadProgress({ current: 0, total: rowsToImport.length });
            const result = await addBulkOpeningBalances(rowsToImport, (current, total) => {
                setBulkUploadProgress({ current, total });
            });

            const noteParts = [
                skippedCount ? `${skippedCount} skipped (no/ambiguous balance)` : '',
                result.duplicates ? `${result.duplicates} skipped as duplicate number` : '',
            ].filter(Boolean).join(', ');

            if (result.failed > 0 || result.duplicates > 0) {
                showToast(`Imported ${result.success}, ${result.failed} failed${noteParts ? `, ${noteParts}` : ''}.`, 'error');
            } else {
                showToast(`Imported ${result.success} opening balances successfully!${noteParts ? ` (${noteParts})` : ''}`, 'success');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to import file.';
            showToast(message, 'error');
        } finally {
            setIsBulkUploading(false);
            setBulkUploadProgress(null);
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
        }
    };

    const handleSettlePayment = async (
        invoice: any,
        amount: number,
        method: string,
        chequeNumber?: string,
        chequeDate?: string
    ) => {
        try {
            if (!companyId) {
                throw new Error('Company ID not found. Please log in again.');
            }

            // Handle opening balance settlement separately
            if (invoice.isOpeningBalance) {
                const paymentRecord = await settleOpeningBalancePayment(
                    companyId,
                    invoice.id,
                    amount,
                    method,
                    chequeNumber,
                    chequeDate,
                );
                updateOpeningBalanceLocally(invoice.id, amount, paymentRecord as PaymentRecord);
                setIsPaymentModalOpen(false);
                setSelectedInvoiceForPayment(null);
                showToast(`Opening balance payment of ₹${amount} settled via ${method}!`, 'success');
                return;
            }

            if (!invoice.id || !invoice.type) {
                throw new Error('Invalid invoice data.');
            }

            const { paymentRecord, creditAdjustmentApplied } = await settleInvoicePayment({
                companyId,
                invoiceId: invoice.id,
                invoiceType: invoice.type,
                amount,
                method,
                partyNumber: invoice.partyNumber,
                chequeNumber,
                chequeDate,
            });

            if (creditAdjustmentApplied) {
                setAvailableCredit(prev => Math.max(0, prev - amount));
            }

            updateTransactionLocally(invoice.id, amount, paymentRecord as PaymentRecord);

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

    const handleSettlePaymentClick = async (txn: LedgerTransaction) => {
        const txnWithBalance = txn as LedgerTransaction & { balanceType?: 'due' | 'advance' };
        setSelectedInvoiceForPayment({
            id: txn.id,
            invoiceNumber: txn.invoiceNumber,
            type: txn.type,
            totalAmount: txn.totalAmount,
            dueAmount: txn.dueAmount,
            partyName: selectedPartyName,
            partyNumber: txn.partyNumber,
            createdAt: txn.createdAt,
            isOpeningBalance: txn.isOpeningBalance === true,
            balanceType: txnWithBalance.balanceType || 'due',
        });

        // Fetch creditBalance/debitBalance from the party's document
        const partyNum = (txn.partyNumber || '').replace(/\D/g, '').slice(-10);
        if (partyNum && companyId) {
            try {
                // Purchase (Supplier) → debitBalance, Sales (Customer) → creditBalance
                const isSupplier = txn.type === 'purchase';
                const collectionName = isSupplier ? 'suppliers' as const : 'customers' as const;
                const balanceField = isSupplier ? 'debitBalance' as const : 'creditBalance' as const;

                const balance = await fetchPartyBalance(companyId, collectionName, partyNum, balanceField);
                setAvailableCredit(balance);
            } catch {
                setAvailableCredit(0);
            }
        } else {
            setAvailableCredit(0);
        }

        setIsPaymentModalOpen(true);
    };

    const handleOpenOpeningBalanceForSelectedParty = () => {
        setObForm({
            partyName: selectedPartyLedger?.partyName || '',
            partyNumber: selectedPartyLedger?.partyNumber || '',
            partyType: selectedPartyLedger?.partyType === 'Supplier' ? 'Supplier' : 'Customer',
            balanceType: 'due',
            amount: '',
            note: '',
        });
        setIsOBModalOpen(true);
    };

    const filteredParties = useMemo(() => {
        const lowerQuery = searchQuery.toLowerCase();
        return partySummaries.filter(party => {
            const matchesSearch =
                !searchQuery.trim() ||
                party.partyName.toLowerCase().includes(lowerQuery) ||
                party.partyNumber.toLowerCase().includes(lowerQuery);

            const matchesType =
                partyTypeFilter === 'all' ||
                party.partyType === partyTypeFilter ||
                party.partyType === 'Both';

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'due' && party.totalDue > 0) ||
                (statusFilter === 'settled' && party.totalDue === 0);

            return matchesSearch && matchesType && matchesStatus;
        });
    }, [searchQuery, partyTypeFilter, partySummaries, statusFilter]);

    if (isLoading || authLoading) return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-muted-foreground">
            <Spinner size="lg" />
            <p className="text-sm font-medium">Loading ledger...</p>
        </div>
    );
    if (error) return <div className="p-4 text-center text-destructive">{error}</div>;

    return (
        <div className="aurora flex h-full min-h-screen flex-col bg-muted pb-16">
            <OpeningBalanceModal
                open={isOBModalOpen}
                onOpenChange={(open) => {
                    setIsOBModalOpen(open);
                    if (!open) setObForm({ partyName: '', partyNumber: '', partyType: 'Customer', balanceType: 'due', amount: '', note: '' });
                }}
                form={obForm}
                onFormChange={setObForm}
                onSave={handleAddOpeningBalance}
                saving={obLoading}
            />

            {toast && (
                <div className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all ${
                    toast.type === 'success' ? 'bg-success' : 'bg-destructive'
                }`}>
                    {toast.message}
                </div>
            )}

            {bulkUploadProgress && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-80 rounded-2xl bg-card p-8 text-center shadow-xl">
                        <h3 className="mb-4 text-lg font-bold text-foreground">Importing Old Invoices...</h3>
                        <div className="mb-2 h-4 w-full overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-4 rounded-full bg-primary transition-all duration-100"
                                style={{ width: `${(bulkUploadProgress.current / bulkUploadProgress.total) * 100}%` }}
                            />
                        </div>
                        <p className="font-mono text-sm text-muted-foreground">
                            {bulkUploadProgress.current} / {bulkUploadProgress.total} processed
                        </p>
                    </div>
                </div>
            )}

            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => {
                    setIsPaymentModalOpen(false);
                    setSelectedInvoiceForPayment(null);
                    setAvailableCredit(0);
                }}
                invoice={selectedInvoiceForPayment}
                onSubmit={handleSettlePayment}
                availableCredit={availableCredit}
                isDebitNote={selectedInvoiceForPayment?.type === 'purchase'}
            />

            {/* Hidden file input lives at the top level so both mobile & desktop triggers can use it */}
            <input type="file" ref={bulkFileInputRef} onChange={handleBulkFileSelected} className="hidden" accept=".xlsx, .xls" />

            {!selectedPartyName && (
                <header className="glass mx-3 mt-3 flex flex-shrink-0 items-center gap-3 rounded-2xl p-3 shadow-sm">
                    <BackButton />
                    <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
                            <Users className="size-4" />
                        </span>
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
                            Party <span className="text-gradient">Ledger</span>
                        </h1>
                        <p className="text-xs text-muted-foreground">Dues, advances &amp; payment history by party</p>
                    </div>
                </header>
            )}

            <div className="flex flex-1 flex-col gap-0 px-0 md:flex-row">
                {/* LEFT: main column */}
                <div className="w-full flex-1 md:w-[65%]">
                    {/* MOBILE-ONLY compact bulk import bar */}
                    {!selectedPartyName && (
                        <BulkImportPanel
                            compact
                            className="mx-3 mb-3 mt-3 md:hidden"
                            isUploading={isBulkUploading}
                            onUploadClick={() => bulkFileInputRef.current?.click()}
                            onDownloadSample={generateBulkImportTemplate}
                        />
                    )}

                    {!selectedPartyName && (
                        <PartyFilterBar
                            searchQuery={searchQuery}
                            onSearchQueryChange={(value) => {
                                setSearchQuery(value);
                                if (value.trim()) setShowTransactionList(true);
                            }}
                            datePreset={datePreset}
                            onPresetChange={handleDatePresetChange}
                            customStartDate={customStartDate}
                            customEndDate={customEndDate}
                            onStartDateChange={(value) => { setCustomStartDate(value); setDatePreset('custom'); }}
                            onEndDateChange={(value) => { setCustomEndDate(value); setDatePreset('custom'); }}
                            onApply={handleApplyFilters}
                            partyTypeFilter={partyTypeFilter}
                            onPartyTypeFilterChange={(value) => { setPartyTypeFilter(value); setShowTransactionList(true); }}
                            statusFilter={statusFilter}
                            onStatusFilterChange={(value) => { setStatusFilter(value); setShowTransactionList(true); }}
                        />
                    )}

                    <div className="px-3 md:px-0">
                        {!selectedPartyName ? (
                            <PartyListView
                                parties={filteredParties}
                                showList={showTransactionList}
                                onToggleShowList={() => setShowTransactionList(prev => !prev)}
                                onSelectParty={(party) => {
                                    setSelectedPartyName(party.partyNumber || party.partyName);
                                    setShowTransactionList(false);
                                }}
                                sendingReminderFor={sendingReminderFor}
                                onSendReminder={handleSendPartyReminder}
                            />
                        ) : (
                            <PartyDetailView
                                selectedPartyName={selectedPartyName}
                                selectedPartyLedger={selectedPartyLedger}
                                expandedBillId={expandedBillId}
                                onToggleBillExpansion={toggleBillExpansion}
                                onBack={() => { setSelectedPartyName(null); setExpandedBillId(null); setShowTransactionList(false); }}
                                onOpenOpeningBalance={handleOpenOpeningBalanceForSelectedParty}
                                onSettlePaymentClick={handleSettlePaymentClick}
                            />
                        )}
                    </div>
                </div>

                {/* RIGHT: desktop sidebar — Bulk Import (master list only) */}
                {!selectedPartyName && (
                    <div className="hidden w-[35%] flex-col border-l border-border bg-card shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] md:flex">
                        <div className="sticky top-4 w-full self-start p-6">
                            <BulkImportPanel
                                isUploading={isBulkUploading}
                                onUploadClick={() => bulkFileInputRef.current?.click()}
                                onDownloadSample={generateBulkImportTemplate}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PartyLedger;
