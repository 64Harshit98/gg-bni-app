import type { RefObject } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { PenLine } from 'lucide-react';
import { Button } from '../../../Components/ui/button';
import { SettingsCard } from './SettingsCard';

interface BillSignatureSectionProps {
  sigPadRef: RefObject<SignatureCanvas | null>;
  onClear: () => void;
}

/** Digital signature captured for display on printed invoices. */
export function BillSignatureSection({ sigPadRef, onClear }: BillSignatureSectionProps) {
  return (
    <SettingsCard
      title="Digital Signature"
      icon={<PenLine className="size-4" />}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          className="text-destructive hover:text-destructive"
        >
          Clear Signature
        </Button>
      }
    >
      <p className="-mt-2 text-xs text-muted-foreground">Sign here to display on invoices.</p>
      <div className="relative flex items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted">
        <SignatureCanvas
          ref={sigPadRef}
          penColor="black"
          canvasProps={{
            className: 'signature-canvas',
            style: { width: '100%', height: '200px' },
          }}
          backgroundColor="rgba(255,255,255,0)"
        />
        <div className="pointer-events-none absolute text-4xl font-bold text-muted-foreground opacity-20 select-none">
          SIGN HERE
        </div>
      </div>
    </SettingsCard>
  );
}
