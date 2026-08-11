import { useNavigate } from 'react-router';
import { useAuth } from '../../context/auth-context';
import { useState, useEffect } from 'react';
import { State } from '../../enums';
import { formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { type Sale } from '../../Pages/Reports/CustomerReportComponents/customerReport.utils';

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

    const ordersRef = collection(db, 'companies', currentUser.companyId, 'Orders');
    const obRef = collection(db, 'companies', currentUser.companyId, 'openingBalances');

    const q = query(ordersRef, where('status', '!=', 'Upcoming'));
    const obQ = query(obRef);

    const unsubscribeSales = onSnapshot(
      q,
      (snapshot) => {
        setSales(prev => {
          const obEntries = prev.filter((s: any) => s.isOpeningBalance === true);
          const salesEntries = snapshot.docs.map((doc) => {
            const data = doc.data();
            const total = Number(data.totalAmount || 0);
            const paid = Number(data.paidAmount || 0);
            return {
              id: doc.id,
              partyName:
                data.userName ||
                data.billingDetails?.name ||
                data.shippingDetails?.name ||
                'N/A',
              partyNumber: (
                data.userLoginPhone ||
                data.billingDetails?.phone ||
                data.shippingDetails?.phone ||
                'N/A'
              ).toString(),
              totalAmount: total,
              dueAmount: Math.max(0, total - paid),
              creditNoteAmount: 0,
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
      const salesEntries = prev.filter((s: any) => s.isOpeningBalance !== true);
      const obEntries = snapshot.docs
        .filter(doc => {
          const data = doc.data();
          return (data.balanceType ?? 'due') === 'due' 
            && data.partyType === 'Customer'
            && data.source === 'catalogue';  // ← ADD THIS
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
      () => { }
    );

    return () => {
      unsubscribeSales();
      unsubscribeOB();
    };
  }, [currentUser?.companyId]);

  return {
    navigate,
    sales,
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
