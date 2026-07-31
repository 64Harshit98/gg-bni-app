import { Building2 } from 'lucide-react';
import { Badge } from '../../../Components/ui/badge';
import { SettingsCard } from './SettingsCard';
import type { BusinessInfoData } from '../../../services/settings/catalogueBillSetting.service';

interface BillCompanyDetailsCardProps {
  businessInfo: BusinessInfoData;
  onEditProfile: () => void;
}

const ReadOnlyField = ({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) => (
  <div>
    <label className="mb-1 block text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</label>
    <div
      className={
        wrap
          ? 'flex min-h-[44px] items-center whitespace-normal break-words rounded-lg border border-border bg-muted px-3 py-2 font-medium text-foreground'
          : 'flex h-[44px] items-center truncate rounded-lg border border-border bg-muted px-3 font-medium text-foreground'
      }
    >
      {value}
    </div>
  </div>
);

/** Read-only snapshot of the business profile, pulled in from the company's business_info doc. */
export function BillCompanyDetailsCard({ businessInfo, onEditProfile }: BillCompanyDetailsCardProps) {
  return (
    <SettingsCard
      title="Company Details"
      icon={<Building2 className="size-4" />}
      action={<Badge variant="secondary">Read Only</Badge>}
    >
      <p className="-mt-2 text-xs text-muted-foreground">
        Fetched from your{' '}
        <button
          type="button"
          onClick={onEditProfile}
          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-normal text-primary hover:underline"
        >
          Business Profile
        </button>
        . Edit there to update here.
      </p>

      <div className="space-y-6 opacity-90">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {businessInfo.companyLogo ? (
            <img
              src={businessInfo.companyLogo}
              alt="Company Logo"
              className="h-16 w-16 shrink-0 rounded-lg border border-border bg-muted object-contain p-1.5"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted text-xs font-bold text-muted-foreground">
              LOGO
            </div>
          )}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <ReadOnlyField label="Company Name" value={businessInfo.companyName} />
            </div>
            <div className="md:col-span-2">
              <ReadOnlyField label="Registered Address" value={businessInfo.address} wrap />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Phone" value={businessInfo.phone} />
          <ReadOnlyField label="Email" value={businessInfo.email} />
        </div>

        <div className="border-t border-border" />

        <div>
          <p className="mb-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">Tax & Registration</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <ReadOnlyField label="GSTIN" value={businessInfo.gstin} />
            <ReadOnlyField label="PAN Number" value={businessInfo.panNumber} />
            <ReadOnlyField label="MSME No." value={businessInfo.msmeNumber} />
          </div>
        </div>

        <div className="border-t border-border" />

        <div>
          <p className="mb-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">Bank Details</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Bank Name" value={businessInfo.bankName} />
            <ReadOnlyField label="Acc. Holder Name" value={businessInfo.accountHolderName} />
            <ReadOnlyField label="Account Number" value={businessInfo.accountNumber} />
            <ReadOnlyField label="IFSC Code" value={businessInfo.ifscCode} />
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
