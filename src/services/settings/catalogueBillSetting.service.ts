import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

// --- Types ---------------------------------------------------------------

export interface BillSettingsData {
  printFormat?: 'A4' | 'THERMAL58' | 'A5';
  upiId?: string;
  termsAndConditions: string;
  signatureBase64?: string;
  whatsappExtraMessage?: string;
  enableTriplicate?: boolean;
  discountDisplayFormat?: 'amount' | 'percentage';
}

export interface BusinessInfoData {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  // Tax
  gstin: string;
  panNumber: string;
  msmeNumber: string;
  // Bank
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  // Branding
  companyLogo: string;
}

export interface CatalogueBillSettingsBundle {
  businessInfo: BusinessInfoData;
  settings: BillSettingsData;
}

interface RawBusinessInfo {
  businessName?: string;
  name?: string;
  phoneNumber?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  panNumber?: string;
  msmeUdyamNumber?: string;
  registrationNumber?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  companyLogo?: string;
  upiId?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  zipCode?: string;
  pincode?: string;
}

interface RawBillSettings {
  cataloguePrintFormat?: BillSettingsData['printFormat'];
  upiId?: string;
  catalogueTermsAndConditions?: string;
  signatureBase64?: string;
  catalogueWhatsappExtraMessage?: string;
  enableTriplicate?: boolean;
  discountDisplayFormat?: BillSettingsData['discountDisplayFormat'];
}

const DEFAULT_TERMS =
  '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.';

/** Formats a business address record (or a plain string) into a single display line. */
export const formatBusinessAddress = (
  addr: RawBusinessInfo | string | null | undefined,
): string => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const { streetAddress, city, state, postalCode, zipCode, pincode } = addr;
  const parts = [streetAddress, city, state].filter((part) => part && part.trim() !== '');
  let fullAddress = parts.join(', ');
  const code = postalCode || zipCode || pincode;
  if (code) fullAddress += ` - ${code}`;
  return fullAddress;
};

/**
 * Loads the business profile, bill-specific settings and the current user's
 * email for the Catalogue bill settings page.
 */
export async function fetchCatalogueBillSettings(
  companyId: string,
  userId: string,
): Promise<CatalogueBillSettingsBundle> {
  try {
    const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
    const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'bill');
    const userDocRef = doc(db, 'companies', companyId, 'users', userId);

    const [businessSnap, settingsSnap, userSnap] = await Promise.all([
      getDoc(businessDocRef),
      getDoc(settingsDocRef),
      getDoc(userDocRef),
    ]);

    const bData = (businessSnap.exists() ? businessSnap.data() : {}) as RawBusinessInfo;
    const sData = (settingsSnap.exists() ? settingsSnap.data() : {}) as RawBillSettings;
    const uData = (userSnap.exists() ? userSnap.data() : {}) as { email?: string };

    const businessInfo: BusinessInfoData = {
      companyName: bData.businessName || bData.name || 'Not Set',
      address: formatBusinessAddress(bData),
      phone: bData.phoneNumber || bData.phone || 'Not Set',
      email: uData.email || bData.email || 'Not Set',
      gstin: bData.gstin || '',
      panNumber: bData.panNumber || '',
      msmeNumber: bData.msmeUdyamNumber || bData.registrationNumber || '',
      bankName: bData.bankName || '',
      accountHolderName: bData.accountHolderName || '',
      accountNumber: bData.accountNumber || '',
      ifscCode: bData.ifscCode || '',
      companyLogo: bData.companyLogo || '',
    };

    const settings: BillSettingsData = {
      printFormat: sData.cataloguePrintFormat || 'A4',
      upiId: sData.upiId || bData.upiId || '',
      termsAndConditions: sData.catalogueTermsAndConditions || DEFAULT_TERMS,
      signatureBase64: sData.signatureBase64 || '',
      whatsappExtraMessage: sData.catalogueWhatsappExtraMessage || '',
      enableTriplicate: sData.enableTriplicate || false,
      discountDisplayFormat: sData.discountDisplayFormat || 'amount',
    };

    return { businessInfo, settings };
  } catch (error) {
    console.error('Error fetching bill settings:', error);
    throw error;
  }
}

export interface SaveCatalogueBillSettingsInput {
  upiId?: string;
  signatureBase64?: string;
  enableTriplicate?: boolean;
  termsAndConditions: string;
  printFormat?: BillSettingsData['printFormat'];
  whatsappExtraMessage?: string;
  discountDisplayFormat?: BillSettingsData['discountDisplayFormat'];
  /** Always re-synced from the business profile so the bill stays fresh. */
  businessInfo: Pick<
    BusinessInfoData,
    'gstin' | 'panNumber' | 'msmeNumber' | 'accountHolderName' | 'accountNumber' | 'bankName' | 'ifscCode'
  >;
}

/** Persists the Catalogue bill settings document for a company. */
export async function saveCatalogueBillSettings(
  companyId: string,
  input: SaveCatalogueBillSettingsInput,
): Promise<void> {
  try {
    const dataToSave = {
      // Editable settings (shared)
      upiId: input.upiId,
      signatureBase64: input.signatureBase64,
      enableTriplicate: input.enableTriplicate || false,

      // Editable settings (independent per bill type)
      catalogueTermsAndConditions: input.termsAndConditions,
      cataloguePrintFormat: input.printFormat || 'A4',
      catalogueWhatsappExtraMessage: input.whatsappExtraMessage,
      discountDisplayFormat: input.discountDisplayFormat || 'amount',

      // Always sync from businessInfo so these stay fresh
      companyGstin: input.businessInfo.gstin,
      panNumber: input.businessInfo.panNumber,
      msmeNumber: input.businessInfo.msmeNumber,
      accountName: input.businessInfo.accountHolderName,
      accountNumber: input.businessInfo.accountNumber,
      bankName: input.businessInfo.bankName,
      ifscCode: input.businessInfo.ifscCode,

      updatedAt: serverTimestamp(),
    };

    const docRef = doc(db, 'companies', companyId, 'settings', 'bill');
    await setDoc(docRef, dataToSave, { merge: true });
  } catch (error) {
    console.error('Error saving bill settings:', error);
    throw error;
  }
}
