import * as React from 'react';
import { FloatingLabelInput } from '../../../Components/ui/FloatingLabelInput';
import type { CatalogueProfileData } from '../../../services/catalogue/catalogueEditProfile.service';
import { SectionCard } from './SectionCard';

interface SocialMediaCardProps {
  formData: Partial<CatalogueProfileData>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const SocialMediaCard: React.FC<SocialMediaCardProps> = ({ formData, onInputChange }) => (
  <SectionCard title="Social Media">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FloatingLabelInput type="text" name="instagram" value={formData.instagram || ''} onChange={onInputChange} label="Instagram" />
      <FloatingLabelInput type="text" name="facebook" value={formData.facebook || ''} onChange={onInputChange} label="Facebook" />
      <FloatingLabelInput type="text" name="twitter" value={formData.twitter || ''} onChange={onInputChange} label="Twitter / X" />
      <FloatingLabelInput
        type="text"
        name="whatsappNumber"
        value={formData.whatsappNumber || ''}
        onChange={onInputChange}
        label="WhatsApp No."
        maxLength={10}
        inputMode="numeric"
      />
    </div>
  </SectionCard>
);
