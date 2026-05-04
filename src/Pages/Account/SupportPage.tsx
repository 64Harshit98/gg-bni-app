import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// --- ICONS ---
// (Assuming you use Lucide-React like standard Tailwind projects. 
// If not, replace with simple SVGs or your icon library)
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Mail,
  Phone,
  MessageCircle,
  FileText,
  Send
} from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';

// --- TYPES ---
interface AccordionItemProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onClick: () => void;
}

// --- REUSABLE ACCORDION COMPONENT ---
const AccordionItem: React.FC<AccordionItemProps> = ({ title, icon, children, isOpen, onClick }) => {
  return (
    <div className="border border-gray-200 rounded-lg bg-white mb-3 overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md">
      <button
        onClick={onClick}
        className={`w-full flex items-center justify-between p-4 text-left transition-colors ${isOpen ? 'bg-gray-50 text-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-gray-500">{icon}</span>}
          <span className="font-semibold text-sm sm:text-base">{title}</span>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      <div
        className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
      >
        <div className="p-4 border-t border-gray-100 text-gray-600 text-sm leading-relaxed bg-white">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---
const SupportPage: React.FC = () => {
  const [openSection, setOpenSection] = useState<string | null>('faq-1');

  // --- NEW STATES ---
  const [userProfile, setUserProfile] = useState({ fullName: '', email: '', phone: '' });
  const [formData, setFormData] = useState({ subject: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // --- FETCH LOGGED-IN USER PROFILE ---
  useEffect(() => {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const fetchProfile = async () => {
      const companiesSnapshot = await getDocs(collection(db, "companies"));

      for (const companyDoc of companiesSnapshot.docs) {
        const userDoc = await getDoc(doc(db, "companies", companyDoc.id, "users", currentUser.uid));

        if (userDoc.exists()) {
          const data = userDoc.data();

          setUserProfile({
            fullName: data.name || currentUser.email || 'Unknown', // ← use data.name instead of displayName
            email: currentUser.email || 'N/A',
            phone: data.phoneNumber || 'N/A', // ← this is correct
          });
          break; // Stop once found
        }
      }
    };

    fetchProfile();
  }, []);

  const generateRefNumber = async () => {
    const counterRef = doc(db, "counters", "support_tickets");
    const counterSnap = await getDoc(counterRef);

    let nextNumber = 1;
    if (counterSnap.exists()) {
      nextNumber = (counterSnap.data().count || 0) + 1;
    }

    // FIX: setDoc safely creates "support_tickets" if it's missing, 
    // or updates the count if it already exists.
    await setDoc(counterRef, { count: nextNumber });

    return `TKT-${String(nextNumber).padStart(4, '0')}`; // TKT-0001, TKT-0002...
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.subject || !formData.description) {
      alert("Please fill all fields.");
      return;
    }
    setSubmitting(true);
    try {
      const refNumber = await generateRefNumber();
      await addDoc(collection(db, "support_tickets"), {
        referenceNumber: refNumber,
        fullName: userProfile.fullName,
        email: userProfile.email,
        phone: userProfile.phone,
        subject: formData.subject,
        description: formData.description,
        status: 'received',
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
      setFormData({ subject: '', description: '' });
    } catch (err) {
      alert("Failed to submit ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSection = (id: string) => {
    setOpenSection(prev => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">

      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <BackButton/>
            <h1 className="text-xl font-bold text-gray-800">Help & Support</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-8">

        {/* --- SECTION 1: FREQUENTLY ASKED QUESTIONS --- */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 ml-1">
            Frequently Asked Questions
          </h2>

          <AccordionItem
            title="How do I upgrade my subscription plan?"
            icon={<HelpCircle className="w-5 h-5" />}
            isOpen={openSection === 'faq-1'}
            onClick={() => toggleSection('faq-1')}
          >
            Go to the <Link to={ROUTES.SUBSCRIPTION_PAGE}><strong>Subscription</strong></Link> page from your account menu. Toggle between Monthly or Yearly billing, select the plan that suits you (Basic or Pro), and click "Choose". Your benefits will be active after your payment is verified.
          </AccordionItem>

          <AccordionItem
            title="Can I use the app on multiple devices?"
            icon={<HelpCircle className="w-5 h-5" />}
            isOpen={openSection === 'faq-2'}
            onClick={() => toggleSection('faq-2')}
          >
            Yes! Our platform is cloud-based. You can log in from your phone, tablet, or laptop. Data syncs automatically across all devices in real-time.
          </AccordionItem>

          <AccordionItem
            title="How do I reset my password?"
            icon={<HelpCircle className="w-5 h-5" />}
            isOpen={openSection === 'faq-3'}
            onClick={() => toggleSection('faq-3')}
          >
            If you are logged out, click "Forgot Password" on the login screen. If you are logged in, go to <strong>Account Settings &gt; Security</strong> to change your password.
          </AccordionItem>

          <AccordionItem
            title="Is my data safe?"
            icon={<HelpCircle className="w-5 h-5" />}
            isOpen={openSection === 'faq-4'}
            onClick={() => toggleSection('faq-4')}
          >
            Absolutely. We use Google Firebase for secure cloud storage and authentication. Your data is encrypted and backed up daily.
          </AccordionItem>
        </div>


        {/* --- SECTION 2: CONTACT OPTIONS --- */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 ml-1">
            Get in Touch
          </h2>

          <AccordionItem
            title="Contact Support Team"
            icon={<Phone className="w-5 h-5" />}
            isOpen={openSection === 'contact-1'}
            onClick={() => toggleSection('contact-1')}
          >
            <div className="space-y-4">
              <p>Our team is available Mon-Fri, 10 AM - 6 PM.</p>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md border border-gray-100">
                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-bold uppercase">Email Us</p>
                  <a href="mailto:sellarsuite@gmail.com" className="text-blue-600 font-medium hover:underline">sellarsuite@gmail.com</a>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md border border-gray-100">
                <div className="bg-green-100 p-2 rounded-full text-green-600">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-bold uppercase">WhatsApp Support</p>
                  <a href="https://wa.me/919818815838" className="text-green-600 font-medium hover:underline">+91 9818815838</a>
                </div>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem
            title="Visit Our Office"
            icon={<FileText className="w-5 h-5" />}
            isOpen={openSection === 'contact-2'}
            onClick={() => toggleSection('contact-2')}
          >
            <p className="font-medium text-gray-800">Sellar HQ</p>
            <p>Ground Floor, Harsha City Mall, G-46, Plot number 2B, Shakti Khand 2,</p>
            <p> Indirapuram, Ghaziabad, Uttar Pradesh 201014</p>
            <p className="mt-2 text-xs text-gray-400">(Visits by appointment only)</p>
          </AccordionItem>
        </div>


        {/* --- SECTION 3: RAISE TICKET --- */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 ml-1">
            Report an Issue
          </h2>

          <AccordionItem
            title="Raise a Support Ticket"
            icon={<Send className="w-5 h-5" />}
            isOpen={openSection === 'ticket'}
            onClick={() => toggleSection('ticket')}
          >
            {submitted ? (
              <div className="text-center py-6">
                <p className="text-green-600 font-bold text-lg">✓ Ticket Submitted!</p>
                <p className="text-gray-500 text-sm mt-1">Our team will reach out to you soon.</p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-4 text-sm text-blue-600 hover:underline"
                >
                  Raise another ticket
                </button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Issue Subject</label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData(p => ({ ...p, subject: e.target.value }))}
                    placeholder="e.g., Cannot export sales report"
                    className="w-full border border-gray-300 rounded-sm p-2 text-sm focus:ring-1 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                    placeholder="Describe what happened..."
                    className="w-full border border-gray-300 rounded-sm p-2 text-sm focus:ring-1 focus:ring-gray-900 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gray-900 text-white font-bold py-2 rounded-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </form>
            )}
          </AccordionItem>
        </div>

      </div>
    </div>
  );
};

export default SupportPage;