import * as React from 'react';
import { FloatingLabelInput } from '../../../Components/ui/FloatingLabelInput';
import { FloatingLabelSelect } from '../../../Components/FloatingLabelSelect';
import type { CatalogueProfileData } from '../../../services/catalogue/catalogueEditProfile.service';
import { SectionCard } from './SectionCard';
import { businessTypeOptions, businessCategoryOptions } from './constants';

interface BusinessInfoCardProps {
  formData: Partial<CatalogueProfileData>;
  customBusinessType: string;
  customBusinessCategory: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFieldChange: (field: 'businessType' | 'businessCategory', value: string) => void;
  onCustomBusinessTypeChange: (value: string) => void;
  onCustomBusinessCategoryChange: (value: string) => void;
}

export const BusinessInfoCard: React.FC<BusinessInfoCardProps> = ({
  formData,
  customBusinessType,
  customBusinessCategory,
  onInputChange,
  onFieldChange,
  onCustomBusinessTypeChange,
  onCustomBusinessCategoryChange,
}) => (
  <SectionCard title="Business Information">
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <FloatingLabelInput
          type="text"
          name="businessName"
          value={formData.businessName || ''}
          onChange={onInputChange}
          label="Business Name"
        />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <FloatingLabelSelect
          id="businessType"
          label="Business Type"
          value={formData.businessType || ''}
          onChange={(e) => onFieldChange('businessType', e.target.value)}
          options={businessTypeOptions}
        />
      </div>
      {formData.businessType === 'Other' && (
        <div className="col-span-2 sm:col-span-1">
          <FloatingLabelInput
            label="Specify Type"
            name="customBusinessType"
            value={customBusinessType}
            onChange={(e) => onCustomBusinessTypeChange(e.target.value)}
          />
        </div>
      )}

      <div className="col-span-2 sm:col-span-1">
        <FloatingLabelSelect
          id="businessCategory"
          label="Category"
          value={formData.businessCategory || ''}
          onChange={(e) => onFieldChange('businessCategory', e.target.value)}
          options={businessCategoryOptions}
        />
      </div>
      {formData.businessCategory === 'Other' && (
        <div className="col-span-2 sm:col-span-1">
          <FloatingLabelInput
            label="Specify Category"
            name="customBusinessCategory"
            value={customBusinessCategory}
            onChange={(e) => onCustomBusinessCategoryChange(e.target.value)}
          />
        </div>
      )}
      <FloatingLabelInput
        type="text"
        name="gstin"
        value={formData.gstin || ''}
        onChange={onInputChange}
        label="GSTIN"
      />

      <FloatingLabelInput
        type="text"
        name="msmeUdyamNumber"
        maxLength={19}
        value={formData.msmeUdyamNumber || ''}
        onChange={onInputChange}
        label="MSME No."
      />
    </div>
  </SectionCard>
);
