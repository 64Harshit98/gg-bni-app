import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import { useWhatsappProvider } from './useWhatsappProvider';
import BackButton from '../../../Components/BackButton';

interface WhatsappMessageLogRow {
  id: string;
  to: string;
  messageType: string;
  status: 'sent' | 'failed';
  tier: string;
  errorDetail: string | null;
  refCollection: string | null;
  refId: string | null;
  sentAt: any;
}

interface SellarPlanStatus {
  planId: string;
  status: string;
  quotaTotal: number | null;
  quotaUsed: number;
  expiresAt: any;
}

const MESSAGE_TYPE_LABEL: Record<string, string> = {
  invoice: 'Invoice',
  order: 'Order',
  reminder: 'Reminder',
  stockAlert: 'Stock Alert',
};

const WhatsappMessageLog: React.FC = () => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const { provider, loading: providerLoading } = useWhatsappProvider(companyId);

  const [messages, setMessages] = useState<WhatsappMessageLogRow[]>([]);
  const [sellarPlan, setSellarPlan] = useState<SellarPlanStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [messagesSnap, statusSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'companies', companyId, 'whatsappMessages'),
            orderBy('sentAt', 'desc'),
            limit(100)
          )),
          getDoc(doc(db, 'companies', companyId, 'whatsappStatus', 'current')),
        ]);

        setMessages(messagesSnap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsappMessageLogRow)));

        if (statusSnap.exists()) {
          const data = statusSnap.data();
          if (data.sellarPlan) setSellarPlan(data.sellarPlan);
        }
      } catch (err) {
        console.error('Failed to load WhatsApp message log:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  const formatDateTime = (ts: any): string => {
    if (!ts) return 'N/A';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      <div className="flex items-center bg-white border-b border-gray-200 sticky top-0 z-10">
        <BackButton className="ml-3" />
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">WhatsApp Message History</h1>
          <p className="text-xs text-gray-500">Every bill/order/reminder message sent on your behalf</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {!providerLoading && provider !== 'sellar' && provider !== 'snapto' && (
          <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 text-sm text-amber-800">
            This message log is only available for the WhatsApp Business or Sellar WhatsApp Number providers.
          </div>
        )}

        {sellarPlan && (
          <div className="bg-white rounded-sm shadow-sm border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">Sellar WhatsApp Quota</p>
              <p className="text-lg font-bold text-gray-800">
                {sellarPlan.quotaUsed} / {sellarPlan.quotaTotal === null ? '∞' : sellarPlan.quotaTotal}
              </p>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-sm uppercase ${
              sellarPlan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {sellarPlan.status}
            </span>
          </div>
        )}

        <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No messages sent yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-left px-4 py-2">Recipient</th>
                    <th className="text-left px-4 py-2">Type</th>
                    <th className="text-left px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {messages.map(m => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(m.sentAt)}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">{m.to}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{MESSAGE_TYPE_LABEL[m.messageType] || m.messageType}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase ${
                          m.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`} title={m.errorDetail || undefined}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsappMessageLog;
