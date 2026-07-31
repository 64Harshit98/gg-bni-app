import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { expensesService } from '../../../services/expenses.service';
import { toast } from '../../../lib/toast';
import { expenseKeys } from '../expenses.keys';
import type { Expense, ExpenseInput, ExpenseSource } from '../expenses.types';

/**
 * Expenses data hook backed by TanStack Query.
 *
 * NOTE: the returned shape ({ expenses, loading, error, addExpense, deleteExpense })
 * is kept API-compatible with the previous hand-rolled hook so existing call
 * sites keep working during the incremental migration.
 */
export function useExpenses(
  companyId: string | undefined,
  source: ExpenseSource = 'pos',
) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: expenseKeys.list(companyId, source),
    queryFn: () => expensesService.list(companyId as string, source),
    enabled: Boolean(companyId),
  });

  const invalidate = useCallback(
    (cId: string | undefined) =>
      queryClient.invalidateQueries({
        queryKey: expenseKeys.list(cId, source),
      }),
    [queryClient, source],
  );

  const addMutation = useMutation({
    mutationFn: (vars: { companyId: string; data: ExpenseInput }) =>
      expensesService.add(vars.companyId, source, vars.data),
    onSuccess: (_id, vars) => {
      void invalidate(vars.companyId);
      toast.success('Expense added');
    },
    onError: () => toast.error('Failed to add expense'),
  });

  const deleteMutation = useMutation({
    mutationFn: (vars: { companyId: string; id: string }) =>
      expensesService.remove(vars.companyId, source, vars.id),
    onSuccess: (_r, vars) => {
      void invalidate(vars.companyId);
      toast.success('Expense deleted');
    },
    onError: () => toast.error('Failed to delete expense'),
  });

  // --- Legacy-compatible imperative API ---
  const addExpense = useCallback(
    async (cId: string, data: ExpenseInput): Promise<void> => {
      await addMutation.mutateAsync({ companyId: cId, data });
    },
    [addMutation],
  );

  const deleteExpense = useCallback(
    (cId: string, id: string) =>
      deleteMutation.mutateAsync({ companyId: cId, id }),
    [deleteMutation],
  );

  return {
    expenses: (listQuery.data ?? []) as Expense[],
    loading: listQuery.isLoading,
    error: listQuery.error ? (listQuery.error as Error).message : null,
    addExpense,
    deleteExpense,
    isAdding: addMutation.isPending,
    isDeleting: deleteMutation.isPending,
    refetch: listQuery.refetch,
  };
}
