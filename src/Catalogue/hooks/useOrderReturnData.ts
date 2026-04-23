import { useState, useEffect } from 'react';
import { db } from '../../lib/Firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import type { Order, OrderItem } from '../Orders';

export interface UseOrderReturnDataResult {
  salesList: Order[];
  setSalesList: React.Dispatch<React.SetStateAction<Order[]>>;
  availableItems: OrderItem[];
  setAvailableItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  catalogueSettings: any;
  isLoading: boolean;
  error: string | null;
}

export function useOrderReturnData(): UseOrderReturnDataResult {
  const { currentUser } = useAuth();

  const [salesList, setSalesList] = useState<Order[]>([]);
  const [availableItems, setAvailableItems] = useState<OrderItem[]>([]);
  const [catalogueSettings, setCatalogueSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch orders
  useEffect(() => {
    if (!currentUser?.companyId) { setIsLoading(false); return; }

    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'companies', currentUser.companyId, 'Orders'))
        );
        setSalesList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      } catch (err) {
        console.error(err);
        setError('Failed to load orders');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [currentUser]);

  // Fetch catalogue settings
  useEffect(() => {
    if (!currentUser?.companyId) return;

    const fetchSettings = async () => {
      const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'catalogue-sales-settings');
      const snap = await getDoc(ref);
      if (snap.exists()) setCatalogueSettings(snap.data());
    };

    fetchSettings();
  }, [currentUser]);

  // Fetch inventory items
  useEffect(() => {
    if (!currentUser?.companyId) return;

    const fetchItems = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'companies', currentUser.companyId, 'items'))
        );
        setAvailableItems(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]);
      } catch (err) {
        console.error(err);
        setError('Failed to load items');
      }
    };

    fetchItems();
  }, [currentUser]);

  return { salesList, setSalesList, availableItems, setAvailableItems, catalogueSettings, isLoading, error };
}
