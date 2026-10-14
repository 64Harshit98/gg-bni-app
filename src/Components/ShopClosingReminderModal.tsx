import React, { useEffect, useState } from 'react';

interface Props {
  closeTime: string;
  onConfirmClose: () => void;
  onSnooze: () => void;
}

const DAY = 1440;
const GRACE_MIN = 60; // shop auto-locks 1 hour after closing time

// "21:00" -> 1260 (falls back to 0 on bad input)
const toMin = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

// 1260 -> "9:00 pm"
const fmt12 = (min: number): string => {
  const mm = ((min % DAY) + DAY) % DAY;
  const h = Math.floor(mm / 60);
  const m = mm % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

const useNowMinutes = (): number => {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 15000);
    return () => clearInterval(id);
  }, []);
  return now;
};

const ShopClosingReminderModal: React.FC<Props> = ({ closeTime, onConfirmClose, onSnooze }) => {
  const now = useNowMinutes();
  const close = toMin(closeTime);

  // minutes passed since closing time (0 if modal is somehow shown a bit early)
  const rawSince = (now - close + DAY) % DAY;
  const sinceClose = rawSince <= 120 ? rawSince : 0;
  const minsLeft = Math.max(0, GRACE_MIN - sinceClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-closing-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(2,6,24,0.5)] px-4"
    >
      <div className="bg-white rounded-sm shadow-xl max-w-sm w-full p-5 grid gap-3.5">
        <span className="justify-self-center w-14 h-14 rounded-sm bg-amber-50 text-amber-700 grid place-items-center">
          <svg
            className="w-7 h-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>

        <div className="text-center">
          <h2 id="shop-closing-title" className="text-lg font-semibold text-gray-900">
            Shop closes at {fmt12(close)}
          </h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Finish the bill you&apos;re on. The app locks for staff at{' '}
            <b className="font-semibold text-gray-800">{fmt12(close + GRACE_MIN)}</b>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 rounded-sm bg-amber-50 px-3.5 py-3">
          <span className="w-2 h-2 rounded-full bg-amber-600 shadow-[0_0_0_4px_rgba(187,77,0,0.15)] flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-amber-700">
              {minsLeft > 0 ? `Locks in ${minsLeft} min` : 'Locking now'}
            </p>
            <p className="text-xs text-gray-500">
              {minsLeft > 15 ? 'Snooze to be reminded again in 15 min' : 'Last reminder before the app locks'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onSnooze}
            className="h-11 rounded-sm border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition"
          >
            Snooze 15 min
          </button>
          <button
            onClick={onConfirmClose}
            className="h-11 rounded-sm bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Close shop
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShopClosingReminderModal;