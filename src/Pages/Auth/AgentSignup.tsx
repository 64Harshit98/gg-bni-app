// src/pages/Auth/AgentSignup.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Building2, FileText, House, LoaderCircle, Lock, ShieldCheck, User, Users, Wallet } from 'lucide-react';
import { registerAgentWithDetails } from '../../lib/AuthOperations';
import { newEmailError } from '../../lib/email';
import { useEmailCheck } from '../../lib/useEmailCheck';
import { ROUTES } from '../../constants/routes.constants';
import {
  AuthCard,
  AuthLayout,
  CardFooter,
  CardHeading,
  EmailField,
  ErrorBanner,
  Field,
  FormSection,
  FormSections,
  LegalNote,
  Navy,
  PANEL_MUTED,
  PasswordInput,
  TextInput,
  authBtn,
  authLink,
} from './AuthUI';

type FieldKey = 'name' | 'phoneNumber' | 'email' | 'address' | 'panNumber' | 'aadhaarNumber' | 'password';
type FieldErrors = Partial<Record<FieldKey, string>>;

const EARN_STEPS = [
  { icon: User, title: 'Sign up', text: 'Get your own referral code.', short: 'Get your code.' },
  { icon: House, title: 'Refer shops', text: 'They enter your code when they join.', short: 'They use your code.' },
  { icon: Wallet, title: 'Earn', text: 'Recurring commission on their plan.', short: 'On their plan.' },
];

const WHO_JOINS = [
  { icon: Users, text: 'Agencies and software resellers' },
  { icon: FileText, text: 'CAs, accountants and GST practitioners' },
  { icon: House, text: 'Anyone who works with shop owners' },
];

const PartnerPanel: React.FC = () => (
  <div className="flex flex-1 flex-col gap-11 px-12 pb-10 pt-12">
    <div>
      <h2 className="text-[34px] font-semibold leading-[42px] tracking-[-0.025em]">Earn recurring commission for every shop you bring.</h2>
      <p className={`mt-3 max-w-[380px] text-[15px] leading-[23px] ${PANEL_MUTED}`}>
        You already help shop owners run their business. SELLAR pays you for bringing them on.
      </p>
    </div>
    <ol className="relative grid grid-cols-3 gap-4 before:absolute before:inset-x-[18px] before:top-[17px] before:h-0.5 before:bg-white/20">
      {EARN_STEPS.map(({ icon: Icon, title, text }) => (
        <li key={title} className="relative flex flex-col gap-2">
          <span className="grid size-9 place-items-center rounded-full bg-blue-600 shadow-[0_0_0_6px_#0b1a45]">
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">{title}</span>
          <span className={`text-[13px] leading-[19px] ${PANEL_MUTED}`}>{text}</span>
        </li>
      ))}
    </ol>
    <div className="mt-auto">
      <p className={`mb-3.5 text-[13px] font-medium ${PANEL_MUTED}`}>Who joins</p>
      <ul className="divide-y divide-white/10">
        {WHO_JOINS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 py-3 text-sm leading-5 first:pt-0">
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const PartnerHero: React.FC = () => (
  <Navy label="How the partner programme works" className="flex flex-col gap-4 px-4 py-5">
    <div>
      <h1 className="text-2xl font-semibold leading-[31px] tracking-[-0.02em]">Become a SELLAR partner</h1>
      <p className={`mt-1.5 text-sm leading-5 ${PANEL_MUTED}`}>Earn recurring commission for every shop you bring.</p>
    </div>
    <ol className="grid grid-cols-3 gap-3">
      {EARN_STEPS.map(({ title, short }, i) => (
        <li key={title} className={`flex flex-col gap-1.5 text-xs leading-[17px] ${PANEL_MUTED}`}>
          <span className="grid size-[26px] place-items-center rounded-full bg-blue-600 text-xs font-semibold text-white">{i + 1}</span>
          <span className="text-[13px] font-semibold text-white">{title}</span>
          {short}
        </li>
      ))}
    </ol>
  </Navy>
);

const AgentSignup: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');

  // Identity documents (required)
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState(''); // shown as 1234 5678 9012

  // Business documents (optional)
  const [gstinNumber, setGstinNumber] = useState('');
  const [msmeNumber, setMsmeNumber] = useState('');

  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailCheck = useEmailCheck(email, { newAccount: true });

  const edit = (key: FieldKey | null, setter: (v: string) => void) => (value: string) => {
    setter(value);
    if (key && errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = 'Enter your agency or business name.';
    if (phoneNumber.length !== 10) next.phoneNumber = 'Enter all 10 digits of your mobile number.';
    const emailError = newEmailError(email);
    if (emailError) next.email = emailError;
    if (!address.trim()) next.address = 'Enter your registered business address.';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) next.panNumber = 'PAN looks like ABCDE1234F.';
    if (aadhaarNumber.replace(/\s/g, '').length !== 12) next.aadhaarNumber = 'Aadhaar has 12 digits.';
    if (password.length < 6) next.password = 'Use at least 6 characters.';
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const next = validate();
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

    setLoading(true);
    try {
      await registerAgentWithDetails({
        name: name.trim(),
        email: email.trim(),
        password,
        phoneNumber,
        isAgency: true, // Force this to always be true
        address: address.trim(),
        panNumber,
        aadhaarNumber: aadhaarNumber.replace(/\s/g, ''),
        gstinNumber,
        msmeNumber,
      });

      navigate(ROUTES.PARTNER_DASHBOARD);
    } catch (err) {
      setError((err as Error)?.message || "Couldn't create your account. Please try again.");
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      panelLabel="How the partner programme works"
      panel={<PartnerPanel />}
      mobileHero={<PartnerHero />}
      headerAside={
        <>
          <span className="max-sm:hidden">Already a partner? </span>
          <Link to={ROUTES.LANDING} className={authLink}>
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mx-auto w-full max-w-[660px]">
        <AuthCard
          split
          footer={
            <CardFooter sticky>
              <span className="flex-1 max-lg:hidden" />
              <button type="submit" disabled={loading} aria-busy={loading} className={`${authBtn.primary} max-lg:flex-1`}>
                {loading ? (
                  <>
                    <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                    Creating your account…
                  </>
                ) : (
                  <>
                    Become a partner
                    <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
                  </>
                )}
              </button>
            </CardFooter>
          }
        >
          <CardHeading
            icon={Users}
            tone="pink"
            title="Become a SELLAR partner"
            subtitle="Takes about 3 minutes. Keep your PAN and Aadhaar handy."
            className="max-lg:hidden"
          />
          <p className="text-sm leading-5 text-slate-600 lg:hidden">Takes about 3 minutes. Keep your PAN and Aadhaar handy.</p>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <FormSections>
            <FormSection id="partner-about" icon={Building2} title="About your business" note="How we reach you about referrals.">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="Agency or business name" htmlFor="name" required error={errors.name}>
                  <TextInput
                    type="text"
                    autoComplete="organization"
                    placeholder="Name you work under"
                    value={name}
                    onChange={(e) => edit('name', setName)(e.target.value)}
                  />
                </Field>
                <Field label="Phone number" htmlFor="phoneNumber" required error={errors.phoneNumber}>
                  <TextInput
                    addon="+91"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={(e) => edit('phoneNumber', setPhoneNumber)(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="tabular-nums"
                  />
                </Field>
                <EmailField
                  value={email}
                  onChange={edit('email', setEmail)}
                  check={emailCheck}
                  error={errors.email}
                  help="You'll log in to your partner dashboard with this."
                  className="sm:col-span-2"
                />
                <Field label="Registered business address" htmlFor="address" required error={errors.address} className="sm:col-span-2">
                  <TextInput
                    type="text"
                    autoComplete="street-address"
                    placeholder="Full address with city and pincode"
                    value={address}
                    onChange={(e) => edit('address', setAddress)(e.target.value)}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection id="partner-identity" icon={ShieldCheck} tone="amber" title="Identity" note="Checked before we pay any commission." badge="required">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="PAN number" htmlFor="panNumber" required error={errors.panNumber}>
                  <TextInput
                    type="text"
                    maxLength={10}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="ABCDE1234F"
                    value={panNumber}
                    onChange={(e) => edit('panNumber', setPanNumber)(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 10))}
                    className="tabular-nums uppercase tracking-[0.04em]"
                  />
                </Field>
                <Field label="Aadhaar number" htmlFor="aadhaarNumber" required error={errors.aadhaarNumber}>
                  <TextInput
                    type="text"
                    inputMode="numeric"
                    maxLength={14}
                    autoComplete="off"
                    placeholder="1234 5678 9012"
                    value={aadhaarNumber}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
                      edit('aadhaarNumber', setAadhaarNumber)(digits.replace(/(\d{4})(?=\d)/g, '$1 '));
                    }}
                    className="tabular-nums tracking-[0.04em]"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection id="partner-docs" icon={FileText} title="Business documents" note="Add them if your business has them." badge="optional">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="GSTIN" htmlFor="gstinNumber">
                  <TextInput
                    type="text"
                    maxLength={15}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="15 characters"
                    value={gstinNumber}
                    onChange={(e) => setGstinNumber(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
                    className="uppercase tracking-[0.04em] placeholder:normal-case placeholder:tracking-normal"
                  />
                </Field>
                <Field label="Udyam (MSME) number" htmlFor="msmeNumber">
                  <TextInput
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="UDYAM-XX-00-0000000"
                    value={msmeNumber}
                    onChange={(e) => setMsmeNumber(e.target.value.toUpperCase())}
                    className="uppercase tracking-[0.04em]"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection id="partner-password" icon={Lock} tone="green" title="Password" note="For your partner dashboard. At least 6 characters.">
              <Field label="Create a password" htmlFor="password" required error={errors.password} className="sm:max-w-[300px]">
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={(e) => edit('password', setPassword)(e.target.value)}
                />
              </Field>
            </FormSection>
          </FormSections>
        </AuthCard>
        <LegalNote action="signing up" className="mt-4" />
      </form>
    </AuthLayout>
  );
};

export default AgentSignup;
