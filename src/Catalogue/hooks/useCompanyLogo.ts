import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export const logoCache: Record<string, string> = {};

// Separate cache for base64 versions (so we don't re-convert on every PDF)
const logoBase64Cache: Record<string, string> = {};

// ── Helper: convert any image URL → base64 data URL ──────────────
const urlToBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Route Firebase Storage URLs through the Vite dev proxy
    // to avoid CORS + cached-response-without-CORS-headers issues
    const proxiedUrl = url.replace(
      'https://firebasestorage.googleapis.com',
      '/firebase-image'
    );

    const img = new Image();
    // No crossOrigin needed — same-origin request via proxy
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${proxiedUrl}`));
    img.src = proxiedUrl;
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