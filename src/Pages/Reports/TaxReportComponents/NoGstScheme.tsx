import { useNavigate } from 'react-router';
import { FileWarning, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '../../../Components/ui/alert';
import { Button } from '../../../Components/ui/button';

export default function NoGstScheme() {
  const navigate = useNavigate();

  return (
    <div className="aurora min-h-screen bg-muted pb-16">
      <header className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
            Tax Liability <span className="text-gradient">Report</span>
          </h1>
          <p className="text-xs text-muted-foreground">GST-based filings and liability summaries</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-16 text-center sm:px-6">
        <Alert variant="warning" className="items-center text-center [&>svg]:static [&>svg]:mb-3 [&>svg]:size-10 [&>svg]:translate-y-0">
          <FileWarning />
          <AlertTitle className="col-start-1 text-base font-bold">Tax Reports Disabled</AlertTitle>
          <AlertDescription className="col-start-1 mx-auto max-w-sm justify-items-center text-center">
            Your current settings have GST disabled (Scheme: None). Enable GST in Settings to view
            tax reports for this company.
          </AlertDescription>
        </Alert>

        <Button variant="outline" className="mt-6" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    </div>
  );
}
