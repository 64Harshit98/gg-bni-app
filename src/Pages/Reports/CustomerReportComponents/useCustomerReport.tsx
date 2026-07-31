import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/auth-context';
import { useState, useEffect } from 'react';
import { State } from '../../../enums';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import {
  subscribeToCustomerOpeningBalances,
  subscribeToCustomerSales,
  type SaleWithOrigin,
} from '../../../services/reports/customerReport.service';

export default function useCustomerReport() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [sales, setSales] = useState<SaleWithOrigin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ start: '', end: '' });

  const [isListVisible, setIsListVisible] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });
  const [sortConfig, setSortConfig] = useState<{
    key: string; // Changed from keyof Sale to string
    direction: 'asc' | 'desc';
  }>({ key: 'partyName', direction: 'asc' });

  // Update handleSort to accept a string key
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  useEffect(() => {
    const today = new Date();
    const formatted = formatDateForInput(today);

    const start = new Date(formatted);
    start.setHours(0, 0, 0, 0);

    const end = new Date(formatted);
    end.setHours(23, 59, 59, 999);

    setStartDate(formatted);
    setEndDate(formatted);
    setAppliedFilters({
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }, []);

  useEffect(() => {
    if (!currentUser?.companyId) {
      setLoading(false);
      return;
    }

    const unsubscribeSales = subscribeToCustomerSales(
      currentUser.companyId,
      (salesEntries) => {
        setSales((prev) => {
          // Keep existing OB entries, replace sales entries
          const obEntries = prev.filter((s) => s.isOpeningBalance === true);
          return [...salesEntries, ...obEntries];
        });
        setLoading(false);
      },
      () => {
        setError('Failed to fetch customer data.');
        setLoading(false);
      },
    );

    const unsubscribeOB = subscribeToCustomerOpeningBalances(
      currentUser.companyId,
      (obEntries) => {
        setSales((prev) => {
          // Keep existing sales entries, replace OB entries
          const salesEntries = prev.filter((s) => s.isOpeningBalance !== true);
          return [...salesEntries, ...obEntries];
        });
      },
      () => {}, // OB fetch fail hone pe silently ignore
    );

    return () => {
      unsubscribeSales();
      unsubscribeOB();
    };
  }, [currentUser?.companyId]);
  return {
    navigate,
    sales,
    sortConfig,
    handleSort,
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
    isDownloadModalOpen,
    setIsDownloadModalOpen,
    feedbackModal,
    setFeedbackModal,
    currentUser,
    setStartDate,
    setEndDate,
  };
}
