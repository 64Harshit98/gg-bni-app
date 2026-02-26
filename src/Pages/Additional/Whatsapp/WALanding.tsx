import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import {
  FiCheckCircle,
  FiAlertCircle,
  FiTrendingUp,
} from 'react-icons/fi';
import { ROUTES } from '../../../constants/routes.constants';
import { botMasterService } from '../Whatsapp/WhatsappApi';

// --- Types ---
interface QuotaData {
  creditsUsed: number;
  creditsLimit: number;
  planName: string;
  refreshDate: string;
  isActive: boolean;
}

// --- Hook: Fetch Data from Bot Master API ---
const useMessageQuota = (currentUser: any) => {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRealData = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const companyId = currentUser.companyId || currentUser.uid;
        const userDocRef = doc(db, 'companies', companyId, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const { botMasterToken, phoneNumber } = userSnap.data();

          if (botMasterToken && phoneNumber) {
            const response = await botMasterService.getMe(botMasterToken, phoneNumber);

            if (response.success && response.data?.sessions?.length > 0) {
              const session = response.data.sessions[0];
              const sub = session.subscription;

              // FIX: Accessing the correct fields for the calculation
              // sub.plan.sms_count = Total Limit (200)
              // sub.sms_count = Remaining credits (200)
              const limit = sub.plan.sms_count || 1000;
              const remaining = sub.sms_count || 0;
              const used = limit - remaining;

              setQuota({
                creditsUsed: used, // Will be 0 initially
                creditsLimit: limit, // Will be 200
                planName: sub.plan.name || 'Trial Package',
                refreshDate: sub.expires_at || 'N/A',
                isActive: sub.isActive && session.active
              });
              setLoading(false);
              return;
            }
          }
        }
        setLoading(false);
      } catch (err) {
        console.error('Error fetching quota:', err);
        setLoading(false);
      }
    };

    fetchRealData();
  }, [currentUser]);

  return { quota, loading };
};
const MessageQuotaPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { quota, loading } = useMessageQuota(currentUser);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          <span className="font-medium">Loading Usage Data...</span>
        </div>
      </div>
    );
  }

  // Redirect to setup if no quota is found (User isn't linked)
  if (!quota) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gray-50">
        <FiAlertCircle className="w-12 h-12 text-orange-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-800">Connection Required</h2>
        <p className="text-gray-500 mb-6 max-w-xs">We couldn't find an active WhatsApp session for this account.</p>
        <button
          onClick={() => navigate(ROUTES.WHATSAPP_PLAN)}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
        >
          Go to Setup
        </button>
      </div>
    );
  }

  const messagesLeft = Math.max(0, quota.creditsLimit - quota.creditsUsed);


  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg mb-6 bg-green-100 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center shadow-sm">
        <FiCheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
        <div className="text-sm">
          <span className="font-bold">System Online!</span> Your WhatsApp session is currently active.
        </div>
      </div>

      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-white text-center">
          <h1 className="text-2xl font-bold mb-1">Message Balance</h1>
          <p className="text-blue-100 text-sm opacity-90">{quota.planName}</p>

          <div className="mt-6 flex justify-center items-baseline">
            <span className="text-6xl font-bold tracking-tight">
              {messagesLeft.toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-sm text-blue-100 font-medium">Messages Remaining</p>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
              <FiTrendingUp className="text-blue-500 w-6 h-6 mb-2" />
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Expiry Date</span>
              <span className="text-gray-800 font-semibold text-xs text-center">{quota.refreshDate}</span>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
              <FiAlertCircle className={`${quota.isActive ? 'text-green-500' : 'text-red-500'} w-6 h-6 mb-2`} />
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Status</span>
              <span className={`font-semibold text-xs px-2 py-0.5 rounded-full ${quota.isActive ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {quota.isActive ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate(ROUTES.HOME)}
              className="w-full bg-gray-500 text-white font-semibold py-4 rounded-xl border-2 border-gray-100 hover:bg-gray-50 transition-colors"
            >
              Go to Main Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageQuotaPage;