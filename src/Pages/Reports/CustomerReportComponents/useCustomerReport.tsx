import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/auth-context';
import { useState, useEffect } from 'react';
import { State } from '../../../enums';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { type Sale } from './customerReport.utils';

export default function useCustomerReport() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [sales, setSales] = useState<Sale[]>([]);
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

    const salesRef = collection(
      db,
      'companies',
      currentUser.companyId,
      'sales',
    );

    const q = query(salesRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSales(
          snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              partyName: data.partyName || 'N/A',
              partyNumber: data.partyNumber || 'N/A',
              totalAmount: data.totalAmount || 0,
              dueAmount: data.dueAmount || 0,
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt.toDate()
                  : new Date(),
            };
          }),
        );
        setLoading(false);
      },
      () => {
        setError('Failed to fetch customer data.');
        setLoading(false);
      },
    );

    return unsubscribe;
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
