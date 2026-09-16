import axios from 'axios';

// Snapto's API doesn't send CORS headers, so browser requests go through the
// snaptoProxy Cloud Function (same pattern as BotMaster's botmasterProxy)
// instead of hitting app.snapto.ai directly.
const SNAPTO_BASE_URL = import.meta.env.VITE_SNAPTO_PROXY_URL;

export interface SnaptoTemplateSendParams {
  apiKey: string;
  to: string;
  templateName: string;
  language?: string;
  fileUrl?: string;
  templateVariables?: string[];
}

export interface SnaptoSendResponse {
  id: string;
  waMessageId: string;
}

// Sends a pre-approved WhatsApp template message via the Snapto Business API.
// Free-form text is not supported here on purpose — outside Meta's 24-hour
// customer-service window, only approved templates deliver, so this client
// only exposes the template path.
export const snaptoService = {
  sendTemplateMessage: async ({
    apiKey,
    to,
    templateName,
    language = 'en',
    fileUrl,
    templateVariables = [],
  }: SnaptoTemplateSendParams): Promise<SnaptoSendResponse> => {
    const response = await axios.post(
      `${SNAPTO_BASE_URL}/api/v1/whatsapp/sendMessage`,
      {
        templateName,
        language,
        to,
        ...(fileUrl ? { fileUrl } : {}),
        templateVariables,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
      }
    );
    return response.data;
  },
};
