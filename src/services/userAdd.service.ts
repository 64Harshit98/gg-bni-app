import { inviteUser } from '../lib/AuthOperations';
import type { ROLES } from '../enums';

export interface CreateUserInput {
  fullName: string;
  phoneNumber: string;
  email: string;
  password: string;
  role: ROLES;
}

export interface CreateUserResult {
  status: string;
  userId: string;
}

/**
 * Invites a new team member via the `inviteUserToCompany` Cloud Function.
 * Thin typed wrapper around `inviteUser` so the page component only ever
 * talks to a typed service boundary.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  try {
    return await inviteUser(
      input.fullName,
      input.phoneNumber,
      input.email,
      input.password,
      input.role,
    );
  } catch (err) {
    console.error('createUser failed:', err);
    throw err instanceof Error ? err : new Error('An unexpected error occurred. Please try again.');
  }
}
