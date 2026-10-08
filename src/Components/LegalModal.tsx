import { useEffect, useState } from 'react';
import { FiX } from 'react-icons/fi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'terms' | 'privacy';
}

type Tab = 'terms' | 'privacy';

export const LegalModal = ({ isOpen, onClose, defaultTab = 'terms' }: Props) => {
  const [tab, setTab] = useState<Tab>(defaultTab);

  useEffect(() => {
    if (isOpen) setTab(defaultTab);
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl max-h-[85vh] rounded-lg shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => setTab('terms')}
              className={`px-4 py-2 rounded-sm text-sm font-semibold transition-colors ${
                tab === 'terms'
                  ? 'bg-black text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Terms & Conditions
            </button>
            <button
              onClick={() => setTab('privacy')}
              className={`px-4 py-2 rounded-sm text-sm font-semibold transition-colors ${
                tab === 'privacy'
                  ? 'bg-black text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Privacy Policy
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Close"
          >
            <FiX size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-8 text-slate-700 leading-relaxed">
          {tab === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>
      </div>
    </div>
  );
};

const TermsContent = () => (
  <div className="space-y-10">
    <header>
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-black mb-2">
        Terms & Conditions
      </h1>
      <p className="text-slate-500 font-medium text-sm">Last Updated: March 2026</p>
    </header>

    <Section num="01" title="Acceptance of Terms">
      <p>
        By accessing, browsing, or using the Sellar platform, you acknowledge that you have read, understood, and agree to be legally bound by these Terms & Conditions.
        These Terms apply to all users including but not limited to business owners, staff members, visitors, and any third party accessing the platform.
      </p>
      <p className="mt-3">
        If you do not agree with any part of these Terms, you must immediately discontinue use of the platform. Continued use of the platform constitutes your acceptance of these Terms.
      </p>
    </Section>

    <Section num="02" title="Description of Services">
      <p>
        Sellar is a cloud-based retail management platform designed to assist businesses in managing billing (POS), digital catalogs, customer data, inventory, analytics, and other operational workflows.
      </p>
      <p className="mt-3">
        We reserve the right to update, enhance, modify, or discontinue any feature or functionality of the platform at any time without prior notice.
        We may also introduce new services or impose limitations on certain features as part of product evolution.
      </p>
    </Section>

    <Section num="03" title="User Responsibilities">
      <p>As a user of Sellar, you agree to use the platform responsibly and in compliance with all applicable laws and regulations.</p>
      <ul className="list-disc ml-6 mt-3 space-y-2">
        <li>You must provide accurate, complete, and up-to-date information</li>
        <li>You are responsible for maintaining proper business records and tax compliance (including GST)</li>
        <li>You must ensure that your usage does not violate any laws or third-party rights</li>
        <li>You agree not to misuse the platform for fraudulent, illegal, or unethical activities</li>
      </ul>
    </Section>

    <Section num="04" title="Account & Security">
      <p>
        You are responsible for maintaining the confidentiality of your account credentials, including passwords, OTPs, and login access.
      </p>
      <p className="mt-3">
        Any activity performed through your account shall be deemed to be performed by you. Sellar shall not be liable for any unauthorized access, misuse, or loss arising due to compromised account security.
      </p>
    </Section>

    <Section num="05" title="Payments, Billing & Subscriptions">
      <p>
        Certain features of Sellar are available under paid subscription plans. By subscribing to any paid plan, you agree to pay all applicable charges, including taxes, fees, and applicable GST, in accordance with the selected plan.
      </p>
      <p className="mt-3">
        Payments are processed through secure third-party payment gateways. Sellar does not store sensitive payment information such as complete card details, CVV, or banking credentials.
      </p>
      <p className="mt-3">
        Subscription plans may be billed on a recurring basis (monthly, quarterly, or yearly), depending on the plan selected. You authorize us to charge the applicable fees automatically at the beginning of each billing cycle unless canceled before renewal.
      </p>
      <p className="mt-3">
        All payments made are generally non-refundable unless explicitly stated otherwise. In cases of failed payments, delayed payments, or chargebacks, Sellar reserves the right to suspend or restrict access to premium features until dues are cleared.
      </p>
      <p className="mt-3">
        We reserve the right to revise pricing, introduce new plans, modify billing structures, or discontinue existing plans at our sole discretion.
      </p>
    </Section>

    <Section num="06" title="Data Ownership & Usage">
      <p>
        You retain full ownership of your business data, including but not limited to customer information, invoices, product listings, and transaction records.
      </p>
      <p className="mt-3">
        Sellar processes your data solely for providing services, improving functionality, ensuring security, and enhancing user experience.
        We may use anonymized or aggregated data for analytics and product improvements.
      </p>
    </Section>

    <Section num="07" title="Prohibited Activities">
      <p>
        Users are strictly prohibited from engaging in activities that compromise the integrity, security, or lawful use of the Sellar platform.
      </p>
      <ul className="list-disc ml-6 mt-3 space-y-2">
        <li>Attempting to hack, disrupt, or gain unauthorized access to the platform, servers, or databases</li>
        <li>Reverse engineering, copying, modifying, or exploiting the software or underlying technology</li>
        <li>Uploading or distributing viruses, malware, or any harmful code</li>
        <li>Using the platform for fraudulent, illegal, misleading, or unethical business practices</li>
        <li>Violating intellectual property rights, privacy rights, or any third-party rights</li>
        <li>Misusing customer data or engaging in unauthorized data collection or scraping</li>
      </ul>
      <p className="mt-3">
        Any violation of these restrictions may result in immediate suspension or permanent termination of your account, along with potential legal action.
      </p>
    </Section>

    <Section num="08" title="Service Availability & Reliability">
      <p>
        Sellar strives to provide a stable, secure, and uninterrupted platform experience. However, we do not guarantee that the service will always be available, uninterrupted, timely, or error-free.
      </p>
      <p className="mt-3">
        The platform may experience downtime due to scheduled maintenance, updates, server issues, network failures, or unforeseen technical disruptions.
      </p>
      <p className="mt-3">
        We are not responsible for any loss of data, business interruptions, or financial losses resulting from system outages or service interruptions.
      </p>
      <p className="mt-3">
        Users are advised to maintain backups of critical business data and ensure contingency measures for operational continuity.
      </p>
    </Section>

    <Section num="09" title="Limitation of Liability">
      <p>
        To the maximum extent permitted by applicable law, Sellar shall not be liable for any indirect, incidental, special, consequential, or punitive damages.
      </p>
      <p className="mt-3">
        This includes, but is not limited to, loss of profits, revenue, business opportunities, data loss, or reputational damage arising from:
      </p>
      <ul className="list-disc ml-6 mt-3 space-y-2">
        <li>Use or inability to use the platform</li>
        <li>Errors, bugs, or inaccuracies in the system</li>
        <li>Unauthorized access to user accounts or data</li>
        <li>Third-party integrations or services</li>
      </ul>
      <p className="mt-3">
        Your use of the platform is entirely at your own risk, and you agree that Sellar's total liability shall not exceed the amount paid by you for the service in the preceding billing period.
      </p>
    </Section>

    <Section num="10" title="Intellectual Property Rights">
      <p>
        All content, features, designs, trademarks, logos, software, and technology associated with Sellar are the exclusive property of Sellar and are protected under applicable intellectual property laws.
      </p>
      <p className="mt-3">
        Users are granted a limited, non-exclusive, non-transferable license to use the platform solely for business purposes in accordance with these Terms.
      </p>
      <p className="mt-3">
        You may not copy, reproduce, distribute, modify, create derivative works, or exploit any part of the platform without prior written permission.
      </p>
      <p className="mt-3">
        Any unauthorized use of Sellar's intellectual property may result in legal action.
      </p>
    </Section>

    <Section num="11" title="Termination & Suspension">
      <p>
        Sellar reserves the right to suspend, restrict, or terminate your account at its sole discretion, with or without prior notice.
      </p>
      <p className="mt-3">
        This may occur if you violate these Terms, engage in suspicious or harmful activities, fail to make required payments, or misuse the platform in any way.
      </p>
      <p className="mt-3">
        Upon termination, your access to the platform and its features may be revoked immediately. We may also delete or restrict access to your data in accordance with applicable laws and policies.
      </p>
      <p className="mt-3">
        You may choose to terminate your account at any time by contacting support or using available account settings.
      </p>
    </Section>

    <Section num="12" title="Governing Law">
      <p>These Terms & Conditions shall be governed by and interpreted in accordance with the laws of India.</p>
      <p className="mt-3">
        Any disputes, claims, or legal proceedings arising out of or relating to these Terms or the use of the platform shall be subject to the exclusive jurisdiction of the courts located in Ghaziabad, Uttar Pradesh.
      </p>
      <p className="mt-3">
        By using the platform, you agree to submit to the jurisdiction of such courts and waive any objections to jurisdiction or venue.
      </p>
    </Section>

    <Section num="13" title="Changes to Terms">
      <p>
        Sellar reserves the right to update, modify, or replace these Terms & Conditions at any time to reflect changes in legal requirements, business practices, or platform features.
      </p>
      <p className="mt-3">
        Any changes will be posted on this page with an updated "Last Updated" date. Significant changes may also be communicated through notifications or email.
      </p>
      <p className="mt-3">Continued use of the platform after such updates constitutes your acceptance of the revised Terms.</p>
      <p className="mt-3">We encourage users to review these Terms periodically to stay informed about their rights and obligations.</p>
    </Section>

    <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
      <h2 className="text-lg font-bold text-black mb-2">Contact Us</h2>
      <p>For any questions regarding these Terms, please reach out to our support team.</p>
    </section>
  </div>
);

const PrivacyContent = () => (
  <div className="space-y-10">
    <header>
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-black mb-2">
        Privacy Policy
      </h1>
      <p className="text-slate-500 font-medium text-sm">Last Updated: April 2026</p>
    </header>

    <Section num="01" title="Information We Collect">
      <p>
        We collect information that is necessary to provide, operate, and improve our SaaS platform. This may include personal details such as{' '}
        <span className="text-black font-medium">your name, email address, phone number, and business information</span> when you register or use our services.
      </p>
      <p className="mt-3">
        Additionally, we may collect usage data such as login activity, device information, browser type, IP address, and interactions within the platform
        to better understand user behavior and enhance overall performance.
      </p>
      <p className="mt-3">We only collect data that is relevant, limited, and required to deliver a smooth and secure user experience.</p>
    </Section>

    <Section num="02" title="How We Use Information">
      <p>
        The information we collect is used to deliver and maintain our services efficiently. This includes account management, processing transactions,
        generating invoices, and enabling key features of the platform.
      </p>
      <p className="mt-3">
        We may also use your data to personalize your experience, provide customer support, send important service-related updates, and improve our platform
        through analytics and performance monitoring.
      </p>
      <p className="mt-3">We do not use your personal data for any unauthorized or unrelated purposes.</p>
    </Section>

    <Section num="03" title="Data Sharing">
      <p>
        We value your trust and <span className="text-black font-medium">do not sell, rent, or trade your personal data</span> to third parties.
      </p>
      <p className="mt-3">
        Your data may only be shared with trusted third-party service providers such as payment gateways, cloud storage providers, or analytics tools
        that help us operate our services effectively.
      </p>
      <p className="mt-3">These partners are contractually obligated to keep your information secure and use it only for the intended purpose.</p>
    </Section>

    <Section num="04" title="Cookies & Tracking Technologies">
      <p>
        We use cookies and similar tracking technologies to enhance your browsing experience, remember user preferences, and improve platform performance.
      </p>
      <p className="mt-3">
        Cookies help us understand how users interact with our platform, allowing us to optimize features and deliver a more personalized experience.
      </p>
      <p className="mt-3">
        You can choose to disable cookies through your browser settings; however, some features of the platform may not function properly as a result.
      </p>
    </Section>

    <Section num="05" title="Your Rights & Data Control">
      <p>
        You have full control over your personal data. At any time, you may request access to the information we hold about you, correct inaccurate details.
      </p>
      <p className="mt-3">We are committed to ensuring transparency and providing you with the tools necessary to manage your data effectively.</p>
      <p className="mt-3">
        For any such requests, you can contact us directly, and we will respond in a timely manner in accordance with applicable data protection laws.
      </p>
    </Section>

    <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
      <h2 className="text-lg font-bold text-black mb-2">Contact Us</h2>
      <p>
        If you have any questions, concerns, or requests regarding this Privacy Policy or your personal data, feel free to contact our support team anytime.
      </p>
    </section>
  </div>
);

const Section = ({ num, title, children }: { num: string; title: string; children: React.ReactNode }) => (
  <section>
    <h2 className="text-xl font-bold text-black mb-3 flex items-center">
      <span className="mr-3 text-slate-300">{num}</span> {title}
    </h2>
    {children}
  </section>
);
