import { useNavigate } from 'react-router';
import { useAuth } from '../../context/auth-context';
import { useState, useEffect } from 'react';
import { State } from '../../enums';
import { formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { type Sale } from '../../Pages/Reports/CustomerReportComponents/customerReport.utils';

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
  const [customers, setCustomers] = useState<any[]>([]);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

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
    if (!currentUser?.companyId) return;

    const ref = collection(
      db,
      'companies',
      currentUser.companyId,
      'customers'
    );

    const unsubscribe = onSnapshot(ref, (snap) => {
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setCustomers(list);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.companyId) {
      setLoading(false);
      return;
    }

    const salesRef = collection(
      db,
      'companies',
      currentUser.companyId,
      'Orders',
    );

    const q = query(salesRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSales(
          snapshot.docs
            .map((doc) => {
              const data = doc.data();
              const totalAmount = Number(data.totalAmount || 0);
              const paidAmount = Number(data.paidAmount || 0);
              const isValidOrder = data.status !== 'Upcoming';
              const creditNote = Number(data.creditNoteGenerated || 0);

              return {
                id: doc.id,
                partyName: data.billingDetails?.name || data.userName || 'N/A',
                partyNumber: data.userLoginPhone
                  ? String(data.userLoginPhone)
                  : 'N/A',
                totalAmount,
                paidAmount,
                creditNoteGenerated: creditNote, 
                dueAmount: totalAmount - paidAmount,
                createdAt:
                  data.createdAt instanceof Timestamp
                    ? data.createdAt.toDate()
                    : new Date(),
                isValidOrder,
                returnHistory: data.returnHistory || [],
                paymentMethods: data.paymentMethods || {},
              };
            })
            .filter((s) => s.isValidOrder)
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
    customers,
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
