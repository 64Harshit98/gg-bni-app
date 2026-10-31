import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { getDefaultShopHoursSettings, type ShopHoursSettings } from '../hooks/useShopHours';
import { Spinner } from '../../constants/Spinner';

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
const DAY = 1440;
const GRACE_MIN = 60; // shop auto-locks 1 hour after closing time

// "21:00" -> 1260. Returns null if the value is empty/invalid (e.g. input cleared).
const toMin = (time: string): number | null => {
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// 1260 -> "9:00 pm"
const fmt12 = (min: number): string => {
  const mm = ((min % DAY) + DAY) % DAY;
  const h = Math.floor(mm / 60);
  const m = mm % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

// 336 -> "5 h 36 min", 45 -> "45 min"
const fmtDuration = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

// true if `now` falls in [start, end), handles overnight ranges (e.g. 18:00 -> 02:00)
const inRange = (now: number, start: number, end: number): boolean => {
  const s = ((start % DAY) + DAY) % DAY;
  const e = ((end % DAY) + DAY) % DAY;
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
};

// Bar segments (in %) for a range that may wrap past midnight
const segments = (start: number, length: number) => {
  const s = ((start % DAY) + DAY) % DAY;
  const end = s + length;
  if (end <= DAY) return [{ left: (s / DAY) * 100, width: (length / DAY) * 100 }];
  return [
    { left: (s / DAY) * 100, width: ((DAY - s) / DAY) * 100 },
    { left: 0, width: ((end - DAY) / DAY) * 100 },
  ];
};

const useNowMinutes = (): number => {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const Svg: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = 'w-4 h-4', children }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const BellIcon: React.FC = () => (
  <Svg>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
  </Svg>
);

const ClockIcon: React.FC = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

const LockIcon: React.FC = () => (
  <Svg>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  activeColor?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, activeColor = 'bg-blue-600' }) => (
  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only"
    />
    <div
      className={`w-11 h-6 rounded-full transition-colors duration-200 ${checked ? activeColor : 'bg-gray-300'
        }`}
    >
      <div
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'
          }`}
      />
    </div>
  </label>
);

// ---------------------------------------------------------------------------
// Status Card ("Open now · closing reminder in 5 h 36 min")
// ---------------------------------------------------------------------------
type StatusTone = 'success' | 'warning' | 'neutral';

interface StatusInfo {
  tone: StatusTone;
  title: string;
  caption: string;
  badge?: string;
}

const STATUS_STYLES: Record<StatusTone, { box: string; dot: string; title: string; badge: string }> = {
  success: {
    box: 'bg-green-50',
    dot: 'bg-green-600 shadow-[0_0_0_4px_rgba(0,130,54,0.15)]',
    title: 'text-green-700',
    badge: 'bg-green-100 text-green-700',
  },
  warning: {
    box: 'bg-amber-50',
    dot: 'bg-amber-600 shadow-[0_0_0_4px_rgba(187,77,0,0.15)]',
    title: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
  },
  neutral: {
    box: 'bg-gray-50',
    dot: 'bg-gray-400 shadow-[0_0_0_4px_rgba(156,163,175,0.2)]',
    title: 'text-gray-700',
    badge: 'bg-gray-100 text-gray-500',
  },
};

const StatusCard: React.FC<{ info: StatusInfo }> = ({ info }) => {
  const s = STATUS_STYLES[info.tone];
  return (
    <div className={`flex items-center gap-3 rounded-sm px-3.5 py-3 mb-3 ${s.box}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold ${s.title}`}>{info.title}</p>
        {info.caption && <p className="text-xs text-gray-500">{info.caption}</p>}
      </div>
      {info.badge && (
        <span className={`text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-sm ${s.badge}`}>
          {info.badge}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Success Banner
// ---------------------------------------------------------------------------
const SuccessBanner: React.FC = () => (
  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-sm px-3.5 py-2.5 mb-3">
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
    Settings saved successfully.
  </div>
);

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
interface ShopHoursSettingPageProps {
  theme?: 'blue' | 'orange';
}

const STRIPES =
  'repeating-linear-gradient(45deg, #bb4d00 0 3px, #fff3e6 3px 6px)';

const ShopHoursSettingPage: React.FC<ShopHoursSettingPageProps> = ({ theme = 'blue' }) => {
  const { currentUser } = useAuth();
  const accent = theme === 'orange'
    ? 'bg-[#F97316] hover:bg-orange-600 focus:ring-orange-400'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
  const focusRing = theme === 'orange' ? 'focus:ring-[#F97316]' : 'focus:ring-blue-500';
  const toggleColor = theme === 'orange' ? 'bg-[#F97316]' : 'bg-blue-600';
  const softBox = theme === 'orange' ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100';
  const infoChip = theme === 'orange' ? 'bg-orange-50 text-[#F97316]' : 'bg-blue-50 text-blue-700';
  const [settings, setSettings] = useState<ShopHoursSettings>(getDefaultShopHoursSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const now = useNowMinutes();

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.companyId) return;
      try {
        const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'shop-hours');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setSettings(snap.data() as ShopHoursSettings);
        }
      } catch (err) {
        console.error('Failed to load shop-hours settings', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser?.companyId]);

  const handleSave = async () => {
    if (!currentUser?.companyId) return;
    setSaving(true);
    setSaved(false);
    try {
      const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'shop-hours');
      await setDoc(ref, settings, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save shop-hours settings', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Spinner />
      </div>
    );
  }

  // ---- derived values for timeline / steps / status ----
  const open = toMin(settings.openTime);
  const close = toMin(settings.closeTime);
  const valid = open !== null && close !== null;

  let status: StatusInfo = { tone: 'neutral', title: 'Choose opening and closing time', caption: '' };
  if (!settings.enabled) {
    status = {
      tone: 'neutral',
      title: 'Shop hours lock is off',
      caption: 'Staff can log in at any time',
      badge: 'OFF',
    };
  } else if (valid) {
    const openLen = (close - open + DAY) % DAY;
    const sinceClose = (now - close + DAY) % DAY;
    if (inRange(now, open, close)) {
      status = {
        tone: 'success',
        title: 'Open now',
        caption: `Closing reminder in ${fmtDuration((close - now + DAY) % DAY)}`,
        badge: `OPEN · ${Math.round(openLen / 60)} H`,
      };
    } else if (inRange(now, close, close + GRACE_MIN)) {
      status = {
        tone: 'warning',
        title: 'Past closing time',
        caption: `App locks for staff in ${fmtDuration(GRACE_MIN - sinceClose)}`,
        badge: 'LOCKING SOON',
      };
    } else {
      status = {
        tone: 'neutral',
        title: 'Closed',
        caption: `Opens at ${fmt12(open)}`,
        badge: 'LOCKED',
      };
    }
  }

  const steps = valid
    ? [
        {
          icon: <BellIcon />,
          chip: infoChip,
          title: `${fmt12(close)} — closing reminder`,
          text: 'Pops up for anyone logged in.',
        },
        {
          icon: <ClockIcon />,
          chip: 'bg-amber-50 text-amber-700',
          title: 'Every 15 min if snoozed',
          text: [15, 30, 45].map((m) => fmt12(close + m)).join(', '),
        },
        {
          icon: <LockIcon />,
          chip: 'bg-red-50 text-red-600',
          title: `${fmt12(close + GRACE_MIN)} — app locks for staff`,
          text: `Automatic, 1 hour after closing time. Opens again at ${fmt12(open)}.`,
        },
      ]
    : [];

  const barColor = theme === 'orange' ? 'bg-[#F97316]' : 'bg-blue-600';
  const ticks = [
    { left: 0, label: '12 am', shift: '' },
    { left: 25, label: '6 am', shift: '-translate-x-1/2' },
    { left: 50, label: '12 pm', shift: '-translate-x-1/2' },
    { left: 75, label: '6 pm', shift: '-translate-x-1/2' },
    { left: 100, label: '12 am', shift: '-translate-x-full' },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* Scrollable body (title + subtitle live in the modal header) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-3">

      {/* Main Card */}
      <div className="bg-white border border-gray-200 rounded-sm p-4 mb-3 grid gap-4">

        {/* Toggle */}
        <div className={`flex items-start justify-between gap-4 rounded-sm border p-3.5 ${softBox}`}>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900 mb-0.5">Lock app outside shop hours</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Managers and salesmen can log in only between opening and closing time.
            </p>
          </div>
          <ToggleSwitch
            checked={settings.enabled}
            onChange={(checked) => setSettings((s) => ({ ...s, enabled: checked }))}
            activeColor={toggleColor}
          />
        </div>

        {/* Time inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Opens at</label>
            <input
              type="time"
              value={settings.openTime}
              onChange={(e) => setSettings((s) => ({ ...s, openTime: e.target.value }))}
              disabled={!settings.enabled}
              className={`w-full text-sm font-semibold tabular-nums text-gray-900 bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed transition ${focusRing}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Closes at</label>
            <input
              type="time"
              value={settings.closeTime}
              onChange={(e) => setSettings((s) => ({ ...s, closeTime: e.target.value }))}
              disabled={!settings.enabled}
              className={`w-full text-sm font-semibold tabular-nums text-gray-900 bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed transition ${focusRing}`}
            />
          </div>
        </div>

        {valid && (
          <div className={settings.enabled ? '' : 'opacity-40'}>
            {/* Day timeline */}
            <div className="relative h-9 mt-5">
              <span className="absolute inset-x-0 top-2 h-2.5 rounded-sm bg-gray-100 border border-gray-200" />
              {segments(open, (close - open + DAY) % DAY).map((seg, i) => (
                <span
                  key={`open-${i}`}
                  className={`absolute top-2 h-2.5 rounded-sm ${barColor}`}
                  style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
                />
              ))}
              {segments(close, GRACE_MIN).map((seg, i) => (
                <span
                  key={`grace-${i}`}
                  className="absolute top-2 h-2.5 rounded-sm"
                  style={{ left: `${seg.left}%`, width: `${seg.width}%`, backgroundImage: STRIPES }}
                />
              ))}
              <span
                className="absolute top-0.5 w-0.5 h-[22px] bg-gray-900 rounded-sm"
                style={{ left: `${(now / DAY) * 100}%` }}
              >
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold whitespace-nowrap text-gray-900">
                  Now {fmt12(now)}
                </span>
              </span>
              {ticks.map((t) => (
                <span
                  key={t.left}
                  className={`absolute top-[22px] whitespace-nowrap text-[10px] text-gray-400 ${t.shift}`}
                  style={{ left: `${t.left}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <i className={`w-2.5 h-2.5 rounded-sm ${barColor}`} />
                Staff can log in
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm" style={{ backgroundImage: STRIPES }} />
                Closing reminders
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm bg-gray-100 border border-gray-200" />
                Locked
              </span>
            </div>

            {/* At closing time */}
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">At closing time</p>
              <div>
                {steps.map((step, i) => (
                  <div key={step.title} className="relative grid grid-cols-[28px_1fr] gap-2.5 pb-3 last:pb-0">
                    {i < steps.length - 1 && (
                      <span className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-gray-200" />
                    )}
                    <span className={`w-7 h-7 rounded-sm grid place-items-center ${step.chip}`}>
                      {step.icon}
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-gray-900 leading-[18px]">{step.title}</p>
                      <p className="text-xs text-gray-500 leading-4">{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 leading-relaxed">
          Applies to managers and salesmen. Other roles can always log in.
        </p>
      </div>

      {/* Status Card */}
      <StatusCard info={status} />

      </div>

      {/* Pinned footer */}
      <div className="flex-shrink-0 px-5 pt-3 pb-4 border-t border-gray-100 bg-white">
        {/* Success Banner */}
        {saved && <SuccessBanner />}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full h-11 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-sm flex items-center justify-center gap-2 transition ${accent}`}
        >
          {saving ? <Spinner /> : 'Save settings'}
        </button>
      </div>
    </div>
  );
};

export default ShopHoursSettingPage;