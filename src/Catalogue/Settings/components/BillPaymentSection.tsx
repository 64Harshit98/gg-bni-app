import { Wallet } from 'lucide-react';
import { Input } from '../../../Components/ui/input';
import { Label } from '../../../Components/ui/label';
import { SettingsCard } from './SettingsCard';

interface BillPaymentSectionProps {
  upiId: string;
  onUpiIdChange: (value: string) => void;
}

/** UPI ID shown on invoices for quick payments. */
export function BillPaymentSection({ upiId, onUpiIdChange }: BillPaymentSectionProps) {
  return (
    <SettingsCard title="Payment" icon={<Wallet className="size-4" />}>
      <p className="-mt-2 text-xs text-muted-foreground">UPI ID displayed on invoices for quick payments.</p>
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="upiId">UPI ID</Label>
        <Input
          id="upiId"
          name="upiId"
          value={upiId}
          onChange={(e) => onUpiIdChange(e.target.value)}
          placeholder="e.g. yourname@upi"
        />
      </div>
    </SettingsCard>
  );
}
