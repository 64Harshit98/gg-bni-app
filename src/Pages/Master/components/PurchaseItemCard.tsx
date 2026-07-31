import React from 'react';
import { Camera, Pencil, X as XIcon } from 'lucide-react';
import type { Item } from '../../../constants/models';

export interface PurchaseGridCardData {
  item: Item;
  isSelected: boolean;
  quantity: number;
  mrp: number;
  cp: number;
  discPct: number;
  lineSubtotal: number;
}

interface PurchaseItemCardProps {
  data: PurchaseGridCardData;
  withImage: boolean;
  onCardClick: () => void;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  onEdit: () => void;
}

/**
 * Single catalogue card rendered in the Purchase page's card-view grid.
 * Supports the "with photo" and "without photo" layouts that
 * `purchaseSettings.cardViewWithPhoto` toggles between. Extracted verbatim
 * (styling reskinned onto design tokens) from `Purchase.tsx`'s inline grid
 * renderer.
 */
export const PurchaseItemCard: React.FC<PurchaseItemCardProps> = ({
  data,
  withImage,
  onCardClick,
  onAdd,
  onIncrement,
  onDecrement,
  onRemove,
  onEdit,
}) => {
  const { item, isSelected, quantity, mrp, cp, discPct, lineSubtotal } = data;

  if (withImage) {
    const imageUrl: string | undefined =
      (item as any).image ||
      (item as any).imageUrl ||
      (item as any).thumbnail ||
      (item as any).imageURL;

    return (
      <div
        onClick={onCardClick}
        className={`group relative flex w-full flex-col overflow-visible rounded-xl border bg-card transition-all duration-200
        ${isSelected ? 'border-2 border-primary shadow-md ring-1 ring-primary/20' : 'border-border hover:border-border hover:shadow-md'}`}
      >
        {/* Image block */}
        <div className="relative w-full overflow-hidden rounded-t-xl bg-muted" style={{ height: '140px' }}>
          <div className="flex h-full w-full items-center justify-center p-1.5">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={item.name}
                className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const placeholder = (e.currentTarget as HTMLImageElement)
                    .parentElement
                    ?.querySelector<HTMLElement>('[data-no-image]');
                  if (placeholder) placeholder.style.display = 'flex';
                }}
              />
            ) : null}

            <div
              data-no-image
              className="absolute inset-0 flex flex-col items-center justify-center bg-muted"
              style={{ display: imageUrl ? 'none' : 'flex' }}
            >
              <Camera className="text-muted-foreground" size={22} strokeWidth={1.4} />
              <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">No Image</span>
            </div>
          </div>

          {discPct > 0 && (
            <div className="absolute left-1.5 top-1.5 z-10 rounded-md bg-primary px-1.5 py-[3px] text-[9px] font-bold leading-tight text-primary-foreground shadow-sm">
              {discPct}% OFF
            </div>
          )}

          {isSelected && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="absolute right-1.5 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card/80 text-[10px] font-bold leading-none text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <XIcon size={11} />
            </button>
          )}
        </div>

        {/* Content block */}
        <div className="flex flex-1 flex-col gap-0.5 p-1.5 sm:p-2">
          <div className="flex items-start justify-between gap-1" style={{ minHeight: '28px' }}>
            <p
              className="flex-1 overflow-hidden text-[11px] font-bold leading-snug text-foreground"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
              title={item.name}
            >
              {item.name.length > 45 ? item.name.slice(0, 45) : item.name}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="mt-0.5 flex-shrink-0 text-muted-foreground transition-colors hover:text-primary"
            >
              <Pencil size={11} />
            </button>
          </div>

          <div className="mt-auto flex flex-col gap-1 border-t border-border pt-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-foreground">₹{Number(cp).toLocaleString('en-IN')}</span>
              {discPct > 0 && mrp > 0 && Number(cp) < mrp && (
                <span className="text-[10px] text-muted-foreground line-through">₹{mrp.toLocaleString('en-IN')}</span>
              )}
              {item.unit && <span className="ml-0.5 text-[9px] font-medium text-muted-foreground">({item.unit})</span>}
            </div>

            {isSelected && (
              <div className="flex min-w-0 items-center gap-1 border-t border-border pt-1">
                <span className="flex-shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">Subtotal</span>
                <span className="truncate text-[10px] font-semibold text-primary">₹{lineSubtotal.toLocaleString('en-IN')}</span>
              </div>
            )}

            {!isSelected ? (
              <>
                <div className="h-[18px] border-t border-border" />
                <button
                  onClick={(e) => { e.stopPropagation(); onAdd(); }}
                  className="h-[26px] w-full rounded-md border border-border bg-muted text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  + Add
                </button>
              </>
            ) : (
              <div
                className="flex w-full items-center overflow-hidden rounded-md border border-border bg-card"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); if (quantity > 1) onDecrement(); else onRemove(); }}
                  className="flex h-7 flex-1 items-center justify-center bg-muted text-sm font-bold text-foreground transition-colors hover:bg-accent"
                >−</button>
                <span className="w-8 text-center text-[11px] font-semibold text-foreground">{quantity}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onIncrement(); }}
                  className="flex h-7 flex-1 items-center justify-center bg-muted text-sm font-bold text-foreground transition-colors hover:bg-accent"
                >+</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── CARD WITHOUT IMAGE ──────────────────────────────────────────────
  return (
    <div
      onClick={onCardClick}
      className={`relative flex flex-col overflow-visible rounded-xl border bg-card transition-all
      ${isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:shadow-sm'}`}
      style={{ minHeight: 130 }}
    >
      {discPct > 0 && (
        <div
          className="absolute -left-px -top-px z-10 rounded-[10px_0_8px_0] bg-primary text-center text-[8px] font-medium leading-tight text-primary-foreground"
          style={{ padding: '3px 6px', minWidth: 28 }}
        >
          {discPct}% OFF
        </div>
      )}

      {isSelected && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute right-2 top-1 z-10 border-none bg-transparent text-xs leading-none text-muted-foreground transition-colors hover:text-destructive"
        >
          <XIcon size={12} />
        </button>
      )}

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p
          className="flex min-h-[32px] items-start pr-4 text-[12px] font-medium leading-snug text-foreground"
          style={{
            marginTop: discPct > 0 ? 14 : 2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as any,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={item.name}
        >
          {item.name}
        </p>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-foreground">₹{Number(cp).toLocaleString('en-IN')}</span>
            {discPct > 0 && mrp > 0 && Number(cp) < mrp && (
              <span className="text-[10px] text-muted-foreground line-through">₹{mrp.toLocaleString('en-IN')}</span>
            )}
            {item.unit && <span className="ml-0.5 text-[9px] font-medium text-muted-foreground">({item.unit})</span>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex-shrink-0 text-muted-foreground transition-colors hover:text-primary"
          >
            <Pencil size={10} />
          </button>
        </div>

        <div className="mt-auto flex min-w-0 items-center justify-between gap-2 overflow-hidden pt-2" onClick={(e) => e.stopPropagation()}>
          {!isSelected ? (
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              className="w-full rounded-md border border-border bg-muted py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              + Add
            </button>
          ) : (
            <div className="flex w-full min-w-0 items-center justify-between gap-1">
              <div className="min-w-0 flex-shrink overflow-hidden text-left">
                <p className="text-[9px] uppercase leading-none tracking-wide text-muted-foreground">Subtotal</p>
                <p className="truncate text-[11px] font-semibold text-primary">₹{lineSubtotal.toLocaleString('en-IN')}</p>
              </div>

              <div className="flex flex-shrink-0 items-center overflow-hidden rounded-md border border-border bg-card">
                <button
                  onClick={(e) => { e.stopPropagation(); if (quantity > 1) onDecrement(); else onRemove(); }}
                  className="flex h-7 w-6 items-center justify-center bg-muted text-sm font-bold text-foreground transition-colors hover:bg-accent"
                >−</button>
                <span className="w-5 text-center text-xs font-semibold text-foreground">{quantity}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onIncrement(); }}
                  className="flex h-7 w-6 items-center justify-center bg-muted text-sm font-bold text-foreground transition-colors hover:bg-accent"
                >+</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
