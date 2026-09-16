import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSmartphone, FiBriefcase, FiExternalLink, FiArrowRight } from 'react-icons/fi';
import { ROUTES } from '../../../constants/routes.constants';
import BackButton from '../../../Components/BackButton';

// The Snapto signup link carries our referral/account id so signups from
// inside the app are attributed correctly.
const SNAPTO_SIGNUP_URL = 'https://wa.redlava.in/Signup?accId=6a96b1d8550e8ab4615ac0a6';

const WAChooseProvider: React.FC = () => {
  const navigate = useNavigate();

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

          {/* Official business number -> Snapto (Meta Cloud API) */}
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
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-sm p-4 text-xs text-blue-800">
          After signing up on Snapto, come back here and paste your <strong>API key</strong> and{' '}
          <strong>template name</strong> in{' '}
          <button
            onClick={() => navigate(ROUTES.BILLSETTING)}
            className="underline font-semibold"
          >
            Bill Settings
          </button>{' '}
          to finish connecting.
        </div>
      </div>
    </div>
  );
};

export default WAChooseProvider;
