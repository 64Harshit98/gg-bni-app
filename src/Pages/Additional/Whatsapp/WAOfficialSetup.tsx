import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FiArrowRight, FiCheck, FiChevronDown, FiCopy, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import BackButton from '../../../Components/BackButton';

// In-app guide for connecting a company's own official WhatsApp Business
// number through Snapto. The Snapto signup (Sellar's white-label at
// wa.sellar.in) is embedded beside a step list, so the user never leaves the
// app. wa.sellar.in sends no X-Frame-Options / frame-ancestors, and the app
// runs on *.sellar.in, so it's same-site and Snapto's login cookie survives
// inside the frame. Meta's own "Connect with Facebook" step always opens as a
// popup — Facebook never renders its login inside a frame — so the iframe
// must stay un-sandboxed for that popup to talk back to it.
//
// The last step sends the API key + Phone ID to submitSnaptoSetup
// (functions/lib/index.js); a super admin activates it from WhatsApp Config.

// Carries our referral/account id so signups are attributed to Sellar.
export const SNAPTO_SIGNUP_URL = 'https://wa.sellar.in/Signup?accId=6a96b1d8550e8ab4615ac0a6';
const SNAPTO_TEMPLATES_URL = 'https://wa.sellar.in/ListTemplate';
const SNAPTO_API_KEYS_URL = 'https://wa.sellar.in/Integrations/ListApikey';

type StepId = 'account' | 'connect' | 'templates' | 'credentials' | 'submit';

const STEP_ORDER: StepId[] = ['account', 'connect', 'templates', 'credentials', 'submit'];

const STEP_TITLES: Record<StepId, string> = {
  account: 'Create your account',
  connect: 'Connect your WhatsApp number',
  templates: 'Get your message templates approved',
  credentials: 'Copy your API key and Phone Number ID',
  submit: 'Send the details to Sellar',
};

// What Sellar actually fills in each template — mirrors the templateVariables
// arrays in useInvoiceCommunication.ts, sendDueReminder.ts and RequestPage.tsx.
// `suggested` = the name Snapto's "Create Bulk Template → Sellar" set uses.
const TEMPLATE_GUIDE = [
  {
    key: 'templateName' as const,
    label: 'Invoice / order',
    suggested: 'bussiness_document',
    required: true,
    header: 'Document (the PDF bill is attached here)',
    vars: ['Customer name', 'Your business name', '"invoice" or "order"', 'Bill number', 'Amount'],
    sample: 'Hi {{1}}, thank you for shopping with {{2}}. Your {{3}} {{4}} for ₹{{5}} is attached.',
  },
  {
    key: 'reminderTemplateName' as const,
    label: 'Payment reminder',
    suggested: 'payment_reminder',
    required: false,
    header: 'None',
    vars: ['Customer name', 'Your business name', 'Amount due', 'Bill(s) it is for', 'Total amount'],
    sample: 'Hi {{1}}, this is a reminder from {{2}} that ₹{{3}} is pending for {{4}}. Total: ₹{{5}}.',
  },
  {
    key: 'stockAlertTemplateName' as const,
    label: 'Back-in-stock alert',
    suggested: 'stock_alert',
    required: false,
    header: 'None',
    vars: ['Your business name', 'Customer name', 'Items now available'],
    sample: 'Hi {{2}}, good news from {{1}}! These items are back in stock: {{3}}.',
  },
];

interface SubmitForm {
  snaptoApiKey: string;
  snaptoPhoneId: string;
  whatsappNumber: string;
  templateName: string;
  reminderTemplateName: string;
  stockAlertTemplateName: string;
  language: string;
}

// Template names start pre-filled with the bulk "Sellar" set, so most
// companies only need to paste the API key and Phone Number ID.
const EMPTY_FORM: SubmitForm = {
  snaptoApiKey: '', snaptoPhoneId: '', whatsappNumber: '',
  templateName: 'bussiness_document', reminderTemplateName: 'payment_reminder', stockAlertTemplateName: '', language: 'en',
};

const progressKey = (companyId: string) => `wa-official-setup:${companyId}`;

const readProgress = (companyId: string | undefined): StepId[] => {
  if (!companyId) return [];
  try {
    const raw = localStorage.getItem(progressKey(companyId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s: string): s is StepId => STEP_ORDER.includes(s as StepId)) : [];
  } catch {
    return [];
  }
};

const inputCls = 'w-full h-10 text-sm bg-white border border-gray-300 rounded-sm px-3 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

const CopyChip: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the text is still selectable */ }
  };
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1 font-mono text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-sm px-1.5 py-0.5">
      {text} {copied ? <FiCheck size={11} className="text-green-600" /> : <FiCopy size={11} className="text-gray-400" />}
    </button>
  );
};

const WAOfficialSetup: React.FC = () => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;

  const [done, setDone] = useState<StepId[]>(() => readProgress(companyId));
  const [open, setOpen] = useState<StepId | null>(null);
  const [mobileView, setMobileView] = useState<'steps' | 'snapto'>('steps');

  const [frameUrl, setFrameUrl] = useState(SNAPTO_SIGNUP_URL);
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameSlow, setFrameSlow] = useState(false);

  const [form, setForm] = useState<SubmitForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const firstOpenSet = useRef(false);

  useEffect(() => { setDone(readProgress(companyId)); }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    try { localStorage.setItem(progressKey(companyId), JSON.stringify(done)); } catch { /* storage unavailable */ }
  }, [companyId, done]);

  // Open the first unfinished step once, on arrival.
  useEffect(() => {
    if (firstOpenSet.current) return;
    firstOpenSet.current = true;
    setOpen(STEP_ORDER.find(s => !done.includes(s)) || null);
  }, [done]);

  useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, 'whatsappActivationRequests', companyId)).then(snap => {
      const x = snap.exists() ? snap.data() : null;
      if (x?.snaptoStatus === 'submitted') setSubmittedAt(x.snaptoSubmittedAt?.toDate ? x.snaptoSubmittedAt.toDate() : new Date());
    }).catch(() => { });
    getDoc(doc(db, 'companies', companyId, 'whatsappStatus', 'current')).then(snap => {
      const x = snap.exists() ? snap.data() : null;
      setConnected(!!x && x.activeTier === 'snapto' && !!x.active);
    }).catch(() => { });
  }, [companyId]);

  // If the frame hasn't loaded in a while, point at the new-tab fallback.
  useEffect(() => {
    setFrameLoaded(false);
    setFrameSlow(false);
    const t = setTimeout(() => setFrameSlow(true), 12000);
    return () => clearTimeout(t);
  }, [frameKey]);

  const doneCount = done.length;

  const markDone = (step: StepId) => {
    setDone(prev => (prev.includes(step) ? prev : [...prev, step]));
    const next = STEP_ORDER.find(s => s !== step && !done.includes(s));
    setOpen(next || null);
  };
  const markUndone = (step: StepId) => setDone(prev => prev.filter(s => s !== step));

  const update = (patch: Partial<SubmitForm>) => setForm(f => ({ ...f, ...patch }));

  const canSubmit = useMemo(
    () => form.snaptoApiKey.trim().length >= 10 && /^\d{10,20}$/.test(form.snaptoPhoneId.replace(/\s+/g, '')) && !!form.templateName.trim(),
    [form],
  );

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await httpsCallable(getFunctions(), 'submitSnaptoSetup')(form);
      setSubmittedAt(new Date());
      setForm(f => ({ ...f, snaptoApiKey: '' }));
      setDone(prev => (prev.includes('submit') ? prev : [...prev, 'submit']));
    } catch (err: any) {
      setSubmitError(err.message || 'Could not send the details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const showSnapto = () => setMobileView('snapto');

  // Point the embedded panel at a specific Snapto page (same login session).
  const openInSnapto = (url: string) => {
    setFrameUrl(url);
    setFrameKey(k => k + 1);
    setMobileView('snapto');
  };

  const openPageBtn = (url: string, label: string) => (
    <button type="button" onClick={() => openInSnapto(url)}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-sm bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
      {label} <FiArrowRight size={14} />
    </button>
  );

  const stepBody = (step: StepId) => {
    switch (step) {
      case 'account':
        return (
          <>
            <p>Sign up in the Snapto panel <span className="lg:hidden">(tap <b>Open Snapto</b> below)</span><span className="hidden lg:inline">on the right</span> with your business email, then log in.</p>
            <p className="text-gray-500">Already have an account? Just log in.</p>
          </>
        );
      case 'connect':
        return (
          <>
            <p>In Snapto, click <b>Connect with Facebook</b>. A small Facebook window opens on top of this page — sign in there, then:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Pick your business (or create one).</li>
              <li>Add the phone number customers will get messages from, and verify it with the code Meta sends.</li>
              <li>Set the display name customers will see.</li>
            </ol>
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-sm p-2.5 text-xs space-y-1">
              <p><b>The number must not be on the regular WhatsApp or WhatsApp Business app.</b> Delete that account first, or use a different number.</p>
              <p>No Facebook window? Allow pop-ups for this site in your browser and click again.</p>
            </div>
          </>
        );
      case 'templates':
        return (
          <>
            <p>WhatsApp only lets businesses start a chat with an approved template. Sellar's templates are ready-made — submit them all in one go:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Open <b>Templates</b> in Snapto.</li>
              <li>Click the <b>Create Bulk Template</b> drop-down and choose <b>Sellar</b>.</li>
              <li>All of Sellar's templates are sent to Meta for verification. Wait until they show <b>Approved</b> — usually minutes, sometimes up to a day.</li>
            </ol>
            {openPageBtn(SNAPTO_TEMPLATES_URL, 'Open Templates')}
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer font-semibold text-gray-700">Making your own instead? What each template needs</summary>
              <p className="mt-2">Create them as <b>Utility</b> templates. Word them your own way, but keep the same <b>numbered placeholders in the same order</b> — Sellar fills them in — and enter your names in the last step.</p>
            <div className="space-y-2 mt-2">
              {TEMPLATE_GUIDE.map(t => (
                <div key={t.key} className="border border-gray-200 rounded-sm p-2.5">
                  <p className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                    {t.label}
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${t.required ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{t.required ? 'Required' : 'Optional'}</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Name it e.g. <CopyChip text={t.suggested} /> · Header: {t.header}</p>
                  <ul className="text-xs text-gray-600 mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                    {t.vars.map((v, i) => <li key={v}><span className="font-mono">{`{{${i + 1}}}`}</span> {v}</li>)}
                  </ul>
                  <p className="text-xs text-gray-500 mt-1.5 italic">“{t.sample}”</p>
                </div>
              ))}
            </div>
            </details>
          </>
        );
      case 'credentials':
        return (
          <>
            <p>From Snapto, copy:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>API key</b> — under <b>Integrations → API Keys</b>. Create one if the list is empty.</li>
              <li><b>Phone Number ID</b> — in <b>Connected Accounts</b>, next to your number.</li>
            </ul>
            {openPageBtn(SNAPTO_API_KEYS_URL, 'Open API Keys')}
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-sm p-2.5 text-xs">
              Copy the <b>Phone Number ID</b>, not the <b>WhatsApp Business Account ID</b>. Both are long numbers; the wrong one makes every message fail.
            </div>
          </>
        );
      case 'submit':
        return (
          <div className="space-y-3">
            {submittedAt && (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-sm p-2.5 text-xs">
                Sent on {submittedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. We'll check and switch it on shortly. Changed something? Send it again below.
              </div>
            )}
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">API key *</span>
              <input type="password" autoComplete="off" className={inputCls} value={form.snaptoApiKey} onChange={e => update({ snaptoApiKey: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">Phone Number ID *</span>
              <input inputMode="numeric" className={inputCls} placeholder="e.g. 1432291703292665" value={form.snaptoPhoneId} onChange={e => update({ snaptoPhoneId: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">WhatsApp number</span>
              <input type="tel" className={inputCls} placeholder="+91 …" value={form.whatsappNumber} onChange={e => update({ whatsappNumber: e.target.value })} />
            </label>
            {TEMPLATE_GUIDE.map(t => (
              <label key={t.key} className="block">
                <span className="block text-xs font-medium text-gray-700 mb-1">{t.label} template name{t.required ? ' *' : ''}</span>
                <input className={inputCls} placeholder={t.suggested} value={form[t.key]} onChange={e => update({ [t.key]: e.target.value.trim().toLowerCase() } as Partial<SubmitForm>)} />
              </label>
            ))}
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">Template language code</span>
              <input className={inputCls} value={form.language} onChange={e => update({ language: e.target.value.trim() })} />
            </label>
            {submitError && <p className="text-xs text-red-600">{submitError}</p>}
            <button onClick={submit} disabled={!canSubmit || submitting}
              className="w-full h-10 rounded-sm bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Sending…' : submittedAt ? 'Send again' : 'Send to Sellar'}
            </button>
            <p className="text-[11px] text-gray-400">Your API key is stored securely and only Sellar's team can see it.</p>
          </div>
        );
    }
  };

  const stepsPanel = (
    <div className="space-y-2">
      {connected && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-sm p-3 text-sm flex items-center gap-2">
          <FiCheck className="shrink-0" /> Your official WhatsApp number is connected.
        </div>
      )}
      {STEP_ORDER.map((step, i) => {
        const isDone = done.includes(step);
        const isOpen = open === step;
        return (
          <div key={step} className={`bg-white border rounded-sm ${isOpen ? 'border-blue-300 shadow-sm' : 'border-gray-200'}`}>
            <button onClick={() => setOpen(isOpen ? null : step)} className="w-full flex items-center gap-3 p-3 text-left">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDone ? 'bg-green-600 text-white' : isOpen ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {isDone ? <FiCheck size={14} /> : i + 1}
              </span>
              <span className={`flex-1 text-sm font-semibold ${isDone && !isOpen ? 'text-gray-500' : 'text-gray-900'}`}>{STEP_TITLES[step]}</span>
              <FiChevronDown className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-3 pb-3 pl-[52px] text-sm text-gray-700 space-y-2">
                {stepBody(step)}
                {step !== 'submit' && (
                  <div className="flex items-center gap-2 pt-1">
                    {(step === 'account' || step === 'connect') && (
                      <button onClick={showSnapto} className="lg:hidden h-9 px-3 rounded-sm border border-gray-300 text-sm font-semibold text-gray-800">Open Snapto</button>
                    )}
                    {isDone
                      ? <button onClick={() => markUndone(step)} className="h-9 px-3 rounded-sm text-sm font-semibold text-gray-500 hover:bg-gray-100">Mark as not done</button>
                      : <button onClick={() => markDone(step)} className="h-9 px-3 rounded-sm bg-gray-900 text-white text-sm font-semibold hover:bg-black">Done, next step</button>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const snaptoPanel = (
    <div className="bg-white border border-gray-200 rounded-sm flex flex-col h-[calc(100dvh-170px)] lg:h-[calc(100dvh-120px)] min-h-[480px] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 text-xs text-gray-500">
        <span className="flex-1 truncate font-mono">{frameUrl.replace(/^https:\/\//, '').replace(/\?.*$/, '')}</span>
        <button onClick={() => setFrameKey(k => k + 1)} className="inline-flex items-center gap-1 px-2 py-1 rounded-sm hover:bg-gray-100 text-gray-700">
          <FiRefreshCw size={12} /> Reload
        </button>
        <a href={frameUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-sm hover:bg-gray-100 text-gray-700">
          <FiExternalLink size={12} /> New tab
        </a>
      </div>
      <div className="relative flex-1">
        {!frameLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-gray-500 p-6 text-center">
            <p>Loading Snapto…</p>
            {frameSlow && (
              <p className="text-xs">Taking too long? <a href={frameUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Open it in a new tab</a> and come back here when done.</p>
            )}
          </div>
        )}
        <iframe
          key={frameKey}
          src={frameUrl}
          title="Snapto — official WhatsApp setup"
          onLoad={() => setFrameLoaded(true)}
          allow="clipboard-read; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-4 lg:py-6">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <BackButton />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-gray-900 truncate">Set up official WhatsApp</h1>
            <p className="text-xs text-gray-500">{doneCount} of {STEP_ORDER.length} steps done · Meta's WhatsApp Business API via Snapto</p>
          </div>
        </div>

        {/* Phones: one panel at a time. */}
        <div className="lg:hidden grid grid-cols-2 bg-gray-200 rounded-sm p-1 mb-3 text-sm font-semibold">
          {(['steps', 'snapto'] as const).map(v => (
            <button key={v} onClick={() => setMobileView(v)} className={`py-1.5 rounded-sm ${mobileView === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
              {v === 'steps' ? 'Steps' : 'Snapto'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4 items-start">
          <div className={`${mobileView === 'steps' ? '' : 'hidden'} lg:block lg:sticky lg:top-4 lg:max-h-[calc(100dvh-120px)] lg:overflow-y-auto`}>
            {stepsPanel}
          </div>
          {/* Kept mounted while hidden so the Snapto session isn't reloaded on every tab switch. */}
          <div className={`${mobileView === 'snapto' ? '' : 'hidden'} lg:block`}>
            {snaptoPanel}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WAOfficialSetup;
