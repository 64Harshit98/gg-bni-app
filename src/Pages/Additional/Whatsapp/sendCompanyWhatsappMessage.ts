import { getFunctions, httpsCallable } from 'firebase/functions';

export type WhatsappMessageType = 'invoice' | 'order' | 'reminder' | 'stockAlert';

export interface SendCompanyWhatsappMessageParams {
  to: string;
  messageType: WhatsappMessageType;
  fileUrl?: string;
  templateVariables: string[];
  refCollection?: string;
  refId?: string;
}

export interface SendCompanyWhatsappMessageResult {
  success: boolean;
  waMessageId: string | null;
}

// Thin wrapper around the sendCompanyWhatsappMessage Cloud Function — the one
// send path shared by both the 'snapto' (company's own account, admin-entered)
// and 'sellar' (Sellar's shared number) tiers. No credential is ever read or
// held client-side; the function resolves which tier's credential to use
// server-side from companies/{companyId}/whatsappStatus/current.
export const sendCompanyWhatsappMessage = async (
  params: SendCompanyWhatsappMessageParams
): Promise<SendCompanyWhatsappMessageResult> => {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'sendCompanyWhatsappMessage');
  const result = await fn(params);
  return result.data as SendCompanyWhatsappMessageResult;
};
