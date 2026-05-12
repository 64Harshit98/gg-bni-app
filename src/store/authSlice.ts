import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User } from '../Role/permission';
import type { Permissions, PLANS } from '../enums';
import type { Role } from '../Role/permission';
import type { RootState } from './store';

/**
 * Redux-safe version of the User type.
 * `expiryDate` is stored as an ISO string instead of a Date object so the
 * store remains fully serializable (no Redux non-serializable-value warnings).
 */
export interface SerializableUser {
  uid: string;
  name: string;
  role: Role;
  permissions: Permissions[];
  companyId: string;
  plan: PLANS;
  isFirstLogin?: boolean;
  Subscription?: {
    pack: string;
    isActive: boolean;
    expiryDate?: string; // ISO string — convert from Date before dispatching
  };
}

export interface AuthState {
  user: SerializableUser | null;
  status: 'pending' | 'authenticated' | 'unauthenticated';
}

const initialState: AuthState = {
  user: null,
  status: 'pending',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setPending(state) {
      state.status = 'pending';
      state.user = null;
    },
    setUser(state, action: PayloadAction<SerializableUser>) {
      state.user = action.payload;
      state.status = 'authenticated';
    },
    clearUser(state) {
      state.user = null;
      state.status = 'unauthenticated';
    },
  },
});

export const { setPending, setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;

/**
 * Converts a runtime User (which may contain a Date) into the serializable
 * form safe for Redux. Call this before dispatching setUser.
 */
export function toSerializableUser(user: User): SerializableUser {
  return {
    uid: user.uid,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    companyId: user.companyId,
    plan: user.plan,
    isFirstLogin: user.isFirstLogin,
    Subscription: user.Subscription
      ? {
          pack: user.Subscription.pack,
          isActive: user.Subscription.isActive,
          expiryDate: user.Subscription.expiryDate instanceof Date
            ? user.Subscription.expiryDate.toISOString()
            : user.Subscription.expiryDate,
        }
      : undefined,
  };
}

// Selectors
export const selectCurrentUser = (state: RootState) => state.auth.user;
export const selectAuthStatus = (state: RootState) => state.auth.status;
export const selectIsAuthenticated = (state: RootState) => state.auth.status === 'authenticated';
