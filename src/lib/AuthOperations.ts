// src/lib/AuthOperations.ts
import { confirmPasswordReset as firebaseConfirmPasswordReset } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from './Firebase';
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  createUserWithEmailAndPassword,
  type ConfirmationResult,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import type { ROLES } from '../enums';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './Firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

export const registerUserWithDetails = async (
  name: string,
  phoneNumber: string,
  email: string,
  password: string,
  role: ROLES,
  businessData: any,
  planDetails: any,
  salesSettings: any,
  catalogueSalesSettings: any,
  items: any[] = [],
  finalReferralCode: string | null = null // <--- Reverted back to string
): Promise<any> => {
  try {
    const functions = getFunctions();
    const registerCompanyAndUser = httpsCallable(functions, 'registerCompanyAndUser');

    const result = await registerCompanyAndUser({
      name,
      phoneNumber,
      email,
      password,
      role,
      businessData,
      planDetails,
      salesSettings,
      catalogueSalesSettings,
      items,
      referralCode: finalReferralCode // <--- Pass the string to the cloud function
    });

    await loginUser(email, password);
    return result.data;
  } catch (error: any) {
    console.error('Error calling registration function:', error);
    throw new Error(error.message || 'An unexpected error occurred during registration.');
  }
};

export const processManualSubscription = async (
  companyId: string,
  amountPaid: number,
  planDays: number
) => {
  try {
    const functions = getFunctions();
    const approvePayment = httpsCallable(functions, 'approveManualPayment');

    // Example: processManualSubscription("CMP-1024", 5000, 365) 
    // This will extend CMP-1024 by 365 days, and automatically add ₹500 to the Agent!
    const result = await approvePayment({ companyId, amountPaid, planDays });
    return result.data;
  } catch (error: any) {
    console.error("Failed to approve payment:", error);
    throw new Error(error.message);
  }
};
export const inviteUser = async (fullName: string, phoneNumber: string, email: string, password: string, role: ROLES) => {
  try {
    const functions = getFunctions();
    const inviteUserToCompany = httpsCallable(functions, 'inviteUserToCompany');
    const result = await inviteUserToCompany({ fullName, phoneNumber, email, password, role });
    return result.data as { status: string; userId: string };
  } catch (error: any) {
    throw new Error(error.message || 'Error inviting user.');
  }
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    throw new Error(error.message || 'Login failed.');
  }
};
export const generateCompanyReferralCode = async (companyId: string): Promise<string> => {
  try {
    const functions = getFunctions();
    const generateCode = httpsCallable(functions, 'generateMyReferralCode');

    const result = await generateCode({ companyId });
    const data = result.data as { status: string; referralCode: string };

    return data.referralCode;
  } catch (error: any) {
    console.error('Error generating code:', error);
    throw new Error(error.message || 'Failed to generate referral code.');
  }
};

export interface AgentRegistrationParams {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  isAgency: boolean;
  address: string;
  panNumber: string;
  aadhaarNumber: string;
  gstinNumber: string; // NEW
  msmeNumber: string;  // NEW
}

export const registerAgentWithDetails = async (params: AgentRegistrationParams) => {
  const { name, email, password, phoneNumber, isAgency, address, panNumber, aadhaarNumber, gstinNumber, msmeNumber } = params;

  try {
    // 1. Create the user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Generate a referral code
    const ownReferralCode = (name.substring(0, 4).toUpperCase() + Math.floor(1000 + Math.random() * 9000));

    // 3. Save all text data directly to Firestore
    await setDoc(doc(db, 'agents', user.uid), {
      uid: user.uid,
      name,
      email,
      phoneNumber,
      role: isAgency ? 'AGENCY' : 'AGENT',
      isAgency,
      address,

      // Identity Verification (Always Saved)
      panNumber,
      aadhaarNumber,

      // Business Verification (Only saved if Agency)
      ...(isAgency && {
        gstinNumber,
        msmeNumber
      }),

      ownReferralCode,
      tier: 'Bronze',
      unpaidBalance: 0,
      totalEarned: 0,
      minPayoutLimit: 500,
      createdAt: serverTimestamp()
    });

    return user;
  } catch (error: any) {
    console.error("Error registering agent:", error);
    throw new Error(error.message);
  }
};
export const confirmPasswordResetUser = async (oobCode: string, newPassword: string): Promise<void> => {
  try {
    await firebaseConfirmPasswordReset(auth, oobCode, newPassword);
  } catch (error: unknown) {
    if (error instanceof FirebaseError) {
      console.error('Error resetting password:', error.code, error.message);
      // Map Firebase error codes to friendly messages
      if (error.code === 'auth/expired-action-code') {
        throw new Error('The reset link has expired. Please request a new one.');
      }
      if (error.code === 'auth/invalid-action-code') {
        throw new Error('Invalid reset link. It may have been used already.');
      }
      throw new Error(error.message);
    }
    throw new Error('An unexpected error occurred.');
  }
};

export const logoutUser = async () => { await signOut(auth); };
export const resetPassword = async (email: string) => { await sendPasswordResetEmail(auth, email); };

// ... (Keep existing Phone Auth functions: setupRecaptcha, sendOtp, confirmOtp) ...
export const setupRecaptcha = (containerId: string) => {
  if (recaptchaVerifier) return;
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
};
export const sendOtp = async (phoneNumber: string) => {
  if (!recaptchaVerifier) throw new Error('Recaptcha not ready');
  confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
};
export const confirmOtp = async (otp: string) => {
  if (!confirmationResult) throw new Error('No OTP sent');
  return (await confirmationResult.confirm(otp)).user;
};