import * as React from 'react';
import { FloatingLabelInput } from '../../../Components/ui/FloatingLabelInput';
import type { CatalogueProfileData } from '../../../services/catalogue/catalogueEditProfile.service';
import { SectionCard, LabeledField } from './SectionCard';
import { inputClass } from './constants';

interface PersonalInfoCardProps {
  formData: Partial<CatalogueProfileData>;
  phoneError: string | null;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const PersonalInfoCard: React.FC<PersonalInfoCardProps> = ({
  formData,
  phoneError,
  onInputChange,
  onPhoneChange,
}) => (
  <SectionCard title="Personal Information">
    <div className="flex flex-col gap-4">
      <FloatingLabelInput
        type="text"
        name="name"
        value={formData.name || ''}
        onChange={onInputChange}
        label="Your Full Name"
      />
      <FloatingLabelInput
        type="text"
        name="phone"
        value={formData.phone || ''}
        onChange={onPhoneChange}
        label="Phone Number"
        maxLength={10}
        inputMode="numeric"
        error={phoneError}
      />
      <LabeledField label="Email Address">
        <input
          type="email"
          name="email"
          value={formData.email || ''}
          readOnly
          className={`${inputClass} cursor-not-allowed bg-muted text-muted-foreground`}
          placeholder="Email Address"
        />
      </LabeledField>
      <FloatingLabelInput
        type="text"
        name="panNumber"
        maxLength={10}
        value={formData.panNumber || ''}
        onChange={onInputChange}
        label="PAN No."
      />
    </div>
  </SectionCard>
);
