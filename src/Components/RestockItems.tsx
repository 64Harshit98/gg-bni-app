import React from 'react';
import { CatCard, CardHead, Ico, ICONS } from '../Components/ui/Catalogueui';

// Placeholder only: Restock alerts feature is still under development.
export const CatalogueRestockSoon: React.FC = () => (
    <CatCard>
        <CardHead
            title="Restock alerts"
            sub="Catalogue items running low"
            right={
                <span className="inline-flex h-[22px] items-center rounded-sm bg-[#fef6d7] px-2 text-[11px] font-semibold leading-[22px] tracking-[0.03em] text-[#a16207]">
                    SOON
                </span>
            }
        />
        <div className="grid place-items-center gap-2 rounded-sm border-[1.5px] border-dashed border-[#f6e1d0] px-3 py-6 text-center text-slate-500">
            <Ico d={ICONS.box} size={28} className="text-orange-500" />
            <b className="text-sm font-semibold text-slate-900">Coming soon</b>
            <span className="text-xs leading-[18px]">You’ll see items that are about to sell out, so you can hide or restock them.</span>
        </div>
    </CatCard>
);