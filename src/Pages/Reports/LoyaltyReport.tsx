import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { ChevronDown, ChevronRight, Search, Settings, SlidersHorizontal, Star } from 'lucide-react';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { useLoyaltySettings } from '../../context/SettingsContext';
import { ROUTES } from '../../constants/routes.constants';
import { Spinner } from '../../constants/Spinner';
import BackButton from '../../Components/BackButton';
import LoyaltyAdjustModal from '../../Components/LoyaltyAdjustModal';
import { normalizeLoyaltyPhone, pointsToRupees, type LoyaltyAccount } from '../../lib/loyalty';

// Customer points: every loyalty balance, its history, and manual add/remove.
// The route is gated by Permissions.ManageLoyaltyPoints.
// Shared by POS (theme="blue") and Catalogue (theme="orange").

interface ThemeStyles {
    page: string;
    border: string;
    divide: string;
    hoverBg: string;
    sunken: string;
    link: string;
    outline: string;
    within: string;
    shadow: string;
}

const THEMES: Record<'blue' | 'orange', ThemeStyles> = {
    blue: {
        page: 'bg-[#eef2ff]',
        border: 'border-[#dfe6fb]',
        divide: 'divide-[#dfe6fb]',
        hoverBg: 'hover:bg-[#f5f7ff]',
        sunken: 'bg-[#f9faff]',
        link: 'text-[#155dfc]',
        outline: 'focus-visible:outline-[#155dfc]',
        within: 'focus-within:outline-[#155dfc]',
        shadow: 'shadow-[0_1px_2px_rgba(21,48,140,.05),0_2px_6px_rgba(21,48,140,.06)]',
    },
    orange: {
        page: 'bg-[#fff5ec]',
        border: 'border-[#f6e1d0]',
        divide: 'divide-[#f6e1d0]',
        hoverBg: 'hover:bg-[#fff8f2]',
        sunken: 'bg-[#fff8f2]',
        link: 'text-[#c2410c]',
        outline: 'focus-visible:outline-[#ea580c]',
        within: 'focus-within:outline-[#ea580c]',
        shadow: 'shadow-[0_1px_2px_rgba(194,65,12,.05),0_2px_6px_rgba(194,65,12,.06)]',
    },
};

const FONT =
    "font-['Poppins',system-ui,-apple-system,'Segoe_UI',sans-serif] text-sm leading-[22px] text-[#0f172b] antialiased";
const FOCUS_BASE = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

interface LedgerRow {
    id: string;
    type: string;
    points: number;
    balanceAfter: number | null;
    refType: string;
    invoiceNumber: string;
    note: string;
    createdByName: string;
    createdAt: Date | null;
}

const TYPE_LABEL: Record<string, string> = { earn: 'Earned', redeem: 'Used', adjust: 'Adjusted', reverse: 'Reversed' };

const fmtDate = (d: Date | null) =>
    d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const History: React.FC<{ companyId: string; phone: string; refreshKey: number; t: ThemeStyles }> = ({ companyId, phone, refreshKey, t }) => {
    const [rows, setRows] = useState<LedgerRow[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        setRows(null);
        // Equality filter only (no orderBy) so no composite index is needed; sorted here.
        getDocs(query(collection(db, 'companies', companyId, 'loyaltyLedger'), where('phone', '==', phone)))
            .then((snap) => {
                if (cancelled) return;
                const list = snap.docs.map((d) => {
                    const x = d.data();
                    return {
                        id: d.id,
                        type: x.type,
                        points: Number(x.points) || 0,
                        balanceAfter: typeof x.balanceAfter === 'number' ? x.balanceAfter : null,
                        refType: x.refType || '',
                        invoiceNumber: x.invoiceNumber || '',
                        note: x.note || '',
                        createdByName: x.createdByName || '',
                        createdAt: x.createdAt?.toDate ? x.createdAt.toDate() : null,
                    } as LedgerRow;
                });
                list.sort((a, b) => (b.createdAt?.getTime() ?? Infinity) - (a.createdAt?.getTime() ?? Infinity));
                setRows(list);
            })
            .catch((err) => {
                console.error('Failed to load points history', err);
                if (!cancelled) setRows([]);
            });
        return () => { cancelled = true; };
    }, [companyId, phone, refreshKey]);

    if (rows === null) return <div className="px-4 py-3 text-xs text-[#5b6b86]">Loading history…</div>;
    if (rows.length === 0) return <div className="px-4 py-3 text-xs text-[#5b6b86]">No history yet.</div>;

    return (
        <ul className={`m-0 list-none divide-y ${t.divide} p-0`}>
            {rows.slice(0, 100).map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-2.5">
                    <div className="min-w-0">
                        <div className="text-[13px] font-medium">
                            {TYPE_LABEL[r.type] || r.type}
                            {r.invoiceNumber && <span className="font-normal text-[#5b6b86]"> · {r.invoiceNumber}</span>}
                        </div>
                        <div className="truncate text-xs text-[#5b6b86]">
                            {fmtDate(r.createdAt)}
                            {r.note && ` · ${r.note}`}
                            {r.createdByName && ` · by ${r.createdByName}`}
                        </div>
                    </div>
                    <div className="text-right">
                        <b className={`block text-[13px] tabular-nums ${r.points >= 0 ? 'text-[#008236]' : 'text-[#d5000c]'}`}>
                            {r.points > 0 ? '+' : ''}{r.points} pts
                        </b>
                        {r.balanceAfter !== null && <span className="text-xs tabular-nums text-[#5b6b86]">= {r.balanceAfter}</span>}
                    </div>
                </li>
            ))}
        </ul>
    );
};

interface LoyaltyReportProps {
    theme?: 'blue' | 'orange';
}

const LoyaltyReport: React.FC<LoyaltyReportProps> = ({ theme = 'blue' }) => {
    const t = THEMES[theme];
    const isCatalogue = theme === 'orange';
    // NOTE: ye component body me hai (JSX ke andar nahi)
    const settingsPath = isCatalogue ? `${ROUTES.CHOME}/${ROUTES.CATA_LOYALTY_SETTING}` : ROUTES.LOYALTYSETTING;
    const BTN_SECONDARY = `inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-sm border border-[#7a8aa3] bg-white px-3 text-[13px] font-medium text-[#0f172b] ${t.hoverBg} ${FOCUS_BASE} ${t.outline}`;

    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;
    const { loyaltySettings } = useLoyaltySettings();

    const [accounts, setAccounts] = useState<LoyaltyAccount[] | null>(null);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [adjusting, setAdjusting] = useState<{ phone: string; name: string; balance: number } | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        getDocs(query(collection(db, 'companies', companyId, 'loyaltyAccounts'), orderBy('balance', 'desc'), limit(1000)))
            .then((snap) => {
                if (cancelled) return;
                setAccounts(snap.docs.map((d) => {
                    const x = d.data();
                    return {
                        phone: x.phone || d.id,
                        name: x.name || '',
                        balance: Number(x.balance) || 0,
                        lifetimeEarned: Number(x.lifetimeEarned) || 0,
                        lifetimeRedeemed: Number(x.lifetimeRedeemed) || 0,
                    };
                }));
            })
            .catch((err) => {
                console.error('Failed to load loyalty accounts', err);
                if (!cancelled) setAccounts([]);
            });
        return () => { cancelled = true; };
    }, [companyId, refreshKey]);

    const q = search.trim().toLowerCase();
    const filtered = useMemo(
        () => (accounts || []).filter((a) => !q || a.name.toLowerCase().includes(q) || a.phone.includes(q.replace(/\D/g, '') || q)),
        [accounts, q],
    );
    const typedPhone = normalizeLoyaltyPhone(search);
    const showNewCustomer = !!typedPhone && !(accounts || []).some((a) => a.phone === typedPhone);

    const totals = useMemo(() => (accounts || []).reduce(
        (acc, a) => ({ customers: acc.customers + (a.balance !== 0 ? 1 : 0), balance: acc.balance + a.balance }),
        { customers: 0, balance: 0 },
    ), [accounts]);

    return (
        <div className={`${FONT} ${t.page} flex min-h-screen w-full flex-col`}>
            <div className={`sticky top-0 z-30 border-b ${t.border} bg-white`}>
                <div className="flex h-14 items-center gap-3 px-2 md:h-auto md:px-6 md:py-3.5">
                    <div className="flex-shrink-0"><BackButton /></div>
                    <div className="min-w-0 flex-1">
                        <div className="hidden text-xs leading-[18px] text-[#5b6b86] md:block">Customers /</div>
                        <h1 className="m-0 text-lg font-semibold leading-6 md:text-[22px] md:leading-[30px]">Customer points</h1>
                    </div>
                    <Link to={settingsPath} className={BTN_SECONDARY}>
                        <Settings size={15} strokeWidth={1.75} />
                        <span className="hidden sm:inline">Loyalty settings</span>
                    </Link>
                </div>
            </div>

            <main className="mx-auto box-border grid w-full max-w-[860px] gap-4 px-3 pb-24 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
                {!loyaltySettings?.enabled && (
                    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-[#ffe2a8] bg-[#fff8e8] px-3.5 py-2.5 text-[13px] text-[#7a3d00]">
                        Loyalty points are turned off — bills aren't earning or using points.
                        <Link to={settingsPath} className={`font-medium ${t.link} hover:underline`}>Turn on</Link>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-sm border ${t.border} bg-white p-3.5 ${t.shadow}`}>
                        <div className="flex items-center gap-2 text-xs text-[#5b6b86]"><Star size={14} strokeWidth={1.75} className="text-[#bb4d00]" />Points outstanding</div>
                        <b className="mt-1 block text-xl font-semibold tabular-nums">{totals.balance.toLocaleString('en-IN')}</b>
                        {loyaltySettings && (
                            <span className="text-xs text-[#5b6b86]">Worth ₹{pointsToRupees(totals.balance, loyaltySettings).toLocaleString('en-IN')}</span>
                        )}
                    </div>
                    <div className={`rounded-sm border ${t.border} bg-white p-3.5 ${t.shadow}`}>
                        <div className="text-xs text-[#5b6b86]">Customers with points</div>
                        <b className="mt-1 block text-xl font-semibold tabular-nums">{totals.customers.toLocaleString('en-IN')}</b>
                    </div>
                </div>

                <label className={`flex h-10 items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 ${t.within}`}>
                    <Search size={16} strokeWidth={1.75} className="flex-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name or mobile — or type a mobile to give points"
                        aria-label="Search customers"
                        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]"
                    />
                </label>

                <section className={`overflow-hidden rounded-sm border ${t.border} bg-white ${t.shadow}`}>
                    {accounts === null ? (
                        <div className="flex items-center justify-center gap-3 p-8 text-[#45556c]"><Spinner />Loading…</div>
                    ) : (
                        <ul className={`m-0 list-none divide-y ${t.divide} p-0`}>
                            {showNewCustomer && (
                                <li className="flex items-center gap-3 px-4 py-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium">{typedPhone}</div>
                                        <div className="text-xs text-[#5b6b86]">No points yet</div>
                                    </div>
                                    <button type="button" className={BTN_SECONDARY} onClick={() => setAdjusting({ phone: typedPhone, name: '', balance: 0 })}>
                                        <SlidersHorizontal size={15} strokeWidth={1.75} />Give points
                                    </button>
                                </li>
                            )}
                            {filtered.length === 0 && !showNewCustomer && (
                                <li className="px-4 py-8 text-center text-[13px] text-[#5b6b86]">
                                    {accounts.length === 0 ? 'No customer has points yet. They appear here after their first bill.' : 'No customer matches.'}
                                </li>
                            )}
                            {filtered.map((a) => {
                                const open = expanded === a.phone;
                                return (
                                    <li key={a.phone}>
                                        <div className="flex items-center gap-2 px-2 py-2.5 sm:px-4">
                                            <button
                                                type="button"
                                                aria-expanded={open}
                                                onClick={() => setExpanded(open ? null : a.phone)}
                                                className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-1 text-left ${t.hoverBg} ${FOCUS_BASE} ${t.outline}`}
                                            >
                                                {open ? <ChevronDown size={16} className="flex-none text-[#5b6b86]" /> : <ChevronRight size={16} className="flex-none text-[#5b6b86]" />}
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-medium">{a.name || 'Customer'}</span>
                                                    <span className="block truncate text-xs text-[#5b6b86]">
                                                        {a.phone} · earned {a.lifetimeEarned} · used {a.lifetimeRedeemed}
                                                    </span>
                                                </span>
                                                <b className={`text-[15px] tabular-nums ${a.balance < 0 ? 'text-[#d5000c]' : 'text-[#0f172b]'}`}>{a.balance} pts</b>
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`Adjust points for ${a.name || a.phone}`}
                                                className={BTN_SECONDARY}
                                                onClick={() => setAdjusting({ phone: a.phone, name: a.name, balance: a.balance })}
                                            >
                                                <SlidersHorizontal size={15} strokeWidth={1.75} />
                                                <span className="hidden sm:inline">Adjust</span>
                                            </button>
                                        </div>
                                        {open && companyId && (
                                            <div className={`border-t ${t.border} ${t.sunken}`}>
                                                <History companyId={companyId} phone={a.phone} refreshKey={refreshKey} t={t} />
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </main>

            <LoyaltyAdjustModal
                theme={theme}
                isOpen={!!adjusting}
                onClose={() => setAdjusting(null)}
                phone={adjusting?.phone || ''}
                name={adjusting?.name}
                balance={adjusting?.balance ?? 0}
                onSaved={() => { setRefreshKey((k) => k + 1); setSearch(''); }}
            />
        </div>
    );
};

export default LoyaltyReport;