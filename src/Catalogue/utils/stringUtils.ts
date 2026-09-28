/**
 * Sanitizes a name string for use as a filename.
 * e.g. "John Doe!" → "john-doe"
 */
export const sanitizeName = (name: string): string => {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
};