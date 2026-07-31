import * as React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '../../../Components/ui/button';

export type ImportMode = 'create_update' | 'update_only';

interface ImportSettingsModalProps {
  importMode: ImportMode;
  onImportModeChange: (mode: ImportMode) => void;
  updateFields: Record<string, boolean>;
  onToggleUpdateField: (key: string, value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Pre-flight settings shown before a bulk Excel/CSV import actually runs:
 * choose whether to create+update or only update existing inventory, and
 * (for update-only mode) which fields should be touched.
 */
export const ImportSettingsModal: React.FC<ImportSettingsModalProps> = ({
  importMode,
  onImportModeChange,
  updateFields,
  onToggleUpdateField,
  onCancel,
  onConfirm,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Bulk Import Settings</h2>
        </div>

        <div className="mb-6 space-y-3">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${importMode === 'create_update' ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted'
              }`}
          >
            <input
              type="radio"
              name="mode"
              className="mt-1 h-4 w-4 accent-primary"
              checked={importMode === 'create_update'}
              onChange={() => onImportModeChange('create_update')}
            />
            <div>
              <span className="block font-semibold text-foreground">Add New & Update All</span>
              <span className="text-xs text-muted-foreground">Creates new items if they don't exist. Fully updates existing items.</span>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${importMode === 'update_only' ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted'
              }`}
          >
            <input
              type="radio"
              name="mode"
              className="mt-1 h-4 w-4 accent-primary"
              checked={importMode === 'update_only'}
              onChange={() => onImportModeChange('update_only')}
            />
            <div>
              <span className="block font-semibold text-foreground">Update Existing Inventory Only</span>
              <span className="text-xs text-muted-foreground">Skips new items. Matches by Barcode or Name. Select which fields to update below.</span>
            </div>
          </label>
        </div>

        {importMode === 'update_only' && (
          <div className="mb-6 rounded-xl border border-border bg-muted p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Fields to Update</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(updateFields).map(([key, value]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded accent-primary focus:ring-primary"
                    checked={value}
                    onChange={(e) => onToggleUpdateField(key, e.target.checked)}
                  />
                  <span className="capitalize text-foreground">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto flex justify-end gap-3">
          <Button type="button" variant="ghost" className="rounded-xl active:scale-[0.98]" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="rounded-xl active:scale-[0.98]" onClick={onConfirm}>
            Start Import
          </Button>
        </div>
      </div>
    </div>
  );
};
