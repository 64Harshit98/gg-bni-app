/** Which POS surface an expense belongs to. */
export type ExpenseSource = 'pos' | 'catalogue';

export interface Expense {
  id: string;
  title: string;
  description: string;
  amount: number;
  /** Expense date, epoch ms. */
  date: number;
  /** Record creation time, epoch ms. */
  createdAt: number;
}

/** Fields required to create an expense. */
export type ExpenseInput = Omit<Expense, 'id' | 'createdAt'>;
