import * as React from 'react';
import { FloatingLabelInput } from '../../../Components/ui/FloatingLabelInput';
import type { CatalogueProfileData } from '../../../services/catalogue/catalogueEditProfile.service';
import { SectionCard } from './SectionCard';

interface BankDetailsCardProps {
  formData: Partial<CatalogueProfileData>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const BankDetailsCard: React.FC<BankDetailsCardProps> = ({ formData, onInputChange }) => (
  <SectionCard title="Bank Details">
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <FloatingLabelInput
          type="text"
          name="accountHolderName"
          value={formData.accountHolderName || ''}
          onChange={onInputChange}
          label="Acc Holder Name"
        />
      </div>
      <FloatingLabelInput type="text" name="bankName" value={formData.bankName || ''} onChange={onInputChange} label="Bank" />
      <FloatingLabelInput
        type="text"
        name="ifscCode"
        value={formData.ifscCode || ''}
        onChange={onInputChange}
        label="IFSC Code"
      />
      <div className="col-span-2">
        <FloatingLabelInput
          type="text"
          name="accountNumber"
          value={formData.accountNumber || ''}
          onChange={onInputChange}
          label="Account No."
        />
      </div>
    </div>
  </SectionCard>
);
