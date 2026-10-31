import React, { useState } from 'react';
import { Spinner } from '../constants/Spinner';
import { CatCard, CardHead, Seg, HiddenState, Ico, ICONS } from '../Components/ui/Catalogueui';
import { splitAddOns } from '../UseComponents/addOnText';

interface TopItem {
    id: string;
    name: string;
    totalQuantity: number;
    totalAmount: number;
}

// Same props as the old TopSoldItemsCard; data comes from HomePage.
interface CatalogueTopItemsProps {
    isDataVisible: boolean;
    topByQuantity: TopItem[];
    topByAmount: TopItem[];
    loading: boolean;
}

export const CatalogueTopItems: React.FC<CatalogueTopItemsProps> = ({
    isDataVisible,
    topByQuantity,
    topByAmount,
    loading,
}) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');
    const [showAll, setShowAll] = useState(false);

    const items = viewMode === 'quantity' ? topByQuantity : topByAmount;
    const visible = showAll ? items : items.slice(0, 3);

    const renderBody = () => {
        if (loading) return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
        if (!isDataVisible) return <HiddenState height={160} />;
        if (items.length === 0) return <p className="flex h-40 items-center justify-center text-center text-sm text-slate-500">No items sold in this period.</p>;

        return (
            <>
                <ol className="m-0 list-none p-0">
                    {visible.map((item, index) => {
                        const { baseName, addOnText } = splitAddOns(item);
                        return (
                            <li key={item.id} className="flex items-center gap-3 border-b border-[#f6e1d0] py-2.5 last:border-b-0">
                                <span className="h-6 w-6 flex-none rounded-sm bg-orange-100 text-center text-xs font-semibold leading-6 text-orange-800">
                                    {index + 1}
                                </span>
                                <div className="min-w-0 flex-1" title={item.name}>
                                    <p className="truncate text-sm text-slate-900">{baseName}</p>
                                    {addOnText && (
                                        <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">+ {addOnText}</p>
                                    )}
                                </div>
                                <span className="text-sm font-medium tabular-nums text-slate-900">
                                    {viewMode === 'quantity'
                                        ? <>{item.totalQuantity}<span className="ml-1 text-xs font-normal text-slate-500">sold</span></>
                                        : item.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}
                                </span>
                            </li>
                        );
                    })}
                </ol>
                {items.length > 3 && (
                    <button
                        onClick={() => setShowAll(v => !v)}
                        className="mt-2 inline-flex h-8 items-center gap-1 rounded-sm text-[13px] font-medium text-orange-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                    >
                        {showAll ? 'Show top 3' : `See all top ${items.length}`}
                        <Ico d={ICONS.chevronRight} size={16} className={showAll ? 'rotate-90' : ''} />
                    </button>
                )}
            </>
        );
    };

    return (
        <CatCard>
            <CardHead
                title="Top items"
                sub={viewMode === 'amount' ? 'By sales amount' : 'By quantity sold'}
                right={<Seg value={viewMode} onChange={setViewMode} />}
            />
            {renderBody()}
        </CatCard>
    );
};