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
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type ConfirmationResult,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { ROLES } from '../enums';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './Firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Sign-up draft (both steps, including the password) kept between Signup and BusInfo.
export const ONBOARDING_STORAGE_KEY = 'sellar_onboarding_data';

export const clearOnboardingDraft = () => {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    /* storage blocked — nothing to clear */
  }
};

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
  finalReferralCode: string | null = null
): Promise<any> => {
  const register = httpsCallable(getFunctions(), 'registerCompanyAndUser', { timeout: 120_000 });
  const payload = {
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
    referralCode: finalReferralCode,
  };

  let data: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      data = (await register(payload)).data;
      break;
    } catch (error) {
      console.error(`Registration attempt ${attempt} failed:`, error);
      const code = (error as CallError)?.code;
      const transient = !!code && TRANSIENT_CALL_ERRORS.has(code);
      // "Already exists" or a lost reply can both mean the company was made (by an
      // earlier tap, or this one). If the login works with this password, it's
      // theirs: finish instead of showing an error.
      if (code === 'functions/already-exists' || transient) {
        if (await signInIfRegistered(email, password)) {
          clearOnboardingDraft();
          return { status: 'recovered' };
        }
      }
      // The server rolls back a half-made account, so one retry is safe.
      if (transient && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw signupErrorFrom(error);
    }
  }

  try {
    await loginUser(email, password); // also clears the sign-up draft
  } catch (error) {
    console.error('Login after registration failed:', error);
    // The company exists; tapping Finish again takes the "already exists" path above and logs in.
    throw new SignupError("Your shop is set up, but we couldn't log you in. Tap Finish setup again, or log in with your email and password.");
  }
  return data;
};

/** A sign-up failure with a message to show as-is, and the field it belongs to. */
export class SignupError extends Error {
  field: 'email' | 'referral' | null;
  constructor(message: string, field: 'email' | 'referral' | null = null) {
    super(message);
    this.name = 'SignupError';
    this.field = field;
  }
}

// Network drops, timeouts and server hiccups: worth one retry.
const TRANSIENT_CALL_ERRORS = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/unknown',
  'functions/aborted',
  'functions/resource-exhausted',
]);

type CallError = { code?: string; message?: string } | null | undefined;

const signupErrorFrom = (error: unknown): SignupError => {
  const { code, message } = (error as CallError) ?? {};
  if (code === 'functions/already-exists') {
    return new SignupError('This email already has a Sellar account. Log in with it, or go back and use a different email.', 'email');
  }
  if (code === 'functions/invalid-argument') {
    if (message === 'Invalid referral code.') {
      return new SignupError("This referral code doesn't exist. Check it with your partner, or leave it empty.", 'referral');
    }
    if (message === 'Invalid email.') return new SignupError("This email can't be used. Go back and check it.", 'email');
    return new SignupError('Some of your details are missing. Go back to step 1 and check them.');
  }
  return new SignupError("We couldn't finish setting up. Check your internet and tap Finish setup again. Everything you typed is kept.");
};

/** True when this email + password already log in to a company: the sign-up went through. */
const signInIfRegistered = async (email: string, password: string): Promise<boolean> => {
  try {
    await setPersistence(auth, browserLocalPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const { claims } = await cred.user.getIdTokenResult(true);
    if (claims.companyId) return true;
    await signOut(auth);
  } catch {
    /* no such account, or a different password */
  }
  return false;
};

export type SignupCheck = { emailTaken?: boolean; referralValid?: boolean };

/**
 * Live check for the sign-up form: is the email free, does the referral code exist.
 * Null when the check itself couldn't run — the form shouldn't block on that.
 */
export const checkSignupDetails = async (details: { email?: string; referralCode?: string }): Promise<SignupCheck | null> => {
  try {
    const check = httpsCallable(getFunctions(), 'checkSignupDetails', { timeout: 15_000 });
    return (await check(details)).data as SignupCheck;
  } catch (error) {
    console.warn('Sign-up check unavailable:', error);
    return null;
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

// `remember` false keeps the session only until the tab closes ("Keep me logged in" unticked).
// Errors are rethrown as-is so callers can read the Firebase `code`.
export const loginUser = async (email: string, password: string, remember = true): Promise<User> => {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  clearOnboardingDraft(); // drop any half-finished sign-up left on this device
  return userCredential.user;
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
      role: isAgency ? ROLES.AGENCY : ROLES.AGENT,
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

export const logoutUser = async () => {
  clearOnboardingDraft();
  await signOut(auth);
};
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