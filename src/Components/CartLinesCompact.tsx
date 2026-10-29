export interface CompactCartLine {
  id: string;
  name: string;
  quantity: number;
}

interface CartLinesCompactProps<T extends CompactCartLine> {
  items: T[];
  getUnitPrice: (item: T) => number;
  onQuantityChange: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
}

// Desktop side-panel cart lines (name, line total, "qty × ₹unit", −/+ stepper).
// Shared by Sales and Purchase so both panels list what's in the bill.
export const CartLinesCompact = <T extends CompactCartLine>({
  items,
  getUnitPrice,
  onQuantityChange,
  onDelete,
}: CartLinesCompactProps<T>) => (
  <div>
    {items.map((i) => {
      const unit = Number(getUnitPrice(i) || 0);
      return (
        <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 py-2.5 border-b border-[#dfe6fb] items-center">
          <b className="text-[13px] font-medium text-[#0f172b] truncate">{i.name}</b>
          <b className="text-[13px] font-medium text-[#0f172b] tabular-nums">₹{(unit * i.quantity).toLocaleString('en-IN')}</b>
          <span className="text-xs text-[#5b6b86]">{i.quantity} × ₹{unit.toLocaleString('en-IN')}</span>
          <div className="inline-flex items-center border border-[#7a8aa3] rounded-sm bg-white h-7 justify-self-end">
            <button onClick={() => i.quantity > 1 ? onQuantityChange(i.id, i.quantity - 1) : onDelete(i.id)} aria-label="Less" className="w-6 h-[26px] text-[#45556c]">−</button>
            <span className="min-w-[20px] text-center text-xs font-semibold tabular-nums">{i.quantity}</span>
            <button onClick={() => onQuantityChange(i.id, i.quantity + 1)} aria-label="More" className="w-6 h-[26px] text-[#45556c]">+</button>
          </div>
        </div>
      );
    })}
  </div>
);
