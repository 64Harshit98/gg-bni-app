import { useState, useEffect } from 'react';
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';

export interface Expense {
  id: string;
  title: string;
  description: string;
  amount: number;
  date: number;
  createdAt: number;
}

export function useExpenses(companyId: string | undefined, source: 'pos' | 'catalogue' = 'pos') {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const collectionName = source === 'catalogue' ? 'catalogue_expenses' : 'expenses';
    const q = query(
      collection(db, 'companies', companyId, collectionName),
      orderBy('date', 'desc'),
      limit(300),
    );
    const unsub = onSnapshot(q,
      (snap) => {
        setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); },
    );
    return unsub;
  }, [companyId, source]);

  const addExpense = async (
    companyId: string,
    data: Omit<Expense, 'id' | 'createdAt'>,
  ) => {
    const collectionName = source === 'catalogue' ? 'catalogue_expenses' : 'expenses';
    await addDoc(collection(db, 'companies', companyId, collectionName), {
      ...data,
      createdAt: Date.now(),
    });
  };

  const deleteExpense = async (companyId: string, id: string) => {
    const collectionName = source === 'catalogue' ? 'catalogue_expenses' : 'expenses';
    await deleteDoc(doc(db, 'companies', companyId, collectionName, id));
  };
  return { expenses, loading, error, addExpense, deleteExpense };
}