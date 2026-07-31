import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../Components/ui/dialog';
import { Button } from '../../../Components/ui/button';
import { Input } from '../../../Components/ui/input';
import { Badge } from '../../../Components/ui/badge';
import { Spinner } from '../../../Components/ui/spinner';
import { cn } from '../../../lib/utils';

export interface OpeningBalanceFormState {
  partyName: string;
  partyNumber: string;
  partyType: 'Customer' | 'Supplier';
  balanceType: 'due' | 'advance';
  amount: string;
  note: string;
}

interface OpeningBalanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: OpeningBalanceFormState;
  onFormChange: (updater: (form: OpeningBalanceFormState) => OpeningBalanceFormState) => void;
  onSave: () => void;
  saving: boolean;
}

export default function OpeningBalanceModal({
  open,
  onOpenChange,
  form,
  onFormChange,
  onSave,
  saving,
}: OpeningBalanceModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showClose={!saving}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Add Opening Balance</DialogTitle>
            <Badge variant={form.partyType === 'Customer' ? 'info' : 'secondary'}>{form.partyType}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Party Name *" value={form.partyName} readOnly className="flex-1 cursor-not-allowed bg-muted text-muted-foreground" />
            <Input placeholder="Phone" value={form.partyNumber} readOnly maxLength={10} className="w-28 cursor-not-allowed bg-muted text-muted-foreground" />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Balance Type</p>
            <div className="flex overflow-hidden rounded-lg border border-border text-sm">
              <button
                type="button"
                onClick={() => onFormChange((f) => ({ ...f, balanceType: 'due' }))}
                className={cn(
                  'flex-1 px-3 py-2 font-medium transition-colors',
                  form.balanceType === 'due' ? 'bg-destructive text-white' : 'bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                Due (They Owe You)
              </button>
              <button
                type="button"
                onClick={() => onFormChange((f) => ({ ...f, balanceType: 'advance' }))}
                className={cn(
                  'flex-1 border-l border-border px-3 py-2 font-medium transition-colors',
                  form.balanceType === 'advance' ? 'bg-success text-white' : 'bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                Debt (You Owe Them)
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {form.balanceType === 'due'
                ? 'Party owes you money — receivable/debit balance.'
                : 'You owe the party — payable/credit balance.'}
            </p>
          </div>

          <Input
            type="number"
            placeholder="Amount (₹) *"
            value={form.amount}
            onChange={(e) => onFormChange((f) => ({ ...f, amount: e.target.value }))}
          />
          <Input
            placeholder="Note (optional)"
            value={form.note}
            onChange={(e) => onFormChange((f) => ({ ...f, note: e.target.value }))}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 gap-1.5 bg-gradient-brand text-white hover:opacity-90"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? <Spinner size="sm" /> : null}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
