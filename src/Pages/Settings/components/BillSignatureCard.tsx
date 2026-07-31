import * as React from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { PenTool, Eraser } from 'lucide-react';
import { Button } from '../../../Components/ui/button';
import { SettingsSectionCard } from './SettingsSectionCard';

interface BillSignatureCardProps {
  sigPadRef: React.RefObject<SignatureCanvas | null>;
  onClear: () => void;
}

/** Digital signature pad, printed on invoices. */
export const BillSignatureCard: React.FC<BillSignatureCardProps> = ({ sigPadRef, onClear }) => (
  <SettingsSectionCard
    icon={<PenTool className="size-4" />}
    title="Digital Signature"
    description="Sign here to display on invoices"
    action={
      <Button type="button" variant="outline" size="sm" onClick={onClear} className="gap-1.5 text-destructive hover:text-destructive">
        <Eraser className="size-3.5" />
        Clear Signature
      </Button>
    }
  >
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
      <div className="pointer-events-none absolute select-none text-4xl font-bold text-muted-foreground opacity-20">
        SIGN HERE
      </div>
    </div>
  </SettingsSectionCard>
);
