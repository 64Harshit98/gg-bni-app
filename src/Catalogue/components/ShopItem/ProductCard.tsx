import React from 'react';
import { Package, Pin, Send } from 'lucide-react';
import type { Item } from '../../../constants/models';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/formatters';
import { Badge } from '../../../Components/ui/badge';
import ShowWrapper from '../../../context/ShowWrapper';
import { Cata_Permissions } from '../../enum/cata_permissions.enum';
import { StockIndicator } from './StockIndicator';
import { QuickListedToggle } from './QuickListedToggle';
import { getEffectivePriceInfo } from './pdfExport';

export interface ProductCardProps {
  item: Item;
  isUncategorized: boolean;
  isHighlighted: boolean;
  isPinned: boolean;
  showDiscountBadgeSetting: boolean;
  onOpenDetail: (item: Item) => void;
  onTogglePin: (e: React.MouseEvent, id: string) => void;
  onShare: (item: Item) => void;
  onOpenEdit: (item: Item) => void;
  onToggleListed: (itemId: string, newState: boolean) => Promise<void>;
}

/** A single product tile in the shop grid: image, price, pin/share, and edit/live actions. */
export function ProductCard({
  item,
  isUncategorized,
  isHighlighted,
  isPinned,
  showDiscountBadgeSetting,
  onOpenDetail,
  onTogglePin,
  onShare,
  onOpenEdit,
  onToggleListed,
}: ProductCardProps) {
  const { mrp, salePrice, discountPercent, hasDiscount, hasBothPrices } = getEffectivePriceInfo(item);
  const multiplier = item.unitMultiplier || 1;
  const showDiscountBadge = showDiscountBadgeSetting && hasDiscount;

  return (
    <div
      id={item.id}
      onClick={() => onOpenDetail(item)}
      className={cn(
        'group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        isHighlighted
          ? 'scale-[1.02] border-primary shadow-lg ring-1 ring-primary'
          : isPinned
            ? 'border-primary/40 shadow-lg ring-1 ring-primary/40'
            : 'border-border hover:border-primary/40',
      )}
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted">
        {isPinned && (
          <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-full border border-primary/30 bg-card p-1 text-primary shadow-md">
            <Pin size={12} className="fill-primary" />
          </div>
        )}

        {showDiscountBadge && (
          <Badge
            variant="default"
            className={cn('absolute top-2 bg-primary text-primary-foreground shadow-md', isPinned ? 'right-8' : 'right-2')}
          >
            {discountPercent}% OFF
          </Badge>
        )}

        <div className="absolute left-2 top-2">
          <StockIndicator stock={item.stock || 0} />
        </div>

        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <Package className="h-10 w-10 text-muted-foreground/40" />
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="mb-1 flex items-start justify-between">
          <h3 className="max-h-[2.5em] overflow-hidden break-words text-[14px] font-bold uppercase leading-tight text-foreground">
            {item.name}
          </h3>

          {!isUncategorized && (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => onTogglePin(e, item.id!)}
                className={cn(
                  'rounded-md p-1 transition-all',
                  isPinned
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground',
                )}
                title={isPinned ? 'Unpin' : 'Pin to top'}
              >
                <Pin size={12} className={isPinned ? 'fill-primary' : ''} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(item);
                }}
                className="rounded-md bg-primary/10 p-1 text-primary transition-all hover:bg-primary hover:text-primary-foreground"
                title="Share Product"
              >
                <Send size={12} />
              </button>
            </div>
          )}
        </div>

        <div className="flex w-full items-center justify-between">
          <div className="flex w-full min-w-0 items-center gap-2">
            {hasBothPrices ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-1 leading-tight">
                <p className="shrink-0 whitespace-nowrap text-[14px] font-bold text-muted-foreground line-through">
                  {formatCurrency(mrp)}
                </p>
                <p className="shrink-0 whitespace-nowrap text-[14px] font-black text-primary">
                  {formatCurrency(salePrice)}
                </p>
                <span className="whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
                  ({multiplier} pcs)
                </span>
              </div>
            ) : (
              <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
                <p className="max-w-[70%] truncate whitespace-nowrap text-[14px] font-black text-primary">
                  {formatCurrency(salePrice)}
                </p>
                <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-muted-foreground">
                  ({multiplier} pcs)
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto flex gap-1 pt-2">
          {isUncategorized ? (
            <ShowWrapper requiredPermission={Cata_Permissions.ViewEditButton}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenEdit(item);
                }}
                className="w-full rounded-md border border-border bg-muted py-1.5 text-[12px] font-black uppercase text-foreground"
              >
                Edit
              </button>
            </ShowWrapper>
          ) : (
            <ShowWrapper requiredPermission={Cata_Permissions.ViewEditButton}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenEdit(item);
                }}
                className="flex-1 rounded-md border border-border bg-muted py-1.5 text-[12px] font-black uppercase text-foreground"
              >
                Edit
              </button>

              <QuickListedToggle itemId={item.id!} isListed={item.isListed ?? false} onToggle={onToggleListed} />
            </ShowWrapper>
          )}
        </div>
      </div>
    </div>
  );
}
