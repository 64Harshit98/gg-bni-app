import { FileSpreadsheet, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../Components/ui/dialog';
import { Button } from '../../../Components/ui/button';

export default function DownloadChoiceModal({
  isOpen,
  onClose,
  onDownloadPdf,
  onDownloadExcel,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDownloadPdf: () => void;
  onDownloadExcel: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm text-center">
        <DialogHeader>
          <DialogTitle>Download Report</DialogTitle>
          <DialogDescription>Select your preferred format.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Button
            onClick={onDownloadExcel}
            className="w-full bg-success text-success-foreground hover:bg-success/90"
          >
            <FileSpreadsheet className="size-4" />
            Export as Excel
          </Button>

          <Button
            onClick={onDownloadPdf}
            variant="destructive"
            className="w-full"
          >
            <FileText className="size-4" />
            Export as PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
