import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../constants/Spinner';
import { CatCard, CardHead, Seg, HiddenState, inr, usePeriodText } from './ui/Catalogueui';

interface ChartDataPoint {
    date: string; // YYYY-MM-DD
    sales: number;
    bills: number;
}

// Same props as the old OrderBarChartReport; data comes from HomePage.
interface CatalogueSalesByWeekProps {
    isDataVisible: boolean;
    chartData: ChartDataPoint[];
    totalSales: number;
    totalBills: number;
    loading: boolean;
}

const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// Round the axis max up to a tidy number
const niceMax = (v: number, even: boolean) => {
    if (v <= 0) return even ? 2 : 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const m = steps.find(s => n <= s) ?? 10;
    const out = m * p;
    return even ? Math.max(2, Math.ceil(out / 2) * 2) : out;
};

// Compact axis label in Indian units: ₹5k · ₹2.5L · ₹1Cr
const compactInr = (v: number) => {
    const t = (n: number) => `${+n.toFixed(1)}`;
    if (v >= 1e7) return `₹${t(v / 1e7)}Cr`;
    if (v >= 1e5) return `₹${t(v / 1e5)}L`;
    if (v >= 1e3) return `₹${t(v / 1e3)}k`;
    return `₹${Math.round(v)}`;
};

// Real pixel width of the chart area, so text stays 11px at any card size
const useWidth = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(380);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return { ref, w };
};

export const CatalogueSalesByWeek: React.FC<CatalogueSalesByWeekProps> = ({
    isDataVisible,
    chartData,
    loading,
}) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');
    const periodText = usePeriodText();
    const { ref: wrapRef, w: W } = useWidth();
    const isAmount = viewMode === 'amount';

    // Long ranges are bucketed by week (a daily line is mostly empty spikes); short ranges stay daily
    const { buckets, weekly } = useMemo(() => {
        const sorted = [...chartData].sort((a, b) => a.date.localeCompare(b.date));
        const isWeekly = sorted.length > 31;
        const size = isWeekly ? 7 : 1;
        const out: { label: string; sales: number; bills: number }[] = [];
        for (let i = 0; i < sorted.length; i += size) {
            const g = sorted.slice(i, i + size);
            out.push({
                label: fmtDay(g[0].date),
                sales: g.reduce((s, x) => s + x.sales, 0),
                bills: g.reduce((s, x) => s + x.bills, 0),
            });
        }
        return { buckets: out, weekly: isWeekly };
    }, [chartData]);

    const unit = weekly ? 'week' : 'day';
    const values = buckets.map(b => (isAmount ? b.sales : b.bills));
    const max = niceMax(Math.max(0, ...values), !isAmount);

    const fmtAxis = (v: number) => (isAmount ? compactInr(v) : String(Math.round(v)));

    // Geometry in real pixels: the left gutter grows with the widest axis label
    const H = 200, BASE = 182, TOP = 8, PLOT_H = BASE - TOP;
    const widest = Math.max(...[0, 0.5, 1].map(f => fmtAxis(max * f).length));
    const X0 = Math.max(34, Math.round(widest * 6.4) + 12);
    const X1 = W - 4;
    const n = Math.max(buckets.length, 1);
    const slot = (X1 - X0) / n;
    const bw = Math.max(2, Math.min(slot * 0.64, 40));
    const maxLabels = Math.max(2, Math.floor((X1 - X0) / 64));
    const labelEvery = Math.max(1, Math.ceil(n / maxLabels));

    const best = values.length ? Math.max(...values) : 0;
    const bestIdx = values.indexOf(best);
    const emptyCount = values.filter(v => v === 0).length;
    const bestText = isAmount ? inr(best) : `${best} bills`;

    return (
        <CatCard>
            <CardHead
                title={`Sales by ${unit}`}
                sub={`Completed orders · ${periodText}`}
                right={<Seg value={viewMode} onChange={setViewMode} />}
            />

            <div ref={wrapRef} className="w-full min-w-0 overflow-hidden">
            {loading ? (
                <div className="flex h-[200px] items-center justify-center"><Spinner /></div>
            ) : !isDataVisible ? (
                <HiddenState height={200} />
            ) : (
                <>
                    <svg
                        width={W}
                        height={H}
                        viewBox={`0 0 ${W} ${H}`}
                        role="img"
                        aria-label={`Catalogue sales by ${unit}, ${periodText}`}
                        className="block max-w-full"
                    >
                        {[0, 0.5, 1].map(f => {
                            const y = BASE - f * PLOT_H;
                            return (
                                <g key={f}>
                                    <line x1={X0} x2={X1} y1={y} y2={y} stroke="#f6e1d0" strokeDasharray="3 4" />
                                    <text x={X0 - 6} y={y + 4} textAnchor="end" fontSize={11} fill="#5b6b86">{fmtAxis(max * f)}</text>
                                </g>
                            );
                        })}

                        {buckets.map((b, i) => {
                            const v = values[i];
                            const x = X0 + i * slot + (slot - bw) / 2;
                            const h = v > 0 ? Math.max(2, (v / max) * PLOT_H) : 2;
                            return (
                                <g key={`${b.label}-${i}`}>
                                    <rect
                                        x={x}
                                        y={BASE - h}
                                        width={bw}
                                        height={h}
                                        rx={3}
                                        fill={v > 0 ? '#f97316' : '#f6e1d0'}
                                    >
                                        <title>{`${b.label}: ${isAmount ? inr(v) : `${v} bills`}`}</title>
                                    </rect>
                                    {i % labelEvery === 0 && (
                                        <text x={x + bw / 2} y={196} textAnchor="middle" fontSize={11} fill="#5b6b86">{b.label}</text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>

                    <div className="mt-1.5 text-xs leading-[18px] text-slate-500">
                        {best > 0
                            ? <>Best {unit}: {buckets[bestIdx].label} · {bestText}{emptyCount > 0 && ` · no orders in ${emptyCount} of ${buckets.length} ${unit}s`}</>
                            : 'No sales in this period'}
                    </div>
                </>
            )}
            </div>
        </CatCard>
    );
};