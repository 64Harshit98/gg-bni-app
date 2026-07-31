import React, { useMemo, useState } from 'react';
import { Download, Eye, EyeOff, Receipt, Search } from 'lucide-react';

import { useAuth } from '../../context/auth-context';
import { useExpenses, type Expense } from '@/features/expenses';
import { ExpenseModal } from '../../Components/ExpenseModal';
import BackButton from '../../Components/BackButton';
import { toast } from '@/lib/toast';
import { Button } from '../../Components/ui/button';
import { Skeleton } from '../../Components/ui/skeleton';
import { ConfirmDialog } from '../../Components/ui/confirm-dialog';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';

import { ExpenseFilterBar } from './ExpenseReportComponents/components/ExpenseFilterBar';
import { ExpenseSummaryCards } from './ExpenseReportComponents/components/ExpenseSummaryCards';
import { ExpenseTable } from './ExpenseReportComponents/components/ExpenseTable';
import { downloadExpensePdf, downloadExpenseExcel } from './ExpenseReportComponents/expenseReport.downloads';
import { formatDateForInput } from './SalesReportComponents/salesReport.utils';

const ExpenseReportPage: React.FC = () => {
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;
    const { expenses: posExpenses, loading: posLoading, addExpense, deleteExpense } = useExpenses(companyId, 'pos');
    const { expenses: catExpenses, loading: catLoading } = useExpenses(companyId, 'catalogue');
    const loading = posLoading || catLoading;
    const expenses = useMemo(() => [...posExpenses, ...catExpenses], [posExpenses, catExpenses]);

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
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
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
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const { filtered, summary } = useMemo(() => {
        if (!appliedFilters) return { filtered: [], summary: { total: 0, count: 0 } };

        let list = expenses.filter((e) =>
            e.date >= appliedFilters.start && e.date <= appliedFilters.end,
        );
        if (searchQuery) {
            list = list.filter((e) =>
                e.description.toLowerCase().includes(searchQuery.toLowerCase()),
            );
        }

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

    const downloadAsPdf = async () => {
        if (!appliedFilters) return;
        try {
            await downloadExpensePdf({ filtered, summary, appliedFilters, startDate, endDate, companyId });
            setIsDownloadModalOpen(false);
        } catch (err) {
            console.error(err);
            toast.error('Failed to generate PDF.');
        }
    };

    const downloadAsExcel = () => {
        if (!appliedFilters) return;
        try {
            downloadExpenseExcel({ filtered, summary, appliedFilters, startDate, endDate, companyId });
            setIsDownloadModalOpen(false);
            toast.success('Excel downloaded successfully!');
        } catch {
            toast.error('Failed to generate Excel.');
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteConfirm || !companyId) return;
        setIsDeleting(true);
        try {
            await deleteExpense(companyId, deleteConfirm);
        } finally {
            setIsDeleting(false);
            setDeleteConfirm(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen space-y-3 bg-muted p-2 pb-16 md:p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-28 w-full" />
                <div className="grid grid-cols-2 gap-2 md:gap-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="aurora min-h-screen bg-muted pb-16">
            <DownloadChoiceModal
                isOpen={isDownloadModalOpen}
                onClose={() => setIsDownloadModalOpen(false)}
                onDownloadPdf={downloadAsPdf}
                onDownloadExcel={downloadAsExcel}
            />
            <ExpenseModal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onSave={(data) => addExpense(companyId!, data)}
            />

            <ConfirmDialog
                open={!!deleteConfirm}
                onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
                title="Delete expense?"
                description="This permanently removes the expense entry and cannot be undone."
                confirmLabel="Delete"
                variant="destructive"
                loading={isDeleting}
                onConfirm={handleConfirmDelete}
            />

            {/* HEADER */}
            <header className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-border px-4 py-3">
                <BackButton />
                <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
                        <Receipt className="size-4" />
                    </span>
                </div>
                <div className="flex-1">
                    <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
                        Expense <span className="text-gradient">Report</span>
                    </h1>
                    <p className="text-xs text-muted-foreground">Track and manage business expenses</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSearch(true)} aria-label="Search expenses">
                    <Search className="size-4" />
                </Button>
            </header>

            <div className="mx-auto max-w-6xl space-y-4 px-4 pt-6 sm:px-6 lg:px-8">
                <ExpenseFilterBar
                    datePreset={datePreset}
                    onDatePresetChange={handleDatePreset}
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={handleStartDateChange}
                    onEndDateChange={handleEndDateChange}
                    onApply={handleApply}
                    showSearch={showSearch}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    onCloseSearch={() => setShowSearch(false)}
                />

                <ExpenseSummaryCards total={summary.total} count={summary.count} />

                {/* DETAILS */}
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs md:flex-row md:items-center md:justify-between">
                    <h2 className="w-full text-center text-lg font-semibold text-foreground md:w-auto md:text-left">
                        Report Details
                    </h2>
                    <div className="flex w-full flex-wrap justify-between gap-2 md:w-auto md:justify-end">
                        <Button variant="secondary" size="sm" onClick={() => setIsListVisible((v) => !v)} className="gap-1.5">
                            {isListVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            {isListVisible ? 'Hide List' : 'Show List'}
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                if (filtered.length === 0) toast.info('No data to download.');
                                else setIsDownloadModalOpen(true);
                            }}
                            className="gap-1.5 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90"
                        >
                            <Download className="size-4" />
                            Download Report
                        </Button>
                    </div>
                </div>

                {isListVisible && (
                    <ExpenseTable
                        expenses={filtered}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        onDeleteRequest={setDeleteConfirm}
                    />
                )}
            </div>
        </div>
    );
};

export default ExpenseReportPage;
