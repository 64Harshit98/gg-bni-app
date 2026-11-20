import { useState, useEffect } from 'react';
import {
  collection, addDoc, deleteDoc, doc, updateDoc,
  onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { clearExpenseRangeCache } from './expenseRangeCache';

export interface Expense {
  id: string;
  title: string;
  description: string;
  amount: number;
  date: number;
  createdAt: number;
  addedBy: string;
  category?: string;
  paidFrom?: string;
}

export type ExpenseSource = 'pos' | 'catalogue';
export type ExpenseInput = Omit<Expense, 'id' | 'createdAt'>;

const collectionFor = (source: ExpenseSource) =>
  source === 'catalogue' ? 'catalogue_expenses' : 'expenses';

// Writes without a listener — every write clears the report range cache.
export const addExpenseDoc = async (companyId: string, source: ExpenseSource, data: ExpenseInput) => {
  await addDoc(collection(db, 'companies', companyId, collectionFor(source)), {
    ...data,
    createdAt: Date.now(),
  });
  clearExpenseRangeCache(companyId, source);
};

export const updateExpenseDoc = async (
  companyId: string,
  source: ExpenseSource,
  id: string,
  data: Partial<ExpenseInput>,
) => {
  await updateDoc(doc(db, 'companies', companyId, collectionFor(source), id), data);
  clearExpenseRangeCache(companyId, source);
};

export const deleteExpenseDoc = async (companyId: string, source: ExpenseSource, id: string) => {
  await deleteDoc(doc(db, 'companies', companyId, collectionFor(source), id));
  clearExpenseRangeCache(companyId, source);
};

export function useExpenses(companyId: string | undefined, source: ExpenseSource = 'pos') {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const q = query(
      collection(db, 'companies', companyId, collectionFor(source)),
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

  const addExpense = (companyId: string, data: ExpenseInput) =>
    addExpenseDoc(companyId, source, data);

  const deleteExpense = (companyId: string, id: string) =>
    deleteExpenseDoc(companyId, source, id);

  return { expenses, loading, error, addExpense, deleteExpense };
}
