import { useState, useEffect, useMemo, useRef } from 'react';
import { SAMPLE_INVOICES } from '../journal.types';
import { useJournalData } from './useJournalData';

interface UseJournalListParams {
  companyId?: string;
  isTutorialActive: boolean;
}

// Owns Paid/Unpaid tab, Credit/Debit type, date filter, search, and
// expand/collapse state for the journal (transactions) list, and composes
// useJournalData internally.
export const useJournalList = ({ companyId, isTutorialActive }: UseJournalListParams) => {
  const [activeTab, setActiveTab] = useState<'Paid' | 'Unpaid'>('Paid');
  const [activeType, setActiveType] = useState<'Debit' | 'Credit'>('Credit');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const { invoices, loading: dataLoading, error } = useJournalData(companyId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredInvoices = useMemo(() => {
    // While the tutorial is active, always show the sample invoices,
    // regardless of date filter / search / tab state, so every tutorial
    // step has real-looking cards to point at.
    if (isTutorialActive) {
      return SAMPLE_INVOICES.filter(
        (invoice) => invoice.type === activeType && invoice.status === activeTab
      );
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return invoices
      .filter((invoice) => {
        if (activeDateFilter === 'all') return true;
        const invoiceDate = invoice.createdAt;
        const daysAgo = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);
        switch (activeDateFilter) {
          case 'today': return invoiceDate >= today;
          case 'yesterday': return invoiceDate >= daysAgo(today, 1) && invoiceDate < today;
          case 'last7': return invoiceDate >= daysAgo(today, 7);
          case 'last15': return invoiceDate >= daysAgo(today, 15);
          case 'last30': return invoiceDate >= daysAgo(today, 30);
          case 'custom':
            if (!customStartDate || !customEndDate) return false;
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            return invoiceDate >= start && invoiceDate <= end;
          default: return true;
        }
      })
      .filter((invoice) => {
        const trimmedQuery = searchQuery.toLowerCase().trim();
        if (!trimmedQuery) return true;
        const searchTokens = trimmedQuery.split(/\s+/);
        return searchTokens.every((token) => {
          const matchesDetails =
            invoice.invoiceNumber.toLowerCase().includes(token) ||
            invoice.partyName.toLowerCase().includes(token) ||
            (invoice.partyNumber && invoice.partyNumber.includes(token));
          const matchesItems = invoice.items?.some(item =>
            item.name.toLowerCase().includes(token)
          );
          return matchesDetails || matchesItems;
        });
      })
      .filter((invoice) => invoice.type === activeType && invoice.status === activeTab);
  }, [invoices, activeType, activeTab, searchQuery, activeDateFilter, customStartDate, customEndDate, isTutorialActive]);

  const selectedPeriodText = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const formatDate = (date: Date) => date.toLocaleDateString('en-IN', options);

    switch (activeDateFilter) {
      case 'today': return `Today, ${formatDate(today)}`;
      case 'yesterday': return `Yesterday, ${formatDate(new Date(today.setDate(today.getDate() - 1)))}`;
      case 'last7': return `${formatDate(new Date(today.setDate(today.getDate() - 6)))} - ${formatDate(now)}`;
      case 'last15': return `${formatDate(new Date(today.setDate(today.getDate() - 14)))} - ${formatDate(now)}`;
      case 'last30': return `${formatDate(new Date(today.setDate(today.getDate() - 29)))} - ${formatDate(now)}`;
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${new Date(customStartDate).toLocaleDateString('en-IN', options)} - ${new Date(customEndDate).toLocaleDateString('en-IN', options)}`;
        }
        return 'Select Custom Range';
      default: return 'Selected Period';
    }
  }, [activeDateFilter, customStartDate, customEndDate]);

  const dateFilters = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7' },
    { label: 'Last 15 Days', value: 'last15' },
    { label: 'Last 30 Days', value: 'last30' },
    { label: 'Custom Range', value: 'custom' },
  ];

  const handleDateFilterSelect = (value: string) => {
    setActiveDateFilter(value);
    setIsFilterOpen(false);
  };

  const handleInvoiceClick = (invoiceId: string) => {
    setExpandedInvoiceId(prevId => (prevId === invoiceId ? null : invoiceId));
  };

  return {
    invoices,
    dataLoading,
    error,

    activeTab,
    setActiveTab,
    activeType,
    setActiveType,
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    activeDateFilter,
    setActiveDateFilter,
    isFilterOpen,
    setIsFilterOpen,
    filterRef,

    expandedInvoiceId,
    setExpandedInvoiceId,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    showCustomPicker,
    setShowCustomPicker,

    filteredInvoices,
    selectedPeriodText,
    dateFilters,
    handleDateFilterSelect,
    handleInvoiceClick,
  };
};
