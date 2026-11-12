import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Gift, Mail, RotateCcw, ShieldCheck, User, UserPlus } from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import { newEmailError } from '../../lib/email';
import { saveLeadProgress } from '../../lib/Lead';
import { useEmailCheck } from '../../lib/useEmailCheck';
import {
  AuthCard,
  AuthLayout,
  AuthStepper,
  CardFooter,
  CardHeading,
  EmailField,
  Field,
  FormSection,
  FormSections,
  PANEL_MUTED,
  PasswordInput,
  TextInput,
  authBtn,
  authLink,
} from './AuthUI';

const LOCAL_STORAGE_KEY = 'sellar_onboarding_data';

type FieldKey = 'fullName' | 'phoneNumber' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<FieldKey, string>>;

const NEXT_STEPS = [
  { title: 'Your details', note: 'Name, phone, email and a password.' },
  { title: 'Your shop', note: 'Business name, GST and address. These print on your bills.' },
  { title: 'Your first bill', note: 'Add an item, make a sale, send it on WhatsApp.' },
];

const SignupPanel: React.FC = () => (
  <div className="flex flex-1 flex-col justify-between gap-10 px-12 pb-10 pt-12">
    <div>
      <h2 className="mb-6 text-[26px] font-semibold leading-[34px] tracking-[-0.02em]">From sign-up to your first bill in a few minutes.</h2>
      <ol>
        {NEXT_STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-[18px] pb-7 last:pb-0">
            {i < NEXT_STEPS.length - 1 && <span aria-hidden="true" className="absolute bottom-0.5 left-[15px] top-[34px] w-0.5 bg-white/15" />}
            <span
              className={`relative grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] text-[13px] font-semibold ${i === 0 ? 'border-white bg-white text-[#0b1a45]' : 'border-white/35'
                }`}
            >
              {i + 1}
            </span>
            <span className="flex flex-col gap-1 pt-1">
              <span className="text-[15px] font-semibold">
                {s.title} {i === 0 && <span className={`font-normal ${PANEL_MUTED}`}>(you are here)</span>}
              </span>
              <span className={`text-sm leading-[21px] ${PANEL_MUTED}`}>{s.note}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
    <div className="flex flex-wrap items-baseline gap-4 border-t border-white/15 pt-6">
      <span className="text-[40px] font-semibold leading-[44px] tracking-[-0.03em]">3 days free</span>
      <span className={`max-w-[240px] text-sm leading-[21px] ${PANEL_MUTED}`}>Every feature unlocked. No card needed to start.</span>
    </div>
  </div>
);

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const emailCheck = useEmailCheck(email, { newAccount: true });

  useEffect(() => {
    const savedDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedDataString) {
      const savedData = JSON.parse(savedDataString);
      if (savedData.fullName) setFullName(savedData.fullName);
      if (savedData.email) setEmail(savedData.email);
      if (savedData.phoneNumber) setPhoneNumber(savedData.phoneNumber);
      if (savedData.password) {
        setPassword(savedData.password);
        setConfirmPassword(savedData.password);
      }
    }
  }, []);

  useEffect(() => {
    const currentSaved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    const updatedData = { ...currentSaved, fullName, email, phoneNumber, password };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedData));
  }, [fullName, email, phoneNumber, password]);

  // Clears a field's error as soon as it is edited.
  const edit = (key: FieldKey, setter: (v: string) => void) => (value: string) => {
    setter(value);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateForm = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = 'Enter your name.';
    if (phoneNumber.length !== 10) next.phoneNumber = 'Enter all 10 digits of your mobile number.';
    const emailError = newEmailError(email);
    if (emailError) next.email = emailError;
    if (password.length < 6) next.password = 'Use at least 6 characters.';
    if (!confirmPassword) next.confirmPassword = 'Type your password again.';
    else if (password !== confirmPassword) next.confirmPassword = "Passwords don't match.";
    return next;
  };

  const handleClearData = () => {
    const existingData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ ...existingData, fullName: '', email: '', phoneNumber: '', password: '' })
    );
    setFullName('');
    setEmail('');
    setPhoneNumber('');
    setPassword('');
    setConfirmPassword('');
    setErrors({});
  };

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateForm();
    setErrors(next);
    emailCheck.reveal();
    const firstBad = Object.keys(next)[0];
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    if (emailCheck.holdForTypo()) {
      document.getElementById('email')?.focus();
      return;
    }

    const address = email.trim();
    await saveLeadProgress(address, {
      fullName,
      phoneNumber,
      status: 'Onboarding',
      currentStep: 'Step 2: Business Info',
    });

    navigate(ROUTES.BUSINESS_INFO, {
      state: { fullName, email: address, phoneNumber, password },
    });
  };

  const passwordsMatch = confirmPassword.length >= 6 && password === confirmPassword && !errors.confirmPassword;

  return (
    <AuthLayout
      panelLabel="What happens next"
      panel={<SignupPanel />}
      headerAside={
        <>
          <span className="max-sm:hidden">Already have an account? </span>
          <Link to={ROUTES.LANDING} className={authLink}>
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleNext} noValidate className="mx-auto w-full max-w-[620px]">
        <AuthCard
          split
          top={<AuthStepper step={1} />}
          footer={
            <CardFooter sticky>
              <button type="button" onClick={handleClearData} className={authBtn.ghost}>
                <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
                <span className="max-sm:sr-only">Clear form</span>
              </button>
              <span className="flex-1" />
              <span className="text-[13px] text-slate-500 max-sm:hidden">Step 1 of 2</span>
              <button type="submit" className={`${authBtn.primary} max-sm:flex-1`}>
                Next: your shop
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </CardFooter>
          }
        >
          <CardHeading icon={UserPlus} title="Create your account" subtitle="Start with your own details. Your shop comes next." />

          <FormSections>
            <FormSection id="signup-you" icon={User} title="About you" note="The person who runs the shop.">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="Your name" htmlFor="fullName" required error={errors.fullName} className="sm:col-span-2">
                  <TextInput
                    type="text"
                    autoComplete="name"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(e) => edit('fullName', setFullName)(e.target.value)}
                  />
                </Field>
                <Field label="Phone number" htmlFor="phoneNumber" required error={errors.phoneNumber} help="Your 10-digit mobile number.">
                  <TextInput
                    addon="+91"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={(e) => edit('phoneNumber', setPhoneNumber)(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                </Field>
                <EmailField
                  icon={Mail}
                  value={email}
                  onChange={edit('email', setEmail)}
                  check={emailCheck}
                  error={errors.email}
                  help="You'll log in with this email."
                />
              </div>
            </FormSection>

            <FormSection id="signup-password" icon={ShieldCheck} tone="green" title="Password" note="At least 6 characters.">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="Create a password" htmlFor="password" required error={errors.password}>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="Choose a password"
                    value={password}
                    onChange={(e) => edit('password', setPassword)(e.target.value)}
                  />
                </Field>
                <Field
                  label="Confirm password"
                  htmlFor="confirmPassword"
                  required
                  error={errors.confirmPassword}
                  help={
                    passwordsMatch ? (
                      <span className="flex items-center gap-1 text-green-700">
                        <Check size={14} strokeWidth={2.25} aria-hidden="true" />
                        Passwords match
                      </span>
                    ) : undefined
                  }
                >
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="Type it again"
                    value={confirmPassword}
                    onChange={(e) => edit('confirmPassword', setConfirmPassword)(e.target.value)}
                  />
                </Field>
              </div>
            </FormSection>
          </FormSections>

          <div className="flex items-center gap-3 rounded-sm bg-blue-50 px-3.5 py-3 text-blue-800 lg:hidden">
            <Gift size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
            <span className="text-[13px] leading-[19px]">
              <span className="font-semibold">3 days free.</span> Every feature unlocked. No card needed.
            </span>
          </div>
        </AuthCard>
      </form>
    </AuthLayout>
  );
};

export default SignUpPage;
