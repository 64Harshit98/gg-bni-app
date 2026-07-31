import * as React from 'react';
import { Plus, Tag, X } from 'lucide-react';
import type { ItemGroup } from '../../../constants/models';
import { IconScanCircle } from '../../../constants/Icons';
import { FormSectionHeader } from './FormSectionHeader';
import { FieldLabel } from './FieldLabel';
import { fieldInputClass, fieldHelperClass } from './formFieldStyles';

interface BasicInfoSectionProps {
  itemName: string;
  onItemNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  itemBarcode: string;
  onItemBarcodeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requireBarcode?: boolean;
  onScanClick: () => void;
  itemGroups: ItemGroup[];
  selectedCategories: string[];
  requireCategory?: boolean;
  showCategoryDropdown: boolean;
  onToggleCategoryDropdown: (open: boolean) => void;
  onPrimaryCategoryChange: (value: string) => void;
  onAddCategory: (value: string) => void;
  onRemoveCategory: (categoryId: string) => void;
}

/**
 * Core identity of the product: name, barcode (with scanner shortcut) and
 * category assignment (primary category + optional extra "catalogue only" tags).
 */
export const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
  itemName,
  onItemNameChange,
  itemBarcode,
  onItemBarcodeChange,
  requireBarcode,
  onScanClick,
  itemGroups,
  selectedCategories,
  requireCategory,
  showCategoryDropdown,
  onToggleCategoryDropdown,
  onPrimaryCategoryChange,
  onAddCategory,
  onRemoveCategory,
}) => {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <FormSectionHeader
        icon={<Tag className="size-4" />}
        eyebrow="Step 1"
        title="Basic Information"
        description="The name, barcode and category customers and staff will see."
      />

      <div className="space-y-4">
        <div>
          <FieldLabel required tooltip="The name of the product being added.">
            Item Name
          </FieldLabel>
          <input
            type="text"
            value={itemName}
            onChange={onItemNameChange}
            className={fieldInputClass}
            placeholder="e.g. Apple"
          />
        </div>

        <div>
          <FieldLabel required={requireBarcode} tooltip="Unique identifier for scanning the product.">
            Barcode
          </FieldLabel>
          <div className="flex gap-2">
            <input
              type="text"
              value={itemBarcode}
              onChange={onItemBarcodeChange}
              className={fieldInputClass}
              placeholder="Scan or Type"
            />
            <button
              type="button"
              onClick={onScanClick}
              title="Scan barcode"
              className="bg-gradient-brand flex h-10 shrink-0 items-center justify-center rounded-xl px-4 text-white shadow-xs transition-transform hover:opacity-90 active:scale-95"
            >
              <IconScanCircle width={20} height={20} />
            </button>
          </div>
          <p className={fieldHelperClass}>This is the next available number. You can change it if needed.</p>
        </div>

        <div>
          <FieldLabel required={requireCategory} tooltip="Select a primary category. Add more as catalogue-only tags below.">
            Category
          </FieldLabel>

          {/* Primary category dropdown — always visible */}
          <select
            value={selectedCategories[0] || ''}
            onChange={(e) => onPrimaryCategoryChange(e.target.value)}
            className={fieldInputClass}
          >
            <option value="">Select category</option>
            <option value="ADD_NEW_GROUP" className="font-semibold bg-muted">+ Add New Group</option>
            {itemGroups.map((g) => (
              <option key={g.id} value={g.id!}>{g.name}</option>
            ))}
          </select>

          {/* Extra categories as "Catalogue only" chips */}
          {selectedCategories.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedCategories.slice(1).map((catId) => {
                const group = itemGroups.find((g) => g.id === catId);
                if (!group) return null;
                return (
                  <span
                    key={catId}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                  >
                    <Tag className="size-3" />
                    {group.name}
                    <button
                      type="button"
                      onClick={() => onRemoveCategory(catId)}
                      className="ml-0.5 leading-none text-primary/70 hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Add more category link */}
          {!showCategoryDropdown ? (
            <button
              type="button"
              onClick={() => onToggleCategoryDropdown(true)}
              className="mt-2 flex items-center gap-1 text-sm text-primary transition-colors hover:underline"
            >
              <Plus className="size-3.5" /> Add more category
            </button>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <select
                defaultValue=""
                onChange={(e) => onAddCategory(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Add more</option>
                <option value="ADD_NEW_GROUP" className="font-semibold bg-muted">+ Add New Group</option>
                {itemGroups
                  .filter((g) => !selectedCategories.includes(g.id!))
                  .map((g) => (
                    <option key={g.id} value={g.id!}>{g.name}</option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => onToggleCategoryDropdown(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
