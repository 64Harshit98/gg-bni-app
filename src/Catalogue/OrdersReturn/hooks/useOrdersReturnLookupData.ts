import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import type { Order, OrderItem } from '../../Orders';

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). Owns the three independent Firestore fetch effects
// that populate the screen on mount: the full Orders list (previously
// ~L101-128), the catalogue-sales-settings doc (previously ~L143-163), and
// the company's items list (previously ~L165-187).
//
// `salesList`/`availableItems`/`isLoading` are NOT owned here even though
// this hook is what first populates them — they are also written from
// elsewhere (salesList by useSaleSelection's refreshSelectedOrder,
// availableItems by useItemEditDrawer's handleSaveSuccess, isLoading by
// useReturnTransaction's saveReturnTransaction), so per the cross-hook
// convention they were lifted to OrdersReturn.tsx and threaded into every
// hook that touches them as setter params instead of being owned by any
// single hook.
// ─────────────────────────────────────────────────────────────────────────

interface UseOrdersReturnLookupDataParams {
  currentUser: any;
  setSalesList: React.Dispatch<React.SetStateAction<Order[]>>;
  setAvailableItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export const useOrdersReturnLookupData = ({
  currentUser,
  setSalesList,
  setAvailableItems,
  setIsLoading,
}: UseOrdersReturnLookupDataParams) => {
  const [catalogueSettings, setCatalogueSettings] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.companyId) {
      setIsLoading(false);
      return;
    }

    const fetchOrders = async () => {
      if (!currentUser?.companyId) return; // Safety check
      setIsLoading(true);
      try {
        const ordersQuery = query(
          collection(db, 'companies', currentUser.companyId, 'Orders')
        );

        const snap = await getDocs(ordersQuery);
        const completedOrders = snap.docs.map(
          d => ({ id: d.id, ...d.data() } as Order)
        );
        setSalesList(completedOrders);
      } catch (err) {
        console.error(err);
        setError('Failed to load orders');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.companyId) return;

    const fetchSettings = async () => {
      const ref = doc(
        db,
        "companies",
        currentUser.companyId,
        "settings",
        "catalogue-sales-settings"
      );

      const snap = await getDoc(ref);

      if (snap.exists()) {
        setCatalogueSettings(snap.data());
      }
    };

    fetchSettings();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.companyId) return;

    const fetchItems = async () => {
      try {
        const q = query(
          collection(db, 'companies', currentUser.companyId, 'items')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as any[];

        setAvailableItems(list);
      } catch (err) {
        console.error(err);
        setError('Failed to load items');
      }
    };

    fetchItems();
  }, [currentUser]);

  return { catalogueSettings, error, setError };
};
