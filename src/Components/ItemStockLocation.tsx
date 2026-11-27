import React, { useMemo, useState } from 'react';
import { FiRepeat } from 'react-icons/fi';
import { Store, Warehouse } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import {
  useGodowns, useGodownStock, useStockTransfers, SHOP_ID,
} from '../Pages/hooks/useStockTransfer';
import { TransferStockModal } from './TransferStockModal';

interface Props {
  itemId: string;
  itemName: string;
  unit?: string;
  barcode?: string;
  theme: 'blue' | 'orange';
  /** compact = no card wrapper (used inside the Stock card on phones) */
  compact?: boolean;
  /** Called after a transfer succeeds so the drawer can refresh its stock field */
  onTransferred: () => void | Promise<void>;
}

export const ItemStockLocations: React.FC<Props> = ({
  itemId, itemName, unit, barcode, theme, compact = false, onTransferred,
}) => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const { godowns } = useGodowns(companyId);
  const { stockRows } = useGodownStock(companyId, godowns);
  const { transferStock } = useStockTransfers(companyId, null);
  const [open, setOpen] = useState(false);

  // Only this item's rows
  const rows = useMemo(() => stockRows.filter((r) => r.itemId === itemId), [stockRows, itemId]);
  const hasSecondLocation = godowns.length > 0;

  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">Stock locations</div>

      {rows.length === 0 ? (
        <p className="m-0 text-xs text-[#5b6b86]">No stock recorded in any location.</p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {rows.map((r) => {
            const isShop = r.godownId === SHOP_ID;
            const Icon = isShop ? Store : Warehouse;
            return (
              <li key={r.godownId} className="flex items-center gap-2 text-[13px]">
                <Icon size={14} className="shrink-0 text-(--dr-primary)" />
                <span className="min-w-0 flex-1 truncate text-[#45556c]">{r.godownName}</span>
                <span className="font-semibold tabular-nums text-[#0f172b]">{r.quantity.toLocaleString('en-IN')} pcs</span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasSecondLocation || rows.length === 0}
        title={!hasSecondLocation ? 'Add a godown first' : rows.length === 0 ? 'No stock to move' : undefined}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border border-[#7a8aa3] bg-white px-3 text-xs font-medium text-[#0f172b] hover:bg-(--dr-sunken) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--dr-primary) disabled:pointer-events-none disabled:opacity-45"
      >
        <FiRepeat size={14} /> Transfer stock
      </button>
      <small className="text-[11px] leading-[15px] text-[#5b6b86]">
        {hasSecondLocation ? 'Transfers are saved immediately.' : 'Add a godown in Stock transfer to move stock.'}
      </small>

      <TransferStockModal
        isOpen={open}
        onClose={() => setOpen(false)}
        items={[{ id: itemId, name: itemName, unit, barcode }]}
        godowns={godowns}
        stockRows={rows}
        theme={theme}
        initialItemId={itemId}
        onSave={async (data) => {
          await transferStock(companyId!, data);
          await onTransferred();
        }}
      />
    </>
  );

  return compact ? (
    <div className="grid gap-2">{body}</div>
  ) : (
    <div className="grid gap-2 rounded-sm border border-(--dr-line) bg-white p-3.5 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]">
      {body}
    </div>
  );
};