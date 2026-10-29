import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { botMasterService } from './WhatsappApi';
import { sendCompanyWhatsappMessage } from './sendCompanyWhatsappMessage';
import type { WhatsappProvider } from './useWhatsappProvider';

export interface DueLine {
  /** Invoice number, or "Opening Due" for an opening balance. */
  label: string;
  amount: number;
}

interface SendDueReminderParams {
  companyId: string;
  provider: WhatsappProvider;
  partyName: string;
  partyNumber: string;
  dueLines: DueLine[];
  totalDue: number;
}

// 'sent'        — delivered through BotMaster / the cloud template
// 'opened'      — no provider connected; WhatsApp opened with the message prefilled
// 'needs_setup' — BotMaster selected but its credentials are missing
export type SendDueReminderResult = 'sent' | 'opened' | 'needs_setup';

const inr = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const freeTextMessage = (partyName: string, dueLines: DueLine[], totalDue: number) => {
  const invoiceLines = dueLines
    .map((l) => `• ${l.label}: ${l.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`)
    .join('\n');
  const totalDueStr = totalDue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  return `Dear ${partyName},\n\nThis is a gentle reminder that a total amount of ${totalDueStr} is due against the following invoice(s):\n\n${invoiceLines}\n\nKindly clear the due amount at your earliest convenience. Thank you!`;
};

// Shared by Party Ledger and the Customer report. Throws on a failed send.
export const sendDueReminder = async ({
  companyId,
  provider,
  partyName,
  partyNumber,
  dueLines,
  totalDue,
}: SendDueReminderParams): Promise<SendDueReminderResult> => {
  if (provider === 'botmaster') {
    const businessSnap = await getDoc(doc(db, 'companies', companyId, 'business_info', companyId));
    const { botMasterToken, whatsappNumber } = businessSnap.data() || {};
    if (!botMasterToken || !whatsappNumber) return 'needs_setup';

    const response = await botMasterService.sendMessage(
      botMasterToken,
      whatsappNumber,
      partyNumber,
      freeTextMessage(partyName, dueLines, totalDue),
    );

    let isSuccess = false;
    if (Array.isArray(response) && response.length > 0) {
      const res = response[0];
      if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
    } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
      isSuccess = true;
    }
    if (!isSuccess) throw new Error('API reported failure.');
    return 'sent';
  }

  if (provider === 'snapto' || provider === 'sellar') {
    const businessSnap = await getDoc(doc(db, 'companies', companyId, 'business_info', companyId));
    const businessData = businessSnap.exists() ? businessSnap.data() : {};
    // Meta rejects newlines inside template variable values, so invoice lines
    // are joined with " | " instead of the "\n" used for the free-text message.
    const invoiceList = dueLines.map((l) => `${l.label}: ₹${inr(l.amount)}`).join(' | ');
    const totalDueStr = inr(totalDue);

    await sendCompanyWhatsappMessage({
      to: partyNumber,
      messageType: 'reminder',
      templateVariables: [
        partyName,
        businessData.businessName || businessData.name || '',
        totalDueStr,
        invoiceList,
        totalDueStr,
      ],
    });
    return 'sent';
  }

  // No provider connected: let the user send it from their own WhatsApp.
  const digits = partyNumber.replace(/\D/g, '').slice(-10);
  const text = encodeURIComponent(freeTextMessage(partyName, dueLines, totalDue));
  window.open(`https://wa.me/91${digits}?text=${text}`, '_blank', 'noopener');
  return 'opened';
};
