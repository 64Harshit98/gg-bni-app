import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';

export type WhatsappProvider = 'sellar' | 'snapto' | 'botmaster' | 'none';

// Single source of truth for which WhatsApp sender a company has connected —
// used everywhere a "Send on WhatsApp" button is rendered so only one
// provider's button ever shows, never both.
//
// 'snapto' and 'sellar' are both now admin-managed server-side (no company
// ever holds a Snapto API key client-side any more — see
// functions/lib/index.js's sendCompanyWhatsappMessage), so both are resolved
// from the client-readable companies/{id}/whatsappStatus/current mirror doc
// rather than from a client-held credential. 'botmaster' is unchanged: still
// fully client-side, still resolved from credential presence.
export const useWhatsappProvider = (companyId: string | undefined) => {
  const [provider, setProvider] = useState<WhatsappProvider>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setProvider('none');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProvider = async () => {
      setLoading(true);
      try {
        const [businessSnap, statusSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId, 'business_info', companyId)),
          getDoc(doc(db, 'companies', companyId, 'whatsappStatus', 'current')),
        ]);

        const businessData = businessSnap.exists() ? businessSnap.data() : {};
        const statusData = statusSnap.exists() ? statusSnap.data() : {};

        const hasBotMaster = !!(businessData.botMasterToken && businessData.whatsappNumber);
        const cloudTier = statusData.active ? statusData.activeTier : null;
        const hasSellar = cloudTier === 'sellar' && statusData.sellarPlan?.status === 'active';
        const hasSnapto = cloudTier === 'snapto';

        if (cancelled) return;

        if (hasSellar) setProvider('sellar');
        else if (hasSnapto) setProvider('snapto');
        else if (hasBotMaster) setProvider('botmaster');
        else setProvider('none');
      } catch (err) {
        console.error('Error resolving WhatsApp provider:', err);
        if (!cancelled) setProvider('none');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProvider();
    return () => { cancelled = true; };
  }, [companyId]);

  return { provider, loading };
};
