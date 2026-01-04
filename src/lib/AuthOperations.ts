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
  type ConfirmationResult,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import type { ROLES } from '../enums';
import { getFunctions, httpsCallable } from 'firebase/functions';

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

export const registerUserWithDetails = async (
  name: string,
  phoneNumber: string,
  email: string,
  password: string,
  role: ROLES,
  businessData: any, // Goes to business_info
  planDetails: any,  // Goes to Root Doc
  salesSettings: any, // Goes to settings/sales-settings
  items: any[] = [], 
): Promise<any> => {
  try {
    const functions = getFunctions();
    const registerCompanyAndUser = httpsCallable(functions, 'registerCompanyAndUser');

    // Call Cloud Function with ALL separated data
    const result = await registerCompanyAndUser({
      name,
      phoneNumber,
      email,
      password,
      role,
      businessData, 
      planDetails, 
      salesSettings, // <--- Passing this to backend
      items, 
    });

    // Auto-Login after success
    await loginUser(email, password);

    return result.data;
  } catch (error: any) {
    console.error('Error calling registration function:', error);
    throw new Error(error.message || 'An unexpected error occurred during registration.');
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