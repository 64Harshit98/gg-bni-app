import React, { useEffect, useMemo, useState } from 'react';
import type { Item } from '../constants/models';

interface BarcodeLinkModalProps {
  isOpen: boolean;
  barcode: string | null;
  items: Item[];
  isLinking: boolean;
  onClose: () => void;
  onLink: (item: Item) => void;
}

const BarcodeLinkModal: React.FC<BarcodeLinkModalProps> = ({
  isOpen,
  barcode,
  items,
  isLinking,
  onClose,
  onLink
}) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen, barcode]);

  const itemsWithoutBarcode = useMemo(() => {
    return items.filter((item) => !(item.barcode || '').trim());
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return itemsWithoutBarcode;

    return itemsWithoutBarcode.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const group = (item.itemGroupId || '').toLowerCase();
      const hsn = (item.hsnSac || '').toLowerCase();
      return name.includes(query) || group.includes(query) || hsn.includes(query);
    });
  }, [itemsWithoutBarcode, search]);

  if (!isOpen || !barcode) return null;

  return (
    <div className="fixed inset-0 z-[2100] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl p-5">
        <h3 className="text-lg font-bold text-slate-800">Link Scanned Barcode</h3>
        <p className="text-sm text-slate-600 mt-1">
          Barcode: <span className="font-semibold">{barcode}</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Select the existing item (without barcode) to link this barcode.
        </p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item by name/group/HSN..."
          className="w-full mt-4 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="mt-3 max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filteredItems.length === 0 ? (
            <p className="p-4 text-sm text-slate-500 text-center">No items found without barcode.</p>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id || item.name} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    MRP: ₹{Number(item.mrp || 0).toLocaleString('en-IN')} | Group: {item.itemGroupId || 'N/A'}
                  </p>
                </div>
                <button
                  onClick={() => onLink(item)}
                  disabled={isLinking || !item.id}
                  className="shrink-0 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-60"
                >
                  Link
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            disabled={isLinking}
            className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 hover:bg-gray-50 text-sm disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeLinkModal;