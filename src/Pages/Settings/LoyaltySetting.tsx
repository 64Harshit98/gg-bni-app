import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FiCheck } from 'react-icons/fi';
import { Award, Gift, Printer, ShieldCheck, Star, Users } from 'lucide-react';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';
import {
    LOYALTY_SETTINGS_DOC,
    calcEarnPoints,
    getDefaultLoyaltySettings,
    pointsToRupees,
    type LoyaltySettings,
} from '../../lib/loyalty';

/* SELLAR tokens (POS blue accent) — same values as SalesSetting.tsx */
const ROOT_BASE =
    "bg-[#eef2ff] font-['Poppins',system-ui,-apple-system,'Segoe_UI',sans-serif] text-sm leading-[22px] text-[#0f172b] antialiased";
const CARD_SHADOW = 'shadow-[0_1px_2px_rgba(21,48,140,.05),0_2px_6px_rgba(21,48,140,.06)]';
const FLOAT_SHADOW = 'shadow-[0_10px_28px_rgba(21,48,140,.14),0_2px_6px_rgba(21,48,140,.08)]';
const FOCUS_RING =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]';
const FIELD =
    'flex h-10 items-center gap-2 border border-[#7a8aa3] bg-white px-3 rounded-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]';
const FIELD_INPUT =
    'min-w-0 flex-1 border-0 bg-transparent text-sm tabular-nums text-[#0f172b] outline-none placeholder:text-[#5b6b86]';
const FIELD_LABEL = 'mb-1 block text-xs font-medium text-[#45556c]';
const BTN_PRIMARY = `inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent px-4 text-sm font-medium leading-5 transition-colors bg-[#155dfc] text-white hover:bg-[#1447e6] disabled:cursor-not-allowed disabled:opacity-[.45] ${FOCUS_RING}`;
const PREVIEW =
    'mt-2 inline-flex flex-wrap items-center gap-1.5 bg-[#f5f7ff] px-3 py-2 text-xs leading-[18px] text-[#45556c] rounded-sm [&_b]:font-semibold [&_b]:tabular-nums [&_b]:text-[#0f172b]';

type Tint = 'blue' | 'green' | 'amber' | 'magenta';
const TINTS: Record<Tint, string> = {
    blue: 'bg-[#e6eeff] text-[#155dfc]',
    green: 'bg-[#e9faef] text-[#008236]',
    amber: 'bg-[#fff3dd] text-[#bb4d00]',
    magenta: 'bg-[#ffe8f8] text-[#c4009a]',
};

const ico = (Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>) => <Icon size={16} strokeWidth={1.75} />;

const Section: React.FC<{ title: string; subtitle: string; icon: React.ReactNode; tint?: Tint; children: React.ReactNode }> = ({
    title, subtitle, icon, tint = 'blue', children,
}) => (
    <section className={`min-w-0 overflow-hidden border border-[#dfe6fb] bg-white rounded-sm ${CARD_SHADOW}`}>
        <div className="flex items-center gap-3 border-b border-[#dfe6fb] px-3.5 py-3 lg:px-[18px] lg:py-3.5">
            <span className={`inline-grid h-8 w-8 flex-none place-items-center rounded-sm ${TINTS[tint]}`}>{icon}</span>
            <div className="min-w-0">
                <b className="block text-[15px] font-semibold leading-[22px] lg:text-base">{title}</b>
                <small className="block text-xs font-normal leading-[18px] text-[#5b6b86]">{subtitle}</small>
            </div>
        </div>
        {children}
    </section>
);

const Opt: React.FC<{
    id?: string;
    label: string;
    description?: React.ReactNode;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    children?: React.ReactNode;
}> = ({ id, label, description, checked, onChange, disabled = false, children }) => {
    const hasSwitch = Boolean(id && onChange);
    return (
        <div
            className={`grid items-center gap-x-4 gap-y-1.5 border-b border-[#dfe6fb] px-3.5 py-3 last:border-b-0 lg:px-[18px] lg:py-3.5 ${
                hasSwitch ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)]'
            } ${disabled ? 'pointer-events-none opacity-[.45]' : ''}`}
        >
            <div className="min-w-0">
                <div className="text-sm font-medium">
                    {hasSwitch ? <label htmlFor={id} className="cursor-pointer">{label}</label> : <span>{label}</span>}
                </div>
                {description && <p className="mb-0 mt-0.5 text-xs leading-[18px] text-[#5b6b86]">{description}</p>}
            </div>
            {hasSwitch && (
                <label className="relative inline-flex flex-none cursor-pointer" htmlFor={id}>
                    <input
                        id={id}
                        type="checkbox"
                        className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
                        checked={checked ?? false}
                        onChange={(e) => onChange!(e.target.checked)}
                    />
                    <span
                        aria-hidden="true"
                        className="relative block h-[22px] w-10 rounded-full bg-[#7a8aa3] transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform after:content-[''] peer-checked:bg-[#155dfc] peer-checked:after:translate-x-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#155dfc]"
                    />
                </label>
            )}
            {children && <div className="col-span-full">{children}</div>}
        </div>
    );
};

/** The number boxes on this page. Kept as text while typing so a box can stay empty. */
type NumKey = 'earnPoints' | 'earnPerAmount' | 'minBillForEarn' | 'pointValue' | 'minPointsToRedeem' | 'maxRedeemPercent';
const NUM_KEYS: NumKey[] = ['earnPoints', 'earnPerAmount', 'minBillForEarn', 'pointValue', 'minPointsToRedeem', 'maxRedeemPercent'];
/** Optional boxes: left empty they mean "no minimum" (0) / "no limit" (100%). */
const EMPTY_MEANS: Partial<Record<NumKey, number>> = { minBillForEarn: 0, minPointsToRedeem: 0, maxRedeemPercent: 100 };
const DECIMAL = /^\d*\.?\d*$/;

/** Saved value → box text. Nothing saved yet, or 0, shows an empty box. */
const toText = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v !== 0 ? String(v) : '');
/** Box text → number; an empty required box becomes NaN so validation flags it. */
const toNum = (key: NumKey, text: string) =>
    text.trim() === '' ? (EMPTY_MEANS[key] ?? NaN) : Number(text);

const NumberField: React.FC<{
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    prefix?: string;
    suffix?: string;
    placeholder?: string;
}> = ({ id, label, value, onChange, prefix, suffix, placeholder }) => (
    <div className="min-w-0">
        <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
        <div className={FIELD}>
            {prefix && <span className="text-[#5b6b86]">{prefix}</span>}
            <input
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className={FIELD_INPUT}
                value={value}
                placeholder={placeholder}
                onChange={(e) => DECIMAL.test(e.target.value) && onChange(e.target.value)}
            />
            {suffix && <span className="whitespace-nowrap text-[#5b6b86]">{suffix}</span>}
        </div>
    </div>
);

const rupees = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/** Returns an error message, or null when the settings can be saved. */
const validate = (s: LoyaltySettings): string | null => {
    if (!s.enabled) return null;
    if (!(s.earnPoints > 0) || !Number.isInteger(s.earnPoints)) return 'Points earned must be a whole number above 0.';
    if (!(s.earnPerAmount > 0)) return 'The spend amount for earning points must be above ₹0.';
    if (s.minBillForEarn < 0) return 'Minimum bill cannot be negative.';
    if (s.redeemEnabled) {
        if (!(s.pointValue > 0)) return 'The value of one point must be above ₹0.';
        if (s.minPointsToRedeem < 0 || !Number.isInteger(s.minPointsToRedeem)) return 'Minimum points to redeem must be a whole number.';
        if (!(s.maxRedeemPercent > 0 && s.maxRedeemPercent <= 100)) return 'Maximum share of a bill must be between 1% and 100%.';
    }
    return null;
};

const LoyaltySettingPage: React.FC = () => {
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;

    const [settings, setSettings] = useState<LoyaltySettings | null>(null);
    // Number boxes start empty (no pre-filled defaults); see toText / toNum
    const [nums, setNums] = useState<Record<NumKey, string>>(
        () => Object.fromEntries(NUM_KEYS.map((k) => [k, ''])) as Record<NumKey, string>,
    );
    const [isSaving, setIsSaving] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        (async () => {
            const defaults = getDefaultLoyaltySettings(companyId);
            try {
                const snap = await getDoc(doc(db, 'companies', companyId, 'settings', LOYALTY_SETTINGS_DOC));
                if (cancelled) return;
                const data = snap.exists() ? snap.data() : {};
                setSettings({ ...defaults, ...data } as LoyaltySettings);
                setNums(Object.fromEntries(NUM_KEYS.map((k) => [k, toText(data[k])])) as Record<NumKey, string>);
            } catch (err) {
                console.error('Failed to load loyalty settings:', err);
                if (!cancelled) {
                    setSettings(defaults);
                    setModal({ message: 'Failed to load loyalty settings.', type: State.ERROR });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [companyId]);

    const set = <K extends keyof LoyaltySettings>(key: K, value: LoyaltySettings[K]) =>
        setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    const setNum = (key: NumKey) => (v: string) => setNums((prev) => ({ ...prev, [key]: v }));

    /** The settings as they'd be saved — empty required boxes are NaN. */
    const parsed: LoyaltySettings | null = settings
        ? { ...settings, ...(Object.fromEntries(NUM_KEYS.map((k) => [k, toNum(k, nums[k])])) as Record<NumKey, number>) }
        : null;

    const handleSave = async () => {
        if (!companyId || !parsed) return;
        const error = validate(parsed);
        if (error) {
            setModal({ message: error, type: State.ERROR });
            return;
        }
        // A box left empty while its feature is off isn't saved, so nothing already saved is wiped
        const payload: Record<string, unknown> = { ...parsed };
        NUM_KEYS.forEach((k) => {
            if (!Number.isFinite(parsed[k])) delete payload[k];
            else if (k === 'earnPoints' || k === 'minPointsToRedeem') payload[k] = Math.trunc(parsed[k]);
        });
        setIsSaving(true);
        try {
            await setDoc(
                doc(db, 'companies', companyId, 'settings', LOYALTY_SETTINGS_DOC),
                {
                    ...payload,
                    companyId,
                    settingType: 'loyalty',
                    updatedAt: new Date(),
                },
                { merge: true },
            );
            setModal({ message: 'Loyalty settings saved.', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save loyalty settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    if (!settings || !parsed) {
        return (
            <div className={ROOT_BASE}>
                <div className="flex min-h-screen flex-col items-center justify-center text-[#45556c]">
                    <Spinner />
                    <p className="mt-4">Loading settings...</p>
                </div>
            </div>
        );
    }

    const off = !settings.enabled;
    const exampleBill = 1250;
    const earnReady = parsed.earnPoints > 0 && parsed.earnPerAmount > 0;
    const exampleEarn = earnReady ? calcEarnPoints(exampleBill, { ...parsed, enabled: true }) : 0;
    const redeemReady = parsed.pointValue > 0;

    return (
        <div className={`${ROOT_BASE} flex min-h-screen w-full flex-col`}>
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <div className="sticky top-0 z-30 border-b border-[#dfe6fb] bg-white">
                <div className="flex h-14 items-center gap-3 px-2 md:h-auto md:px-6 md:py-3.5">
                    <div className="flex-shrink-0"><BackButton /></div>
                    <div className="min-w-0 flex-1">
                        <div className="hidden text-xs leading-[18px] text-[#5b6b86] md:block">Settings /</div>
                        <h1 className="m-0 text-lg font-semibold leading-6 text-[#0f172b] md:text-[22px] md:leading-[30px]">
                            Loyalty points
                        </h1>
                    </div>
                    <Link
                        to={ROUTES.LOYALTY_POINTS}
                        className={`inline-flex h-9 items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-sm font-medium text-[#0f172b] hover:bg-[#f5f7ff] ${FOCUS_RING}`}
                    >
                        <Users size={16} strokeWidth={1.75} />
                        <span className="hidden sm:inline">Customer points</span>
                    </Link>
                </div>
            </div>

            <main className="min-h-0 w-full flex-grow box-border px-3 pb-44 pt-3 sm:px-4 sm:pt-4 md:pb-6 lg:px-6 lg:pt-6">
                <div className="mx-auto grid max-w-[760px] gap-4">
                    <Section title="Loyalty programme" subtitle="Reward customers with points on every bill" icon={ico(Star)}>
                        <Opt
                            id="loyalty-enabled"
                            label="Turn on loyalty points"
                            description="Customers with a 10-digit mobile number earn points on their bills. Walk-in bills without a number don't earn points."
                            checked={settings.enabled}
                            onChange={(v) => set('enabled', v)}
                        />
                    </Section>

                    <Section title="Earning" subtitle="How many points a bill gives" icon={ico(Award)} tint="green">
                        <Opt label="Points per spend" disabled={off}>
                            <div className="grid grid-cols-2 gap-3 sm:max-w-[420px]">
                                <NumberField id="earn-points" label="Give" suffix="pts" value={nums.earnPoints} onChange={setNum('earnPoints')} />
                                <NumberField id="earn-per" label="For every" prefix="₹" value={nums.earnPerAmount} onChange={setNum('earnPerAmount')} />
                            </div>
                            <div className={PREVIEW}>
                                {earnReady
                                    ? <>A <b>{rupees(exampleBill)}</b> bill earns <b>{exampleEarn} pts</b>. Points are rounded down.</>
                                    : <>Enter the points and the spend amount to see an example.</>}
                            </div>
                        </Opt>
                        <Opt label="Minimum bill to earn" description="Bills below this amount don't earn points. Leave empty for no minimum." disabled={off}>
                            <div className="sm:max-w-[200px]">
                                <NumberField id="earn-min" label="Minimum bill" prefix="₹" value={nums.minBillForEarn} onChange={setNum('minBillForEarn')} placeholder="No minimum" />
                            </div>
                        </Opt>
                        <Opt
                            id="allow-override"
                            label="Allow authorised staff to change points on a bill"
                            description={
                                <>
                                    Cashiers always see the points as read-only. When this is on, only roles with the{' '}
                                    <b className="font-semibold text-[#45556c]">Change points on a bill</b> permission can edit them.{' '}
                                    <Link to={ROUTES.PERMSETTING} className="font-medium text-[#155dfc] hover:underline">Manage permissions</Link>
                                </>
                            }
                            checked={settings.allowBillOverride}
                            onChange={(v) => set('allowBillOverride', v)}
                            disabled={off}
                        />
                    </Section>

                    <Section title="Redeeming" subtitle="Customers pay part of a bill with points" icon={ico(Gift)} tint="amber">
                        <Opt
                            id="redeem-enabled"
                            label="Allow paying with points"
                            description="Shows a Use points option in the payment screen. Any staff member can apply it."
                            checked={settings.redeemEnabled}
                            onChange={(v) => set('redeemEnabled', v)}
                            disabled={off}
                        />
                        <Opt label="Value and limits" disabled={off || !settings.redeemEnabled}>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <NumberField id="point-value" label="1 point is worth" prefix="₹" value={nums.pointValue} onChange={setNum('pointValue')} />
                                <NumberField id="min-redeem" label="Minimum points to use" suffix="pts" value={nums.minPointsToRedeem} onChange={setNum('minPointsToRedeem')} placeholder="No minimum" />
                                <NumberField id="max-pct" label="Max share of a bill" suffix="%" value={nums.maxRedeemPercent} onChange={setNum('maxRedeemPercent')} placeholder="No limit" />
                            </div>
                            <div className={PREVIEW}>
                                {redeemReady ? (
                                    <>
                                        <b>100 pts</b> = <b>{rupees(pointsToRupees(100, parsed))}</b>. On a <b>₹1,000</b> bill, points can pay up to{' '}
                                        <b>{rupees((1000 * Math.min(100, Math.max(0, parsed.maxRedeemPercent || 0))) / 100)}</b>.
                                    </>
                                ) : <>Enter what 1 point is worth to see an example.</>}
                            </div>
                        </Opt>
                    </Section>

                    <Section title="Other" subtitle="Online orders and printing" icon={ico(Printer)} tint="magenta">
                        <Opt
                            id="online-orders"
                            label="Use points on online orders"
                            description="Orders earn points when you mark them Completed, and points can be used when you take payment."
                            checked={settings.applyToOnlineOrders}
                            onChange={(v) => set('applyToOnlineOrders', v)}
                            disabled={off}
                        />
                        <Opt
                            id="print-on-bill"
                            label="Print points on the bill"
                            description="Shows points earned, used and the customer's balance at the bottom of the bill."
                            checked={settings.printOnBill}
                            onChange={(v) => set('printOnBill', v)}
                            disabled={off}
                        />
                    </Section>

                    <p className="m-0 flex items-start gap-2 px-1 text-xs leading-[18px] text-[#5b6b86]">
                        <ShieldCheck size={14} strokeWidth={1.75} className="mt-0.5 flex-none" />
                        Adding or removing a customer's points by hand needs the Manage loyalty points permission. Every change is kept in the customer's points history.
                    </p>
                </div>
            </main>

            <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 px-3 pb-2 md:pointer-events-auto md:sticky md:inset-x-auto md:bottom-0 md:border-t md:border-[#dfe6fb] md:bg-white md:p-0 md:shadow-[0_-6px_16px_rgba(21,48,140,.06)]">
                <div className={`pointer-events-auto mx-auto flex max-w-[640px] items-center justify-between gap-3 border border-[#dfe6fb] bg-white py-2.5 pl-4 pr-2.5 rounded-sm ${FLOAT_SHADOW} md:mx-0 md:max-w-none md:rounded-none md:border-0 md:bg-transparent md:px-6 md:py-3 md:shadow-none`}>
                    <span className="min-w-0 text-xs leading-[18px] text-[#5b6b86]">Changes save only when you press Save.</span>
                    <button type="button" onClick={handleSave} disabled={isSaving} className={`${BTN_PRIMARY} min-w-[140px]`}>
                        {isSaving ? <Spinner /> : (<><FiCheck size={16} />Save settings</>)}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoyaltySettingPage;
