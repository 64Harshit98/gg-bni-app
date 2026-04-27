import { useState, useMemo } from 'react';
import type { Invoice } from '../../constants/models';

type JournalInvoice = Invoice & {
  type: 'Debit' | 'Credit';
  status: 'Paid' | 'Unpaid';
  dueAmount?: number;
};

export const useJournalFilters = (invoices: JournalInvoice[]) => {
  const [activeTab, setActiveTab] = useState<'Paid' | 'Unpaid'>('Paid');
  const [activeType, setActiveType] = useState<'Debit' | 'Credit'>('Credit');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysAgo = (date: Date, days: number) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);

    return invoices
      .filter((invoice) => {
        if (activeDateFilter === 'all') return true;
        const d = invoice.createdAt;
        switch (activeDateFilter) {
          case 'today':     return d >= today;
          case 'yesterday': return d >= daysAgo(today, 1) && d < today;
          case 'last7':     return d >= daysAgo(today, 7);
          case 'last15':    return d >= daysAgo(today, 15);
          case 'last30':    return d >= daysAgo(today, 30);
          case 'custom': {
            if (!customStartDate || !customEndDate) return false;
            const start = new Date(customStartDate); start.setHours(0, 0, 0, 0);
            const end   = new Date(customEndDate);   end.setHours(23, 59, 59, 999);
            return d >= start && d <= end;
          }
          default: return true;
        }
      })
      .filter((invoice) => {
        const trimmed = searchQuery.toLowerCase().trim();
        if (!trimmed) return true;
        return trimmed.split(/\s+/).every((token) => {
          const matchDetails =
            invoice.invoiceNumber.toLowerCase().includes(token) ||
            (invoice.partyName ?? '').toLowerCase().includes(token) ||
            (invoice.partyNumber && invoice.partyNumber.includes(token));
          const matchItems = invoice.items?.some((item) =>
            item.name.toLowerCase().includes(token)
          );
          return matchDetails || matchItems;
        });
      })
      .filter((invoice) => invoice.type === activeType && invoice.status === activeTab);
  }, [invoices, activeType, activeTab, searchQuery, activeDateFilter, customStartDate, customEndDate]);

  const selectedPeriodText = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', opts);
    switch (activeDateFilter) {
      case 'today':     return `Today, ${fmt(today)}`;
      case 'yesterday': return `Yesterday, ${fmt(new Date(today.setDate(today.getDate() - 1)))}`;
      case 'last7':     return `${fmt(new Date(today.setDate(today.getDate() - 6)))} - ${fmt(now)}`;
      case 'last15':    return `${fmt(new Date(today.setDate(today.getDate() - 14)))} - ${fmt(now)}`;
      case 'last30':    return `${fmt(new Date(today.setDate(today.getDate() - 29)))} - ${fmt(now)}`;
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${new Date(customStartDate).toLocaleDateString('en-IN', opts)} - ${new Date(customEndDate).toLocaleDateString('en-IN', opts)}`;
        }
        return 'Select Custom Range';
      default: return 'Selected Period';
    }
  }, [activeDateFilter, customStartDate, customEndDate]);

  const totalUnpaidAmount = useMemo(() => {
    if (activeTab !== 'Unpaid') return 0;
    return filteredInvoices.reduce((sum, inv) => sum + (inv.dueAmount || 0), 0);
  }, [filteredInvoices, activeTab]);

  return {
    activeTab, setActiveTab,
    activeType, setActiveType,
    searchQuery, setSearchQuery,
    activeDateFilter, setActiveDateFilter,
    customStartDate, setCustomStartDate,
    customEndDate, setCustomEndDate,
    filteredInvoices,
    selectedPeriodText,
    totalUnpaidAmount,
  };
};
