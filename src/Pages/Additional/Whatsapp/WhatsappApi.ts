import axios from 'axios';

// The base URL from your Postman screenshots
const API_BASE_URL = (import.meta.env.VITE_BMS_BASE_URL || '').trim();
const PARTNER_UID = (import.meta.env.VITE_BMS_PARTNER_UID || '').trim();
const API_SEND_URL = (import.meta.env.VITE_BMS_BASE_SEND_URL || '').trim();

const requireEnv = (value: string, key: string) => {
  if (!value) {
    throw new Error(`Missing ${key} in .env. Please configure WhatsApp API settings.`);
  }
  return value;
};

const getBaseApiUrl = () => `${requireEnv(API_BASE_URL, 'VITE_BMS_BASE_URL').replace(/\/+$/, '')}/`;
const getSendApiUrl = () => `${requireEnv(API_SEND_URL, 'VITE_BMS_BASE_SEND_URL').replace(/\/+$/, '')}/`;

export const botMasterService = {

  // Matches image_059bc0.png
  registerUser: async (data: any) => {
    const response = await axios.post(getBaseApiUrl(), {
      partnerUid: requireEnv(PARTNER_UID, 'VITE_BMS_PARTNER_UID'),
      username: data.name.toLowerCase().replace(/\s/g, ''),
      name: data.name,
      phone: data.phone.replace(/\D/g, ''),
      password: data.password,
      email: data.email,
      country: "India"
    }, { params: { action: 'register' } });
    return response.data;
  },

  // Matches image_059ba2.png
  createSession: async (authToken: string, senderId: string) => {
    const response = await axios.post(getBaseApiUrl(), {
      auth_token: authToken, // Key from image_059ba2.png
      senderId: senderId.replace(/\D/g, '')
    }, { params: { action: 'createsession' } });
    return response.data;
  },

  getQrCode: async (authToken: string, senderId: string) => {
    const response = await axios.get(getBaseApiUrl(), {
      params: { action: 'getqrcode', authToken, senderId: senderId.replace(/\D/g, '') }
    });
    return response.data;
  },

  getMe: async (authToken: string, senderId: string) => {
    const response = await axios.get(getBaseApiUrl(), {
      params: { action: 'getme', authToken, senderId: senderId.replace(/\D/g, '') }
    });
    return response.data;
  },

  /**
    * 8. Send Template Message (Fixed URL)
    * Directly hits the URL found in your screenshot.
    */
  /**
    * 6. Send Message (V1 API - Exact Match to Screenshot)
    * Matches: https://api.botmastersender.com/api/v1/?action=send
    * Body: senderId, receiverId, messageText, authToken, mediaurl (optional)
    */
  sendMessage: async (
    authToken: string,
    senderId: string,
    number: string,
    message: string,
    mediaUrl?: string // Optional parameter for the PDF link
  ) => {
    // 1. Use the V1 URL

    // 2. Construct Body EXACTLY as shown in your Thunder Client screenshot
    const body: any = {
      authToken: authToken,
      senderId: senderId,
      receiverId: number.replace(/\D/g, ''),
      messageText: message,
    };

    // 3. Add mediaurl only if we have a link
    if (mediaUrl) {
      body.mediaurl = mediaUrl;
    }

    // 4. Send Request
    const response = await axios.post(getSendApiUrl(), body, {
      params: { action: 'send' }
    });

    return response.data;
  },
  /**
   * 9. Send File Upload (FormData)
   * Uploads the raw file binary to the API.
   * This is the equivalent of "uploading from local".
   */
  sendFileUpload: async (
    authToken: string,
    senderId: string,
    number: string,
    message: string,
    fileBlob: Blob,       // The actual file data (PDF)
    filename: string
  ) => {
    // 1. Create FormData object
    const formData = new FormData();

    // 2. Append standard V1 fields
    formData.append('authToken', authToken);
    formData.append('senderId', senderId);
    formData.append('receiverId', number.replace(/\D/g, ''));
    formData.append('messageText', message);
    formData.append('type', 'media');

    // 3. Append the File
    // The key 'file' or 'media' depends on the API. 'file' is most common for uploads.
    formData.append('file', fileBlob, filename);

    // 4. Send as multipart/form-data
    // Note: We don't set Content-Type header manually; axios/browser does it with the boundary.
    const response = await axios.post(getSendApiUrl(), formData, {
      params: { action: 'send' },
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  },
  sendPdfFromUrl: async (
    authToken: string,
    senderId: string,
    number: string,
    message: string,
    pdfUrl: string,
    filename: string
  ) => {

    const response = await axios.post(getSendApiUrl(), {
      authToken: authToken,
      senderId: senderId,
      receiverId: number.replace(/\D/g, ''),
      messageText: message,
      mediaurl: pdfUrl,
      filename: filename,

      // CHANGE THIS: 'document' is better for PDFs and filenames
      type: 'document'
    }, {
      params: { action: 'send' }
    });

    return response.data;
  },


  sendPdf: async (
    authToken: string,
    senderId: string,
    number: string,
    pdfUrl: string,   // <--- Now takes a URL instead of Base64
    filename: string,
    caption: string
  ) => {
    const params = new URLSearchParams();

    params.append('action', 'sendtemplate');
    params.append('auth_token', authToken);
    params.append('sender_id', senderId);
    params.append('receiver_id', number.replace(/\D/g, ''));

    // V3 Media Parameters for Remote URL
    params.append('type', 'media');
    params.append('url', pdfUrl);           // Primary key for remote URLs
    params.append('media_url', pdfUrl);     // Fallback key (some versions use this)

    params.append('filename', filename);
    params.append('message', caption);

    const response = await axios.post(getBaseApiUrl(), params);
    return response.data;
  },
  /**
   * 6. Send Simple Text Message
   */
  // sendMessage: async (authToken: string, senderId: string, number: string, message: string) => {
  //   const response = await axios.post(`${API_SEND_URL}/`, {
  //     authToken: authToken,
  //     senderId: senderId,
  //     receiverId: number.replace(/\D/g, ''), // Matches your URL parameter
  //     messageText: message,                  // Matches your URL parameter
  //     type: 'text'
  //   }, {
  //     params: { action: 'send' }
  //   });
  //   return response.data;
  // }
};
