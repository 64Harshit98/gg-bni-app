import React from 'react';
import { Search, Menu, Trash2, X as XIcon } from 'lucide-react';
import type { Item } from '../../../constants/models';
import { IconScanCircle } from '../../../constants/Icons';
import { PurchaseItemCard, type PurchaseGridCardData } from './PurchaseItemCard';
import { EmptyState } from '../../../Components/ui/empty-state';

export type PurchaseGridSortOrder = 'az' | 'za' | 'price_asc' | 'price_desc';

interface CartLikeItem {
  id: string;
  productId?: string;
  quantity: number;
  purchasePrice: number | string;
}

interface PurchaseCatalogGridProps {
  sortedGridItems: Item[];
  cartItems: CartLikeItem[];
  categories: string[];
  itemGroupMap: Record<string, string>;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  gridSearchQuery: string;
  onGridSearchQueryChange: (value: string) => void;
  sortOrder: PurchaseGridSortOrder;
  onSortOrderChange: (order: PurchaseGridSortOrder) => void;
  isSearchOpen: boolean;
  onToggleSearchOpen: () => void;
  isSortOpen: boolean;
  onToggleSortOpen: () => void;
  isCardImageView: boolean;
  globalDefaultDiscount: number;
  cartItemCount: number;
  onOpenScanner: () => void;
  onClearCart: () => void;
  onAddItem: (item: Item) => void;
  onIncrementCartItem: (cartItemId: string, nextQuantity: number) => void;
  onDecrementCartItem: (cartItemId: string, nextQuantity: number) => void;
  onRemoveCartItem: (cartItemId: string) => void;
  onEditItem: (item: Item) => void;
}

const SORT_OPTIONS: { value: PurchaseGridSortOrder; label: string; shortLabel: string }[] = [
  { value: 'az', label: 'A → Z', shortLabel: 'A-Z' },
  { value: 'za', label: 'Z → A', shortLabel: 'Z-A' },
  { value: 'price_asc', label: 'Price ↑', shortLabel: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓', shortLabel: 'Price ↓' },
];

/**
 * Card-view catalogue grid for the Purchase page: search/category/sort
 * toolbar (mobile + desktop variants) plus the responsive grid of
 * `PurchaseItemCard`s. Extracted verbatim (styling reskinned onto design
 * tokens) from `Purchase.tsx`'s `isCardView` render branch.
 */
export const PurchaseCatalogGrid: React.FC<PurchaseCatalogGridProps> = ({
  sortedGridItems,
  cartItems,
  categories,
  itemGroupMap,
  selectedCategory,
  onSelectCategory,
  gridSearchQuery,
  onGridSearchQueryChange,
  sortOrder,
  onSortOrderChange,
  isSearchOpen,
  onToggleSearchOpen,
  isSortOpen,
  onToggleSortOpen,
  isCardImageView,
  globalDefaultDiscount,
  cartItemCount,
  onOpenScanner,
  onClearCart,
  onAddItem,
  onIncrementCartItem,
  onDecrementCartItem,
  onRemoveCartItem,
  onEditItem,
}) => {
  const buildCardData = (item: Item): PurchaseGridCardData => {
    const matchingCartItems = cartItems.filter((i) => i.productId === item.id);
    const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
    const isSelected = matchingCartItems.length > 0;
    const quantity = lastAddedCartItem?.quantity || 0;
    const mrp = item.mrp || 0;
    const masterPurchasePrice = Number(item.purchasePrice || 0);
    const masterPurchaseDiscount = (item as any).purchasediscount || 0;
    const salesPriceBase = Number((item as any).salesPrice || 0);

    let effectiveDisplayPrice = 0;
    let effectiveDiscPct = 0;

    if (lastAddedCartItem) {
      effectiveDisplayPrice = Number(lastAddedCartItem.purchasePrice ?? 0);
      const badgeBase = mrp > 0 ? mrp : salesPriceBase;
      effectiveDiscPct = badgeBase > 0 && effectiveDisplayPrice < badgeBase
        ? Math.round(((badgeBase - effectiveDisplayPrice) / badgeBase) * 100)
        : 0;
    } else if (masterPurchasePrice > 0) {
      effectiveDisplayPrice = masterPurchasePrice;
      const badgeBase = mrp > 0 ? mrp : salesPriceBase;
      effectiveDiscPct = badgeBase > 0 && masterPurchasePrice < badgeBase
        ? Math.round(((badgeBase - masterPurchasePrice) / badgeBase) * 100)
        : 0;
    } else if (mrp > 0) {
      if (masterPurchaseDiscount > 0) {
        effectiveDisplayPrice = mrp * (1 - masterPurchaseDiscount / 100);
        effectiveDiscPct = masterPurchaseDiscount;
      } else if (globalDefaultDiscount > 0) {
        effectiveDisplayPrice = mrp * (1 - globalDefaultDiscount / 100);
        effectiveDiscPct = globalDefaultDiscount;
      } else {
        effectiveDisplayPrice = mrp;
        effectiveDiscPct = 0;
      }
    } else if (salesPriceBase > 0) {
      if (masterPurchaseDiscount > 0) {
        effectiveDisplayPrice = salesPriceBase * (1 - masterPurchaseDiscount / 100);
        effectiveDiscPct = masterPurchaseDiscount;
      } else if (globalDefaultDiscount > 0) {
        effectiveDisplayPrice = salesPriceBase * (1 - globalDefaultDiscount / 100);
        effectiveDiscPct = globalDefaultDiscount;
      } else {
        effectiveDisplayPrice = salesPriceBase;
        effectiveDiscPct = 0;
      }
    }

    const cp = effectiveDisplayPrice;
    const discPct = effectiveDiscPct;
    const lineSubtotal = Math.round((Number(cp) * quantity) * 100) / 100;

    return {
      item,
      isSelected,
      quantity,
      mrp,
      cp,
      discPct,
      lineSubtotal,
    };
  };

  const handleCardClick = (data: PurchaseGridCardData) => {
    if (data.isSelected) {
      const matchingCartItems = cartItems.filter((i) => i.productId === data.item.id);
      const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
      if (lastAddedCartItem) onIncrementCartItem(lastAddedCartItem.id, data.quantity + 1);
    } else {
      onAddItem(data.item);
    }
  };

  return (
    <div className="flex w-full flex-col overflow-hidden border-r border-border md:w-3/4">
      <div className="flex-shrink-0 border-b border-border bg-muted">
        {/* MOBILE: single toolbar row */}
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 md:hidden">
          <button
            onClick={onToggleSearchOpen}
            className={`flex-shrink-0 rounded-md border p-2 transition-colors ${isSearchOpen ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground'}`}
            title="Search"
          >
            <Search size={16} />
          </button>

          <div className="scrollbar-hide flex flex-1 gap-1.5 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => onSelectCategory(cat)}
                className={`flex-shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs transition
                  ${selectedCategory === cat ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-foreground'}`}
              >
                {cat === 'All' ? 'All' : itemGroupMap[cat] || 'uncategorized'}
              </button>
            ))}
          </div>

          <div className="relative flex-shrink-0">
            <button
              onClick={onToggleSortOpen}
              className={`rounded-md border p-2 transition-colors ${isSortOpen ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground'}`}
              title="Sort"
            >
              <Menu size={16} />
            </button>

            {isSortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={onToggleSortOpen} />
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[100px] rounded-md border border-border bg-card shadow-lg">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { onSortOrderChange(opt.value); onToggleSortOpen(); }}
                      className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors
                        ${sortOrder === opt.value ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-muted'}`}
                    >
                      {opt.shortLabel}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* MOBILE: expandable search bar + camera */}
        {isSearchOpen && (
          <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 md:hidden">
            <div className="relative flex-grow">
              <input
                type="text"
                value={gridSearchQuery}
                onChange={(e) => onGridSearchQueryChange(e.target.value)}
                placeholder="Search items by name or barcode..."
                className="w-full rounded-md border border-border px-3 py-2 pr-8 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-ring"
                autoComplete="off"
                autoFocus
              />
              {gridSearchQuery && (
                <button
                  onClick={() => onGridSearchQueryChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
            <button
              onClick={onOpenScanner}
              className="flex-shrink-0 rounded-md bg-primary p-3 text-primary-foreground transition-colors hover:opacity-90"
              title="Scan Barcode"
            >
              <IconScanCircle width={22} height={22} />
            </button>
          </div>
        )}

        {/* DESKTOP: search bar */}
        <div className="hidden items-center gap-2 bg-card p-3 md:flex">
          <div className="relative flex-grow">
            <input
              type="text"
              value={gridSearchQuery}
              onChange={(e) => onGridSearchQueryChange(e.target.value)}
              placeholder="Search items by name or barcode..."
              className="w-full rounded-md border border-border px-3 py-2 pr-8 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-ring"
              autoComplete="off"
            />
            {gridSearchQuery && (
              <button
                onClick={() => onGridSearchQueryChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>
          <button
            onClick={onOpenScanner}
            className="rounded-md bg-primary p-3 text-primary-foreground transition-colors hover:opacity-90"
            title="Scan Barcode"
          >
            <IconScanCircle width={22} height={22} />
          </button>
        </div>

        {/* DESKTOP: category pills */}
        <div className="hidden gap-2 overflow-x-auto border-b border-border bg-card px-3 pb-3 md:flex">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onSelectCategory(cat)}
              className={`whitespace-nowrap rounded-md border px-3 py-1 text-xs transition
                ${selectedCategory === cat ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-foreground hover:bg-muted'}`}
            >
              {cat === 'All' ? 'All' : itemGroupMap[cat] || 'uncategorized'}
            </button>
          ))}
        </div>

        {/* DESKTOP: sort bar */}
        <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-card px-3 py-2 md:flex">
          <span className="flex-shrink-0 whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground">Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSortOrderChange(opt.value)}
              className={`flex-shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs transition
                ${sortOrder === opt.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground hover:bg-muted'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 items-center border-b border-border bg-card px-3 pb-2 pt-2">
          <div className="justify-self-start">
            <h3 className="font-medium text-foreground">Cart</h3>
          </div>
          <div className="justify-self-center" />
          <div className="justify-self-end">
            {cartItemCount > 0 && (
              <button
                onClick={onClearCart}
                className="flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs text-destructive"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className="grid flex-1 grid-cols-2 overflow-y-auto bg-muted sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5"
        style={{ gridAutoRows: 'auto', alignContent: 'start', gap: '14px', padding: '8px 14px' }}
      >
        {sortedGridItems.length === 0 ? (
          <div className="col-span-full mt-6">
            <EmptyState
              icon={<Search />}
              title={gridSearchQuery ? `No items found for "${gridSearchQuery}"` : 'Start typing to search items'}
              description={gridSearchQuery ? 'Try searching with different keywords or scan a barcode.' : 'Search by name or scan a barcode to add items.'}
            />
          </div>
        ) : (
          sortedGridItems.map((item) => {
            const data = buildCardData(item);
            return (
              <PurchaseItemCard
                key={item.id}
                data={data}
                withImage={isCardImageView}
                onCardClick={() => handleCardClick(data)}
                onAdd={() => onAddItem(item)}
                onIncrement={() => {
                  const matchingCartItems = cartItems.filter((i) => i.productId === item.id);
                  const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
                  if (lastAddedCartItem) onIncrementCartItem(lastAddedCartItem.id, data.quantity + 1);
                }}
                onDecrement={() => {
                  const matchingCartItems = cartItems.filter((i) => i.productId === item.id);
                  const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
                  if (lastAddedCartItem) onDecrementCartItem(lastAddedCartItem.id, data.quantity - 1);
                }}
                onRemove={() => {
                  const matchingCartItems = cartItems.filter((i) => i.productId === item.id);
                  const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
                  if (lastAddedCartItem) onRemoveCartItem(lastAddedCartItem.id);
                }}
                onEdit={() => onEditItem(item)}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
