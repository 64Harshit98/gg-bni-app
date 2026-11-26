import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSmartphone, FiBriefcase, FiArrowRight, FiZap, FiCheck } from 'react-icons/fi';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import { ROUTES } from '../../../constants/routes.constants';
import BackButton from '../../../Components/BackButton';
import { SELLAR_WHATSAPP_PLANS, discountPct, perMessageRate } from './SellarWhatsappPlans';
import WACheckoutModal from './WACheckoutModal';

interface ActiveSellarPlan { planId: string; quotaTotal: number | null; quotaUsed: number; expiresAt: Date | null }

const WAChooseProvider: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;

  const [sellarExpanded, setSellarExpanded] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    SELLAR_WHATSAPP_PLANS.find(p => p.recommended)?.id || SELLAR_WHATSAPP_PLANS[0]?.id
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [existingRequestStatus, setExistingRequestStatus] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<ActiveSellarPlan | null>(null);

  useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, 'whatsappActivationRequests', companyId))
      .then(snap => {
        if (snap.exists()) setExistingRequestStatus(snap.data().status || 'pending');
      })
      .catch(() => { });
    getDoc(doc(db, 'companies', companyId, 'whatsappStatus', 'current'))
      .then(snap => {
        const x = snap.exists() ? snap.data() : null;
        const p = x?.sellarPlan;
        if (!x || x.activeTier !== 'sellar' || !x.active || !p || p.status !== 'active') return;
        const expiresAt = p.expiresAt?.toDate ? p.expiresAt.toDate() : null;
        if (expiresAt && expiresAt < new Date()) return;
        setActivePlan({ planId: p.planId || '', quotaTotal: typeof p.quotaTotal === 'number' ? p.quotaTotal : null, quotaUsed: p.quotaUsed || 0, expiresAt });
        setSellarExpanded(true);
      })
      .catch(() => { });
  }, [companyId]);

  // Paid before auto-activation existed and still waiting on the team.
  const awaitingManualActivation = !activePlan && existingRequestStatus === 'paid';

  const selectedPlan = SELLAR_WHATSAPP_PLANS.find(p => p.id === selectedPlanId);

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

          {/* Official business number -> Snapto (Meta Cloud API), guided in-app setup */}
          <button
            onClick={() => navigate(ROUTES.WHATSAPP_OFFICIAL_SETUP)}
            className="w-full text-left bg-white rounded-sm border border-gray-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all p-6 flex items-start gap-4"
          >
            <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <FiBriefcase size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">WhatsApp Business (Official Number)</h3>
              <p className="text-xs text-gray-500 mt-1">
                Use Meta's official WhatsApp Business API via Snapto. We guide you through each step right here —
                account, number, message templates. More reliable for scale.
              </p>
            </div>
            <FiArrowRight className="text-gray-300 mt-1 shrink-0" />
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
                {awaitingManualActivation ? (
                  <div className="bg-purple-50 border border-purple-100 rounded-sm p-4 text-sm text-purple-800 flex items-center gap-2">
                    <FiCheck className="shrink-0" />
                    Payment received — we'll activate this shortly.
                  </div>
                ) : (
                  <>
                    {activePlan && (
                      <div className="bg-green-50 border border-green-100 rounded-sm p-4 text-sm text-green-800">
                        <p className="font-bold flex items-center gap-2">
                          <FiCheck className="shrink-0" />
                          Active · {SELLAR_WHATSAPP_PLANS.find(p => p.id === activePlan.planId)?.name || 'Sellar WhatsApp plan'}
                        </p>
                        <p className="text-xs mt-1">
                          {activePlan.quotaTotal === null
                            ? 'Unlimited messages'
                            : `${Math.max(0, activePlan.quotaTotal - activePlan.quotaUsed).toLocaleString('en-IN')} of ${activePlan.quotaTotal.toLocaleString('en-IN')} messages left`}
                          {activePlan.expiresAt && ` · valid till ${activePlan.expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </p>
                        <p className="text-xs mt-2 text-green-700">
                          Buying another plan starts a fresh year and adds your unused messages on top.
                        </p>
                      </div>
                    )}
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
                              {perMessageRate(plan) !== null && (
                                <p className="text-[11px] font-semibold text-purple-700 mt-0.5">₹{perMessageRate(plan)} / message</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1">
                              {plan.recommended && (
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-purple-100 text-purple-700">
                                  Popular
                                </span>
                              )}
                              {discountPct(plan) > 0 && (
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm bg-green-100 text-green-700">
                                  {discountPct(plan)}% off
                                </span>
                              )}
                            </div>
                            {plan.mrp > plan.price && (
                              <span className="text-[11px] text-gray-400 line-through">₹{plan.mrp.toLocaleString('en-IN')}</span>
                            )}
                            <span className="text-sm font-bold text-gray-800">
                              ₹{plan.price.toLocaleString('en-IN')}
                              <span className="text-[10px] font-medium text-gray-400">/{plan.duration.toLowerCase()}</span>
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={() => setCheckoutOpen(true)}
                      disabled={!companyId || !selectedPlan}
                      className="w-full bg-purple-600 text-white py-2.5 rounded-sm font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      {selectedPlan ? `${activePlan ? 'Renew' : 'Buy'} ${selectedPlan.subtitle} · ₹${selectedPlan.price.toLocaleString('en-IN')}` : 'Choose a plan'}
                    </button>
                    <p className="text-[11px] text-gray-400 text-center">
                      Price excludes 18% GST. Have a coupon? Apply it at checkout.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {checkoutOpen && selectedPlan && (
        <WACheckoutModal plan={selectedPlan} isRenewal={!!activePlan} onClose={() => setCheckoutOpen(false)} />
      )}
    </div>
  );
};

export default WAChooseProvider;
