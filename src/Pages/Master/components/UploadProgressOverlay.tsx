import * as React from 'react';
import { Loader2 } from 'lucide-react';

interface UploadProgressOverlayProps {
  current: number;
  total: number;
}

/** Full-screen blocking progress indicator shown while a bulk import runs. */
export const UploadProgressOverlay: React.FC<UploadProgressOverlayProps> = ({ current, total }) => {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-80 rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
        <Loader2 className="mx-auto mb-3 size-6 animate-spin text-primary" />
        <h3 className="mb-4 text-lg font-bold text-foreground">Uploading Items...</h3>
        <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="bg-gradient-brand h-2.5 rounded-full transition-all duration-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          {current} / {total} processed
        </p>
      </div>
    </div>
  );
};
