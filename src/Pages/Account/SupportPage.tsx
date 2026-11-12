import React, { useState } from 'react';
import { Link } from 'react-router-dom';
// import { db } from '../../lib/Firebase';
// import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth';

// --- ICONS (Lucide, same set the design system uses) ---
import {
  ChevronDown,
  ChevronRight,
  HelpCircle,
  MapPin,
  Mail,
  Phone,
  MessageCircle,
  Search,
  Send,
  Building2
} from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';

/* ------------------------------------------------------------------
 * SELLAR design system — "Help & Support" page (Tailwind only).
 * Same look as the artifact; no custom CSS string any more.
 *   primary #155dfc · primary-hover #1447e6 · primary-soft #e6eeff
 *   canvas #eef2ff · border #dfe6fb · surface-sunken #f5f7ff
 *   ink #0f172b · ink-muted #45556c · ink-subtle #5b6b86
 *   border-control #7a8aa3 · success #008236 / #e9faef
 * Every box/card/chip is rounded-sm.
 * ------------------------------------------------------------------ */

// --- TYPES ---
interface FaqEntry {
  id: string;
  title: string;
  searchText: string;
  answer: React.ReactNode;
}

// --- SHARED CLASS STRINGS ---
const CARD =
  'min-w-0 rounded-sm border border-[#dfe6fb] bg-white shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';
const OVERLINE = 'text-[11px] font-semibold uppercase leading-4 tracking-[.08em] text-[#5b6b86]';
const TINT = 'inline-grid flex-none place-items-center rounded-sm bg-[#e6eeff] text-[#155dfc]';
const TINT_GREEN = 'inline-grid flex-none place-items-center rounded-sm bg-[#e9faef] text-[#008236]';

// --- SMALL REUSABLE PIECES ---
const Collapse: React.FC<{ id: string; isOpen: boolean; children: React.ReactNode }> = ({
  id,
  isOpen,
  children
}) => (
  <div
    id={id}
    role="region"
    className={`grid transition-[grid-template-rows,visibility] duration-[250ms] ease-in-out ${isOpen
      ? 'visible grid-rows-[1fr] [transition-delay:0s,0s]'
      : 'invisible grid-rows-[0fr] [transition-delay:0s,250ms]'
      }`}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

const SearchField: React.FC<{
  className?: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ className = '', value, onChange }) => (
  <label
    className={`flex items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc] ${className}`}
  >
    <Search className="h-4 w-4 flex-none" aria-hidden="true" />
    <input
      placeholder="Search questions"
      aria-label="Search questions"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]"
    />
  </label>
);

interface ContactCardProps {
  id: string;
  title: string;
  caption: string;
  icon: React.ReactNode;
  green?: boolean;
  isOpen: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const ContactCard: React.FC<ContactCardProps> = ({
  id,
  title,
  caption,
  icon,
  green,
  isOpen,
  onClick,
  children
}) => (
  <div className={`${CARD} overflow-hidden`}>
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-controls={`${id}-panel`}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-white px-4 py-3.5 text-left hover:bg-[#f5f7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]"
    >
      <span className={`h-10 w-10 ${green ? TINT_GREEN : TINT}`}>{icon}</span>
      <div>
        <b className="text-[15px] font-semibold text-[#0f172b]">{title}</b>
        <span className="mt-0.5 block text-xs leading-[18px] text-[#5b6b86]">{caption}</span>
      </div>
      <span
        className={`flex text-[#5b6b86] transition-transform duration-[250ms] ${isOpen ? 'rotate-180' : ''}`}
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
    <Collapse id={`${id}-panel`} isOpen={isOpen}>
      <div className="grid gap-3 border-t border-[#dfe6fb] px-4 pb-4 pt-3.5 text-sm leading-[22px] text-[#45556c]">
        {children}
      </div>
    </Collapse>
  </div>
);

// --- MAIN PAGE COMPONENT ---
const SupportPage: React.FC = () => {
  const [openSection, setOpenSection] = useState<string | null>('faq-1');
  const [query, setQuery] = useState('');

  // --- NEW STATES ---
  //const [userProfile, setUserProfile] = useState({ fullName: '', email: '', phone: '' });
  //const [formData, setFormData] = useState({ subject: '', description: '' });
  //const [submitting, setSubmitting] = useState(false);
  //const [submitted, setSubmitted] = useState(false);

  // --- FETCH LOGGED-IN USER PROFILE ---
  // useEffect(() => {
  //   const auth = getAuth();
  //   const currentUser = auth.currentUser;
  //   if (!currentUser) return;

  //   const fetchProfile = async () => {
  //     const companiesSnapshot = await getDocs(collection(db, "companies"));

  //     for (const companyDoc of companiesSnapshot.docs) {
  //       const userDoc = await getDoc(doc(db, "companies", companyDoc.id, "users", currentUser.uid));

  //       if (userDoc.exists()) {
  //         const data = userDoc.data();

  //         setUserProfile({
  //           fullName: data.name || currentUser.email || 'Unknown', // ← use data.name instead of displayName
  //           email: currentUser.email || 'N/A',
  //           phone: data.phoneNumber || 'N/A', // ← this is correct
  //         });
  //         break; // Stop once found
  //       }
  //     }
  //   };

  //   fetchProfile();
  // }, []);

  // NOTE: must stay a transaction — the earlier getDoc-then-setDoc version
  // let concurrent submits read the same count. Needs runTransaction imported
  // when re-enabled, AND firestore.rules currently has no rule letting normal
  // users touch top-level counters/ or support_tickets/ (only super admins).
  // const generateRefNumber = async () => {
  //   const counterRef = doc(db, "counters", "support_tickets");
  //   const nextNumber = await runTransaction(db, async (tx) => {
  //     const snap = await tx.get(counterRef);
  //     const next = (snap.exists() ? snap.data().count || 0 : 0) + 1;
  //     tx.set(counterRef, { count: next }, { merge: true });
  //     return next;
  //   });
  //   return `TKT-${String(nextNumber).padStart(4, '0')}`; // TKT-0001, TKT-0002...
  // };

  // const handleSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   if (!formData.subject || !formData.description) {
  //     alert("Please fill all fields.");
  //     return;
  //   }
  //   setSubmitting(true);
  //   try {
  //     const refNumber = await generateRefNumber();
  //     await addDoc(collection(db, "support_tickets"), {
  //       referenceNumber: refNumber,
  //       fullName: userProfile.fullName,
  //       email: userProfile.email,
  //       phone: userProfile.phone,
  //       subject: formData.subject,
  //       description: formData.description,
  //       status: 'received',
  //       createdAt: serverTimestamp(),
  //     });
  //     setSubmitted(true);
  //     setFormData({ subject: '', description: '' });
  //   } catch (err) {
  //     alert("Failed to submit ticket. Please try again.");
  //   } finally {
  //     setSubmitting(false);
  //   }
  // };

  const toggleSection = (id: string) => {
    setOpenSection(prev => (prev === id ? null : id));
  };

  const faqs: FaqEntry[] = [
    {
      id: 'faq-1',
      title: 'How do I upgrade my subscription plan?',
      searchText: 'upgrade subscription plan POS catalogue choose payment verified',
      answer: (
        <>
          Go to the{' '}
          <Link to={ROUTES.SUBSCRIPTION_PAGE} className="text-inherit no-underline">
            <b className="font-semibold text-[#0f172b]">Subscription</b>
          </Link>{' '}
          page from your account menu.
          <ol className="mt-2 grid list-decimal gap-1 pl-[18px]">
            <li>Select the category — POS, Catalogue, or Both.</li>
            <li>
              Choose the plan that best fits your business and tap{' '}
              <b className="font-semibold text-[#0f172b]">Choose</b>.
            </li>
            <li>Your benefits will be active after your payment is verified.</li>
          </ol>
        </>
      )
    },
    {
      id: 'faq-2',
      title: 'Can I use the app on multiple devices?',
      searchText: 'multiple devices phone tablet laptop cloud sync',
      answer: (
        <>
          Yes! Our platform is cloud-based. You can log in from your phone, tablet, or laptop. Data syncs automatically across all devices in real-time.
        </>
      )
    },
    {
      id: 'faq-3',
      title: 'How do I reset my password?',
      searchText: 'reset password forgot login email',
      answer: (
        <>
          Click "Forgot Password" on the login screen and follow the instructions sent to your registered email to reset your password.
        </>
      )
    },
    {
      id: 'faq-4',
      title: 'Is my data safe?',
      searchText: 'data safe secure firebase encrypted backup',
      answer: (
        <>
          Absolutely. We use Google Firebase for secure cloud storage and authentication. Your data is encrypted and backed up daily.
        </>
      )
    }
  ];

  const q = query.trim().toLowerCase();
  const visibleFaqs = q
    ? faqs.filter(f => (f.title + ' ' + f.searchText).toLowerCase().includes(q))
    : faqs;

  return (
    <div className="min-h-screen bg-[#eef2ff] pb-20 font-sans text-sm leading-[22px] text-[#0f172b] antialiased">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[#dfe6fb] bg-white px-2 sm:h-auto sm:gap-3 sm:px-6 sm:py-3.5">
        <BackButton />
        <div>
          <div className="hidden text-xs leading-[18px] text-[#5b6b86] sm:block">Account /</div>
          <h1 className="m-0 whitespace-nowrap text-lg font-semibold leading-6 text-[#0f172b] sm:text-[22px] sm:leading-[30px]">
            Help &amp; Support
          </h1>
          <span className="block text-xs font-normal leading-4 text-[#5b6b86] sm:hidden">
            FAQs and contact
          </span>
        </div>
        <SearchField
          className="ml-auto hidden h-10 min-w-0 flex-[0_1_340px] sm:flex"
          value={query}
          onChange={setQuery}
        />
      </header>

      <div className="grid grid-cols-1 items-start gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:p-6">
        {/* Mobile search */}
        <SearchField className="flex h-11 sm:hidden" value={query} onChange={setQuery} />

        {/* --- SECTION 1: FREQUENTLY ASKED QUESTIONS --- */}
        <div className="grid min-w-0 gap-2.5">
          <div className={OVERLINE}>
            Frequently Asked Questions
            <span className="hidden sm:inline"> · {visibleFaqs.length}</span>
          </div>

          <div className={`${CARD} overflow-hidden`}>
            {visibleFaqs.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center text-[13px] text-[#5b6b86]">
                <HelpCircle className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
                <strong className="text-sm font-medium text-[#45556c]">No matching questions</strong>
                Try another word, or contact the support team.
              </div>
            )}
            {visibleFaqs.map(f => {
              const isOpen = openSection === f.id;
              return (
                <div key={f.id} className="border-b border-[#dfe6fb] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleSection(f.id)}
                    aria-expanded={isOpen}
                    aria-controls={`${f.id}-panel`}
                    className={`flex w-full items-center gap-3 px-3.5 py-3.5 text-left text-sm font-medium leading-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#155dfc] sm:px-[18px] sm:py-4 sm:text-[15px] ${isOpen
                      ? 'bg-[#e6eeff] text-[#155dfc]'
                      : 'bg-white text-[#0f172b] hover:bg-[#f5f7ff]'
                      }`}
                  >
                    <HelpCircle className="h-5 w-5 flex-none text-[#155dfc]" aria-hidden="true" />
                    <span className="flex-1">{f.title}</span>
                    <span
                      className={`flex flex-none text-[#5b6b86] transition-transform duration-[250ms] ${isOpen ? 'rotate-180' : ''}`}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                  <Collapse id={`${f.id}-panel`} isOpen={isOpen}>
                    <div className="bg-[#e6eeff] pb-3.5 pl-11 pr-3.5 pt-0.5 text-[13px] leading-5 text-[#45556c] sm:pb-[18px] sm:pl-[50px] sm:pr-[18px] sm:pt-1 sm:text-sm sm:leading-[22px]">
                      {f.answer}
                    </div>
                  </Collapse>
                </div>
              );
            })}
          </div>
        </div>

        {/* --- SECTION 2 + 3: CONTACT OPTIONS, RAISE TICKET --- */}
        <div className="grid min-w-0 gap-2.5">
          <div className={OVERLINE}>Get in Touch</div>

          <ContactCard
            id="contact-1"
            title="Contact Support Team"
            caption="Talk to the SELLAR team"
            icon={<Phone className="h-5 w-5" aria-hidden="true" />}
            isOpen={openSection === 'contact-1'}
            onClick={() => toggleSection('contact-1')}
          >
            <p className="m-0">Our team is available Mon-Fri, 10 AM - 6 PM.</p>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md border border-gray-100">
              <div className="bg-purple-100 p-2 rounded-full text-purple-600">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase">Company Name</p>
                <a href="https://www.sellar.in/" className="text-blue-600 font-medium hover:underline">SELLAR SOLUTIONS</a>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] px-3 py-2.5">
              <span className={`h-8 w-8 ${TINT}`}>
                <Mail className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div>
                <span className={`block ${OVERLINE}`}>Email Us</span>
                <a
                  className="break-all font-medium text-[#155dfc] no-underline hover:underline"
                  href="mailto:sellarsuite@gmail.com"
                >
                  sellarsuite@gmail.com
                </a>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] px-3 py-2.5">
              <span className={`h-8 w-8 ${TINT_GREEN}`}>
                <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div>
                <span className={`block ${OVERLINE}`}>WhatsApp Support</span>
                <a
                  className="break-all font-medium text-[#008236] no-underline hover:underline"
                  href="https://wa.me/919818815838"
                >
                  +91 9818815838
                </a>
              </div>
            </div>
          </ContactCard>

          <ContactCard
            id="contact-2"
            title="Visit Our Office"
            caption="Address and directions"
            icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
            green
            isOpen={openSection === 'contact-2'}
            onClick={() => toggleSection('contact-2')}
          >
            <div>
              <p className="m-0 font-semibold text-[#0f172b]">Sellar Solutions</p>
              <p className="m-0">2nd Floor, Parsvnath Arcade, Unit 22, Vaibhav khand</p>
              <p className="m-0">Indirapuram, Ghaziabad, Uttar Pradesh 201014</p>
              <p className="m-0 mt-2 text-xs text-[#5b6b86]">(Visits by appointment only)</p>
            </div>

            <div className="border-t border-[#dfe6fb] pt-3">
              <span className={`block ${OVERLINE}`}>Registered Address</span>
              <p className="m-0 mt-1 font-semibold text-[#0f172b]">Sellar Solutions</p>
              <p className="m-0">Lower Ground Floor, Shipra Shopping Center, Shop No, SPL-036, Vaibhav Khand,</p>
              <p className="m-0">Indirapuram, Ghaziabad, Uttar Pradesh 201014</p>
            </div>
          </ContactCard>

          <div className={`${OVERLINE} mt-1.5 sm:mt-3`}>Report an Issue</div>

          <div
            aria-disabled="true"
            className="grid cursor-not-allowed grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] px-4 py-3.5"
          >
            <span className={`h-10 w-10 opacity-60 ${TINT}`}>
              <Send className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <span className="mb-1 inline-flex h-[22px] items-center rounded-sm bg-[#e6eeff] px-2 text-[11px] font-semibold uppercase tracking-[.03em] text-[#155dfc]">
                Coming Soon
              </span>
              <b className="block text-[15px] font-semibold text-[#0f172b] opacity-60">
                Raise a Support Ticket
              </b>
              <span className="mt-0.5 block text-xs leading-[18px] text-[#5b6b86]">
                Until then, contact the support team above.
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-[#5b6b86]" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;