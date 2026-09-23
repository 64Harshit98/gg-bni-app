import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export const logoCache: Record<string, string> = {};

// Separate cache for base64 versions (so we don't re-convert on every PDF)
const logoBase64Cache: Record<string, string> = {};

// ── Helper: convert any image URL → base64 data URL ──────────────
// ── Helper: convert any image URL → base64 data URL ──────────────
const urlToBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!url) {
      console.warn("⚠️ urlToBase64 was given an empty URL. Check Firestore database!");
      return resolve("");
    }

    console.log("🔄 Attempting to convert logo URL to Base64:", url);

    const img = new Image();
    // CRITICAL for Canvas export
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context unavailable')); return; }

      ctx.drawImage(img, 0, 0);
      const base64Str = canvas.toDataURL('image/png');

      console.log("✅ Successfully converted logo to Base64!");
      resolve(base64Str);
    };

    img.onerror = (err) => {
      console.error("❌ Image failed to load for canvas conversion. This is almost always a Firebase CORS configuration issue.", err);
      resolve(""); // Resolve empty so it doesn't crash the whole app
    };

    // CACHE BUSTER: This forces the browser to fetch a fresh copy from Firebase
    // ensuring it gets the correct CORS headers, ignoring any non-CORS cached version.
    const cacheBusterUrl = url + (url.includes('?') ? '&' : '?') + 'cb=' + new Date().getTime();
    img.src = cacheBusterUrl;
  });
};
// ── For React components ──────────────────────────────────────────
export const useCompanyLogo = (companyId?: string): string => {
  const [logo, setLogo] = useState<string>(
    companyId ? (logoCache[companyId] ?? '') : ''
  );

  useEffect(() => {
    if (!companyId) return;
    if (logoCache[companyId]) {
      setLogo(logoCache[companyId]);
      return;
    }
    const fetchLogo = async () => {
      try {
        const businessDoc = await getDoc(
          doc(db, 'companies', companyId, 'business_info', companyId)
        );
        const url = businessDoc.exists()
          ? (businessDoc.data()?.companyLogo ?? '')
          : '';
        logoCache[companyId] = url;
        setLogo(url);
      } catch (err) {
        console.error('useCompanyLogo: failed to fetch logo', err);
      }
    };
    fetchLogo();
  }, [companyId]);

  return logo;
};

// ── For non-React contexts like PDF generation ────────────────────
// Returns the storage URL (cached).
export const resolveCompanyLogo = async (companyId?: string): Promise<string> => {
  if (!companyId) return '';
  if (logoCache[companyId]) return logoCache[companyId];
  try {
    const businessDoc = await getDoc(
      doc(db, 'companies', companyId, 'business_info', companyId)
    );
    const url = businessDoc.exists()
      ? (businessDoc.data()?.companyLogo ?? '')
      : '';
    logoCache[companyId] = url;
    return url;
  } catch (err) {
    console.error('resolveCompanyLogo: failed', err);
    return '';
  }
};

// ── NEW: resolves logo URL then converts to base64 ────────────────
// Safe to call multiple times — result is cached after first conversion.
export const resolveCompanyLogoBase64 = async (companyId?: string): Promise<string> => {
  if (!companyId) return '';

  // Return cached base64 if already converted
  if (logoBase64Cache[companyId]) return logoBase64Cache[companyId];

  try {
    // 1. Get the storage URL (reuses URL cache)
    const url = await resolveCompanyLogo(companyId);
    if (!url) return '';

    // 2. Convert URL → base64 via canvas (CORS-safe)
    const base64 = await urlToBase64(url);
    logoBase64Cache[companyId] = base64;
    return base64;
  } catch (err) {
    console.error('resolveCompanyLogoBase64: failed to convert logo to base64', err);
    return '';
  }
};

// ── Cache invalidation (call after uploading a new logo) ──────────
export const invalidateLogoCache = (companyId: string) => {
  delete logoCache[companyId];
  delete logoBase64Cache[companyId];   // also clear the base64 cache
};