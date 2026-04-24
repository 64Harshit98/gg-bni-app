import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '../../../lib/Firebase';
import { type ProfileData } from './Profiledata';

const useProfileData = (userId?: string, companyId?: string) => {
  const [profile, setProfile] = useState<Partial<ProfileData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfileData = async () => {
    if (!userId || !companyId) return;
    setLoading(true);
    try {
      const userDocRef = doc(db, 'companies', companyId, 'users', userId);
      const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);

      const [userDocSnap, businessDocSnap] = await Promise.all([
        getDoc(userDocRef),
        getDoc(businessDocRef),
      ]);

      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      const businessData = businessDocSnap.exists() ? businessDocSnap.data() : {};
      setProfile({ ...userData, ...businessData });
    } catch (err) {
      console.error('Error fetching profile data:', err);
      setError('Failed to load profile information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId || !companyId) { setLoading(false); return; }
    fetchProfileData();
  }, [userId, companyId]);

  const refetch = () => fetchProfileData();

  const saveData = async (data: Partial<ProfileData>) => {
    if (!userId || !companyId || !auth.currentUser) {
      throw new Error('User or company is not authenticated.');
    }

    const { name, email, phone, profilePicture, panNumber, accountType,msmeUdyamNumber, ...businessData } = data;

    const userDocRef = doc(db, 'companies', companyId, 'users', userId);
    const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);

    const promises: Promise<void>[] = [];

    // Auth profile update
    const authUpdates: { displayName?: string; photoURL?: string } = {};
    if (name && auth.currentUser.displayName !== name) authUpdates.displayName = name;
    if (profilePicture && auth.currentUser.photoURL !== profilePicture) authUpdates.photoURL = profilePicture;
    if (Object.keys(authUpdates).length > 0) {
      promises.push(updateProfile(auth.currentUser, authUpdates));
    }

    // User doc update
    const userUpdateData: Record<string, any> = {};
    if (name)                       userUpdateData.name           = name;
    if (phone !== undefined)         userUpdateData.phone          = phone;
    if (email !== undefined)         userUpdateData.email          = email;
    if (panNumber !== undefined)     userUpdateData.panNumber      = panNumber;
    if (accountType !== undefined)   userUpdateData.accountType    = accountType;
    if (profilePicture !== undefined) userUpdateData.profilePicture = profilePicture;
    if (msmeUdyamNumber !== undefined)  userUpdateData.msmeUdyamNumber  = msmeUdyamNumber;
    if (Object.keys(userUpdateData).length > 0) {
      promises.push(setDoc(userDocRef, userUpdateData, { merge: true }));
    }

    // Business info update
    const cleanBusinessData = Object.fromEntries(
      Object.entries(businessData).filter(([, v]) => v !== undefined),
    );
    promises.push(setDoc(businessDocRef, {
      ...cleanBusinessData,
      ownerName: name,
      updatedAt: serverTimestamp(),
    }, { merge: true }));

    await Promise.all(promises);
  };

  return { profile, loading, error, saveData, refetch };
};

export default useProfileData;