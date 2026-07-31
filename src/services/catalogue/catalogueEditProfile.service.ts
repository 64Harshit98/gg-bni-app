import { db, storage } from '../../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export interface CatalogueProfileData {
  name: string;
  email: string;
  phone: string;
  panNumber: string;
  accountType: string;
  businessName: string;
  businessType: string;
  businessCategory: string;
  gstin: string;
  msmeUdyamNumber: string;

  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;

  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  accountNumber: string;

  instagram?: string;
  facebook?: string;
  twitter?: string;
  gmail?: string;
  whatsappNumber?: string;

  profilePicture?: string;
  companyLogo?: string;
}

/** Fetches the merged business + user-owner profile data for the catalogue edit-profile page. */
export async function fetchCatalogueProfile(
  companyId: string,
  catalogueId: string,
  userId: string,
): Promise<Partial<CatalogueProfileData>> {
  try {
    const businessDocRef = doc(db, 'companies', companyId, 'business_info', catalogueId);
    const userDocRef = doc(db, 'companies', companyId, 'users', userId);

    const [businessSnap, userSnap] = await Promise.all([getDoc(businessDocRef), getDoc(userDocRef)]);

    const businessData = businessSnap.exists() ? businessSnap.data() : {};
    const userData = userSnap.exists() ? userSnap.data() : {};

    return {
      ...businessData,
      name: userData.name || '',
      profilePicture: userData.profilePicture || businessData.profilePicture || '',
      companyLogo: businessData.companyLogo || '',
      msmeUdyamNumber: userData.msmeUdyamNumber || businessData.msmeUdyamNumber || '',
      email: userData.email || '',
      phone: userData.phoneNumber || userData.phone || '',
    };
  } catch (err) {
    console.error('Error fetching catalogue profile:', err);
    throw err;
  }
}

/** Persists profile edits: business_info doc gets business fields, users doc gets owner fields. */
export async function saveCatalogueProfile(
  companyId: string,
  catalogueId: string,
  userId: string,
  data: Partial<CatalogueProfileData>,
): Promise<void> {
  try {
    const { name, profilePicture, email, phone, msmeUdyamNumber, ...businessData } = data;

    const businessDocRef = doc(db, 'companies', companyId, 'business_info', catalogueId);
    const userDocRef = doc(db, 'companies', companyId, 'users', userId);

    const cleanBusinessData = Object.fromEntries(
      Object.entries(businessData).filter(([, v]) => v !== undefined),
    );

    await Promise.all([
      setDoc(
        businessDocRef,
        {
          ...cleanBusinessData,
          ...(phone !== undefined && { phoneNumber: phone }),
          ...(msmeUdyamNumber !== undefined && { msmeUdyamNumber }),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
      setDoc(
        userDocRef,
        {
          name,
          profilePicture,
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phoneNumber: phone }),
          ...(msmeUdyamNumber !== undefined && { msmeUdyamNumber }),
        },
        { merge: true },
      ),
    ]);
  } catch (err) {
    console.error('Error saving catalogue profile:', err);
    throw err;
  }
}

/** Aggressively compresses an image (avatar/logo) to a JPEG blob capped at 500px. */
export function compressImageForUpload(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      const MAX_WIDTH = 500;
      const MAX_HEIGHT = 500;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Image compression failed'));
          }
          URL.revokeObjectURL(img.src);
        },
        'image/jpeg',
        0.5,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Image load error'));
    };
  });
}

/** Uploads a compressed profile picture and returns its download URL. */
export async function uploadProfilePicture(
  companyId: string,
  userId: string,
  file: File,
): Promise<string> {
  try {
    const storagePath = `companies/${companyId}/users/${userId}/profile_pic.jpg`;
    const storageRef = ref(storage, storagePath);
    const compressedBlob = await compressImageForUpload(file);
    await uploadBytes(storageRef, compressedBlob);
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.error('Error uploading profile picture:', err);
    throw err;
  }
}

/** Uploads a compressed company logo and returns its download URL. */
export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  try {
    const logoPath = `companies/${companyId}/branding/company_logo.jpg`;
    const logoRef = ref(storage, logoPath);
    const compressedLogo = await compressImageForUpload(file);
    await uploadBytes(logoRef, compressedLogo);
    return await getDownloadURL(logoRef);
  } catch (err) {
    console.error('Error uploading company logo:', err);
    throw err;
  }
}
