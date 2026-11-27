// Mistakes that typing more can't fix, so they can be shown straight away.
export const emailTypingError = (raw: string): string | null => {
  const email = raw.trim();
  if (/\s/.test(email)) return 'Remove the space from your email.';
  if (email.includes(',')) return 'Use a dot instead of the comma.';
  if (email.split('@').length > 2) return 'An email can only have one @.';
  if (email.includes('..')) return 'There are two dots in a row. Keep just one.';
  if (email.startsWith('@')) return 'Add your name before the @, like you@example.com.';
  if (email.startsWith('.')) return "An email can't start with a dot.";

  const [local, domain] = email.split('@');
  if (/[^a-z0-9.!#$%&'*+/=?^_`{|}~-]/i.test(local)) return "This has a character emails can't use.";
  if (domain === undefined) return null;
  if (local.endsWith('.')) return "There can't be a dot just before the @.";
  if (domain.startsWith('.')) return 'Add the name after the @, like gmail.com.';
  if (/[^a-z0-9.-]/i.test(domain)) return 'After the @, use only letters, numbers, dots and hyphens.';
  if (/(^|\.)-|-(\.|$)/.test(domain)) return "A hyphen can't sit next to a dot or at the end.";
  return null;
};

export const emailFormatError = (raw: string): string | null => {
  const email = raw.trim();
  if (!email) return 'Enter your email address.';
  const typingError = emailTypingError(email);
  if (typingError) return typingError;

  const domain = email.split('@')[1];
  if (domain === undefined) return 'Add the @ part, like you@example.com.';
  if (!domain) return 'Add the part after the @, like gmail.com.';
  if (!domain.includes('.')) return 'Add the ending, like gmail.com.';
  if (!/\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(domain)) return 'Finish the ending, like .com or .in.';
  return null;
};

// Common slips for .com, .net, .org and .in. None of these exist as real endings.
const FAKE_ENDINGS: Record<string, string> = {
  ...Object.fromEntries(
    ['som', 'con', 'cmo', 'ocm', 'vom', 'xom', 'cpm', 'cim', 'clm', 'ckm', 'dom', 'fom', 'gom', 'hom', 'coom', 'comm', 'comn'].map((e) => [e, 'com'])
  ),
  ...Object.fromEntries(['ner', 'nett', 'ney', 'nte', 'met'].map((e) => [e, 'net'])),
  ...Object.fromEntries(['ogr', 'orh', 'prg', 'otg'].map((e) => [e, 'org'])),
  inn: 'in',
};

const POPULAR_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.co.in', 'hotmail.com', 'outlook.com', 'rediffmail.com', 'icloud.com'];

// Real addresses that sit one or two letters away from a popular domain
const KNOWN_DOMAINS = new Set([
  ...POPULAR_DOMAINS,
  'ymail.com', 'mail.com', 'email.com', 'gmx.com', 'googlemail.com', 'yahoo.in', 'yahoo.co.uk', 'rocketmail.com',
  'hotmail.co.in', 'hotmail.co.uk', 'outlook.in', 'live.com', 'live.in', 'msn.com', 'me.com', 'mac.com', 'aol.com',
  'rediff.com', 'zoho.com', 'zohomail.in', 'proton.me', 'protonmail.com',
]);

// Edit distance where swapping two neighbouring letters counts as one slip
const typingDistance = (a: string, b: string): number => {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
};

const fixFakeEnding = (domain: string): string | null => {
  const dot = domain.lastIndexOf('.');
  const ending = FAKE_ENDINGS[domain.slice(dot + 1)];
  return ending ? `${domain.slice(0, dot)}.${ending}` : null;
};

const closestPopularDomain = (domain: string): string | null => {
  if (KNOWN_DOMAINS.has(domain)) return null;
  // Short domains need a closer match, or gail.com would turn into gmail.com at two slips
  const allowed = domain.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = allowed + 1;
  for (const popular of POPULAR_DOMAINS) {
    const distance = typingDistance(domain, popular);
    if (distance < bestDistance) {
      best = popular;
      bestDistance = distance;
    }
  }
  return best;
};

// The address the person probably meant ("a@gmial.com" gives "a@gmail.com"), or null
export const emailSuggestion = (raw: string): string | null => {
  const email = raw.trim();
  if (emailFormatError(email)) return null;
  const [local, typedDomain] = email.split('@');
  const domain = typedDomain.toLowerCase();
  const fixed = closestPopularDomain(domain) ?? fixFakeEnding(domain);
  return fixed ? `${local}@${fixed}` : null;
};

// For an address that is about to become a login. Stricter than emailFormatError
// because accounts made before this check may already use one of these endings.
export const newEmailError = (raw: string): string | null => {
  const formatError = emailFormatError(raw);
  if (formatError) return formatError;
  const domain = raw.trim().split('@')[1].toLowerCase();
  return fixFakeEnding(domain) ? "That ending doesn't look right." : null;
};
