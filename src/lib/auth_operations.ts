// src/lib/auth_operations.ts
import { auth } from './firebase'; // Import the auth instance
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import type { User } from 'firebase/auth'; // Import User type-only

/**
 * Signs up a new user with email and password.
 * @param email User's email address.
 * @param password User's password.
 * @returns Promise that resolves with the User credential.
 */
export const signupUser = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    console.error('Error signing up:', error.code, error.message);
    throw new Error(getFriendlyErrorMessage(error.code));
  }
};

/**
 * Logs in an existing user with email and password.
 * @param email User's email address.
 * @param password User's password.
 * @returns Promise that resolves with the User credential.
 */
export const loginUser = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    console.error('Error logging in:', error.code, error.message);
    throw new Error(getFriendlyErrorMessage(error.code));
  }
};

/**
 * Logs out the current user.
 * @returns Promise that resolves when the user is signed out.
 */
export const logoutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error('Error logging out:', error.code, error.message);
    throw new Error(getFriendlyErrorMessage(error.code));
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
  } catch (error: any) {
    console.error('Error sending password reset email:', error.code, error.message);
    throw new Error(getFriendlyErrorMessage(error.code));
  }
};

// Helper function to provide user-friendly error messages
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