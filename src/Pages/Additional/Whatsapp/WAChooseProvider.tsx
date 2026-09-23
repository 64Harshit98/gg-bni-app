import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSmartphone, FiBriefcase, FiExternalLink, FiArrowRight, FiZap, FiCheck } from 'react-icons/fi';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import { ROUTES } from '../../../constants/routes.constants';
import BackButton from '../../../Components/BackButton';
import { SELLAR_WHATSAPP_PLANS } from './SellarWhatsappPlans';

// The Snapto signup link carries our referral/account id so signups from
// inside the app are attributed correctly.
const SNAPTO_SIGNUP_URL = 'https://wa.sellar.in/Signup?accId=6a96b1d8550e8ab4615ac0a6';

const WAChooseProvider: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;

  const [sellarExpanded, setSellarExpanded] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    SELLAR_WHATSAPP_PLANS.find(p => p.recommended)?.id || SELLAR_WHATSAPP_PLANS[0]?.id
  );
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [existingRequestStatus, setExistingRequestStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, 'whatsappActivationRequests', companyId))
      .then(snap => {
        if (snap.exists()) setExistingRequestStatus(snap.data().status || 'pending');
      })
      .catch(() => { });
  }, [companyId]);

  const selectedPlan = SELLAR_WHATSAPP_PLANS.find(p => p.id === selectedPlanId);

  // TODO: online payment for this plan is temporarily unavailable — the
  // gateway integration it depended on was reverted. Wire this back up to
  // whatever payment gateway replaces it.
  const handlePayNow = async () => {
    if (!companyId || !selectedPlanId) return;
    setPaying(true);
    setPayError('Online payment for this plan is temporarily unavailable. Please contact support.');
    setPaying(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute left-0">
            <BackButton />
          </div>
          <h1 className="text-xl font-black text-gray-900">Connect WhatsApp</h1>
        </div>

        <p className="text-center text-sm text-gray-500 mb-8">
          Which WhatsApp number do you want to use to message your customers?
        </p>

        <div className="space-y-4">
          {/* Personal number -> BotMaster QR-linking flow */}
          <button
            onClick={() => navigate(ROUTES.WHATSAPP_PLAN)}
            className="w-full text-left bg-white rounded-sm border border-gray-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all p-6 flex items-start gap-4"
          >
            <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <FiSmartphone size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">Personal WhatsApp Number</h3>
              <p className="text-xs text-gray-500 mt-1">
                Link your regular WhatsApp (like WhatsApp Web) by scanning a QR code. Quick to set up, no approval needed.
              </p>
            </div>
            <FiArrowRight className="text-gray-300 mt-1 shrink-0" />
          </button>

          {/* Official business number -> Snapto (Meta Cloud API), key handed to Sellar support */}
          <button
            onClick={() => window.open(SNAPTO_SIGNUP_URL, '_blank', 'noopener,noreferrer')}
            className="w-full text-left bg-white rounded-sm border border-gray-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all p-6 flex items-start gap-4"
          >
            <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <FiBriefcase size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
                WhatsApp Business (Official Number)
                <FiExternalLink size={13} className="text-gray-400" />
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Use Meta's official WhatsApp Business API via Snapto. Requires business verification and message templates,
                but is more reliable for scale.
              </p>
            </div>
          </button>

          {/* Sellar's own shared number -> no setup, admin-activated */}
          <div className="bg-white rounded-sm border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setSellarExpanded(prev => !prev)}
              className="w-full text-left hover:border-purple-400 hover:shadow-md transition-all p-6 flex items-start gap-4"
            >
              <div className="w-11 h-11 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <FiZap size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">Sellar WhatsApp Number</h3>
                <p className="text-xs text-gray-500 mt-1">
                  No setup needed — pick a plan and we send from our own WhatsApp number.
                </p>
              </div>
            </button>

            {sellarExpanded && (
              <div className="border-t border-gray-100 p-6 pt-4 space-y-3">
                {existingRequestStatus ? (
                  <div className="bg-purple-50 border border-purple-100 rounded-sm p-4 text-sm text-purple-800 flex items-center gap-2">
                    <FiCheck className="shrink-0" />
                    {existingRequestStatus === 'paid'
                      ? "Payment received — we'll activate this shortly."
                      : existingRequestStatus === 'pending'
                        ? "Request sent — we'll activate this shortly."
                        : `Request status: ${existingRequestStatus}`}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {SELLAR_WHATSAPP_PLANS.map(plan => (
                        <label
                          key={plan.id}
                          className={`flex items-center justify-between gap-3 border rounded-sm p-3 cursor-pointer transition-colors ${selectedPlanId === plan.id ? 'border-purple-400 bg-purple-50/50' : 'border-gray-200'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="sellarPlan"
                              checked={selectedPlanId === plan.id}
                              onChange={() => setSelectedPlanId(plan.id)}
                            />
                            <div>
                              <p className="text-sm font-bold text-gray-800">{plan.name}</p>
                              <p className="text-xs text-gray-500">
                                {plan.quota === null ? 'Unlimited messages' : `${plan.quota.toLocaleString('en-IN')} messages`} / {plan.duration.toLowerCase()}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {plan.recommended && (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-purple-100 text-purple-700">
                                Popular
                              </span>
                            )}
                            <span className="text-sm font-bold text-gray-800">
                              ₹{plan.price.toLocaleString('en-IN')}
                              <span className="text-[10px] font-medium text-gray-400">/{plan.duration.toLowerCase()}</span>
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                    {payError && <p className="text-xs text-red-500 text-center">{payError}</p>}
                    <button
                      onClick={handlePayNow}
                      disabled={paying || !selectedPlanId}
                      className="w-full bg-purple-600 text-white py-2.5 rounded-sm font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      {paying ? 'Redirecting to payment...' : selectedPlan ? `Pay ₹${selectedPlan.price.toLocaleString('en-IN')}` : 'Pay Now'}
                    </button>
                    <p className="text-[11px] text-gray-400 text-center">
                      Price excludes GST, added at checkout. We'll activate this plan once payment is confirmed.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-sm p-4 text-xs text-blue-800">
          After signing up on Snapto, contact Sellar support with your <strong>API key</strong> and{' '}
          <strong>template names</strong> to get your WhatsApp Business number activated.
        </div>
      </div>
    </div>
  );
};

export default WAChooseProvider;
