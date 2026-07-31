import React, { useState } from 'react';
import { Link } from 'react-router-dom';

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
    <div className="border border-border rounded-lg bg-card mb-3 overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md">
      <button
        onClick={onClick}
        className={`w-full flex items-center justify-between p-4 text-left transition-colors ${isOpen ? 'bg-muted text-foreground' : 'bg-card text-foreground hover:bg-muted'
          }`}
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="font-semibold text-sm sm:text-base">{title}</span>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>

      <div
        className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
      >
        <div className="p-4 border-t border-border text-muted-foreground text-sm leading-relaxed bg-card">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---
const CatalogueSupport: React.FC = () => {
  const [openSection, setOpenSection] = useState<string | null>('faq-1');

  const toggleSection = (id: string) => {
    setOpenSection(prev => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-muted pb-20 font-sans">

      {/* Header */}
      <div className="bg-card shadow-sm border-b border-border sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <BackButton />
            <h1 className="text-xl font-bold text-foreground">Help & Support</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-8">

        {/* --- SECTION 1: FREQUENTLY ASKED QUESTIONS --- */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 ml-1">
            Frequently Asked Questions
          </h2>

          <AccordionItem
            title="How do I upgrade my subscription plan?"
            icon={<HelpCircle className="w-5 h-5" />}
            isOpen={openSection === 'faq-1'}
            onClick={() => toggleSection('faq-1')}
          >
            Go to the <Link to={ROUTES.SUBSCRIPTION_PAGE}><strong>Subscription</strong></Link> page from your account menu. Select the category (POS, Catalogue, or Both), choose the plan that best fits your business, and tap "Choose". Your benefits will be active after your payment is verified.
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
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 ml-1">
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

              <div className="flex items-center gap-3 p-3 bg-muted rounded-md border border-border">
                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold uppercase">Email Us</p>
                  <a href="mailto:sellarsuite@gmail.com" className="text-blue-600 font-medium hover:underline">sellarsuite@gmail.com</a>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted rounded-md border border-border">
                <div className="bg-green-100 p-2 rounded-full text-green-600">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold uppercase">WhatsApp Support</p>
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
            <p className="font-medium text-foreground">Sellar HQ</p>
            <p>2nd Floor, Parsvnath Arcade, Unit 22, Vaibhav khand</p>
            <p> Indirapuram, Ghaziabad, Uttar Pradesh 201014</p>
            <p className="mt-2 text-xs text-muted-foreground">(Visits by appointment only)</p>
          </AccordionItem>
        </div>


        {/* --- SECTION 3: RAISE TICKET --- */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 ml-1">
            Report an Issue
          </h2>

          <AccordionItem
            title="Raise a Support Ticket (Coming soon)"
            icon={<Send className="w-5 h-5" />}
            isOpen={openSection === 'ticket'}
            onClick={() => toggleSection('ticket')}
          >
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert("Ticket Submitted!"); }}>
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Issue Subject</label>
                <input type="text" disabled placeholder="e.g., Cannot export sales report" className="w-full border border-border rounded-sm p-2 text-sm focus:ring-1 focus:ring-gray-900 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Description</label>
                <textarea rows={4} disabled placeholder="Describe what happened..." className="w-full border border-border rounded-sm p-2 text-sm focus:ring-1 focus:ring-gray-900 outline-none" />
              </div>
              <button className="w-full bg-gray-900 text-white font-bold py-2 rounded-sm hover:bg-gray-800 transition-colors">
                Submit Ticket
              </button>
            </form>
          </AccordionItem>
        </div>

      </div>
    </div>
  );
};

export default CatalogueSupport;