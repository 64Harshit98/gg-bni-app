// A small strip under a cart line that FLAGS a price — it never changes one.
// Used by Sales (customer price available / applied) and Purchase (supplier rate
// changed since last time). The user acts through the buttons; nothing is automatic.

export type PriceFlagTone = 'info' | 'applied' | 'up' | 'down' | 'muted';

export interface PriceFlagAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface PriceFlagData {
  tone: PriceFlagTone;
  text: string;
  actions?: PriceFlagAction[];
}

const TONES: Record<PriceFlagTone, string> = {
  info: 'bg-blue-50 text-blue-800 border-blue-100',
  applied: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  up: 'bg-red-50 text-red-700 border-red-100',
  down: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  muted: 'bg-gray-50 text-gray-500 border-gray-100',
};

const BUTTONS: Record<PriceFlagTone, string> = {
  info: 'text-blue-700 hover:bg-blue-100',
  applied: 'text-emerald-700 hover:bg-emerald-100',
  up: 'text-red-700 hover:bg-red-100',
  down: 'text-emerald-700 hover:bg-emerald-100',
  muted: 'text-gray-600 hover:bg-gray-100',
};

export const PriceFlag = ({ flag, compact = false }: { flag: PriceFlagData; compact?: boolean }) => (
  <div
    className={`flex items-center gap-2 border-t px-2.5 ${compact ? 'py-1' : 'py-1.5'} text-[11px] leading-[15px] ${TONES[flag.tone]}`}
    role="status"
  >
    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{flag.text}</span>
    {flag.actions?.map(a => (
      <button
        key={a.label}
        type="button"
        onClick={(e) => { e.stopPropagation(); a.onClick(); }}
        className={`flex-shrink-0 rounded-sm px-2 py-0.5 font-semibold ${a.primary ? 'underline underline-offset-2' : ''} ${BUTTONS[flag.tone]}`}
      >
        {a.label}
      </button>
    ))}
  </div>
);
