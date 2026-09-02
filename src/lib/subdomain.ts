export const getSubdomain = (): string | null => {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // 1. Handle Localhost (usually just 'localhost')
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  // 2. Identify the slug
  // For 'tenant.sellar.in', parts[0] is 'tenant'
  if (parts.length >= 3) {
    const slug = parts[0].toLowerCase();

    // 3. IGNORE SYSTEM SUBDOMAINS
    // If it's 'app' or 'www', it's NOT a merchant catalogue
    if (slug === 'www' || slug === 'app') {
      return null;
    }

    return slug;
  }

  return null;
};

export const isMerchantSubdomain = (): boolean => getSubdomain() !== null;
