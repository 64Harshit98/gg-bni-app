import * as React from 'react';
import { Check, Download, FileSpreadsheet, Image, Sparkles, Upload } from 'lucide-react';
import { Button } from '../../../Components/ui/button';
import { Badge } from '../../../Components/ui/badge';
import { Spinner } from '../../../constants/Spinner';

interface BulkImportCardProps {
  /** `panel` = roomy desktop sidebar card. `compact` = condensed mobile card. */
  variant: 'panel' | 'compact';
  isUploading: boolean;
  onUploadClick: () => void;
  onDownloadSample: () => void;
}

const GUIDE_STEPS = [
  'Download the sample template',
  'Fill in your product rows',
  'Upload it back here',
];

const CAPABILITIES = [
  { icon: Check, label: '.xlsx / .xls / .csv' },
  { icon: Image, label: 'Embedded images' },
  { icon: Sparkles, label: 'Auto-created categories' },
];

/**
 * Bulk-import entry point (upload Excel/CSV + download the sample template).
 * Rendered twice — once as a compact mobile card, once as the desktop sidebar
 * panel — both driving the same file input, which lives once in the parent.
 */
export const BulkImportCard: React.FC<BulkImportCardProps> = ({
  variant,
  isUploading,
  onUploadClick,
  onDownloadSample,
}) => {
  if (variant === 'compact') {
    return (
      <div className="mb-4 mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:hidden">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Bulk Import</h2>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {CAPABILITIES.map((cap) => (
              <Badge key={cap.label} variant="outline" className="gap-1 text-[10px] font-medium">
                <cap.icon className="size-2.5" />
                {cap.label}
              </Badge>
            ))}
          </div>
          <Button
            type="button"
            onClick={onUploadClick}
            disabled={isUploading}
            className="w-full max-w-xs rounded-xl active:scale-[0.98]"
          >
            {isUploading ? <Spinner /> : <><Upload className="size-4" /> Import from Excel</>}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDownloadSample}
            disabled={isUploading}
            className="w-full max-w-xs rounded-xl active:scale-[0.98]"
          >
            <Download className="size-4" /> Download Sample
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.07] to-transparent p-5 transition-shadow duration-200 hover:shadow-md">
      <div className="mb-4 flex items-center gap-3">
        <div className="bg-gradient-brand flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm shadow-primary/20">
          <FileSpreadsheet className="size-[18px] text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold leading-tight text-foreground">Bulk Import</h2>
          <p className="text-xs text-muted-foreground">Add your whole catalogue at once</p>
        </div>
      </div>

      {/* Mini step-by-step guide — fills the panel with something useful
          instead of dead whitespace, and doubles as a quick how-it-works. */}
      <ol className="mb-4 space-y-2.5 rounded-xl border border-border/60 bg-card/60 p-3.5">
        {GUIDE_STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-2.5 text-xs text-foreground/80">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {CAPABILITIES.map((cap) => (
          <Badge key={cap.label} variant="outline" className="gap-1 text-[10px] font-medium text-muted-foreground">
            <cap.icon className="size-2.5" />
            {cap.label}
          </Badge>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onUploadClick}
          disabled={isUploading}
          className="w-full rounded-xl active:scale-[0.98]"
        >
          {isUploading ? <Spinner /> : <><Upload className="size-4" /> Upload Excel File</>}
        </Button>
        <button
          type="button"
          onClick={onDownloadSample}
          disabled={isUploading}
          className="flex items-center justify-center gap-1 text-center text-sm text-primary underline-offset-2 transition-colors hover:underline disabled:opacity-50"
        >
          <Download className="size-3.5" /> Download Sample Template
        </button>
      </div>
    </div>
  );
};
