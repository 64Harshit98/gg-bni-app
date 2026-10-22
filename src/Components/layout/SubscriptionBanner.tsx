import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { FiClock, FiAlertTriangle, FiX } from 'react-icons/fi';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); // "7 Oct"
const todayKey = () => new Date().toLocaleDateString('en-CA');

/** Days left + end date; owns the "remind me tomorrow" state. */
export function useSubscriptionBanner() {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const [days, setDays] = useState<number | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [isTrial, setIsTrial] = useState(false);
  const dismissKey = `sub_banner_closed_${companyId}`;
  const [closedToday, setClosedToday] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    try { setClosedToday(localStorage.getItem(dismissKey) === todayKey()); } catch { /* ignore */ }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'companies', companyId));
        const data = snap.exists() ? snap.data() : null;
        const expiry = data?.expiryDate ?? null;
        if (!expiry) return;
        setIsTrial(data?.isTrial === true);
        const d: Date = expiry.toDate ? expiry.toDate() : new Date(expiry);
        setEndDate(d);
        setDays(Math.ceil((d.getTime() - Date.now()) / 86400000));
      } catch (e) {
        console.error('Failed to load subscription expiry', e);
      }
    })();
  }, [companyId, dismissKey]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(dismissKey, todayKey()); } catch { /* ignore */ }
    setClosedToday(true);
  }, [dismissKey]);

  // tier: 7–4 info · 3–2 warn · last day (≤1) urgent
  const tier: 'info' | 'warn' | 'urgent' | null =
    days === null || days < 0 || days > 7 ? null : days <= 1 ? 'urgent' : days <= 3 ? 'warn' : 'info';

  return {
    days,
    endDate,
    isTrial,
    tier,
    urgent: tier === 'urgent',
    // the last-day banner can't be closed, so it ignores the dismissal
    visible: tier !== null && (tier === 'urgent' || !closedToday),
    dismiss,
  };
}

type Theme = 'pos' | 'cat';

// Colours from the SELLAR tokens. Catalogue = orange primary + amber warning.
const THEMES = {
  pos: {
    primaryBtn: 'bg-[#155dfc] hover:bg-[#1447e6] text-white',
    info: 'bg-[#e6eeff] border-[#dfe6fb]',
    infoIcon: 'text-[#155dfc]',
    warn: 'bg-[#fff3dd] border-transparent',
    warnIcon: 'text-[#bb4d00]',
    ring: 'focus-visible:ring-[#155dfc]',
  },
  cat: {
    primaryBtn: 'bg-[#c2410c] hover:bg-[#9a3412] text-white',
    info: 'bg-[#ffedd5] border-[#f6e1d0]',
    infoIcon: 'text-[#c2410c]',
    warn: 'bg-[#fef6d7] border-transparent',
    warnIcon: 'text-[#a16207]',
    ring: 'focus-visible:ring-[#c2410c]',
  },
} as const;

interface Props {
  days: number;
  endDate: Date | null;
  isTrial?: boolean;
  tier: 'info' | 'warn' | 'urgent';
  /** desktop = joined under the floating top bar · mobile = compact, under the mobile header */
  variant: 'desktop' | 'mobile';
  /** pos = blue · cat = Catalogue orange */
  theme?: Theme;
  onClose?: () => void;
}

export function SubscriptionBanner({ days, endDate, isTrial = false, tier, variant, theme = 'pos', onClose }: Props) {
  const t = THEMES[theme];
  const urgent = tier === 'urgent';
  const dateTxt = endDate ? fmtDate(endDate) : '';
  const noun = isTrial ? 'trial plan' : 'plan';

  const when =
    days <= 0 ? 'ends today' : days === 1 ? `ends tomorrow, ${dateTxt}` : `ends in ${days} days, on ${dateTxt}`;
  const sub = isTrial
    ? urgent ? 'Choose a plan today to keep using SELLAR without a break.'
      : tier === 'warn' ? 'Choose a plan now so billing doesn’t stop at the counter.'
        : `Choose a plan any time — it starts right after your trial plan ends on ${dateTxt}.`
    : urgent ? 'Renew today to keep using SELLAR without a break.'
      : tier === 'warn' ? 'Renew now so billing doesn’t stop at the counter.'
        : `Renew any time — your new term starts after ${dateTxt}.`;

  const toneBox =
    urgent ? 'bg-[#ffeef0] border-[#d5000c]' : tier === 'warn' ? t.warn : t.info;
  const titleCls = urgent ? 'text-[#d5000c]' : 'text-[#0f172b]';
  const chip = urgent ? 'bg-[#d5000c] text-white' : `bg-white ${tier === 'warn' ? t.warnIcon : t.infoIcon}`;

  const shell =
    variant === 'desktop'
      ? 'mx-3 mt-3 hidden shrink-0 md:flex'
      : 'mx-3 mt-3 flex shrink-0 md:hidden';

  const btn = 'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-sm px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={`${shell} items-center gap-3 rounded-sm border px-4 py-2.5 text-[13px] ${toneBox}`}
    >
      <span className={`grid h-8 w-8 flex-none place-items-center rounded-full ${chip}`}>
        {urgent ? <FiAlertTriangle size={16} aria-hidden /> : <FiClock size={16} aria-hidden />}
      </span>

      {variant === 'desktop' ? (
        <>
          <div className="min-w-0 flex-1 leading-[18px]">
            <b className={`font-semibold ${titleCls}`}>Your {noun} {when}.</b>{' '}
            <span className="text-[#45556c]">{sub}</span>
          </div>
          <Link to="/subscription" className={`${btn} text-[#45556c] hover:bg-[#f5f7ff] ${t.ring}`}>See plans</Link>
          <Link to="/subscription" className={`${btn} ${t.primaryBtn} ${t.ring}`}>{isTrial ? 'Choose a plan' : 'Renew plan'}</Link>
        </>
      ) : (
        <>
          {/* compact: tapping the text opens Plan & subscription */}
          <Link to="/subscription" className="min-w-0 flex-1">
            <b className={`block truncate font-semibold ${titleCls}`}>
              {isTrial ? 'Trial plan' : 'Plan'} {days <= 0 ? 'ends today' : days === 1 ? 'ends tomorrow' : `ends in ${days} days`}
            </b>
          </Link>
          <Link to="/subscription" className={`${btn} ${t.primaryBtn} ${t.ring}`}>{isTrial ? 'Choose plan' : 'Renew'}</Link>
        </>
      )}

      {!urgent && onClose && (
        <button
          onClick={onClose}
          aria-label="Remind me tomorrow"
          className={`grid h-8 w-8 flex-none place-items-center rounded-sm text-[#5b6b86] hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 ${t.ring}`}
        >
          <FiX size={16} />
        </button>
      )}
    </div>
  );
}