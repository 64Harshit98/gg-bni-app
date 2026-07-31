import * as React from 'react';
import { FloatingLabelInput } from '../../../Components/ui/FloatingLabelInput';
import { FloatingLabelSelect } from '../../../Components/FloatingLabelSelect';
import type { CatalogueProfileData } from '../../../services/catalogue/catalogueEditProfile.service';
import { SectionCard } from './SectionCard';
import { stateOptions } from './constants';

interface AddressCardProps {
  formData: Partial<CatalogueProfileData>;
  postalError: string | null;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onPostalCodeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStateChange: (value: string) => void;
}

export const AddressCard: React.FC<AddressCardProps> = ({
  formData,
  postalError,
  onInputChange,
  onPostalCodeChange,
  onStateChange,
}) => (
  <SectionCard title="Business Address">
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <FloatingLabelInput
          name="streetAddress"
          value={formData.streetAddress || ''}
          onChange={onInputChange}
          label="Street Address"
        />
      </div>
      <FloatingLabelInput type="text" name="city" value={formData.city || ''} onChange={onInputChange} label="City" />
      <FloatingLabelSelect
        id="state"
        label="State"
        value={formData.state || ''}
        onChange={(e) => onStateChange(e.target.value)}
        options={stateOptions}
      />
      <div className="col-span-2">
        <FloatingLabelInput
          type="text"
          name="postalCode"
          value={formData.postalCode || ''}
          onChange={onPostalCodeChange}
          label="Postal Code"
          maxLength={6}
          inputMode="numeric"
          error={postalError}
        />
      </div>
    </div>
  </SectionCard>
);
