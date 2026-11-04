import React, { createContext, useContext, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import {
  Check,
  ChevronDown,
  CircleAlert,
  Eye,
  EyeOff,
  Mail,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import { EmailSuggestion } from '../../Components/EmailSuggestion';
import { LegalModal } from '../../Components/LegalModal';
import type { EmailCheck } from '../../lib/useEmailCheck';

/**
 * Shared pieces for the sign-in and onboarding pages (log in, create account,
 * business details, partner sign-up, forgot / reset password).
 * Desktop: tinted form column with the form on a white card, and a navy panel
 * on the right whose content each page draws (no photos).
 * Phone: logo bar, optional navy band, then the form; long forms show each
 * section as its own card and pin the main button to the bottom.
 */

export const SUPPORT_WHATSAPP = 'https://wa.me/919818815838';

const NAVY = 'bg-[#0b1a45]';
/** Secondary text on the navy panel. */
export const PANEL_MUTED = 'text-[#b9c6ea]';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const BTN = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;

export const authBtn = {
  primary: `${BTN} h-11 px-5 text-[15px] lg:h-10 lg:text-sm bg-blue-600 text-white shadow-[0_1px_2px_rgba(21,93,252,0.3),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-blue-700`,
  secondary: `${BTN} h-11 px-4 text-[15px] lg:h-10 lg:text-sm border border-slate-400 bg-white text-slate-900 hover:border-slate-500`,
  ghost: `${BTN} h-11 px-3 text-[15px] lg:h-10 lg:text-sm text-slate-600 hover:bg-white hover:text-slate-900`,
};
export const authLink = `font-medium text-blue-700 hover:underline ${FOCUS}`;

// ─── Layout ─────────────────────────────────────────────────────────────────

/** Navy block with the faint dot grid: the desktop side panel and the phone band. */
export const Navy: React.FC<{ as?: 'aside' | 'section'; label: string; className?: string; children: React.ReactNode }> = ({
  as: Tag = 'section',
  label,
  className = '',
  children,
}) => (
  <Tag aria-label={label} className={`relative overflow-clip text-white ${NAVY} ${className}`}>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.12)_1px,transparent_1.5px)] [background-size:22px_22px] [mask-image:linear-gradient(160deg,transparent_35%,black)]"
    />
    <div className="relative flex min-h-full w-full flex-col">{children}</div>
  </Tag>
);

interface AuthLayoutProps {
  /** Desktop side panel content. */
  panel: React.ReactNode;
  panelLabel: string;
  /** Right side of the logo bar. */
  headerAside?: React.ReactNode;
  /** Navy band under the logo bar, phones only. */
  mobileHero?: React.ReactNode;
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ panel, panelLabel, headerAside, mobileHero, children }) => (
  // reducedMotion="user": the shop-type ticker and transitions stop when the phone asks for less motion.
  <MotionConfig reducedMotion="user">
    <div className="min-h-[100dvh] bg-canvas text-slate-900 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <div className="flex min-h-[100dvh] min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-white px-4 lg:h-auto lg:border-0 lg:bg-transparent lg:px-10 lg:pt-5">
          <img src={sellarLogo} alt="SELLAR" className="h-5 w-auto" />
          {headerAside && <div className="min-w-0 text-[13px] text-slate-500">{headerAside}</div>}
        </header>
        {mobileHero && <div className="lg:hidden">{mobileHero}</div>}
        <main className="flex flex-1 flex-col px-4 pb-6 pt-4 lg:px-10 lg:pb-6 lg:pt-5">{children}</main>
      </div>
      <Navy as="aside" label={panelLabel} className="hidden lg:block">
        {panel}
      </Navy>
    </div>
  </MotionConfig>
);

// ─── Cards ──────────────────────────────────────────────────────────────────

const TONES = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-800',
  pink: 'bg-pink-50 text-pink-700',
} as const;
export type Tone = keyof typeof TONES;

export const IconChip: React.FC<{ icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg' }> = ({ icon: Icon, tone = 'blue', size = 'md' }) => {
  const box = size === 'lg' ? 'size-10' : size === 'md' ? 'size-9' : 'size-7';
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-sm ${box} ${TONES[tone]}`}>
      <Icon size={size === 'lg' ? 20 : size === 'md' ? 18 : 15} strokeWidth={1.75} />
    </span>
  );
};

export const CardHeading: React.FC<{ icon: LucideIcon; tone?: Tone; title: string; subtitle?: string; className?: string }> = ({
  icon,
  tone = 'blue',
  title,
  subtitle,
  className = '',
}) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <IconChip icon={icon} tone={tone} size="lg" />
    <div className="min-w-0">
      <h1 className="text-xl font-semibold leading-7 tracking-[-0.02em]">{title}</h1>
      {subtitle && <p className="text-[13px] leading-[19px] text-slate-600">{subtitle}</p>}
    </div>
  </div>
);

interface AuthCardProps {
  children: React.ReactNode;
  /** Strip above the body (the stepper), divided by a line on desktop. */
  top?: React.ReactNode;
  footer?: React.ReactNode;
  /** Phones: no card around the whole form; each FormSection becomes its own card. */
  split?: boolean;
  className?: string;
}

export const AuthCard: React.FC<AuthCardProps> = ({ children, top, footer, split = false, className = '' }) => (
  <div
    className={`${split ? 'lg:rounded-sm lg:border lg:border-line lg:bg-white lg:shadow-card' : 'rounded-sm border border-line bg-white shadow-card'} ${className}`}
  >
    {top && <div className="pb-3 lg:border-b lg:border-line lg:px-7 lg:py-3">{top}</div>}
    <div className={`flex flex-col gap-4 ${split ? 'lg:gap-5 lg:px-7 lg:pb-6 lg:pt-5' : 'px-5 py-5 lg:px-7 lg:py-6'}`}>{children}</div>
    {footer}
  </div>
);

/** Grey strip at the bottom of a card. `sticky` pins it to the bottom of the screen on phones. */
export const CardFooter: React.FC<{ children: React.ReactNode; sticky?: boolean; className?: string }> = ({ children, sticky = false, className = '' }) => (
  <div
    className={`flex items-center gap-2.5 border-t border-line px-5 py-3 lg:rounded-b-sm lg:bg-sunken lg:px-7 lg:py-3 ${
      sticky ? 'max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:mt-4 max-lg:bg-white max-lg:px-4 max-lg:pb-3 max-lg:pt-3' : 'rounded-b-sm bg-sunken'
    } ${className}`}
  >
    {children}
  </div>
);

interface FormSectionProps {
  id: string;
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  note?: string;
  badge?: 'required' | 'optional';
  children: React.ReactNode;
}

/** A titled group of fields. Desktop: divided by a line inside the card. Phone (split card): its own card. */
export const FormSection: React.FC<FormSectionProps> = ({ id, icon, tone = 'blue', title, note, badge, children }) => (
  <section
    aria-labelledby={id}
    className="flex flex-col gap-3 max-lg:rounded-sm max-lg:border max-lg:border-line max-lg:bg-white max-lg:p-4 max-lg:shadow-card lg:not-first:border-t lg:not-first:border-line lg:not-first:pt-4"
  >
    <div className="flex items-center gap-2.5">
      <IconChip icon={icon} tone={tone} size="sm" />
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold leading-5">{title}</h2>
        {note && <p className="text-xs leading-4 text-slate-500">{note}</p>}
      </div>
      {badge && (
        <span
          className={`ml-auto shrink-0 rounded-sm px-2 py-[3px] text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] ${
            badge === 'required' ? 'bg-amber-50 text-amber-800' : 'border border-line bg-sunken text-slate-600'
          }`}
        >
          {badge}
        </span>
      )}
    </div>
    {children}
  </section>
);

/** Phone-only stack of section cards, a line-divided stack on desktop. */
export const FormSections: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col gap-3 lg:gap-4">{children}</div>
);

// ─── Fields ─────────────────────────────────────────────────────────────────

const FieldContext = createContext<{ id?: string; invalid?: boolean; describedBy?: string }>({});

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
  /** Right of the label, e.g. "Forgot password?". */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Label above, the control, then help or error text below. The control picks up id / aria from context. */
export const Field: React.FC<FieldProps> = ({ label, htmlFor, required, optional, help, error, aside, className = '', children }) => {
  const msgId = `${htmlFor}-msg`;
  const hasMsg = Boolean(error || help);
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium leading-[18px] text-slate-900">
          {label}
          {required && <span aria-hidden="true" className="text-red-700"> *</span>}
          {optional && <span className="font-normal text-slate-500"> (optional)</span>}
        </label>
        {aside}
      </div>
      <FieldContext.Provider value={{ id: htmlFor, invalid: Boolean(error), describedBy: hasMsg ? msgId : undefined }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <p id={msgId} aria-live="polite" className="text-xs leading-[17px] text-red-700">{error}</p>
      ) : help ? (
        <p id={msgId} aria-live="polite" className="text-xs leading-[17px] text-slate-500">{help}</p>
      ) : null}
    </div>
  );
};

const boxClass = (invalid?: boolean) =>
  `relative flex h-11 items-center gap-2.5 rounded-sm border px-3 transition-colors focus-within:border-blue-600 focus-within:bg-white focus-within:ring-3 focus-within:ring-blue-600/15 lg:h-10 ${
    invalid ? 'border-red-700 bg-white' : 'border-slate-400 bg-[#f8faff] hover:border-slate-500'
  }`;
const CONTROL = 'h-full min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed lg:text-sm';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  /** Fixed text before the value, e.g. "+91". */
  addon?: string;
  end?: React.ReactNode;
}

export const TextInput: React.FC<TextInputProps> = ({ icon: Icon, addon, end, className = '', ...rest }) => {
  const field = useContext(FieldContext);
  return (
    <span className={boxClass(field.invalid)}>
      {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-slate-500" />}
      {addon && <span className="shrink-0 border-r border-line pr-2.5 text-sm font-medium leading-5 text-slate-600">{addon}</span>}
      <input
        id={field.id}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        className={`${CONTROL} ${className}`}
        {...rest}
      />
      {end}
    </span>
  );
};

export const PasswordInput: React.FC<Omit<TextInputProps, 'type' | 'end'>> = (props) => {
  const [show, setShow] = useState(false);
  const Icon = show ? EyeOff : Eye;
  return (
    <TextInput
      {...props}
      type={show ? 'text' : 'password'}
      end={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className={`-mr-2 grid size-8 shrink-0 place-items-center rounded-sm text-slate-500 hover:bg-sunken hover:text-slate-900 ${FOCUS}`}
        >
          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      }
    />
  );
};

interface EmailFieldProps {
  value: string;
  onChange: (email: string) => void;
  check: EmailCheck;
  /** Set by the form on submit, e.g. when the field was left empty. */
  error?: string | null;
  help?: React.ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  className?: string;
}

/** The email field with its live check, tick and "Did you mean…?" fix. */
export const EmailField: React.FC<EmailFieldProps> = ({ value, onChange, check, error, help, icon, disabled, className }) => {
  const applySuggestion = (email: string) => {
    onChange(email);
    document.getElementById('email')?.focus();
  };
  const fix = <EmailSuggestion check={check} onUse={applySuggestion} />;
  const message = check.error || error;
  return (
    <Field
      label="Email address"
      htmlFor="email"
      required
      error={message && <>{message}{check.suggestion && <> {fix}</>}</>}
      help={check.suggestion ? fix : help}
      className={className}
    >
      <TextInput
        icon={icon}
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={check.onBlur}
        disabled={disabled}
        end={check.valid ? <Check size={16} strokeWidth={2.25} aria-label="Email looks right" className="shrink-0 text-green-700" /> : undefined}
      />
    </Field>
  );
};

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  icon?: LucideIcon;
  placeholder: string;
  options: { value: string; label: string }[];
}

export const SelectInput: React.FC<SelectInputProps> = ({ icon: Icon, placeholder, options, className = '', ...rest }) => {
  const field = useContext(FieldContext);
  return (
    <span className={boxClass(field.invalid)}>
      {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-slate-500" />}
      <select
        id={field.id}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        className={`${CONTROL} cursor-pointer appearance-none pr-6 ${rest.value ? '' : 'text-slate-500'} ${className}`}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-slate-900">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute right-3 text-slate-500" />
    </span>
  );
};

export const ErrorBanner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="alert" className="flex items-start gap-2.5 rounded-sm bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
    <CircleAlert size={18} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0" />
    <span>{children}</span>
  </div>
);

// ─── Sign-up stepper ────────────────────────────────────────────────────────

const DOT = 'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold';

export const AuthStepper: React.FC<{ step: 1 | 2; onStepOne?: () => void }> = ({ step, onStepOne }) => (
  <ol aria-label="Sign-up progress" className="flex items-center gap-3">
    <li aria-current={step === 1 ? 'step' : undefined}>
      {step === 2 ? (
        <button type="button" onClick={onStepOne} className={`flex items-center gap-2.5 rounded-sm text-[13px] font-medium text-slate-600 hover:text-slate-900 ${FOCUS}`}>
          <span className={`${DOT} bg-green-50 text-green-700`}>
            <Check size={14} strokeWidth={2.5} aria-hidden="true" />
          </span>
          Your details
        </button>
      ) : (
        <span className="flex items-center gap-2.5 text-[13px] font-semibold">
          <span className={`${DOT} bg-blue-600 text-white`}>1</span>
          Your details
        </span>
      )}
    </li>
    <li role="presentation" className={`h-0.5 min-w-10 flex-1 rounded-full ${step === 2 ? 'bg-blue-600' : 'bg-line'}`} />
    <li aria-current={step === 2 ? 'step' : undefined} className={`flex items-center gap-2.5 text-[13px] ${step === 2 ? 'font-semibold' : 'font-medium text-slate-500'}`}>
      <span className={`${DOT} ${step === 2 ? 'bg-blue-600 text-white' : 'border-[1.5px] border-slate-400 bg-white text-slate-600'}`}>2</span>
      Business details
    </li>
  </ol>
);

// ─── Small shared bits ──────────────────────────────────────────────────────

/** "By logging in, you agree to our Terms & Conditions and Privacy Policy." with the legal pop-up. */
export const LegalNote: React.FC<{ action: string; className?: string }> = ({ action, className = '' }) => {
  const [tab, setTab] = useState<'terms' | 'privacy' | null>(null);
  return (
    <>
      <p className={`text-center text-xs leading-[18px] text-slate-500 ${className}`}>
        By {action}, you agree to our{' '}
        <button type="button" onClick={() => setTab('terms')} className={authLink}>
          Terms &amp; Conditions
        </button>{' '}
        and{' '}
        <button type="button" onClick={() => setTab('privacy')} className={authLink}>
          Privacy Policy
        </button>
        .
      </p>
      <LegalModal isOpen={tab !== null} defaultTab={tab ?? 'terms'} onClose={() => setTab(null)} />
    </>
  );
};

export const SupportLink: React.FC = () => (
  <>
    <span className="max-sm:hidden">Need help? </span>
    <a href={SUPPORT_WHATSAPP} target="_blank" rel="noopener noreferrer" className={authLink}>
      Contact support
    </a>
  </>
);

/** Side panel for forgot / reset password. */
export const AccountSafePanel: React.FC = () => (
    <div className="flex flex-1 flex-col justify-between gap-10 px-12 pb-10 pt-12">
      <div>
        <h2 className="text-[34px] font-semibold leading-[42px] tracking-[-0.025em]">Your bills and stock are safe.</h2>
        <p className={`mt-3 max-w-[380px] text-[15px] leading-[23px] ${PANEL_MUTED}`}>
          Resetting your password changes how you log in. Nothing in your shop is touched.
        </p>
      </div>
      <ul className="divide-y divide-white/15">
        <li className="flex gap-3.5 pb-4">
          <Mail size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Use your login email</span>
            <span className={`text-[13px] leading-[19px] ${PANEL_MUTED}`}>The email you signed up with. The link goes only there.</span>
          </span>
        </li>
        <li className="flex gap-3.5 pt-4">
          <Users size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Staff account?</span>
            <span className={`text-[13px] leading-[19px] ${PANEL_MUTED}`}>If your shop owner added you, ask them for help getting back in.</span>
          </span>
        </li>
      </ul>
    </div>
);

/** Grey note at the bottom of the forgot / reset cards. */
export const AccountSafeNote: React.FC = () => (
  <div className="flex items-start gap-2.5 rounded-b-sm border-t border-line bg-sunken px-5 py-3 text-[13px] leading-[19px] text-slate-600 lg:px-7">
    <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0 text-slate-500" />
    <span>Resetting your password only changes how you log in. Your bills and stock stay as they are.</span>
  </div>
);
