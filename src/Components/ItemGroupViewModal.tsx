import React, { useEffect, useMemo, useState } from 'react';
import { FiX, FiSearch, FiTrash2, FiAlertTriangle, FiMoreHorizontal, FiPackage, FiCheck } from 'react-icons/fi';
import { IconEdit } from '../constants/Icons';
import type { ItemGroup } from '../constants/models';

// Same threshold the page uses elsewhere (stock < 10 = low)
const LOW_STOCK_THRESHOLD = 10;

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const initials = (name: string) => (name || '').trim().slice(0, 2).toUpperCase() || '—';

const StockBadge: React.FC<{ stock: number }> = ({ stock }) => {
  if (stock <= 0) {
    return <span className="inline-flex items-center h-5 px-2 rounded-sm text-xs font-semibold whitespace-nowrap bg-red-100 text-red-700">Out of stock</span>;
  }
  if (stock < LOW_STOCK_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-2 rounded-sm text-xs font-semibold whitespace-nowrap bg-amber-100 text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-current" />{stock} left
      </span>
    );
  }
  return <span className="inline-flex items-center h-5 px-2 rounded-sm text-xs font-semibold whitespace-nowrap bg-green-100 text-green-700">{stock} in stock</span>;
};

export interface ItemGroupViewModalProps {
  group: ItemGroup;
  /** ALL items that belong to this group (no search applied) */
  items: any[];
  isUncategorized: boolean;
  onClose: () => void;
  onEditItem: (item: any) => void;
  onDeleteItem: (item: any) => void;
  /** delete the group and all its items (parent shows the confirm modal) */
  onDeleteGroupAndItems: () => void;
  /** rename the group; throw on failure */
  onRename: (newName: string) => Promise<void>;
  theme: {
    primaryText: string;
    primaryHoverText: string;
    focusRing: string;
    primarySoftBg?: string;
  };
}

export const ItemGroupViewModal: React.FC<ItemGroupViewModalProps> = ({
  group, items, isUncategorized, onClose, onEditItem, onDeleteItem, onDeleteGroupAndItems, onRename, theme,
}) => {
  const [query, setQuery] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter(item => !q || (item.name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (q) {
          const aStarts = (a.name || '').toLowerCase().startsWith(q);
          const bStarts = (b.name || '').toLowerCase().startsWith(q);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
        }
        return (a.name || '').localeCompare(b.name || '');
      })
      .map(item => {
        const stock = item.stock || 0;
        const price = item.mrp || item.salesPrice || 0;
        const purchase = typeof item.purchasePrice === 'number' ? item.purchasePrice : 0;
        const hasPurchase = purchase > 0;
        return {
          item,
          stock,
          price,
          priceLabel: item.mrp ? 'MRP' : 'SP',
          purchase,
          hasPurchase,
          margin: hasPurchase && price > 0 ? Math.round(((price - purchase) / price) * 100) : null,
          value: stock * purchase,
        };
      });
  }, [items, query]);

  const missingPurchase = useMemo(
    () => items.filter(i => !(typeof i.purchasePrice === 'number' && i.purchasePrice > 0)),
    [items]
  );

  const startRename = () => { setRenameValue(group.name); setRenameError(null); setIsRenaming(true); };
  const saveRename = async () => {
    const next = renameValue.trim();
    if (!next || next === group.name) { setIsRenaming(false); return; }
    try {
      await onRename(next);
      setIsRenaming(false);
    } catch (e: any) {
      setRenameError(e?.message || 'Could not rename group.');
    }
  };

  const iconBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-sm transition-colors flex-shrink-0';
  const total = items.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-start lg:justify-center bg-slate-950/45 lg:pt-14 lg:px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Item group ${group.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full lg:max-w-[860px] bg-white rounded-sm lg:rounded-sm shadow-xl flex flex-col max-h-[88vh] lg:max-h-[calc(100vh-7rem)] overflow-hidden"
      >
        {/* Grab handle (phone) */}
        <div className="lg:hidden flex justify-center pt-2"><span className="w-10 h-1 rounded-sm bg-gray-300" /></div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-3 lg:px-6 lg:pt-5">
          <span className="w-10 h-10 flex-shrink-0 inline-flex items-center justify-center rounded-sm bg-green-50 text-green-700">
            <FiPackage size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500">
              {isUncategorized ? 'Not in any group' : 'Item group'}
              <span className="lg:hidden"> · {total} {total === 1 ? 'item' : 'items'}</span>
            </div>
            {isRenaming ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') { e.stopPropagation(); setIsRenaming(false); } }}
                  aria-label="Group name"
                  className={`flex-1 min-w-0 h-9 px-3 text-sm border border-gray-300 rounded-sm focus:outline-none focus:ring-2 ${theme.focusRing}`}
                />
                <button onClick={saveRename} aria-label="Save name" className={`${iconBtn} bg-green-600 hover:bg-green-700 text-white`}><FiCheck size={16} /></button>
                <button onClick={() => setIsRenaming(false)} aria-label="Cancel rename" className={`${iconBtn} text-slate-500 hover:bg-gray-100`}><FiX size={16} /></button>
              </div>
            ) : (
              <h2 className="flex items-center gap-1 text-lg lg:text-xl font-semibold text-slate-900 leading-tight min-w-0">
                <span className="truncate" title={group.name}>{group.name}</span>
                {!isUncategorized && (
                  <button onClick={startRename} aria-label="Rename group" className={`${iconBtn} text-slate-500 hover:bg-gray-100 ${theme.primaryHoverText}`}>
                    <IconEdit width={16} height={16} />
                  </button>
                )}
              </h2>
            )}
            {renameError && <p className="text-xs text-red-600 mt-1">{renameError}</p>}
          </div>
          <span className="hidden lg:inline-flex items-center h-6 px-2.5 rounded-sm text-[11px] font-semibold tracking-wide bg-gray-100 text-slate-600">
            {total} {total === 1 ? 'ITEM' : 'ITEMS'}
          </span>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 inline-flex items-center justify-center rounded-sm text-slate-500 hover:text-slate-900 hover:bg-gray-100 transition-colors flex-shrink-0">
            <FiX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 lg:px-6 lg:pb-4 flex flex-col gap-3">
          {missingPurchase.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-amber-50 text-amber-700 text-xs lg:text-[13px] leading-[19px] shrink-0">
              <FiAlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0">
                {missingPurchase.length === 1
                  ? <><b className="font-semibold">{missingPurchase[0].name}</b> has no purchase price</>
                  : <><b className="font-semibold">{missingPurchase.length} items</b> have no purchase price</>}
                <span className="hidden lg:inline">, so stock value shows ₹0 and profit can’t be worked out. </span>
                <span className="lg:hidden"> — stock value shows ₹0. </span>
                <button type="button" onClick={() => onEditItem(missingPurchase[0])} className="underline font-medium">Add purchase price</button>
              </span>
            </div>
          )}

          <label className="relative block shrink-0">
            <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search items in this group"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`w-full h-11 lg:h-[42px] pl-9 pr-3 border border-[#7a8aa3] rounded-sm bg-white text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${theme.focusRing}`}
            />
          </label>

          {rows.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-10">
              {query.trim() ? 'No matching items found.' : 'No items in this group.'}
            </p>
          ) : (
            <>
              {/* Desktop: table */}
              <div className="hidden lg:block shrink-0 border border-gray-200 rounded-sm overflow-clip shadow-sm">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      <th className="text-left px-3 py-2.5 sticky top-0 bg-gray-50">Item</th>
                      <th className="text-left px-3 py-2.5 sticky top-0 bg-gray-50">Stock</th>
                      <th className="text-right px-3 py-2.5 sticky top-0 bg-gray-50">MRP</th>
                      <th className="text-right px-3 py-2.5 sticky top-0 bg-gray-50">Purchase</th>
                      <th className="text-right px-3 py-2.5 sticky top-0 bg-gray-50">Margin</th>
                      <th className="text-right px-3 py-2.5 sticky top-0 bg-gray-50">Stock value</th>
                      <th className="w-20 sticky top-0 bg-gray-50" />
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.map(r => (
                      <tr key={r.item.id} className={`border-b border-gray-200 last:border-b-0 ${r.hasPurchase ? '' : 'bg-amber-50'}`}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 font-semibold text-slate-900 min-w-0">
                            <span className={`w-8 h-8 flex-shrink-0 inline-flex items-center justify-center rounded-sm text-[11px] font-semibold ${theme.primarySoftBg ?? 'bg-blue-50'} ${theme.primaryText}`}>{initials(r.item.name)}</span>
                            <span className="truncate max-w-[220px]" title={r.item.name}>{r.item.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5"><StockBadge stock={r.stock} /></td>
                        <td className="px-3 py-2.5 text-right">{inr(r.price)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {r.hasPurchase ? inr(r.purchase) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700"><FiAlertTriangle size={12} />Not set</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">{r.margin === null ? '—' : `${r.margin}%`}</td>
                        <td className={`px-3 py-2.5 text-right ${r.hasPurchase ? '' : 'text-slate-400'}`}>{inr(r.value)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-0.5">
                            <button onClick={() => onEditItem(r.item)} aria-label={`Edit ${r.item.name}`} className={`${iconBtn} text-slate-500 hover:bg-gray-100 ${theme.primaryHoverText}`}><IconEdit width={16} height={16} /></button>
                            <button onClick={() => onDeleteItem(r.item)} aria-label={`Delete ${r.item.name}`} className={`${iconBtn} text-slate-400 hover:text-red-600 hover:bg-red-50`}><FiTrash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3.5 py-2 text-xs text-slate-500 bg-gray-50 border-t border-gray-200">
                  Showing {rows.length} of {total} · Stock value = in stock × purchase price
                </div>
              </div>

              {/* Phone: cards */}
              <div className="lg:hidden flex flex-col gap-2.5">
                {rows.map(r => (
                  <div key={r.item.id} className={`rounded-sm border shadow-sm px-3.5 py-3 bg-white flex flex-col gap-2.5 ${r.hasPurchase ? 'border-gray-200' : 'border-amber-400'}`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`w-8 h-8 flex-shrink-0 inline-flex items-center justify-center rounded-sm text-[11px] font-semibold ${theme.primarySoftBg ?? 'bg-blue-50'} ${theme.primaryText}`}>{initials(r.item.name)}</span>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-slate-900 truncate">{r.item.name}</span>
                      <StockBadge stock={r.stock} />
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === r.item.id ? null : r.item.id)}
                          aria-label={`More actions for ${r.item.name}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === r.item.id}
                          className={`${iconBtn} text-slate-500 hover:bg-gray-100`}
                        >
                          <FiMoreHorizontal size={18} />
                        </button>
                        {openMenuId === r.item.id && (
                          <>
                            <button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpenMenuId(null)} />
                            <div role="menu" className="absolute right-0 top-9 z-20 w-40 py-1 bg-white border border-gray-200 rounded-sm shadow-lg">
                              <button role="menuitem" onClick={() => { setOpenMenuId(null); onEditItem(r.item); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-gray-50"><IconEdit width={16} height={16} />Edit item</button>
                              <button role="menuitem" onClick={() => { setOpenMenuId(null); onDeleteItem(r.item); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><FiTrash2 size={16} />Delete item</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <dl className="grid grid-cols-3 gap-1 m-0 tabular-nums">
                      <div><dt className="text-[11px] text-slate-500">{r.priceLabel}</dt><dd className="m-0 text-[13px] font-semibold text-slate-900">{inr(r.price)}</dd></div>
                      <div><dt className="text-[11px] text-slate-500">Purchase</dt><dd className="m-0 text-[13px] font-semibold text-slate-900">{r.hasPurchase ? inr(r.purchase) : <span className="text-amber-700">Not set</span>}</dd></div>
                      <div><dt className="text-[11px] text-slate-500">Stock value</dt><dd className="m-0 text-[13px] font-semibold text-slate-900">{inr(r.value)}</dd></div>
                    </dl>
                  </div>
                ))}
                <p className="text-center text-xs text-slate-500">Showing {rows.length} of {total}</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:px-6 border-t border-gray-200 bg-gray-50 pb-5 lg:pb-3">
          {(!isUncategorized || total > 0) ? (
            <button
              onClick={onDeleteGroupAndItems}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-sm text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <FiTrash2 size={16} />
              {isUncategorized ? `Empty Uncategorized (${total})` : `Delete group & ${total} ${total === 1 ? 'item' : 'items'}`}
            </button>
          ) : <span />}
          <button onClick={onClose} className="h-10 px-4 rounded-sm text-sm font-medium bg-white text-slate-700 border border-gray-300 hover:bg-gray-50 transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
};

export default ItemGroupViewModal;