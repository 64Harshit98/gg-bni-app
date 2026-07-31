import React from 'react';

import { Button } from '../../../Components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../Components/ui/dialog';
import { Input } from '../../../Components/ui/input';
import { Label } from '../../../Components/ui/label';
import { Spinner } from '../../../Components/ui/spinner';
import { cn } from '../../../lib/utils';

interface GstNumberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  saving?: boolean;
}

/** Prompts for the company's GSTIN before enabling a Regular/Composition GST scheme. */
export const GstNumberDialog: React.FC<GstNumberDialogProps> = ({
  open,
  onOpenChange,
  value,
  onValueChange,
  onConfirm,
  saving = false,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-sm" showClose={!saving}>
      <DialogHeader>
        <DialogTitle>Enter GST Number</DialogTitle>
        <DialogDescription>
          GST number is required to enable this tax scheme. This will be saved to your business profile.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="gst-number-input">GSTIN</Label>
        <Input
          id="gst-number-input"
          autoFocus
          value={value}
          onChange={(e) => onValueChange(e.target.value.toUpperCase().slice(0, 15))}
          placeholder="e.g., 22AAAAA0000A1Z5"
          maxLength={15}
        />
        <p className={cn('text-xs', value.length === 15 ? 'text-success' : 'text-muted-foreground')}>
          {value.length}/15 characters
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          className="gap-1.5 bg-gradient-brand text-white hover:opacity-90"
          disabled={saving}
          onClick={onConfirm}
        >
          {saving ? <Spinner size="sm" /> : null}
          Save & Continue
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
