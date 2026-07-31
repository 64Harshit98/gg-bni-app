/**
 * Data-access layer for the Bill (invoice) settings page. Wraps the
 * Firestore reads/writes previously made directly inside
 * `Pages/Settings/BillSetting.tsx` behind small, typed functions.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export interface BillSettingsData {
  upiId?: string;
  termsAndConditions: string;
  signatureBase64?: string;
  printFormat?: 'A4' | 'A5' | 'THERMAL58';
  whatsappExtraMessage?: string;
  enableTriplicate?: boolean;
  discountDisplayFormat?: 'amount' | 'percentage';
}

export interface BusinessInfoData {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  panNumber: string;
  msmeNumber: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  companyLogo: string;
}

export const DEFAULT_TERMS_AND_CONDITIONS =
  '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.';

export const getDefaultBillSettings = (): BillSettingsData => ({
  upiId: '',
  termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
  signatureBase64: '',
  printFormat: 'A4',
  whatsappExtraMessage: '',
  enableTriplicate: false,
  discountDisplayFormat: 'amount',
});

interface RawAddress {
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  zipCode?: string;
  pincode?: string;
}

/** Normalizes a business address, which may be a plain string or a structured object, into one display line. */
export const formatBusinessAddress = (addr: string | RawAddress | undefined | null): string => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const { streetAddress, city, state, postalCode, zipCode, pincode } = addr;
  const parts = [streetAddress, city, state].filter((part): part is string => !!part && part.trim() !== '');
  let fullAddress = parts.join(', ');
  const code = postalCode || zipCode || pincode;
  if (code) fullAddress += ` - ${code}`;
  return fullAddress;
};

export interface BillSettingsFetchResult {
  businessInfo: BusinessInfoData;
  settings: BillSettingsData;
}

/** Loads the business profile, saved bill settings, and (as a phone/email fallback) the current user doc. */
export async function fetchBillSettings(
  companyId: string,
  currentUserId?: string,
): Promise<BillSettingsFetchResult> {
  try {
    const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
    const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'bill');
    const userDocRef = currentUserId ? doc(db, 'companies', companyId, 'users', currentUserId) : null;

    const [businessSnap, settingsSnap, userSnap] = await Promise.all([
      getDoc(businessDocRef),
      getDoc(settingsDocRef),
      userDocRef ? getDoc(userDocRef) : Promise.resolve(null),
    ]);

    const bData = businessSnap.exists() ? businessSnap.data() : {};
    const sData = settingsSnap.exists() ? settingsSnap.data() : {};
    const uData = userSnap?.exists() ? userSnap.data() : {};

    const businessInfo: BusinessInfoData = {
      companyName: bData.businessName || bData.name || 'Not Set',
      address: formatBusinessAddress(bData),
      phone: bData.phoneNumber || bData.phone || uData.phoneNumber || uData.phone || 'Not Set',
      email: bData.email || uData.email || 'Not Set',
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
      upiId: sData.upiId || bData.upiId || '',
      termsAndConditions: sData.posTermsAndConditions || DEFAULT_TERMS_AND_CONDITIONS,
      signatureBase64: sData.signatureBase64 || '',
      printFormat: sData.posPrintFormat || 'A4',
      whatsappExtraMessage: sData.posWhatsappExtraMessage || '',
      enableTriplicate: sData.enableTriplicate || false,
      discountDisplayFormat: sData.discountDisplayFormat || 'amount',
    };

    return { businessInfo, settings };
  } catch (error) {
    console.error('billSetting.service: failed to fetch bill settings', error);
    throw error;
  }
}

/**
 * Persists the editable bill settings. Tax/bank/registration fields are
 * always re-synced from the (read-only, profile-sourced) `businessInfo` so
 * the saved doc never drifts from the business profile.
 */
export async function saveBillSettings(
  companyId: string,
  settings: BillSettingsData,
  businessInfo: Pick<
    BusinessInfoData,
    'gstin' | 'panNumber' | 'msmeNumber' | 'accountHolderName' | 'accountNumber' | 'bankName' | 'ifscCode'
  >,
): Promise<void> {
  try {
    const dataToSave = {
      // Editable settings (shared)
      upiId: settings.upiId,
      signatureBase64: settings.signatureBase64,

      // Editable settings (independent per bill type)
      posTermsAndConditions: settings.termsAndConditions,
      posPrintFormat: settings.printFormat,
      posWhatsappExtraMessage: settings.whatsappExtraMessage,
      enableTriplicate: settings.enableTriplicate || false,
      discountDisplayFormat: settings.discountDisplayFormat || 'amount',

      // Always synced from businessInfo so these stay fresh
      companyGstin: businessInfo.gstin,
      panNumber: businessInfo.panNumber,
      msmeNumber: businessInfo.msmeNumber,
      accountName: businessInfo.accountHolderName,
      accountNumber: businessInfo.accountNumber,
      bankName: businessInfo.bankName,
      ifscCode: businessInfo.ifscCode,
      updatedAt: serverTimestamp(),
    };

    const docRef = doc(db, 'companies', companyId, 'settings', 'bill');
    await setDoc(docRef, dataToSave, { merge: true });
  } catch (error) {
    console.error('billSetting.service: failed to save bill settings', error);
    throw error;
  }
}
