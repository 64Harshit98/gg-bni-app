import * as React from 'react';
import { Layers } from 'lucide-react';
import { VariantPicker } from '../../../Components/VariantPicker';
import { FormSectionHeader } from './FormSectionHeader';
import { FieldLabel } from './FieldLabel';

interface VariantsSectionProps {
  allItems: unknown[];
  itemVariants: string[];
  itemBarcode: string;
  onChange: (ids: string[]) => void;
}

/**
 * Optional linking of other catalogue items as variants (sizes, colors, etc).
 */
export const VariantsSection: React.FC<VariantsSectionProps> = ({
  allItems,
  itemVariants,
  itemBarcode,
  onChange,
}) => {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <FormSectionHeader
        icon={<Layers className="size-4" />}
        eyebrow="Step 4 · Optional"
        title="Variants"
        description="Link related items, like different sizes or colors, to this product."
      />
      <div>
        <FieldLabel tooltip="Link other items as variants (e.g. different sizes or colors).">
          Linked Items
        </FieldLabel>
        <VariantPicker
          allItems={allItems}
          selectedIds={itemVariants}
          currentItemBarcode={itemBarcode}
          onChange={onChange}
          activeTheme={{ focusRing: 'focus:ring-primary/40' }}
        />
      </div>
    </div>
  );
};
