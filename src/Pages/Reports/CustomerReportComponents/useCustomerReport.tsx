import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/auth-context';
import { useState, useEffect } from 'react';
import { State } from '../../../enums';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import { collection, onSnapshot, query, Timestamp, limit } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { type Sale } from './customerReport.utils';

export default function useCustomerReport() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState('last30');
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const formattedStart = formatDateForInput(thirtyDaysAgo);
    const formattedEnd = formatDateForInput(today);

    const start = new Date(formattedStart);
    start.setHours(0, 0, 0, 0);

    const end = new Date(formattedEnd);
    end.setHours(23, 59, 59, 999);

    setStartDate(formattedStart);
    setEndDate(formattedEnd);
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

    const salesRef = collection(db, 'companies', currentUser.companyId, 'sales');
    const obRef = collection(db, 'companies', currentUser.companyId, 'openingBalances');

    // Safety caps — this report filters client-side by the selected date range,
    // so without a limit a company with years of sales would re-download the
    // entire collection on every live update.
    const q = query(salesRef, limit(5000));
    const obQ = query(obRef, limit(5000));

    const unsubscribeSales = onSnapshot(
      q,
      (snapshot) => {
        setSales(prev => {
          // Keep existing OB entries, replace sales entries
          const obEntries = prev.filter((s: any) => s.isOpeningBalance === true);
          const salesEntries = snapshot.docs.map((doc) => {
            const data = doc.data();
            const paymentMethods = (data.paymentMethods || {}) as Record<string, unknown>;

            const sumMethodAmounts = (matcher: (key: string) => boolean) =>
              Object.entries(paymentMethods).reduce((sum, [key, value]) => {
                if (!matcher(key)) return sum;
                const num = Number(value || 0);
                return sum + (Number.isFinite(num) ? num : 0);
              }, 0);

            const dueFromMethods = sumMethodAmounts((key) =>
              key.toLowerCase().includes('due'),
            );
            const creditFromMethods = sumMethodAmounts(
              (key) => key.toLowerCase() === 'credit note',
            );

            const dueAmount = Number(data.paymentMethods?.due ?? data.dueAmount ?? dueFromMethods ?? 0);
            const creditNoteAmount = Number(data.creditNoteAmount ?? creditFromMethods ?? 0);

            return {
              id: doc.id,
              partyName: data.partyName || 'N/A',
              partyNumber: data.partyNumber || 'N/A',
              totalAmount: Number(data.totalAmount || 0),
              dueAmount: Number.isFinite(dueAmount) ? dueAmount : 0,
              creditNoteAmount: Number.isFinite(creditNoteAmount) ? creditNoteAmount : 0,
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt.toDate()
                  : new Date(),
              isOpeningBalance: false,
            };
          });
          return [...salesEntries, ...obEntries];
        });
        setLoading(false);
      },
      () => {
        setError('Failed to fetch customer data.');
        setLoading(false);
      },
    );

    const unsubscribeOB = onSnapshot(
      obQ,
      (snapshot) => {
        setSales(prev => {
          // Keep existing sales entries, replace OB entries
          const salesEntries = prev.filter((s: any) => s.isOpeningBalance !== true);
          const obEntries = snapshot.docs
            .filter(doc => {
              const data = doc.data();
              // ✅ Sirf 'due' type OB include karo, 'advance' nahi
              return (data.balanceType ?? 'due') === 'due';
            })
            .map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                partyName: data.partyName || 'N/A',
                partyNumber: data.partyNumber || 'N/A',
                totalAmount: Number(data.amount || 0),
                dueAmount: Number(data.dueAmount ?? data.amount ?? 0),
                creditNoteAmount: 0,
                createdAt:
                  data.createdAt instanceof Timestamp
                    ? data.createdAt.toDate()
                    : new Date(),
                isOpeningBalance: true,
              };
            });
          return [...salesEntries, ...obEntries];
        });
      },
      () => {} // OB fetch fail hone pe silently ignore
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
