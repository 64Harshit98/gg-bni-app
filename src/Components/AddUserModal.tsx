import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ROLES } from '../enums';
import { inviteUser } from '../lib/AuthOperations';
import { newEmailError } from '../lib/email';
import { useEmailCheck } from '../lib/useEmailCheck';
import { IconClose } from '../constants/Icons';
import { EmailSuggestion } from './EmailSuggestion';
import { useAuth } from '../context/auth-context';
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';
import { TutorialStep } from './TutorialStep';

type Theme = 'blue' | 'orange';

// --- THEME TOKENS (blue = POS, orange = Catalogue) ---
// Full class strings on purpose, so Tailwind can see them.
const THEMES: Record<Theme, {
  chip: string;
  focus: string;
  link: string;
  selected: string;
  selectedLabel: string;
  permBox: string;
  footer: string;
  primaryBtn: string;
}> = {
  blue: {
    chip: 'bg-[#ffe8f8] text-[#c4009a]',
    focus: 'focus-within:border-blue-600 focus-within:ring-[#e6eeff]',
    link: 'text-blue-600 hover:text-blue-700',
    selected: 'border-2 border-blue-600 bg-[#e6eeff] px-[11px] py-[9px]',
    selectedLabel: 'text-blue-600',
    permBox: 'bg-[#f5f7ff]',
    footer: 'border-[#dfe6fb] bg-[#f5f7ff]',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700',
  },
  orange: {
    chip: 'bg-orange-100 text-[#F97316]',
    focus: 'focus-within:border-[#F97316] focus-within:ring-orange-100',
    link: 'text-[#F97316] hover:text-orange-700',
    selected: 'border-2 border-[#F97316] bg-orange-50 px-[11px] py-[9px]',
    selectedLabel: 'text-[#F97316]',
    permBox: 'bg-orange-50/60',
    footer: 'border-orange-100 bg-orange-50/60',
    primaryBtn: 'bg-[#F97316] hover:bg-orange-700',
  },
};

interface RoleOption {
  value: ROLES;
  label: string;
  desc: string;
}

const ROLE_OPTIONS: Record<Theme, RoleOption[]> = {
  // POS
  blue: [
    { value: ROLES.SALESMAN, label: 'Salesman', desc: 'Billing at the counter' },
    { value: ROLES.MANAGER, label: 'Manager', desc: 'Sales, purchases & items' },
    { value: ROLES.OWNER, label: 'Owner', desc: 'Full access to the store' },
  ],
  // Catalogue
  orange: [
    { value: ROLES.SALESMAN, label: 'Salesman', desc: 'Orders & returns' },
    { value: ROLES.MANAGER, label: 'Manager', desc: 'Orders, items & reports' },
    { value: ROLES.OWNER, label: 'Owner', desc: 'Full access to the store' },
  ],
};

const BOTH: ROLES[] = [ROLES.SALESMAN, ROLES.MANAGER];
const MANAGER_ONLY: ROLES[] = [ROLES.MANAGER];
const NONE: ROLES[] = [];

// Owner ke liye list nahi dikhti, sirf ye single line dikhti hai.
const OWNER_FULL_ACCESS: Record<Theme, string> = {
  blue: 'Full access to all POS features',
  orange: 'Full access to all catalogue features',
};

const ACCESS_ITEMS: Record<Theme, { label: string; roles: ROLES[] }[]> = {
  // POS
  blue: [
    { label: 'Dashboard', roles: BOTH },
    { label: 'Sales & sales return', roles: BOTH },
    { label: 'Catalogue access', roles: BOTH },
    { label: 'Purchase & purchase return', roles: MANAGER_ONLY },
    { label: 'Transactions', roles: MANAGER_ONLY },
    { label: 'Manage items', roles: MANAGER_ONLY },
    { label: 'Reports', roles: NONE },
    { label: 'Settings & users', roles: NONE },
  ],
  // Catalogue
  orange: [
    { label: 'Dashboard & filters', roles: BOTH },
    { label: 'Orders', roles: BOTH },
    { label: 'Orders return', roles: BOTH },
    { label: 'Requests', roles: MANAGER_ONLY },
    { label: 'View & edit catalog', roles: MANAGER_ONLY },
    { label: 'Manage items', roles: MANAGER_ONLY },
    { label: 'Reports', roles: MANAGER_ONLY },
    { label: 'Settings & users', roles: NONE },
  ],
};

const Icon: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);

const TOTAL_STEPS = 5;
const TUTORIAL_KEY = 'addUserModalTutorialDone';

// Shown only while the tutorial is running (never submitted)
const SAMPLE_USER = {
  fullName: 'Ravi Kumar',
  phoneNumber: '9876543210',
  email: 'ravi.kumar@gmail.com',
  password: 'Sample@123',
  role: ROLES.MANAGER, // shows a mix of allowed / not-allowed access items
};

const fieldInput =
  'flex-1 min-w-0 bg-transparent outline-none text-[13px] sm:text-sm text-slate-900 placeholder:text-slate-400 placeholder:text-xs sm:placeholder:text-sm disabled:opacity-60';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded?: () => void;
  theme?: Theme;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onUserAdded, theme = 'blue' }) => {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ROLES>(ROLES.SALESMAN);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const emailCheck = useEmailCheck(email, { newAccount: true });

  // Tutorial
  const { currentUser } = useAuth();
  const [tutorialStep, setTutorialStep] = useState(0);
  // Pause the tutorial while the modal is closed
  const activeStep = isOpen ? tutorialStep : 0;
  const isTutorial = activeStep > 0;

  // While the tutorial runs, show sample data instead of the real form state
  const dFullName = isTutorial ? SAMPLE_USER.fullName : fullName;
  const dPhone = isTutorial ? SAMPLE_USER.phoneNumber : phoneNumber;
  const dEmail = isTutorial ? SAMPLE_USER.email : email;
  const dPassword = isTutorial ? SAMPLE_USER.password : password;
  const dRole = isTutorial ? SAMPLE_USER.role : role;

  const nameRef = useRef<HTMLDivElement | null>(null);
  const contactRef = useRef<HTMLDivElement | null>(null);
  const passwordRef = useRef<HTMLDivElement | null>(null);
  const roleRef = useRef<HTMLDivElement | null>(null);
  const submitRef = useRef<HTMLDivElement | null>(null);

  const stepRefMap: Record<number, React.RefObject<HTMLDivElement | null>> = {
    1: nameRef,
    2: contactRef,
    3: passwordRef,
    4: roleRef,
    5: submitRef,
  };

  const next = useCallback((n: number) => {
    setTutorialStep(n <= TOTAL_STEPS ? n : 0);
  }, []);

  const skip = useCallback(() => {
    completeTutorial(currentUser, TUTORIAL_KEY, setTutorialStep);
  }, [currentUser]);

  useTutorial(currentUser, setTutorialStep, TUTORIAL_KEY);

  useEffect(() => {
    if (activeStep === 0) return;
    const ref = stepRefMap[activeStep];
    if (!ref?.current) return;
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  if (!isOpen) return null;

  const resetForm = () => {
    setFullName('');
    setPhoneNumber('');
    setEmail('');
    setPassword('');
    setRole(ROLES.SALESMAN);
    setShowPassword(false);
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const generatePassword = () => {
    if (isTutorial) return;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const arr = new Uint32Array(10);
    crypto.getRandomValues(arr);
    setPassword(Array.from(arr, (n) => chars[n % chars.length]).join('') + '@1');
    setShowPassword(true);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTutorial) return;
    setError(null);
    setSuccess(null);

    if (!fullName.trim() || !email.trim() || !password.trim() || !phoneNumber.trim()) {
      setError('Please fill out all user details.');
      return;
    }

    emailCheck.reveal();
    if (newEmailError(email) || emailCheck.holdForTypo()) {
      document.getElementById('modalEmail')?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await inviteUser(fullName.trim(), phoneNumber.trim(), email.trim(), password, role);

      setSuccess(`User "${fullName.trim()}" created successfully!`);
      onUserAdded?.();

      setTimeout(() => {
        resetForm();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('User creation failed:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const t = THEMES[theme];
  const roleOptions = ROLE_OPTIONS[theme];
  const selectedRole = roleOptions.find((r) => r.value === dRole);
  const fieldWrap = `flex items-center gap-2 h-11 px-2.5 sm:px-3 rounded-sm border border-[#7a8aa3] bg-white text-slate-500 transition focus-within:ring-4 ${t.focus}`;

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden rounded-sm shadow-xl relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-sm text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          disabled={isSubmitting}
          aria-label="Close"
        >
          <IconClose />
        </button>

        <div className="flex items-start gap-3 px-6 pt-5 pb-3 pr-14 shrink-0">
          <span className={`grid place-items-center w-10 h-10 rounded-sm shrink-0 ${t.chip}`}>
            <Icon className="w-5 h-5">
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
            </Icon>
          </span>
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Add team member</h2>
            <p className="text-xs text-slate-500 mt-0.5">They'll log in with this exact email and password.</p>
          </div>
        </div>

        <form onSubmit={handleAddUser} className="flex flex-col flex-1 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pt-2 pb-5 flex-1 min-h-0 overflow-y-auto content-start">
            <div ref={nameRef} className="sm:col-span-2">
              <TutorialStep
                step={1}
                currentStep={activeStep}
                text="Enter your staff member's full name here."
                onNext={() => next(2)}
                onSkip={skip}
              >
                <div>
                  <label htmlFor="modalFullName" className={labelCls}>Full name <span className="text-red-600">*</span></label>
                  <div className={fieldWrap}>
                    <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>
                    <input
                      id="modalFullName"
                      type="text"
                      className={fieldInput}
                      placeholder="e.g. Ravi Kumar"
                      value={dFullName}
                      readOnly={isTutorial}
                      onChange={(e) => { if (!isTutorial) setFullName(e.target.value); }}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </TutorialStep>
            </div>

            <div ref={contactRef} className="sm:col-span-2">
              <TutorialStep
                step={2}
                currentStep={activeStep}
                text="Enter their phone number and email. This email will be their login ID."
                onNext={() => next(3)}
                onSkip={skip}
                mobileArrowAlign="left"
              >
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <label htmlFor="modalPhoneNumber" className={`${labelCls} truncate`}>Phone number <span className="text-red-600">*</span></label>
                    <div className={fieldWrap}>
                      <span className="text-xs text-slate-500">+91</span>
                      <input
                        id="modalPhoneNumber"
                        type="tel"
                        maxLength={10}
                        className={fieldInput}
                        placeholder="98765 43210"
                        value={dPhone}
                        readOnly={isTutorial}
                        onChange={(e) => { if (!isTutorial) setPhoneNumber(e.target.value); }}
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="modalEmail" className={`${labelCls} truncate`}>
                      <span className="sm:hidden">Email</span>
                      <span className="hidden sm:inline">Gmail / Email (login ID)</span>{' '}
                      <span className="text-red-600">*</span>
                    </label>
                    <div className={`${fieldWrap} ${emailCheck.error ? '!border-red-600' : ''}`}>
                      <Icon className="w-4 h-4 shrink-0 hidden sm:block"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>
                      <input
                        id="modalEmail"
                        type="email"
                        className={fieldInput}
                        placeholder="name@mail.com"
                        value={dEmail}
                        readOnly={isTutorial}
                        onChange={(e) => { if (!isTutorial) setEmail(e.target.value); }}
                        onBlur={isTutorial ? undefined : emailCheck.onBlur}
                        aria-invalid={Boolean(emailCheck.error) || undefined}
                        aria-describedby="modalEmail-msg"
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <p id="modalEmail-msg" aria-live="polite" className="mt-1 text-xs leading-[17px] text-red-600 empty:hidden">
                      {emailCheck.error}
                      {emailCheck.error && emailCheck.suggestion && ' '}
                      <EmailSuggestion check={emailCheck} onUse={setEmail} linkClassName={t.link} />
                    </p>
                  </div>
                </div>
              </TutorialStep>
            </div>

            <div ref={passwordRef} className="sm:col-span-2">
              <TutorialStep
                step={3}
                currentStep={activeStep}
                text="Create a password, or tap 'Generate'. Use the eye icon to view it."
                onNext={() => next(4)}
                onSkip={skip}
              >
                <div>
                  <label htmlFor="modalPassword" className={labelCls}>Password <span className="text-red-600">*</span></label>
                  <div className={fieldWrap}>
                    <Icon>
                      <circle cx="8" cy="15" r="4" />
                      <path d="m11 12 9-9M16 7l3 3M14 9l2 2" />
                    </Icon>
                    <input
                      id="modalPassword"
                      type={showPassword ? 'text' : 'password'}
                      className={`${fieldInput} ${showPassword ? 'font-mono' : ''}`}
                      placeholder="Create a password"
                      value={dPassword}
                      readOnly={isTutorial}
                      onChange={(e) => { if (!isTutorial) setPassword(e.target.value); }}
                      required
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      disabled={isSubmitting}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="p-1 rounded text-slate-500 hover:text-slate-800"
                    >
                      {showPassword ? (
                        <Icon>
                          <path d="M3 3l18 18" />
                          <path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1" />
                        </Icon>
                      ) : (
                        <Icon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={generatePassword}
                      disabled={isSubmitting}
                      className={`px-1.5 text-xs font-medium ${t.link}`}
                    >
                      Generate
                    </button>
                  </div>
                </div>
              </TutorialStep>
            </div>

            <div ref={roleRef} className="sm:col-span-2">
              <TutorialStep
                step={4}
                currentStep={activeStep}
                text="Choose a role. The access for that role is shown below."
                onNext={() => next(5)}
                onSkip={skip}
              >
                <div>
                  <span className={labelCls}>Role</span>
                  <div className="grid grid-cols-3 gap-2">
                    {roleOptions.map((r) => {
                      const selected = dRole === r.value;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          aria-pressed={selected}
                          disabled={isSubmitting}
                          onClick={() => { if (!isTutorial) setRole(r.value); }}
                          className={`text-center sm:text-left rounded-sm transition disabled:opacity-60 ${selected
                            ? t.selected
                            : 'border border-[#7a8aa3] bg-white hover:bg-slate-50 px-3 py-2.5'
                            }`}
                        >
                          <span className={`block text-sm font-semibold ${selected ? t.selectedLabel : 'text-slate-900'}`}>{r.label}</span>
                          <span className="hidden sm:block text-[11px] leading-4 text-slate-500">{r.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </TutorialStep>
            </div>

            {selectedRole && (
              <div className="sm:col-span-2">
                <span className={labelCls}>Default access for {selectedRole.label}</span>
                <div className={`grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-sm px-3 py-2.5 text-xs ${t.permBox}`}>
                  {dRole === ROLES.OWNER ? (
                    <span className="col-span-2 flex items-center gap-1.5 text-slate-700">
                      <Icon className="w-3.5 h-3.5 shrink-0 text-green-600"><path d="M5 12.5l4.5 4.5L19 7" /></Icon>
                      {OWNER_FULL_ACCESS[theme]}
                    </span>
                  ) : (
                    ACCESS_ITEMS[theme].map((item) => {
                      const allowed = item.roles.includes(dRole);
                      return (
                        <span
                          key={item.label}
                          className={`flex items-center gap-1.5 min-w-0 ${allowed ? 'text-slate-700' : 'text-slate-400'}`}
                        >
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${allowed ? 'text-green-600' : 'text-red-500'}`}>
                            {allowed ? <path d="M5 12.5l4.5 4.5L19 7" /> : <path d="M6 6l12 12M18 6 6 18" />}
                          </Icon>
                          <span className="truncate">{item.label}</span>
                        </span>
                      );
                    })
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  These are the defaults. You can change them later in Permission settings.
                </p>
              </div>
            )}

            {error && (
              <div className="sm:col-span-2 p-3 rounded-sm bg-red-50 border border-red-100">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}
            {success && (
              <div className="sm:col-span-2 p-3 rounded-sm bg-emerald-50 border border-emerald-100">
                <p className="text-sm text-emerald-600 font-medium">{success}</p>
              </div>
            )}
          </div>

          <div className={`flex items-center justify-end gap-2 px-6 py-3.5 border-t shrink-0 ${t.footer}`}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="h-10 px-4 rounded-sm text-sm font-medium text-slate-600 hover:bg-slate-200/60 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <div ref={submitRef}>
              <TutorialStep
                step={5}
                currentStep={activeStep}
                text="Once everything is filled in, add the user from here."
                onNext={() => completeTutorial(currentUser, TUTORIAL_KEY, setTutorialStep)}
                onSkip={skip}
                isLast
              >
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`inline-flex items-center justify-center gap-2 h-10 px-6 rounded-sm text-white text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${t.primaryBtn}`}
                >
                  {isSubmitting ? (
                    'Adding User...'
                  ) : (
                    <>
                      <Icon>
                        <circle cx="9" cy="8" r="4" />
                        <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
                      </Icon>
                      Add user
                    </>
                  )}
                </button>
              </TutorialStep>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUserModal;