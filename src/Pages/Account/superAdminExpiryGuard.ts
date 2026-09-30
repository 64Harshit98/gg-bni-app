// Guards every super-admin write to companies/{id}.expiryDate. A typo in a
// year (e.g. 2052 instead of 2025) silently gives a company decades of free
// software, so anything unusually far out needs an explicit second confirm.
export const MAX_EXPIRY_YEARS_AHEAD = 2;

export const confirmExpiryChange = (
  companyName: string,
  currentExpiry: Date | null,
  newExpiry: Date
): boolean => {
  if (isNaN(newExpiry.getTime())) {
    alert('Invalid expiry date.');
    return false;
  }

  const limit = new Date();
  limit.setFullYear(limit.getFullYear() + MAX_EXPIRY_YEARS_AHEAD);
  if (newExpiry.getTime() <= limit.getTime()) return true;

  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return window.confirm(
    `⚠ ${companyName}: new expiry ${fmt(newExpiry)} is more than ${MAX_EXPIRY_YEARS_AHEAD} years away` +
    (currentExpiry ? ` (currently ${fmt(currentExpiry)})` : '') +
    `.\n\nThis is usually a typo in the year. Continue anyway?`
  );
};
