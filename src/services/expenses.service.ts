import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';

import { db } from '../lib/Firebase';
import type {
  Expense,
  ExpenseInput,
  ExpenseSource,
} from '../features/expenses/expenses.types';

const collectionFor = (source: ExpenseSource): string =>
  source === 'catalogue' ? 'catalogue_expenses' : 'expenses';

const path = (companyId: string, source: ExpenseSource) =>
  collection(db, 'companies', companyId, collectionFor(source));

export const expensesService = {
  /** Fetch all expenses for a company/source, newest first. */
  async list(companyId: string, source: ExpenseSource): Promise<Expense[]> {
    const snap = await getDocs(query(path(companyId, source), orderBy('date', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense);
  },

  /** Create an expense; returns the new document id. */
  async add(
    companyId: string,
    source: ExpenseSource,
    data: ExpenseInput,
  ): Promise<string> {
    const ref = await addDoc(path(companyId, source), {
      ...data,
      createdAt: Date.now(),
    });
    return ref.id;
  },

  /** Permanently delete an expense. */
  async remove(
    companyId: string,
    source: ExpenseSource,
    id: string,
  ): Promise<void> {
    await deleteDoc(doc(db, 'companies', companyId, collectionFor(source), id));
  },
};
