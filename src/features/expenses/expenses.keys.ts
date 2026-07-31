import type { ExpenseSource } from './expenses.types';

export const expenseKeys = {
  all: ['expenses'] as const,
  list: (companyId: string | undefined, source: ExpenseSource) =>
    [...expenseKeys.all, companyId ?? 'anonymous', source] as const,
};
