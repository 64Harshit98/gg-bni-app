import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import {
  FiCheckCircle,
  FiAlertCircle,
  FiTrendingUp,
  FiRefreshCw,
  FiX,
  FiLoader,
  FiArrowRight,
} from 'react-icons/fi';
import { ROUTES } from '../../../constants/routes.constants';
import { botMasterService } from '../Whatsapp/WhatsappApi';

interface QuotaData {
  messagesRemaining: number; // Simplified based on your JSON
  planName: string;
  refreshDate: string;
  isActive: boolean;
  botMasterToken: string;
  phoneNumber: string;
}

const MessageQuotaPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25);

  // --- Logic: Fetch Dashboard Data (With True State Ping) ---
  const fetchDashboardData = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const companyId = (currentUser as any).companyId || currentUser.uid;
      const userDocRef = doc(db, 'companies', companyId, 'users', currentUser.uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const { botMasterToken, phoneNumber } = userSnap.data();

        if (botMasterToken && phoneNumber) {
          // Format phone strictly to 91 prefix
          let formattedPhone = phoneNumber.replace(/\D/g, '');
          if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;

          // 1. Get the account limits (from the JSON you provided)
          const response = await botMasterService.getMe(botMasterToken, formattedPhone);

          if (response.success && response.data?.sessions?.length > 0) {
            const session = response.data.sessions[0];
            const sub = session.subscription;

            // 2. THE FIX: Silent ping to find REAL live WhatsApp connection
            let isLive = false;
            let preloadedQR = null;

            try {
              const qrRes = await botMasterService.getQrCode(botMasterToken, formattedPhone);

              if (qrRes?.error?.data?.state === 'ALREADY_CONNECTED' || qrRes?.message?.toLowerCase().includes('already connected')) {
                isLive = true;
              } else if (qrRes?.baileys_response?.data?.qrCode || qrRes?.qrCode) {
                isLive = false;
                preloadedQR = qrRes?.baileys_response?.data?.qrCode || qrRes?.qrCode;
              }
            } catch (qrErr: any) {
              const errData = qrErr.response?.data;
              if (
                errData?.error?.data?.state === 'ALREADY_CONNECTED' ||
                errData?.error?.message?.toLowerCase().includes('already connected') ||
                errData?.message?.toLowerCase().includes('already connected')
              ) {
                isLive = true;
              }
            }

            // 3. Map directly to your JSON structure
            setQuota({
              messagesRemaining: sub?.sms_count || 0, // Maps to the 11993 in your JSON
              planName: sub?.plan?.name || 'Standard',
              refreshDate: sub?.expires_at || 'N/A',
              isActive: isLive, // Driven entirely by the live ping
              botMasterToken,
              phoneNumber: formattedPhone
            });

            if (preloadedQR) setQrCodeData(preloadedQR);
          }
        }
      }
    } catch (err) {
      console.error("Dashboard Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // --- Logic: Fetch QR Code (Inside Modal) ---
  const handleFetchQR = async () => {
    if (!quota?.botMasterToken || !quota?.phoneNumber) return;
    setQrLoading(true);

    const markAsConnected = () => {
      setQuota(prev => prev ? { ...prev, isActive: true } : null);
      setShowQRModal(false);
    };

    try {
      const response = await botMasterService.getQrCode(quota.botMasterToken, quota.phoneNumber);

      if (response?.error?.data?.state === 'ALREADY_CONNECTED' || response?.message?.toLowerCase().includes('already')) {
        markAsConnected();
        return;
      }

      const qrValue = response?.baileys_response?.data?.qrCode || response?.qrCode;
      if (qrValue) {
        setQrCodeData(qrValue);
        setTimeLeft(25);
      }
    } catch (err: any) {
      const errData = err.response?.data;
      if (
        errData?.error?.data?.state === 'ALREADY_CONNECTED' ||
        errData?.message?.toLowerCase().includes('already connected')
      ) {
        markAsConnected();
      }
    } finally {
      setQrLoading(false);
    }
  };

  // --- Logic: Modal Timer ---
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showQRModal) {
      if (!qrCodeData) handleFetchQR();
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { handleFetchQR(); return 25; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showQRModal, qrCodeData]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <FiLoader className="animate-spin h-8 w-8 text-blue-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">

      <div className={`w-full max-w-lg mb-6 px-4 py-3 rounded-xs flex items-center border shadow-sm ${quota?.isActive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
        {quota?.isActive ? <FiCheckCircle className="mr-3 w-5 h-5" /> : <FiAlertCircle className="mr-3 w-5 h-5" />}
        <span className="text-sm font-bold uppercase tracking-wide">
          {quota?.isActive ? 'System Online' : 'WhatsApp Disconnected'}
        </span>
      </div>

      <div className="max-w-lg w-full bg-white rounded-xs shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-10 text-white text-center">
          <h1 className="text-7xl font-black mb-2 tracking-tighter">
            {quota?.messagesRemaining?.toLocaleString()}
          </h1>
          <p className="text-blue-100 font-medium">Messages Remaining</p>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-5 bg-gray-50 rounded-xs border flex flex-col items-center">
              <FiTrendingUp className="text-blue-500 mb-2" size={20} />
              <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Renewal</span>
              <span className="text-gray-800 font-bold text-xs">{quota?.refreshDate}</span>
            </div>

            <button
              onClick={() => !quota?.isActive && setShowQRModal(true)}
              className={`p-5 rounded-xs border flex flex-col items-center transition-all ${quota?.isActive ? 'bg-green-50/50 cursor-default' : 'bg-red-50 hover:bg-red-100 active:scale-95 cursor-pointer shadow-sm'
                }`}
            >
              <div className={`w-2.5 h-2.5 rounded-xs mb-1 ${quota?.isActive ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest mt-1">Status</span>
              <span className={`text-sm font-bold mt-0.5 ${quota?.isActive ? 'text-green-600' : 'text-red-600'}`}>
                {quota?.isActive ? 'Connected' : 'Fix Now'}
              </span>
            </button>
          </div>

          <button onClick={() => navigate(ROUTES.HOME)} className="w-full bg-gray-900 text-white font-bold py-4 rounded-xs flex items-center justify-center gap-2 hover:bg-black transition-colors">
            Back to Dashboard <FiArrowRight />
          </button>
        </div>
      </div>

      {/* --- MODAL --- */}
      {showQRModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-xs p-10 flex flex-col items-center relative shadow-2xl animate-in zoom-in-95">
            <button
              onClick={() => setShowQRModal(false)}
              className="absolute top-8 right-8 text-gray-400 hover:text-black transition-colors"
            >
              <FiX size={24} />
            </button>

            <h3 className="text-2xl font-black text-gray-800 mb-1">Link Device</h3>
            <p className="text-xs text-gray-400 text-center mb-8 px-4">Open WhatsApp &gt; Linked Devices to scan this code.</p>

            <div className="relative w-64 h-64 bg-gray-50 rounded-[2rem] flex items-center justify-center border-4 border-white shadow-inner overflow-hidden">
              {qrLoading && !qrCodeData ? (
                <FiRefreshCw className="animate-spin text-blue-400 w-10 h-10" />
              ) : qrCodeData ? (
                <img
                  src={qrCodeData}
                  className="w-full h-full object-contain p-4"
                  alt="WhatsApp QR Code"
                />
              ) : (
                <div className="flex flex-col items-center">
                  <FiAlertCircle className="text-gray-300 w-8 h-8 mb-2" />
                  <span className="text-xs text-gray-400 font-bold mt-2">Connecting...</span>
                </div>
              )}
            </div>

            <div className="w-full mt-8 bg-gray-50 px-6 py-4 rounded-2xl flex items-center justify-between border border-gray-100">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">New Code In</span>
              <span className="text-xl font-black text-blue-600">{timeLeft}s</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageQuotaPage;