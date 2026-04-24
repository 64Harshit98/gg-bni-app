// ─── Data Types ───────────────────────────────────────────────────────────────

export interface ProfileData {
  name: string;
  email: string;
  phone: string;
  panNumber: string;
  accountType: string;
  profilePicture?: string;
  companyLogo?: string;
  businessName: string;
  businessType: string;
  businessCategory: string;
  registrationNumber: string;
  gstin: string;
  msmeUdyamNumber: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  ifscCode: string;
}

// ─── Select Options ───────────────────────────────────────────────────────────

export const businessTypeOptions = [
  { value: '', label: 'Select type' },
  { value: 'Private Limited', label: 'Private Limited' },
  { value: 'Partnership', label: 'Partnership' },
  { value: 'Sole Proprietor', label: 'Sole Proprietor' },
  { value: 'LLP', label: 'LLP' },
  { value: 'Other', label: 'Other' },
];

export const businessCategoryOptions = [
  { value: '', label: 'Select category' },
  { value: 'Retail', label: 'Retail' },
  { value: 'Wholesale', label: 'Wholesale' },
  { value: 'Manufacturing', label: 'Manufacturing' },
  { value: 'Services', label: 'Services' },
  { value: 'Other', label: 'Other' },
];

// ─── Image Compression ────────────────────────────────────────────────────────

/** Compresses a profile picture to JPEG at 50% quality, max 500×500px. */
export const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      const MAX = 500;
      let { width, height } = img;

      if (width > height) {
        if (width > MAX) { height *= MAX / width; width = MAX; }
      } else {
        if (height > MAX) { width *= MAX / height; height = MAX; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          blob ? resolve(blob) : reject(new Error('Image compression failed'));
        },
        'image/jpeg',
        0.5,
      );
    };

    img.onerror = (err) => { URL.revokeObjectURL(img.src); reject(err); };
  });
};

/** Compresses a company logo to PNG (preserves transparency), max 500×500px. */
export const compressLogo = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      const MAX = 500;
      let { width, height } = img;

      if (width > height) {
        if (width > MAX) { height *= MAX / width; width = MAX; }
      } else {
        if (height > MAX) { width *= MAX / height; height = MAX; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          blob ? resolve(blob) : reject(new Error('Logo compression failed'));
        },
        'image/png',
        0.9,
      );
    };

    img.onerror = (err) => { URL.revokeObjectURL(img.src); reject(err); };
  });
};

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationErrors {
  postalCode?: string;
  phone?: string;
}

/** Returns an error string, or null if the value is valid / empty. */
export const validatePostalCode = (value: string): string | null =>
  value.length > 0 && value.length < 6 ? 'Postal code must be exactly 6 digits.' : null;

export const validatePhone = (value: string): string | null =>
  value.length > 0 && value.length < 10 ? 'Phone number must be exactly 10 digits.' : null;

/** Full form validation before submit — returns an error string or null. */
export const validateForm = (formData: Partial<ProfileData>): string | null => {
  if (formData.postalCode && formData.postalCode.length !== 6)
    return 'Postal code must be exactly 6 digits.';
  if (formData.phone && formData.phone.length !== 10)
    return 'Phone number must be exactly 10 digits.';
  if (formData.msmeUdyamNumber && formData.msmeUdyamNumber.length !== 19)
    return 'MSME/Udyam number must be exactly 19 characters.';
  if (formData.panNumber && formData.panNumber.length !== 10)
    return 'PAN number must be exactly 10 characters.';
  if (formData.gstin && formData.gstin.length !== 15)
    return 'GSTIN must be exactly 15 characters.';
  return null;
};