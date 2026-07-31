import { ChevronDown, Send, Users } from 'lucide-react';
import { Spinner } from '../../../Components/ui/spinner';
import { Badge } from '../../../Components/ui/badge';
import { EmptyState } from '../../../Components/ui/empty-state';
import { formatCurrency } from '../../../utils/formatters';
import { cn } from '../../../lib/utils';
import type { PartySummary } from './usePartyLedger';

interface PartyListViewProps {
  parties: PartySummary[];
  showList: boolean;
  onToggleShowList: () => void;
  onSelectParty: (party: PartySummary) => void;
  sendingReminderFor: string | null;
  onSendReminder: (party: PartySummary) => void;
}

const partyTypeBadgeVariant = (partyType: PartySummary['partyType']) => {
  if (partyType === 'Customer') return 'info' as const;
  if (partyType === 'Supplier') return 'secondary' as const;
  return 'warning' as const;
};

export default function PartyListView({
  parties,
  showList,
  onToggleShowList,
  onSelectParty,
  sendingReminderFor,
  onSendReminder,
}: PartyListViewProps) {
  if (parties.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No parties found"
        description="No parties matched the selected period or filters."
      />
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        onClick={onToggleShowList}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent"
      >
        <span>{showList ? 'Hide' : 'Show'} List ({parties.length} parties)</span>
        <ChevronDown className={cn('size-4 transition-transform duration-200', showList && 'rotate-180')} />
      </button>

      {showList && parties.map((party) => (
        <div
          key={party.partyName}
          onClick={() => onSelectParty(party)}
          className="cursor-pointer rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
        >
          <div className="mb-1.5 flex items-start justify-between">
            <Badge variant={partyTypeBadgeVariant(party.partyType)}>{party.partyType}</Badge>
            <p className="text-xs text-muted-foreground">Total: {formatCurrency(party.totalBilled)}</p>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-base font-semibold text-foreground">{party.partyName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {party.partyNumber || 'N/A'} <span className="mx-1 text-muted-foreground/50">•</span> {party.totalTransactions} Bills
              </p>
            </div>
            <div className="text-right">
              <p className={cn('text-lg font-bold', party.totalDue > 0 ? 'text-destructive' : 'text-success')}>
                {party.totalDue > 0 ? 'Due: ' : ''}{formatCurrency(party.totalDue)}
              </p>
            </div>
          </div>

          {party.totalDue > 0 && party.partyNumber && party.partyNumber !== 'N/A' && (
            <div className="mt-2 border-t border-border pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSendReminder(party);
                }}
                disabled={sendingReminderFor === party.partyNumber}
                className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-[11px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
              >
                {sendingReminderFor === party.partyNumber ? <Spinner size="sm" /> : <Send className="size-3" />}
                Remind
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
