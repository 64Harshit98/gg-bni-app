import { UploadCloud } from 'lucide-react';
import { Button } from '../../../Components/ui/button';
import { Spinner } from '../../../Components/ui/spinner';
import { cn } from '../../../lib/utils';

interface BulkImportPanelProps {
  isUploading: boolean;
  onUploadClick: () => void;
  onDownloadSample: () => void;
  className?: string;
  compact?: boolean;
}

/**
 * "Bulk Import" card shown both as a compact mobile bar (above the party
 * list filters) and as a full desktop sidebar panel. `compact` switches
 * between the two layouts; the actual file input lives in the parent page.
 */
export default function BulkImportPanel({
  isUploading,
  onUploadClick,
  onDownloadSample,
  className,
  compact = false,
}: BulkImportPanelProps) {
  return (
    <div className={cn('rounded-2xl border border-info/20 bg-info/10 p-4', className)}>
      <div className="mb-2 flex items-center gap-2">
        <UploadCloud className="size-4 text-info" />
        <h3 className={cn('font-bold text-info', compact ? 'text-sm' : 'text-lg')}>Bulk Import</h3>
      </div>
      <p className={cn('mb-3 text-info', compact ? 'text-xs' : 'text-sm')}>
        Upload an Excel sheet of old dues/advances as opening balances.
      </p>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={onUploadClick}
          disabled={isUploading}
          className="w-full gap-2 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90"
        >
          {isUploading ? <Spinner size="sm" /> : null}
          Upload Excel File
        </Button>
        <button
          type="button"
          onClick={onDownloadSample}
          disabled={isUploading}
          className="text-center text-sm text-info underline transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Download Sample Template
        </button>
      </div>
    </div>
  );
}
