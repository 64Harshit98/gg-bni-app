import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../Components/ui/dialog';
import { Button } from '../../../Components/ui/button';
import { Input } from '../../../Components/ui/input';

export interface SalesGstNumberDialogProps {
  open: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

/** Prompts for the company's GSTIN the first time a taxed GST scheme is selected. */
export function SalesGstNumberDialog({ open, value, onValueChange, onCancel, onSave }: SalesGstNumberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Enter GST Number</DialogTitle>
          <DialogDescription>
            GST number is required to enable this tax scheme. This will be saved to your business profile.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value.toUpperCase().slice(0, 15))}
          placeholder="e.g., 22AAAAA0000A1Z5"
          maxLength={15}
          autoFocus
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            Save &amp; Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
