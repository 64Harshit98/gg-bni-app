// src/lib/auth_operations.ts
import { auth } from './Firebase'; // Import 'db'
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import type { ROLES } from '../enums';
// Import the functions client
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Registers a new company and user by calling the secure Cloud Function.
 */
export const registerUserWithDetails = async (
  name: string,
  phoneNumber: string,
  email: string,
  password: string,
  role: ROLES,
  businessData: any // Pass business data
): Promise<any> => {
  try {
    // 1. Get a reference to the Cloud Function
    const functions = getFunctions();
    const registerCompanyAndUser = httpsCallable(functions, 'registerCompanyAndUser');

    // 2. Call the function with all the form data
    const result = await registerCompanyAndUser({
      name,
      phoneNumber,
      email,
      password,
      role,
      businessData: businessData // Pass it to the function
    });

    // 3. Return the successful result
    return result.data;

  } catch (error: any) {
    console.error('Error calling registration function:', error);
    // 'error.message' will now contain the friendly message from the Cloud Function
    throw new Error(error.message || 'An unexpected error occurred during registration.');
  }
};


export const inviteUser = async (
  fullName: string,
  phoneNumber: string,
  email: string,
  password: string,
  role: ROLES
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
    throw new Error(error.message || 'An unexpected error occurred during registration.');
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
    default:
      return 'An unknown error occurred. Please try again.';
  }
};