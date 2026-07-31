import * as React from 'react';
import { CheckCircle2, LayoutList, LayoutGrid, ArrowUpDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SettingsSectionCard } from './SettingsSectionCard';
import { InfoTooltip } from '../../../Components/InfoToolTip';
import type { PurchaseSettings } from '../../../services/settings/purchaseSetting.service';

type ViewType = PurchaseSettings['purchaseViewType'];
type CartOrder = NonNullable<PurchaseSettings['cartInsertionOrder']>;

interface PurchaseDisplaySettingsCardProps {
  purchaseViewType: ViewType;
  onViewTypeChange: (value: ViewType) => void;
  cardViewWithPhoto: boolean;
  onCardPhotoChange: (value: boolean) => void;
  cartInsertionOrder: CartOrder;
  onCartOrderChange: (value: CartOrder) => void;
  action?: React.ReactNode;
}

/** Purchase list-vs-card layout, card photo display, and cart sort-order preferences. */
export const PurchaseDisplaySettingsCard: React.FC<PurchaseDisplaySettingsCardProps> = ({
  purchaseViewType,
  onViewTypeChange,
  cardViewWithPhoto,
  onCardPhotoChange,
  cartInsertionOrder,
  onCartOrderChange,
  action,
}) => (
  <SettingsSectionCard
    icon={<LayoutGrid className="size-4" />}
    title="Display Settings"
    description="Choose how the purchase screen looks and behaves."
    action={action}
  >
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => onViewTypeChange('list')}
        className={cn(
          'relative flex flex-col items-center gap-3 rounded-xl border-2 p-3 transition-all',
          purchaseViewType === 'list' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-card hover:border-primary/40',
        )}
      >
        {purchaseViewType === 'list' && (
          <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckCircle2 className="size-3.5" />
          </span>
        )}
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <LayoutList className="size-4" />
        </span>
        <div className="text-center">
          <p className="text-sm font-bold text-foreground">List View</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Best for POS & Barcode Scanning</p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onViewTypeChange('card')}
        className={cn(
          'relative flex flex-col items-center gap-3 rounded-xl border-2 p-3 transition-all',
          purchaseViewType === 'card' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-card hover:border-primary/40',
        )}
      >
        {purchaseViewType === 'card' && (
          <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckCircle2 className="size-3.5" />
          </span>
        )}
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <LayoutGrid className="size-4" />
        </span>
        <div className="text-center">
          <p className="text-sm font-bold text-foreground">Card View</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Best for Touchscreens</p>
        </div>
      </button>
    </div>

    {purchaseViewType === 'card' && (
      <div className="rounded-xl border border-border bg-muted/40 p-3.5">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Card Image Display</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onCardPhotoChange(true)}
            className={cn(
              'relative flex flex-col items-center gap-2 rounded-lg border p-2.5 text-center transition-all sm:flex-row sm:text-left',
              cardViewWithPhoto ? 'border-primary bg-card shadow-sm' : 'border-border bg-muted hover:border-primary/30',
            )}
          >
            {cardViewWithPhoto && (
              <span className="absolute top-1.5 right-1.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CheckCircle2 className="size-3" />
              </span>
            )}
            <div>
              <p className="text-xs font-semibold text-foreground sm:text-sm">With Photo</p>
              <p className="hidden text-xs text-muted-foreground sm:block">Shows product image</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onCardPhotoChange(false)}
            className={cn(
              'relative flex flex-col items-center gap-2 rounded-lg border p-2.5 text-center transition-all sm:flex-row sm:text-left',
              !cardViewWithPhoto ? 'border-primary bg-card shadow-sm' : 'border-border bg-muted hover:border-primary/30',
            )}
          >
            {!cardViewWithPhoto && (
              <span className="absolute top-1.5 right-1.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CheckCircle2 className="size-3" />
              </span>
            )}
            <div>
              <p className="text-xs font-semibold text-foreground sm:text-sm">Without Photo</p>
              <p className="hidden text-xs text-muted-foreground sm:block">Text-only compact</p>
            </div>
          </button>
        </div>
      </div>
    )}

    <div className="rounded-xl border border-border bg-muted/40 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <ArrowUpDown className="size-3.5 text-muted-foreground" />
        <p className="text-sm font-semibold leading-5 text-foreground">Cart Item Sorting</p>
        <InfoTooltip text="Choose where newly scanned items appear in the cart." />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onCartOrderChange('top')}
          className={cn(
            'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
            cartInsertionOrder === 'top' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent',
          )}
        >
          Newest First
        </button>
        <button
          type="button"
          onClick={() => onCartOrderChange('bottom')}
          className={cn(
            'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
            cartInsertionOrder === 'bottom' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent',
          )}
        >
          Oldest First
        </button>
      </div>
    </div>
  </SettingsSectionCard>
);
