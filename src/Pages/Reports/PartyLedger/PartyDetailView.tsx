import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '../../../Components/ui/button';
import { Badge } from '../../../Components/ui/badge';
import BackButton from '../../../Components/BackButton';
import { formatCurrency } from '../../../utils/formatters';
import { cn } from '../../../lib/utils';
import type { LedgerTransaction, PartySummary, PaymentRecord } from './usePartyLedger';

type LedgerTransactionWithBalance = LedgerTransaction & { balanceType?: 'due' | 'advance' };

interface PartyDetailViewProps {
  selectedPartyName: string;
  selectedPartyLedger?: PartySummary | null;
  expandedBillId: string | null;
  onToggleBillExpansion: (id: string) => void;
  onBack: () => void;
  onOpenOpeningBalance: () => void;
  onSettlePaymentClick: (txn: LedgerTransaction) => void;
}

const formatBillDate = (date: Date): string =>
  date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });

export default function PartyDetailView({
  selectedPartyName,
  selectedPartyLedger,
  expandedBillId,
  onToggleBillExpansion,
  onBack,
  onOpenOpeningBalance,
  onSettlePaymentClick,
}: PartyDetailViewProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* UNIFIED STICKY HEADER: Title + Summary Card */}
      <div className="sticky top-0 z-30 -mx-2 bg-muted px-2 pt-2 pb-3">
        <div className="mb-2 flex items-center justify-between pb-2">
          <BackButton onClick={onBack} />
          <h1 className="flex-1 truncate px-2 text-center text-lg font-bold text-foreground">
            {selectedPartyName} - Ledger
          </h1>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-info/10 px-4 py-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ledger Summary</span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {selectedPartyLedger?.transactions.length ?? 0} Bills
              </span>
              <Button
                type="button"
                size="sm"
                onClick={onOpenOpeningBalance}
                className="h-6 gap-1 rounded-full bg-primary px-2 text-[10px] font-bold text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-3" />
                Opening Balance
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex flex-1 flex-col">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Billed</span>
              <span className="truncate text-lg font-extrabold text-foreground sm:text-xl">
                {formatCurrency(selectedPartyLedger?.totalBilled ?? 0)}
              </span>
            </div>
            <div className="mx-3 h-10 w-px bg-border" />
            <div className="flex flex-1 flex-col text-right">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Pending</span>
              <span
                className={cn(
                  'truncate text-lg font-extrabold sm:text-xl',
                  selectedPartyLedger && selectedPartyLedger.totalDue > 0 ? 'text-destructive' : 'text-success',
                )}
              >
                {formatCurrency(selectedPartyLedger?.totalDue ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bill Cards */}
      <div className="space-y-3 px-1">
        {selectedPartyLedger?.transactions.map((txnBase) => {
          const txn = txnBase as LedgerTransactionWithBalance;
          const isExpanded = expandedBillId === txn.id;
          const isAdvanceOB = txn.isOpeningBalance && txn.balanceType === 'advance';

          return (
            <div
              key={txn.id}
              onClick={() => onToggleBillExpansion(txn.id)}
              className="cursor-pointer rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="mb-1 flex flex-wrap justify-start gap-1">
                {txn.isOpeningBalance ? (
                  <Badge variant={txn.balanceType === 'advance' ? 'success' : 'warning'}>
                    {txn.balanceType === 'advance' ? 'Advance' : 'Opening Balance'}
                  </Badge>
                ) : (
                  <Badge variant={txn.type === 'sale' ? 'info' : 'secondary'}>{txn.type}</Badge>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="flex-1">
                  {txn.isOpeningBalance ? (
                    <>
                      <p className="text-base font-semibold text-foreground">Opening Due</p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatBillDate(new Date(txn.createdAt))}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-foreground">{txn.invoiceNumber || txn.id.slice(0, 8)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatBillDate(new Date(txn.createdAt))}</p>
                    </>
                  )}
                </div>

                <div className="flex shrink-0 items-center justify-center px-2 sm:px-4">
                  {isAdvanceOB ? (
                    <Badge variant="success">Advance Held</Badge>
                  ) : txn.dueAmount <= 0 ? (
                    <Badge variant="success">Settled</Badge>
                  ) : (
                    <Badge variant="destructive">Due</Badge>
                  )}
                </div>

                <div className="flex flex-1 items-center justify-end space-x-3">
                  <div className="text-right">
                    {txn.dueAmount > 0 ? (
                      <>
                        <p className="text-lg font-bold text-destructive">{formatCurrency(txn.dueAmount)}</p>
                        <p className="text-xs text-muted-foreground">Total: {formatCurrency(txn.totalAmount)}</p>
                      </>
                    ) : (
                      <p className="text-lg font-bold text-foreground">{formatCurrency(txn.totalAmount)}</p>
                    )}
                  </div>
                  <ChevronDown
                    className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200', isExpanded && 'rotate-180')}
                  />
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3">
                  {txn.isOpeningBalance && txn.note && (
                    <p className="mb-2 px-1 text-xs italic text-muted-foreground">Note: {txn.note}</p>
                  )}
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-card px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Payment History
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1">
                    {txn.paymentHistory && txn.paymentHistory.length > 0 ? (
                      txn.paymentHistory.map((payment: PaymentRecord, index: number) => (
                        <div key={index} className="flex items-center justify-between border-b border-border py-2 text-foreground last:border-0">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-muted-foreground">
                                {new Date(payment.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(payment.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </span>
                            </div>
                            <Badge variant="info">
                              {payment.method === 'upi' ? 'UPI' : payment.method.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-success">
                              + {formatCurrency(payment.amount)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="py-3 text-center text-xs text-muted-foreground">No payment records found.</p>
                    )}
                  </div>

                  {txn.dueAmount > 0 && !isAdvanceOB && (
                    <div className="mt-3 border-t border-border pt-3">
                      <Button
                        type="button"
                        className="w-full bg-gradient-brand text-white hover:opacity-90"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSettlePaymentClick(txn);
                        }}
                      >
                        Settle Payment
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
