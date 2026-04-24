// src/Catalogue/useCatalogueProfileData.ts
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { type ProfileData } from '../../Pages/Account/EditProfileComponents/Profiledata';

// ── Catalogue extends ProfileData with social links ──────────────────────────
export interface CatalogueData extends ProfileData {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  gmail?: string;
}

export const useCatalogueProfileData = (
  companyId?: string,
  catalogueId?: string,
  userId?: string,
) => {
  const [catalogue, setCatalogue] = useState<Partial<CatalogueData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !catalogueId) { setLoading(false); return; }

    const fetchData = async () => {
      setLoading(true);
      try {
        const businessDocRef = doc(db, 'companies', companyId, 'business_info', catalogueId);
        const userDocRef     = doc(db, 'companies', companyId, 'users', userId!);

        const [businessSnap, userSnap] = await Promise.all([
          getDoc(businessDocRef),
          getDoc(userDocRef),
        ]);

        const businessData = businessSnap.exists() ? businessSnap.data() : {};
        const userData     = userSnap.exists()     ? userSnap.data()     : {};

        setCatalogue({
          ...businessData,
          name:            userData.name            || '',
          email:           userData.email           || '',
          phone:           userData.phone           || '',
          profilePicture:  userData.profilePicture  || businessData.profilePicture || '',
          companyLogo:     businessData.companyLogo || '',
          msmeUdyamNumber: userData.msmeUdyamNumber || businessData.msmeUdyamNumber || '',
        });
      } catch (err) {
        console.error('Error fetching catalogue profile data:', err);
        setError('Failed to load profile.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, catalogueId]);

  const saveData = async (data: Partial<CatalogueData>) => {
    if (!companyId || !catalogueId || !userId) throw new Error('Missing required IDs.');

    // Fields that belong on the user doc
    const { name, email, phone, profilePicture, msmeUdyamNumber, ...businessData } = data;

    const businessDocRef = doc(db, 'companies', companyId, 'business_info', catalogueId);
    const userDocRef     = doc(db, 'companies', companyId, 'users', userId);

    const cleanBusinessData = Object.fromEntries(
      Object.entries(businessData).filter(([, v]) => v !== undefined),
    );

    await Promise.all([
      setDoc(
        businessDocRef,
        { ...cleanBusinessData, updatedAt: serverTimestamp() },
        { merge: true },
      ),
      setDoc(
        userDocRef,
        {
          ...(name            !== undefined && { name }),
          ...(email           !== undefined && { email }),
          ...(phone           !== undefined && { phone }),
          ...(profilePicture  !== undefined && { profilePicture }),
          ...(msmeUdyamNumber !== undefined && { msmeUdyamNumber }),
        },
        { merge: true },
      ),
    ]);
  };

  return { catalogue, loading, error, saveData };
};