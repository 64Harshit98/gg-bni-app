// src/lib/auth_operations.ts
import { auth, db } from './firebase'; // Import 'db' for Firestore
import { doc, setDoc } from 'firebase/firestore'; // Import Firestore functions
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app'; // FIX: Import FirebaseError

/**
 * Creates a new user in Firebase Auth and a corresponding
 * document in Firestore with their name and email.
 * @param name The user's name.
 * @param email User's email address.
 * @param password User's password.
 * @returns Promise that resolves with the User object.
 */
export const registerUserWithDetails = async (
  name: string,
  phoneNumber: string, // Changed to phoneNumber
  email: string,
  password: string,
): Promise<User> => {
  try {
    // 1. Create the user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // 2. Immediately create a user document in Firestore
    if (user.uid) {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        name: name,
        phoneNumber: phoneNumber, // Store phone number
        email: user.email,
        createdAt: Date.now(),
      });
    }

    return user;
  } catch (error: unknown) {
    // FIX: Use unknown and type check
    if (error instanceof FirebaseError) {
      console.error(
        'Error during user registration:',
        error.code,
        error.message,
      );
      throw new Error(getFriendlyErrorMessage(error.code));
    }
    throw new Error('An unexpected error occurred during registration.');
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
