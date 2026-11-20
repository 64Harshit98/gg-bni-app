export const toSocialUrl = (base: string, value?: string): string => {
  const t = (value || '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(www\.)?[a-z0-9-]+\.(com|in|co|net|org|io)\//i.test(t)) return `https://${t}`;
  return `${base}${t.replace(/^@/, '').replace(/\/+$/, '')}`;
};

export const INSTAGRAM_BASE = 'https://www.instagram.com/';
export const FACEBOOK_BASE = 'https://www.facebook.com/';
export const TWITTER_BASE = 'https://x.com/';

// Stored as 91XXXXXXXXXX or XXXXXXXXXX -> always returns the 10-digit number
export const stripCountryCode = (value?: string): string => {
  const d = (value || '').replace(/\D/g, '');
  return d.length > 10 && d.startsWith('91') ? d.slice(2) : d;
};

// wa.me needs the country code
export const toWhatsappNumber = (value?: string): string => {
  const n = stripCountryCode(value);
  return n ? `91${n}` : '';
};