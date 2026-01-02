// src/lib/leads.ts
import { db } from './Firebase';
import { doc, setDoc } from 'firebase/firestore';

interface LeadData {
  email: string;
  phoneNumber?: string;
  fullName?: string;
  currentStep: string; // e.g., "Step 1: SignUp", "Completed"
  status: 'Onboarding' | 'Trial Plan' | 'Abandoned';
  lastUpdated: Date;
  [key: string]: any; // Allow other optional fields
}

/**
 * Saves or updates lead progress in the 'leads' collection.
 * Uses merge: true so we never overwrite existing data accidentally.
 */
export const saveLeadProgress = async (email: string, data: Partial<LeadData>) => {
  if (!email) return;

  try {
    // Use email as the document ID for easy lookup
    const leadId = email.toLowerCase().trim();
    const leadRef = doc(db, 'leads', leadId);

    const payload = {
      email, // Ensure email is always present
      ...data,
      lastUpdated: new Date(),
    };

    // Fire and forget (don't await if you don't want to block UI)
    // or await if you need confirmation.
    await setDoc(leadRef, payload, { merge: true });

  } catch (error) {
    console.error("Error saving lead progress:", error);
  }
};