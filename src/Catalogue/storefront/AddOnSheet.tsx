import React, { useEffect, useState } from 'react';
import { Check, ShoppingCart, X } from 'lucide-react';
import type { AddOnGroup, AddOnOption, Item } from '../../constants/models';
import { extraChargeOf } from '../../constants/models';
import { btnClass } from './StoreUI';
import { formatINR } from './storefront.utils';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

interface Props {
    item: Item | null;
    unitPrice: number;
    pricesVisible: boolean;
    onClose: () => void;
    onConfirm: (addOns: AddOnOption[]) => void;
}

/** Add-ons popup for product cards: bottom sheet on phones, centred card on desktop. */
export const AddOnSheet: React.FC<Props> = ({ item, unitPrice, pricesVisible, onClose, onConfirm }) => {
    const [sel, setSel] = useState<Record<string, string[]>>({});
    useEffect(() => { setSel({}); }, [item?.id]);
    if (!item) return null;

    const groups = item.addOnGroups ?? [];
    const limitOf = (g: AddOnGroup) => (g.multiple ? Number(g.maxSelect) || 0 : 0);
    const hasExtraPrice = (g: AddOnGroup) => g.extraPrice != null;
    const atLimit = (g: AddOnGroup) => !hasExtraPrice(g) && limitOf(g) > 0 && (sel[g.id] ?? []).length >= limitOf(g);

    const picked: AddOnOption[] = groups.flatMap((g) =>
        (sel[g.id] ?? []).flatMap((id, idx) => {
            const o = g.options.find((x) => x.id === id);
            if (!o) return [];
            if (limitOf(g) > 0 && hasExtraPrice(g)) return [{ ...o, price: idx >= limitOf(g) ? extraChargeOf(g, o) : 0 }];
            return [o];
        }));
    const extra = picked.reduce((sum, o) => sum + (Number(o.price) || 0), 0);

    const optionPrice = (g: AddOnGroup, optId: string): number => {
        const opt = g.options.find((x) => x.id === optId);
        const base = Number(opt?.price) || 0;
        if (!opt || limitOf(g) <= 0 || !hasExtraPrice(g)) return base;
        const cur = sel[g.id] ?? [];
        const idx = cur.indexOf(optId);
        const isExtra = idx >= 0 ? idx >= limitOf(g) : cur.length >= limitOf(g);
        return isExtra ? extraChargeOf(g, opt) : 0;
    };

    const toggle = (g: AddOnGroup, optionId: string) => {
        setSel((prev) => {
            const cur = prev[g.id] ?? [];
            const has = cur.includes(optionId);
            if (!has && !hasExtraPrice(g) && limitOf(g) > 0 && cur.length >= limitOf(g)) return prev;
            if (!has && g.options.find((o) => o.id === optionId)?.soldOut) return prev;
            const next = g.multiple ? (has ? cur.filter((id) => id !== optionId) : [...cur, optionId]) : (has ? [] : [optionId]);
            return { ...prev, [g.id]: next };
        });
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/45 md:items-center md:p-4" onClick={onClose}>
            <div role="dialog" aria-label={`Add-ons for ${item.name}`}
                className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-sm bg-white shadow-sf-float md:max-w-md md:rounded-sm"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-sf-line px-4 pb-3 pt-4">
                    <div className="min-w-0">
                        <h2 className="line-clamp-1 text-base font-semibold text-slate-900">{item.name}</h2>
                        <p className="mt-0.5 text-[13px] text-slate-500">Choose add-ons (optional)</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close"
                        className="grid size-9 shrink-0 place-items-center rounded-sm text-slate-500 hover:bg-sf-sunken hover:text-slate-900">
                        <X className="size-5" />
                    </button>
                </div>

                <div className="grid flex-1 gap-5 overflow-y-auto px-4 py-4">
                    {groups.map((g) => (
                        <div key={g.id}>
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[13px] font-medium text-slate-900">{g.name}</p>
                                <small className="text-xs text-slate-500">
                                    {g.multiple ? (limitOf(g) > 0 ? `Choose up to ${limitOf(g)}${hasExtraPrice(g) ? ' · more picks are paid' : ''}` : 'Choose any') : 'Choose one'}
                                </small>
                            </div>
                            <div className="grid gap-2">
                                {[...g.options].sort((a, b) => Number(!!a.itemId) - Number(!!b.itemId)).map((o, idx, arr) => {
                                    const on = (sel[g.id] ?? []).includes(o.id);
                                    const price = optionPrice(g, o.id);
                                    const off = !on && (atLimit(g) || !!o.soldOut);
                                    const firstLinked = !!o.itemId && (idx === 0 || !arr[idx - 1].itemId);
                                    return (
                                        <React.Fragment key={o.id}>
                                            {firstLinked && <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Items</p>}
                                            <button type="button" aria-pressed={on} onClick={() => toggle(g, o.id)} disabled={off}
                                                className={cx('flex min-h-12 items-center justify-between gap-3 rounded-sm px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45',
                                                    on ? 'border-2 border-sf-primary bg-sf-soft' : 'border border-sf-control bg-white hover:bg-sf-sunken')}>
                                                <span className="flex min-w-0 items-center gap-2.5">
                                                    <span className={cx('grid size-5 shrink-0 place-items-center rounded-sm border',
                                                        on ? 'border-sf-primary bg-sf-primary text-white' : 'border-sf-control bg-white')}>
                                                        {on && <Check className="size-3.5" strokeWidth={3} />}
                                                    </span>
                                                    <b className={cx('truncate text-[13px] font-medium', on ? 'text-sf-soft-ink' : 'text-slate-900')}>{o.name}</b>
                                                </span>
                                                {(pricesVisible || o.soldOut) && (
                                                    <small className={cx('shrink-0 text-xs tabular-nums', on ? 'text-sf-soft-ink' : 'text-slate-500')}>
                                                        {o.soldOut ? 'Out of stock' : price > 0 ? `+ ${formatINR(price)}` : 'Free'}
                                                    </small>
                                                )}
                                            </button>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-2 border-t border-sf-line px-4 pb-5 pt-3">
                    {pricesVisible && (
                        <p className="text-[13px] text-slate-600">
                            {picked.length} add-on{picked.length === 1 ? '' : 's'}{extra > 0 ? ` · + ${formatINR(extra)}` : ''}
                        </p>
                    )}
                    <button type="button" onClick={() => onConfirm(picked)} className={btnClass('primary', 'lg', true)}>
                        <ShoppingCart className="size-4" />Add to cart{pricesVisible ? ` · ${formatINR(unitPrice + extra)}` : ''}
                    </button>
                    <button type="button" onClick={() => onConfirm([])} className={btnClass('secondary', 'lg', true)}>Skip add-ons</button>
                </div>
            </div>
        </div>
    );
};