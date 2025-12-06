import { auth } from './Firebase'; // Import 'db'
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  // --- NEW IMPORTS FOR PHONE AUTH ---
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import type { ROLES } from '../enums';
// Import the functions client
import { getFunctions, httpsCallable } from 'firebase/functions';

// --- Module-level state for phone auth flow ---
let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;
// ---------------------------------------------

/**
 * Registers a new company and user by calling the secure Cloud Function.
 * --- THIS FUNCTION IS NOW MODIFIED to accept items ---
 */
export const registerUserWithDetails = async (
  name: string,
  phoneNumber: string,
  email: string,
  password: string,
  role: ROLES,
  businessData: any, // Pass business data
  items: any[] = [], // --- ADDED THIS LINE ---
): Promise<any> => {
  try {
    // 1. Get a reference to the Cloud Function
    const functions = getFunctions();
    const registerCompanyAndUser = httpsCallable(
      functions,
      'registerCompanyAndUser',
    );

    // 2. Call the function with all the form data
    const result = await registerCompanyAndUser({
      name,
      phoneNumber,
      email,
      password,
      role,
      businessData: businessData, // Pass it to the function
      items: items, // --- ADDED THIS LINE ---
    });

    // --- 3. NEW: Automatically log the user in ---
    // After successful registration, sign them in
    await loginUser(email, password);

    // 4. Return the successful result from the cloud function
    return result.data;
  } catch (error: any) {
    console.error('Error calling registration function:', error);
    // 'error.message' will now contain the friendly message from the Cloud Function
    throw new Error(
      error.message || 'An unexpected error occurred during registration.',
    );
  }
};

export const inviteUser = async (
  fullName: string,
  phoneNumber: string,
  email: string,
  password: string,
  role: ROLES,
): Promise<{ status: string; userId: string }> => {
  try {
    const functions = getFunctions();
    const inviteUserToCompany = httpsCallable(functions, 'inviteUserToCompany');

    const result = await inviteUserToCompany({
      fullName,
      phoneNumber,
      email,
      password,
      role,
    });

    return result.data as { status: string; userId: string };
  } catch (error: any) {
    console.error('Error calling invite user function:', error);
    throw new Error(
      error.message || 'An unexpected error occurred during registration.',
    );
  }
};
/**
 * Logs in an existing user with email and password.
 * @param email User's email address.
 * @param password User's password.
 * @returns Promise that resolves with the User credential.
 */
export const loginUser = async (
  email: string,
  password: string,
): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    return userCredential.user;
  } catch (error: unknown) {
    // FIX: Use unknown and type check
    if (error instanceof FirebaseError) {
      console.error('Error logging in:', error.code, error.message);
      throw new Error(getFriendlyErrorMessage(error.code));
    }
    throw new Error('An unexpected error occurred during login.');
  }
};

/**
 * Logs out the current user.
 * @returns Promise that resolves when the user is signed out.
 */
export const logoutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error: unknown) {
    // FIX: Use unknown and type check
    if (error instanceof FirebaseError) {
      console.error('Error logging out:', error.code, error.message);
      throw new Error(getFriendlyErrorMessage(error.code));
    }
    throw new Error('An unexpected error occurred during logout.');
  }
};

/**
 * Sends a password reset email to the given email address.
 * @param email User's email address.
 * @returns Promise that resolves when the email is sent.
 */
export const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: unknown) {
    // FIX: Use unknown and type check
    if (error instanceof FirebaseError) {
      console.error(
        'Error sending password reset email:',
        error.code,
        error.message,
      );
      throw new Error(getFriendlyErrorMessage(error.code));
    }
    throw new Error(
      'An unexpected error occurred while sending the reset email.',
    );
  }
};

// --- NEW PHONE AUTH FUNCTIONS ---

/**
 * Sets up the reCAPTCHA verifier.
 * Call this once in your component's useEffect.
 * @param containerId The ID of the HTML element where reCAPTCHA should render (e.g., "recaptcha-container").
 */
export const setupRecaptcha = (containerId: string) => {
  if (recaptchaVerifier) {
    // Don't re-create if it already exists
    return;
  }
  try {
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
        console.log('reCAPTCHA solved');
      },
      'expired-callback': () => {
        console.error('reCAPTCHA expired');
      },
    });
  } catch (error) {
    console.error('Error setting up reCAPTCHA', error);
    throw error;
  }
};

/**
 * Sends an OTP to the given phone number.
 * @param phoneNumber The phone number in E.164 format (e.g., +911234567890).
 */
export const sendOtp = async (phoneNumber: string): Promise<void> => {
  if (!recaptchaVerifier) {
    throw new Error(
      'reCAPTCHA verifier is not initialized. Call setupRecaptcha first.',
    );
  }
  try {
    confirmationResult = await signInWithPhoneNumber(
      auth,
      phoneNumber,
      recaptchaVerifier,
    );
  } catch (error: unknown) {
    if (error instanceof FirebaseError) {
      console.error('Error sending OTP:', error.code, error.message);
      throw new Error(getFriendlyErrorMessage(error.code));
    }
    throw new Error('An unexpected error occurred while sending the OTP.');
  }
};

/**
 * Confirms the OTP and signs in/signs up the user.
 * If the user is new, you will need to redirect them
 * to your `BusinessInfoPage` to complete their profile.
 * @param otp The 6-digit code from the SMS.
 * @returns Promise that resolves with the User.
 */
export const confirmOtp = async (otp: string): Promise<User> => {
  if (!confirmationResult) {
    throw new Error('No OTP confirmation in progress. Call sendOtp first.');
  }
  try {
    const userCredential = await confirmationResult.confirm(otp);
    return userCredential.user;
  } catch (error: unknown) {
    if (error instanceof FirebaseError) {
      console.error('Error confirming OTP:', error.code, error.message);
      throw new Error(getFriendlyErrorMessage(error.code));
    }
    throw new Error('An unexpected error occurred during OTP confirmation.');
  }
};
// ------------------------------

const getFriendlyErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Invalid email address format.';
    case 'auth/user-disabled':
      return 'Your account has been disabled.';
    case 'auth/user-not-found':
      return 'No user found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many requests. Please try again later.';

    // --- NEW PHONE AUTH ERRORS ---
    case 'auth/invalid-phone-number':
      return 'The phone number is not valid.';
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA verification failed. Please try again.';
    case 'auth/code-expired':
      return 'The OTP has expired. Please request a new one.';
    case 'auth/invalid-verification-code':
      return 'The OTP is incorrect. Please try again.';
    // ----------------------------

    default:
      return 'An unknown error occurred. Please try again.';
  }
};