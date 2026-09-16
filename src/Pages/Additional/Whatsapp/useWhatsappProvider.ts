import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';

export type WhatsappProvider = 'snapto' | 'botmaster' | 'none';

// Single source of truth for which WhatsApp sender a company has connected —
// used everywhere a "Send on WhatsApp" button is rendered so only one
// provider's button ever shows, never both. Snapto takes priority when a
// company has somehow configured both, since it's the official Meta-based
// integration; BotMaster is the fallback for companies onboarded before
// Snapto existed.
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
        const [businessSnap, billSettingsSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId, 'business_info', companyId)),
          getDoc(doc(db, 'companies', companyId, 'settings', 'bill')),
        ]);

        const businessData = businessSnap.exists() ? businessSnap.data() : {};
        const billData = billSettingsSnap.exists() ? billSettingsSnap.data() : {};

        const hasSnapto = !!(billData.snaptoApiKey && billData.snaptoTemplateName);
        const hasBotMaster = !!(businessData.botMasterToken && businessData.whatsappNumber);

        if (cancelled) return;

        if (hasSnapto) setProvider('snapto');
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
