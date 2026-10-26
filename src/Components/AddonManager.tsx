import React, { useMemo, useState } from 'react';
import { FiEdit2, FiLink, FiTrash2, FiX } from 'react-icons/fi';
import type { AddOnGroup, AddOnOption, Item } from '../constants/models';
import { validateAddOnGroups } from '../constants/models';
import { useAddOnTemplates } from '../lib/addOnTemplates';

interface AddOnManagerProps {
    isOpen: boolean;
    onClose: () => void;
    companyId?: string;
    /** Inventory items, so an add-on can be linked to one (e.g. Coke sold with a burger) */
    items: Item[];
    /** Tailwind classes for the primary buttons (page theme) */
    actionClass: string;
}

const INPUT = 'h-9 w-full min-w-0 rounded-sm border border-[#7a8aa3] bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const ICON_BTN = 'inline-flex h-9 w-9 items-center justify-center rounded-sm text-slate-500 hover:bg-gray-100 hover:text-slate-900';

const newOption = (): AddOnOption => ({ id: crypto.randomUUID(), name: '', price: '' });
const newGroup = (): AddOnGroup => ({ id: crypto.randomUUID(), name: '', multiple: true, maxSelect: 0, options: [newOption()] });
const selectionLabel = (g: AddOnGroup) =>
    !g.multiple ? 'Choose one' : Number(g.maxSelect) > 0 ? `Choose up to ${g.maxSelect}` : 'Choose any';

export const AddOnManager: React.FC<AddOnManagerProps> = ({ isOpen, onClose, companyId, items, actionClass }) => {
    const { templates, saveTemplate, deleteTemplate } = useAddOnTemplates(companyId);
    const [draft, setDraft] = useState<AddOnGroup | null>(null);
    //const [bulk, setBulk] = useState('');
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkQuery, setLinkQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AddOnGroup | null>(null); // group waiting for delete confirmation

    const linkResults = useMemo(() => {
        const q = linkQuery.trim().toLowerCase();
        if (!q) return [];
        const taken = new Set((draft?.options ?? []).map((o) => o.itemId).filter(Boolean));
        return items.filter((i) => !i.isDeleted && !taken.has(i.id) && i.name?.toLowerCase().includes(q)).slice(0, 8);
    }, [items, linkQuery, draft]);

    if (!isOpen) return null;

    const itemName = (id?: string) => items.find((i) => i.id === id)?.name;
    const close = () => { setDraft(null); setError(null); setLinkOpen(false); setDeleteTarget(null); onClose(); };
    const patchDraft = (patch: Partial<AddOnGroup>) => setDraft((d) => (d ? { ...d, ...patch } : d));
    const patchOption = (optionId: string, patch: Partial<AddOnOption>) =>
        setDraft((d) => (d ? { ...d, options: d.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) } : d));
    const addOption = () => setDraft((d) => (d ? { ...d, options: [...d.options, newOption()] } : d));
    const removeOption = (optionId: string) =>
        setDraft((d) => (d ? { ...d, options: d.options.filter((o) => o.id !== optionId) } : d));

    // // "Name, price" per line
    // const addBulk = () => {
    //     const rows = bulk.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    //         const m = line.match(/^(.*?)[,\t]\s*([\d.]+)\s*$/);
    //         return { id: crypto.randomUUID(), name: (m ? m[1] : line).trim(), price: m ? m[2] : '' } as AddOnOption;
    //     });
    //     if (rows.length === 0) return;
    //     setDraft((d) => (d ? { ...d, options: [...d.options.filter((o) => o.name.trim() || o.itemId), ...rows] } : d));
    //     setBulk('');
    // };

    // Inventory item -> a new option (name + price filled from the item, both editable)
    const addLinkedItem = (item: Item) => {
        setDraft((d) => (d ? {
            ...d,
            options: [...d.options, {
                id: crypto.randomUUID(),
                name: item.name,
                price: String(item.salesPrice || item.mrp || 0),
                itemId: item.id,
                itemQty: 1,
                syncPrice: true,
            }],
        } : d));
        setLinkQuery('');
    };

    const save = async () => {
        if (!draft) return;
        const clean: AddOnGroup = {
            ...draft,
            name: draft.name.trim(),
            maxSelect: draft.multiple ? Math.max(0, parseInt(String(draft.maxSelect ?? 0), 10) || 0) : 0,
            extraPrice: draft.multiple && Number(draft.maxSelect) > 0 && draft.extraPrice != null ? Math.max(0, Number(draft.extraPrice) || 0) : undefined,
            options: draft.options
                .filter((o) => o.name.trim() || o.itemId)
                .map((o) => ({ ...o, name: o.name.trim(), price: Number(o.price) || 0 })),
        };
        const err = validateAddOnGroups([clean]);
        if (err) { setError(err); return; }
        if (templates.some((t) => t.id !== clean.id && t.name.trim().toLowerCase() === clean.name.toLowerCase())) {
            setError(`An add-on group named "${clean.name}" already exists.`);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await saveTemplate(clean);
            setDraft(null);
        } catch {
            setError('Failed to save the add-on group.');
        } finally {
            setBusy(false);
        }
    };

    const confirmRemove = async () => {
        const g = deleteTarget;
        if (!g) return;
        setBusy(true);
        try {
            await deleteTemplate(g.id);
            setDeleteTarget(null);
        } catch {
            setDeleteTarget(null);
            setError('Failed to delete the add-on group.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={close}>
            <div className="flex max-h-[90vh] w-full flex-col rounded-t-sm bg-white shadow-xl sm:max-w-2xl sm:rounded-sm" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
                    <h2 className="text-lg font-semibold text-slate-900">{draft ? (templates.some((t) => t.id === draft.id) ? 'Edit add-on group' : 'New add-on group') : 'Add-ons'}</h2>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                    {error && <p className="mb-3 rounded-sm bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

                    {!draft ? (
                        templates.length === 0 ? (
                            <p className="py-6 text-center text-sm text-slate-500">No add-on groups yet. Create one, then pick it from the Add item or Edit item screen.</p>
                        ) : (
                            <div className="grid gap-2">
                                {templates.map((g) => (
                                    <div key={g.id} className="flex items-center justify-between gap-3 rounded-sm border border-gray-200 bg-white px-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-900">{g.name}</p>
                                            <p className="truncate text-xs text-slate-500">{selectionLabel(g)} · {g.options.length} option{g.options.length === 1 ? '' : 's'}</p>
                                        </div>
                                        <div className="flex shrink-0 gap-0.5">
                                            <button type="button" aria-label={`Edit ${g.name}`} onClick={() => setDraft({ ...g })} className={ICON_BTN}><FiEdit2 size={16} /></button>
                                            <button type="button" aria-label={`Delete ${g.name}`} onClick={() => setDeleteTarget(g)} className={`${ICON_BTN} hover:!text-red-600`}><FiTrash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <div className="grid gap-4">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <label className="col-span-2 grid gap-1 sm:col-span-1">
                                    <span className="text-xs font-medium text-slate-600">Group name</span>
                                    <input className={INPUT} value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} placeholder="e.g. Sauces" autoFocus />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-xs font-medium text-slate-600">Customer can</span>
                                    <select className={INPUT} value={draft.multiple ? 'many' : 'one'} onChange={(e) => patchDraft({ multiple: e.target.value === 'many' })}>
                                        <option value="one">Choose only one</option>
                                        <option value="many">Choose multiple</option>
                                    </select>
                                </label>
                                {draft.multiple && (
                                    <label className="grid gap-1">
                                        <span className="text-xs font-medium text-slate-600">Max per order</span>
                                        <input className={INPUT} type="number" min="0" value={draft.maxSelect || ''} placeholder="Unlimited"
                                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                            onChange={(e) => patchDraft({ maxSelect: parseInt(e.target.value, 10) || 0 })} />
                                    </label>
                                )}
                            </div>

                            {draft.multiple && Number(draft.maxSelect) > 0 && (
                                <label className="grid gap-1">
                                    <span className="text-xs font-medium text-slate-600">Charge for extra picks (₹, optional)</span>
                                    <input className={INPUT} type="number" min="0" value={draft.extraPrice ?? ''} placeholder="Leave empty to block extras"
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        onChange={(e) => patchDraft({ extraPrice: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
                                    <span className="text-[11px] text-slate-500">
                                        {draft.extraPrice != null
                                            ? `First ${draft.maxSelect} are included. Each extra pick costs ₹${draft.extraPrice} more.`
                                            : `Customers can pick at most ${draft.maxSelect}. No extras allowed.`}
                                    </span>
                                </label>
                            )}

                            <div className="grid gap-2">
                                <span className="text-xs font-medium text-slate-600">Options</span>
                                {draft.options.some((o) => !o.itemId) && (
                                    <div className="grid grid-cols-[minmax(0,1fr)_84px_36px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        <span>Option name</span>
                                        <span>Price (₹)</span>
                                        <span />
                                    </div>
                                )}
                                {draft.options.filter((o) => !o.itemId).map((o) => (
                                    <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_84px_36px] items-center gap-2">
                                        <input className={INPUT} value={o.name} placeholder="e.g. Mint mayo" onChange={(e) => patchOption(o.id, { name: e.target.value })} />
                                        <input className={INPUT} type="number" min="0" value={o.price} placeholder="0 = free"
                                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                            onChange={(e) => patchOption(o.id, { price: e.target.value })} />
                                        <button type="button" aria-label="Remove option" onClick={() => removeOption(o.id)} className={`${ICON_BTN} hover:!text-red-600`}><FiX size={16} /></button>
                                    </div>
                                ))}
                                <button type="button" onClick={addOption} className="w-fit text-sm font-semibold text-blue-600 hover:underline">+ Add another option</button>
                            </div>

                            {/* Inventory items: sold with this group, their own stock is deducted */}
                            <div className="grid gap-2 rounded-sm border border-blue-100 bg-blue-50/50 p-2.5">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 text-xs font-medium text-slate-600">
                                        Sell from inventory
                                        <span className="block font-normal text-slate-500">Linked item's stock reduces automatically when sold</span>
                                    </span>
                                    <button type="button" onClick={() => { setLinkOpen((v) => !v); setLinkQuery(''); }}
                                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-blue-600 hover:underline">
                                        <FiLink size={14} /> Link inventory item
                                    </button>
                                </div>

                                {linkOpen && (
                                    <div className="grid gap-1">
                                        <input autoFocus className={INPUT} placeholder="Search an inventory item…" value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} />
                                        {linkResults.map((it) => (
                                            <button key={it.id ?? it.name} type="button" onClick={() => addLinkedItem(it)}
                                                className="flex items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-2.5 py-1.5 text-left text-sm hover:bg-blue-50">
                                                <span className="truncate">{it.name}</span>
                                                <span className="shrink-0 text-xs tabular-nums text-slate-500">₹{it.salesPrice || it.mrp || 0} · stock {it.stock ?? 0}</span>
                                            </button>
                                        ))}
                                        {linkQuery.trim() && linkResults.length === 0 && <p className="text-xs text-slate-500">No item found.</p>}
                                    </div>
                                )}

                                {draft.options.filter((o) => o.itemId).length === 0 && !linkOpen && (
                                    <p className="text-xs text-slate-500">No item linked. e.g. link Coca Cola to sell it with a burger.</p>
                                )}

                                {draft.options.some((o) => o.itemId) && (
                                    <div className="grid grid-cols-[minmax(0,1fr)_84px_64px_36px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        <span>Display name</span>
                                        <span>Price (₹)</span>
                                        <span>Qty used</span>
                                        <span />
                                    </div>
                                )}
                                {draft.options.filter((o) => o.itemId).map((o) => (
                                    <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_84px_64px_36px] items-start gap-2">
                                        <div className="min-w-0">
                                            <input className={INPUT} value={o.name} onChange={(e) => patchOption(o.id, { name: e.target.value })} />
                                            <p className="mt-0.5 truncate text-[11px] text-slate-500">Item: {itemName(o.itemId) || 'Item not found'}</p>
                                        </div>
                                        <input className={INPUT} type="number" min="0" value={o.price} placeholder="₹ 0" title="Add-on price" disabled={!!o.syncPrice}
                                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                            onChange={(e) => patchOption(o.id, { price: e.target.value })} />
                                        <input className={INPUT} type="number" min="1" value={o.itemQty || 1} title="Pieces deducted from stock per add-on sold"
                                            onChange={(e) => patchOption(o.id, { itemQty: parseInt(e.target.value, 10) || 1 })} />
                                        <button type="button" aria-label="Remove linked item" onClick={() => removeOption(o.id)} className={`${ICON_BTN} hover:!text-red-600`}><FiX size={16} /></button>
                                        <label className="col-span-full flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-600">
                                            <input type="checkbox" checked={!!o.syncPrice} onChange={(e) => patchOption(o.id, { syncPrice: e.target.checked })} className="accent-blue-600" />
                                            Use item's current price
                                        </label>
                                    </div>
                                ))}

                            </div>

                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
                    {draft ? (
                        <>
                            <button type="button" onClick={() => { setDraft(null); setError(null); }} className="h-10 rounded-sm border border-gray-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={save} disabled={busy} className={`h-10 rounded-sm px-4 text-sm font-medium text-white disabled:opacity-60 ${actionClass}`}>{busy ? 'Saving…' : 'Save group'}</button>
                        </>
                    ) : (
                        <button type="button" onClick={() => { setDraft(newGroup()); setError(null); }} className={`h-10 rounded-sm px-4 text-sm font-medium text-white ${actionClass}`}>New add-on group</button>
                    )}
                </div>
            </div>

            {deleteTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { e.stopPropagation(); if (!busy) setDeleteTarget(null); }}>
                    <div className="w-full max-w-md rounded-sm bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h2 className="mb-1.5 text-lg font-semibold text-slate-900">Delete "{deleteTarget.name}"?</h2>
                        <p className="mb-6 text-sm text-slate-600">It will be removed from every item that uses it. Old bills keep the add-on names as they were.</p>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setDeleteTarget(null)} disabled={busy}
                                className="h-10 rounded-sm border border-gray-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-60">Cancel</button>
                            <button type="button" onClick={confirmRemove} disabled={busy}
                                className="h-10 rounded-sm bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">{busy ? 'Deleting…' : 'Delete'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};