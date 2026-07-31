import * as React from 'react';
import { Building2, ImageOff } from 'lucide-react';
import { SettingsSectionCard } from './SettingsSectionCard';
import type { BusinessInfoData } from '../../../services/settings/billSetting.service';

interface ReadOnlyFieldProps {
  label: string;
  value: React.ReactNode;
  className?: string;
  wrap?: boolean;
}

const ReadOnlyField: React.FC<ReadOnlyFieldProps> = ({ label, value, className, wrap }) => (
  <div className={className}>
    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</label>
    <div
      className={
        wrap
          ? 'flex min-h-11 items-center whitespace-normal break-words rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground'
          : 'flex h-11 items-center truncate rounded-lg border border-border bg-muted px-3 text-sm font-medium text-foreground'
      }
    >
      {value || '—'}
    </div>
  </div>
);

interface BillCompanyInfoCardProps {
  businessInfo: BusinessInfoData;
  onEditProfile: () => void;
}

/**
 * Read-only snapshot of the business profile (logo, contact, tax/registration,
 * bank details) shown at the top of Invoice Configuration. Editing happens on
 * the Business Profile page — this card just links there.
 */
export const BillCompanyInfoCard: React.FC<BillCompanyInfoCardProps> = ({ businessInfo, onEditProfile }) => (
  <SettingsSectionCard
    icon={<Building2 className="size-4" />}
    title="Company Details"
    description={
      <>
        Fetched from your{' '}
        <button
          type="button"
          onClick={onEditProfile}
          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-normal text-primary hover:underline"
        >
          Business Profile
        </button>
        . Edit there to update here.
      </>
    }
    badge={
      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Read Only</span>
    }
    contentClassName="opacity-90"
  >
    <div className="flex flex-col items-start gap-4 sm:flex-row">
      {businessInfo.companyLogo ? (
        <img
          src={businessInfo.companyLogo}
          alt="Company Logo"
          className="size-16 shrink-0 rounded-xl border border-border bg-muted object-contain p-1.5"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted text-muted-foreground">
          <ImageOff className="size-5" />
        </div>
      )}
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <ReadOnlyField className="md:col-span-2" label="Company Name" value={businessInfo.companyName} />
        <ReadOnlyField className="md:col-span-2" label="Registered Address" value={businessInfo.address} wrap />
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ReadOnlyField label="Phone" value={businessInfo.phone} />
      <ReadOnlyField label="Email" value={businessInfo.email} />
    </div>

    <div className="border-t border-border" />

    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Tax & Registration</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <ReadOnlyField label="GSTIN" value={businessInfo.gstin} />
        <ReadOnlyField label="PAN Number" value={businessInfo.panNumber} />
        <ReadOnlyField label="MSME No." value={businessInfo.msmeNumber} />
      </div>
    </div>

    <div className="border-t border-border" />

    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Bank Details</p>
      <div className="grid grid-cols-2 gap-4">
        <ReadOnlyField label="Bank Name" value={businessInfo.bankName} />
        <ReadOnlyField label="Acc. Holder Name" value={businessInfo.accountHolderName} />
        <ReadOnlyField label="Account Number" value={businessInfo.accountNumber} />
        <ReadOnlyField label="IFSC Code" value={businessInfo.ifscCode} />
      </div>
    </div>
  </SettingsSectionCard>
);
