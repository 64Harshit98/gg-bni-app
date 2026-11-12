import React from 'react';
import { X } from 'lucide-react';
import type { Item } from '../../constants/models';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import { productState } from './productState';
import { btnClass } from './StoreUI';
import { formatINR, getItemImages } from './storefront.utils';

interface Props {
    title: string | null;
    variants: Item[];
    settings: CatalogueSalesSettings | null;
    pricesVisible: boolean;
    onClose: () => void;
    onSelect: (v: Item) => void;
}

/** Variant picker: every variant is its own item. Bottom sheet on phones. */
export const VariantSheet: React.FC<Props> = ({ title, variants, settings, pricesVisible, onClose, onSelect }) => {
    if (!title) return null;
    return (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/45 md:items-center md:p-4" onClick={onClose}>
            <div role="dialog" aria-label={`Options for ${title}`}
                className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-sm bg-white shadow-sf-float md:max-w-md md:rounded-sm"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-sf-line px-4 pb-3 pt-4">
                    <h2 className="line-clamp-2 text-base font-semibold text-slate-900">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close"
                        className="grid size-9 shrink-0 place-items-center rounded-sm text-slate-500 hover:bg-sf-sunken hover:text-slate-900">
                        <X className="size-5" />
                    </button>
                </div>
                <div className="grid gap-2 overflow-y-auto px-4 py-4">
                    {variants.map((v) => {
                        const vs = productState(v, settings, 0);
                        const img = getItemImages(v)[0];
                        return (
                            <div key={v.id} className="flex items-center gap-3 rounded-sm border border-sf-line bg-white p-2">
                                <span className="size-14 shrink-0 overflow-hidden rounded-sm bg-sf-sunken">
                                    {img && <img src={img} alt="" className="h-full w-full object-contain" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <b className="block truncate text-[13px] font-medium text-slate-900">{v.name}</b>
                                    {pricesVisible && <small className="block text-sm font-semibold tabular-nums text-slate-900">{formatINR(vs.price)}</small>}
                                </div>
                                <button type="button" disabled={vs.outOfStock} onClick={() => onSelect(v)} className={btnClass('outline', 'sm')}>
                                    {vs.outOfStock ? 'Out of stock' : 'ADD'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};