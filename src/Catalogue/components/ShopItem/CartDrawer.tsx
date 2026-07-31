import { Minus, Package, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import type { Item } from '../../../constants/models';
import { formatCurrency } from '../../../utils/formatters';
import { getEffectivePriceInfo } from './pdfExport';

export interface CartLine {
  item: Item;
  quantity: number;
}

export interface CartDrawerProps {
  isOpen: boolean;
  cart: CartLine[];
  cartCount: number;
  cartTotal: number;
  onClose: () => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onRemoveFromCart: (itemId: string) => void;
}

/** Slide-in cart drawer showing selected items, quantity steppers, and the subtotal. */
export function CartDrawer({ isOpen, cart, cartCount, cartTotal, onClose, onUpdateQuantity, onRemoveFromCart }: CartDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-card shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Your Cart ({cartCount})</h2>
          <button onClick={onClose} className="rounded-md p-2 transition-colors hover:bg-muted">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ShoppingCart size={48} strokeWidth={1} />
              <p className="text-xs font-bold uppercase tracking-widest">Cart is empty</p>
            </div>
          ) : (
            cart.map(({ item, quantity }) => {
              const { salePrice, mrp, hasBothPrices } = getEffectivePriceInfo(item);
              return (
                <div key={item.id} className="flex gap-4 rounded-md border border-border bg-muted p-3">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-border bg-card">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-full w-full p-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-[10px] font-black uppercase text-primary">{item.name}</h4>
                    <p className="text-xs font-black text-foreground">
                      {formatCurrency(salePrice)}
                      {hasBothPrices && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground line-through">
                          {formatCurrency(mrp)}
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
                        <button onClick={() => onUpdateQuantity(item.id!, -1)} className="text-muted-foreground hover:text-primary">
                          <Minus size={14} />
                        </button>
                        <span className="w-4 text-center text-xs font-black">{quantity}</span>
                        <button onClick={() => onUpdateQuantity(item.id!, 1)} className="text-muted-foreground hover:text-primary">
                          <Plus size={14} />
                        </button>
                      </div>
                      <button onClick={() => onRemoveFromCart(item.id!)} className="ml-auto text-destructive hover:text-destructive/80">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {cart.length > 0 && (
          <div className="space-y-4 border-t border-border bg-muted p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-muted-foreground">Subtotal</span>
              <span className="text-lg font-black text-foreground">{formatCurrency(cartTotal)}</span>
            </div>
            <button className="w-full rounded-md bg-primary py-4 text-xs font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
              Checkout Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
