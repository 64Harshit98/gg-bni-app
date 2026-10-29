import React from 'react';
import { Spinner } from '../constants/Spinner';
import { CatCard, Ico, ICONS, Tint, inr, usePeriodText, usePeriodDays } from '../Components/ui/Catalogueui';

// Presentation only: every figure is derived from props HomePage already has.
interface CatalogueKpiRowProps {
    isDataVisible: boolean;
    totalSalesAmount: number;
    totalSalesCount: number;
    orderCounts: Record<string, number>;
    loading: boolean;
}

export const CatalogueKpiRow: React.FC<CatalogueKpiRowProps> = ({
    isDataVisible,
    totalSalesAmount,
    totalSalesCount,
    orderCounts,
    loading,
}) => {
    const periodText = usePeriodText();
    const days = usePeriodDays();

    if (loading) {
        return (
            <CatCard className="flex h-28 items-center justify-center">
                <Spinner />
            </CatCard>
        );
    }

    const toConfirm = orderCounts.Upcoming ?? 0;
    const toPack = orderCounts.Confirmed ?? 0;
    const waiting = toConfirm + toPack;
    const avgOrder = totalSalesCount > 0 ? totalSalesAmount / totalSalesCount : 0;

    const perWeekText =
        totalSalesCount === 0 ? 'no orders yet'
            : days >= 7 ? `about ${Math.max(1, Math.round(totalSalesCount / (days / 7)))} a week`
                : 'in this period';

    const money = (n: number) => (isDataVisible ? inr(n) : '₹ ******');
    const num = (n: number) => (isDataVisible ? String(n) : '**');

    const label = 'mb-1 flex items-center gap-3 text-[13px] font-medium text-slate-600';
    const value = 'text-[28px] font-semibold leading-9 tracking-[-0.02em] tabular-nums text-slate-900';
    const hero = 'text-[32px] font-semibold leading-10 tracking-[-0.02em] tabular-nums text-orange-700';
    const caption = 'text-xs leading-[18px] text-slate-500';

    return (
        <>
            {/* Desktop / tablet: four tiles */}
            <section className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1.2fr] xl:gap-5">
                <CatCard className="flex flex-col gap-1">
                    <div className={label}><Tint><Ico d={ICONS.receipt} size={18} /></Tint>Completed sales</div>
                    <div className={hero}>{money(totalSalesAmount)}</div>
                    <div className={caption}>from {num(totalSalesCount)} orders · {periodText}</div>
                </CatCard>

                <CatCard className="flex flex-col gap-1">
                    <div className={label}><Tint tone="green"><Ico d={ICONS.orders} size={18} /></Tint>Orders</div>
                    <div className={value}>{num(totalSalesCount)}</div>
                    <div className={caption}>{isDataVisible ? perWeekText : '**'}</div>
                </CatCard>

                <CatCard className="flex flex-col gap-1">
                    <div className={label}><Tint tone="amber"><Ico d={ICONS.chart} size={18} /></Tint>Average order</div>
                    <div className={value}>{money(avgOrder)}</div>
                    <div className={caption}>per completed order</div>
                </CatCard>

                <CatCard className="flex flex-col gap-1 !border-transparent !bg-orange-100">
                    <div className={label}><Tint tone="amber"><Ico d={ICONS.clock} size={18} /></Tint>Needs action</div>
                    <div className="text-[28px] font-semibold leading-9 tracking-[-0.02em] tabular-nums text-orange-700">
                        {isDataVisible ? `${waiting} order${waiting === 1 ? '' : 's'}` : '**'}
                    </div>
                    <div className="text-xs leading-[18px] text-orange-800">
                        {!isDataVisible ? '**' : waiting === 0 ? 'All caught up' : `${toConfirm} to confirm · ${toPack} to pack`}
                    </div>
                </CatCard>
            </section>

            {/* Mobile: one sales card with a mini stats row */}
            <section className="md:hidden">
                <CatCard>
                    <div className={label}><Tint><Ico d={ICONS.receipt} size={18} /></Tint>Completed sales · {periodText}</div>
                    <div className={hero}>{money(totalSalesAmount)}</div>
                    <div className="mt-3 grid grid-cols-3 border-t border-[#f6e1d0] pt-2.5">
                        <div className="text-[11px] text-slate-500">Orders<b className="block text-[15px] font-semibold text-slate-900">{num(totalSalesCount)}</b></div>
                        <div className="text-[11px] text-slate-500">Avg order<b className="block text-[15px] font-semibold text-slate-900">{money(avgOrder)}</b></div>
                        <div className="text-[11px] text-slate-500">Waiting<b className="block text-[15px] font-semibold text-orange-700">{num(waiting)}</b></div>
                    </div>
                </CatCard>
            </section>
        </>
    );
};