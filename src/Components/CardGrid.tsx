import { useState, useMemo } from 'react';
import { FiEdit, FiCamera } from 'react-icons/fi';
import type { Item } from '../constants/models';
import { State } from '../enums';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CardGridItem extends Partial<Item> {
  id: string;
  name: string;
  mrp?: number;
  salesPrice?: number;
  barcode?: string;
  itemGroupId?: string;
  image?: string;
  imageUrl?: string | null | undefined;
  thumbnail?: string;
  imageURL?: string;
  [key: string]: any;
}

export interface CartEntry {
  cartId: string;     // unique id of the cart row
  productId: string;  // item.id this row belongs to
  quantity: number;
  customPrice?: number | string;
}

interface GenericCartGridProps {
  /** All items available to browse */
  items: Item[];

  /** Current cart entries (used to compute selection state per card) */
  cartEntries: CartEntry[];

  /** Group id → display name map for category chips */
  itemGroupMap?: Record<string, string>;

  /** Base price key to read from the item (e.g. 'salesPrice' | 'mrp') — mirrors basePriceKey in GenericCartList */
  basePriceKey: keyof Item;
  externalSearchQuery?: string;
  settings: {
    showImages: boolean;
    hideMrp?: boolean;
  };

  /** State enum for modal types */
  State: typeof State;

  /** Modal setter function */
  setModal: (modal: { message: string; type: State; onConfirm?: () => void } | null) => void;

  /** Called when the user taps "+ Add" on an item not yet in cart */
  onAddItem: (item: Item) => void;

  /** Called when the user increments qty for a specific cart row */
  onQuantityChange: (cartId: string, newQuantity: number) => void;

  /** Called when the user removes a specific cart row (quantity reaches 0) */
  onDeleteCartEntry: (cartId: string) => void;

  /** Called when the edit (pencil) icon is tapped */
  onEditItem: (item: Item) => void;

  /** Called when scan barcode button is clicked */
  onScanBarcode: () => void;
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortOrder = 'az' | 'za' | 'price_asc' | 'price_desc';

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const GenericCartGrid = ({
  items,
  cartEntries,
  itemGroupMap = {},
  basePriceKey,
  externalSearchQuery,
  settings,
  onAddItem,
  onQuantityChange,
  onDeleteCartEntry,
  onEditItem,
}: GenericCartGridProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortOrder, setSortOrder] = useState<SortOrder>('az');

  const { showImages, hideMrp } = settings;

  // ── Category list derived from items ───────────────────────────────────────
  const categories = useMemo(() => {
    const groups = new Set(items.map(i => i.itemGroupId || 'Others'));
    return ['All', ...Array.from(groups).sort()];
  }, [items]);

  // ── Filtered + sorted items ─────────────────────────────────────────────────
  const visibleItems = useMemo(() => {
    const q = (externalSearchQuery ?? '').toLowerCase();
    const filtered = items.filter(item => {
      const groupId = item.itemGroupId || 'Others';
      const matchesCategory = selectedCategory === 'All' || groupId === selectedCategory;
      const matchesSearch =
        q === '' ||
        item.name.toLowerCase().includes(q) ||
        (item.barcode?.includes(q) ?? false);
      return matchesCategory && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      const aPrice = Number(a[basePriceKey]) || 0;
      const bPrice = Number(b[basePriceKey]) || 0;
      switch (sortOrder) {
        case 'az': return a.name.localeCompare(b.name);
        case 'za': return b.name.localeCompare(a.name);
        case 'price_asc': return aPrice - bPrice;
        case 'price_desc': return bPrice - aPrice;
        default: return 0;
      }
    });
  }, [items, selectedCategory, externalSearchQuery, sortOrder, basePriceKey]);

  // ── Per-item cart helpers ──────────────────────────────────────────────────
  const getCartEntriesForItem = (itemId: string) =>
    cartEntries.filter(e => e.productId === itemId);

  const getTotalQuantity = (itemId: string) =>
    getCartEntriesForItem(itemId).reduce((sum, e) => sum + e.quantity, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Category chips ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex gap-2 overflow-x-auto px-3 py-2 bg-white border-b border-gray-200">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-sm text-xs whitespace-nowrap border transition flex-shrink-0 ${selectedCategory === cat
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
              }`}
          >
            {cat === 'All' ? 'All' : itemGroupMap[cat] || cat}
          </button>
        ))}
      </div>

      {/* ── Sort chips ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex gap-1.5 items-center px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap flex-shrink-0">
          Sort:
        </span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setSortOrder(opt.value)}
            className={`px-2.5 py-1 rounded-sm text-xs whitespace-nowrap border transition flex-shrink-0 ${sortOrder === opt.value
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {/* ── Card Grid ───────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5 bg-gray-100 pb-20"
        style={{ gridAutoRows: 'auto', alignContent: 'start', gap: '14px', padding: '8px 14px' }}
      >
        {visibleItems.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-sm">No items found</p>
          </div>
        ) : (
          visibleItems.map(item => {
            const itemCartEntries = getCartEntriesForItem(item.id!);
            const totalQuantity = getTotalQuantity(item.id!);
            const isSelected = totalQuantity > 0;                          // ✅ define here
            const lastEntry = itemCartEntries[itemCartEntries.length - 1];

            const mrp = Number(item.mrp) || 0;
const basePrice = Number(item[basePriceKey]) || 0;             // ✅ use basePriceKey, not hardcoded mrp

            const resolvedPrice = isSelected && lastEntry?.customPrice !== undefined  // ✅ isSelected now valid
              ? Number(lastEntry.customPrice)
              : basePrice;

            const sharedCardProps = {
              item,
              cartEntries: itemCartEntries,
              totalQuantity,
              hideMrp,
              resolvedPrice,
              basePrice: mrp,
              onAdd: () => onAddItem(item),
              onIncrement: (cartId: string, qty: number) => onQuantityChange(cartId, qty + 1),
              onDecrement: (_cartId: string, qty: number, cartEntryId: string) => {
                if (qty > 1) onQuantityChange(cartEntryId, qty - 1);
                else onDeleteCartEntry(cartEntryId);
              },
              onDelete: onDeleteCartEntry,
              onEdit: () => onEditItem(item),
            };

            return showImages
              ? <CardWithImage key={item.id!} {...sharedCardProps} />
              : <CardWithoutImage key={item.id!} {...sharedCardProps} />;
          })
        )}
      </div>
    </div>
  );
};

// ─── Shared card prop types ────────────────────────────────────────────────────

interface CardProps {
  item: Item;
  cartEntries: CartEntry[];
  totalQuantity: number;
  hideMrp?: boolean;
  /** Already-resolved display price (customPrice → basePriceKey fallback) */
  resolvedPrice: number;
  /** Raw base price from basePriceKey */
  basePrice: number;
  onAdd: () => void;
  onIncrement: (cartId: string, qty: number) => void;
  onDecrement: (cartId: string, qty: number, cartEntryId: string) => void;
  onDelete: (cartId: string) => void;
  onEdit: () => void;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function getDiscountPct(mrp: number, resolvedPrice: number, hideMrp?: boolean): number {
  if (!hideMrp && mrp > 0 && resolvedPrice < mrp) {
    return Math.round(((mrp - resolvedPrice) / mrp) * 100);
  }
  return 0;
}

function getLineSubtotal(resolvedPrice: number, totalQty: number): number {
  return Math.round(resolvedPrice * totalQty * 100) / 100;
}

// ─── Card with Image ───────────────────────────────────────────────────────────

function CardWithImage({
  item, cartEntries, totalQuantity, hideMrp,
  resolvedPrice, basePrice,
  onAdd, onIncrement, onDecrement, onDelete, onEdit,
}: CardProps) {
  const isSelected = totalQuantity > 0;
  const lastEntry = cartEntries[cartEntries.length - 1];
  const discPct = getDiscountPct(basePrice, resolvedPrice, hideMrp);
  const lineSubtotal = getLineSubtotal(resolvedPrice, totalQuantity);
  const imageUrl: string | undefined = item.imageUrl ?? undefined;

  return (
    <div
      onClick={() => {
        if (isSelected && lastEntry) onIncrement(lastEntry.cartId, lastEntry.quantity);
        else onAdd();
      }}
      className={`bg-white rounded-sm flex flex-col w-full overflow-visible transition-all duration-200 relative group cursor-pointer ${isSelected
        ? 'border-2 border-blue-400 shadow-md ring-1 ring-blue-100'
        : 'border border-gray-100 hover:shadow-md hover:border-gray-200'
        }`}
    >
      {/* Image block */}
      <div className="relative w-full bg-gray-100 rounded-t-sm overflow-hidden" style={{ height: 140 }}>
        <div className="w-full h-full flex items-center justify-center p-1.5">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const ph = (e.currentTarget as HTMLImageElement)
                  .parentElement?.querySelector<HTMLElement>('[data-no-image]');
                if (ph) ph.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            data-no-image
            className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50"
            style={{ display: imageUrl ? 'none' : 'flex' }}
          >
            <FiCamera className="text-gray-300" size={22} strokeWidth={1.4} />
            <span className="text-[9px] text-gray-300 mt-1 uppercase tracking-wide font-medium">
              No Image
            </span>
          </div>
        </div>

        {discPct > 0 && (
          <div className="absolute top-1.5 left-1.5 z-10 bg-blue-600 text-white font-bold text-[9px] leading-tight px-1.5 py-[3px] rounded-md shadow-sm">
            {discPct}% OFF
          </div>
        )}

        {isSelected && lastEntry && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(lastEntry.cartId); }}
            className="absolute top-1 right-1.5 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-[10px] font-bold shadow-sm border border-gray-100"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-1.5 sm:p-2 flex flex-col flex-1 gap-0.5">
        <div className="flex items-start justify-between gap-1" style={{ minHeight: 28 }}>
          <p
            className="text-[11px] font-bold text-gray-900 leading-snug flex-1 overflow-hidden"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}
            title={item.name}
          >
            {item.name}
          </p>
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="text-gray-400 hover:text-blue-600 flex-shrink-0 mt-0.5"
          >
            <FiEdit size={11} />
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-1 pt-1 border-t border-gray-50">
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-semibold text-gray-900">
              ₹{Number(resolvedPrice).toLocaleString('en-IN')}
            </span>
            {discPct > 0 && basePrice > 0 && resolvedPrice < basePrice && (
              <span className="text-[10px] text-gray-400 line-through">
                ₹{basePrice.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {isSelected && (
            <div className="flex items-center gap-1 border-t border-gray-50 pt-1 min-w-0">
              <span className="text-[9px] uppercase text-gray-400 tracking-wide flex-shrink-0">Subtotal</span>
              <span className="text-[10px] font-semibold text-blue-600 truncate">
                ₹{lineSubtotal.toLocaleString('en-IN')}
              </span>
            </div>
          )}

          {!isSelected ? (
            <>
              <div className="h-[18px] border-t border-gray-50" />
              <button
                onClick={e => { e.stopPropagation(); onAdd(); }}
                className="w-full h-[26px] rounded-sm text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
              >
                + Add
              </button>
            </>
          ) : lastEntry ? (
            <QtyControl
              quantity={totalQuantity}
              onDecrement={() => onDecrement(lastEntry.cartId, lastEntry.quantity, lastEntry.cartId)}
              onIncrement={() => onIncrement(lastEntry.cartId, lastEntry.quantity)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Card without Image ────────────────────────────────────────────────────────

function CardWithoutImage({
  item, cartEntries, totalQuantity, hideMrp,
  resolvedPrice, basePrice,
  onAdd, onIncrement, onDecrement, onDelete, onEdit,
}: CardProps) {
  const isSelected = totalQuantity > 0;
  const lastEntry = cartEntries[cartEntries.length - 1];
  const discPct = getDiscountPct(basePrice, resolvedPrice, hideMrp);
  const lineSubtotal = getLineSubtotal(resolvedPrice, totalQuantity);

  return (
    <div
      onClick={() => {
        if (isSelected && lastEntry) onIncrement(lastEntry.cartId, lastEntry.quantity);
        else onAdd();
      }}
      className={`bg-white rounded-sm border flex flex-col overflow-visible transition-all relative ${isSelected ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-100 hover:shadow-sm'}`}
      style={{ minHeight: 130 }}
    >
      {discPct > 0 && (
        <div
          className="absolute -top-px -left-px bg-blue-600 text-white text-[8px] font-medium leading-tight text-center z-10"
          style={{ borderRadius: '10px 0 8px 0', padding: '3px 6px', minWidth: 28 }}
        >
          {discPct}% OFF
        </div>
      )}

      {isSelected && lastEntry && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(lastEntry.cartId); }}
          className="absolute top-1 right-2 text-gray-400 hover:text-red-500 transition-colors z-10 bg-transparent border-none cursor-pointer text-xs leading-none"
        >
          ✕
        </button>
      )}

      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <p
          className="text-[12px] font-medium text-gray-900 leading-snug pr-4 min-h-[32px] flex items-start"
          style={{
            marginTop: discPct > 0 ? 14 : 2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as any,
            overflow: 'hidden',
          }}
          title={item.name}
        >
          {item.name}
        </p>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-gray-900">
              ₹{Number(resolvedPrice).toLocaleString('en-IN')}
            </span>
            {discPct > 0 && basePrice > 0 && resolvedPrice < basePrice && (
              <span className="text-[10px] text-gray-400 line-through">
                ₹{basePrice.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
          >
            <FiEdit size={10} />
          </button>
        </div>

        <div className="mt-auto pt-2 flex items-center justify-between gap-2 min-w-0 overflow-hidden">
          {!isSelected ? (
            <button
              onClick={e => { e.stopPropagation(); onAdd(); }}
              className="w-full py-1.5 rounded-sm text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
            >
              + Add
            </button>
          ) : lastEntry ? (
            <div className="flex items-center justify-between gap-1 w-full min-w-0 overflow-hidden">
              <div className="text-left min-w-0 flex-shrink overflow-hidden">
                <p className="text-[9px] uppercase text-gray-400 tracking-wide leading-none">Subtotal</p>
                <p className="text-[11px] font-semibold text-blue-600 truncate">
                  ₹{lineSubtotal.toLocaleString('en-IN')}
                </p>
              </div>
              <QtyControl
                quantity={totalQuantity}
                compact
                onDecrement={() => onDecrement(lastEntry.cartId, lastEntry.quantity, lastEntry.cartId)}
                onIncrement={() => onIncrement(lastEntry.cartId, lastEntry.quantity)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Qty Control ───────────────────────────────────────────────────────────────

function QtyControl({
  quantity,
  compact,
  onDecrement,
  onIncrement,
}: {
  quantity: number;
  compact?: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <div className={`flex items-center border border-gray-200 rounded-sm overflow-hidden bg-white ${compact ? 'flex-shrink-0' : 'w-full'}`}>
      <button
        onClick={e => { e.stopPropagation(); onDecrement(); }}
        className={`flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors h-7 ${compact ? 'w-6' : 'flex-1'}`}
      >
        −
      </button>
      <span className={`text-center text-[11px] font-semibold text-gray-800 ${compact ? 'w-5' : 'w-8'}`}>
        {quantity}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onIncrement(); }}
        className={`flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors h-7 ${compact ? 'w-6' : 'flex-1'}`}
      >
        +
      </button>
    </div>
  );
}