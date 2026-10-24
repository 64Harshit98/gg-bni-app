import { type QueryDocumentSnapshot } from 'firebase/firestore';
import { createRangeCache } from '../reportRangeCache';

// Expenses for the expense and P&L reports, cached per date range — see
// reportRangeCache.ts. Expense docs store `date` as epoch ms (not a Timestamp).

export interface ExpenseRecord {
  id: string;
  title: string;
  description: string;
  amount: number;
  date: number;
  addedBy: string;
  category: string;
  paidFrom: string;
}

const mapExpense = (snap: QueryDocumentSnapshot): ExpenseRecord => {
  const data = snap.data();
  return {
    id: snap.id,
    title: data.title || '',
    description: data.description || '',
    amount: Number(data.amount) || 0,
    date: Number(data.date) || 0,
    addedBy: data.addedBy || '',
    category: data.category || '',
    paidFrom: data.paidFrom || '',
  };
};

const makeExpenseCache = (collectionName: string) =>
  createRangeCache<ExpenseRecord>({
    name: `${collectionName}RangeCache`,
    collectionName,
    mapDoc: mapExpense,
    dateField: 'date',
    toQueryValue: (ms) => ms,
    timeOf: (e) => e.date,
  });

const posExpenseCache = makeExpenseCache('expenses');
const catalogueExpenseCache = makeExpenseCache('catalogue_expenses');

export const loadPosExpensesForRange = posExpenseCache.load;
export const loadCatalogueExpensesForRange = catalogueExpenseCache.load;

export const clearExpenseRangeCache = (
  companyId: string | null | undefined,
  source: 'pos' | 'catalogue',
) => (source === 'catalogue' ? catalogueExpenseCache : posExpenseCache).clear(companyId);

/* ---------- CATEGORIES / PAID FROM ---------- */

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salary',
  'Electricity & bills',
  'Tea & snacks',
  'Transport',
  'Repairs',
  'Supplies',
  'Marketing',
  'Other',
];

export const EXPENSE_PAID_FROM = ['Cash', 'UPI', 'Card', 'Bank'];

export const UNCATEGORISED = 'Uncategorised';

export const categoryOf = (e: { category?: string }) => e.category?.trim() || UNCATEGORISED;

const COLORS = {
  red: { badge: 'bg-red-50 text-red-700', bar: 'bg-red-600' },
  blue: { badge: 'bg-blue-50 text-blue-700', bar: 'bg-blue-600' },
  amber: { badge: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  green: { badge: 'bg-green-50 text-green-700', bar: 'bg-green-600' },
  violet: { badge: 'bg-violet-50 text-violet-700', bar: 'bg-violet-600' },
  cyan: { badge: 'bg-cyan-50 text-cyan-700', bar: 'bg-cyan-600' },
  pink: { badge: 'bg-pink-50 text-pink-700', bar: 'bg-pink-600' },
  orange: { badge: 'bg-orange-50 text-orange-700', bar: 'bg-orange-600' },
  slate: { badge: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
};

const CATEGORY_COLOR: Record<string, keyof typeof COLORS> = {
  Rent: 'blue',
  Salary: 'violet',
  'Electricity & bills': 'amber',
  'Tea & snacks': 'red',
  Transport: 'cyan',
  Repairs: 'orange',
  Supplies: 'green',
  Marketing: 'pink',
  Other: 'slate',
  [UNCATEGORISED]: 'slate',
};

export const categoryColor = (category: string) => COLORS[CATEGORY_COLOR[category] ?? 'slate'];
