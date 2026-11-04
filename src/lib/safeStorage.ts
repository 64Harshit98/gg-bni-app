// localStorage wrappers that never throw. Touching `localStorage` throws a
// SecurityError in Safari with "Block All Cookies" and in some in-app
// webviews, setItem throws QuotaExceededError when storage is full, and a
// corrupted value makes JSON.parse throw — any of which used to crash the
// public catalogue pages (or, during render, the whole app).

export const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable or full — the value just isn't persisted.
  }
};

export const safeRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable — nothing to remove.
  }
};

export const safeGetJSON = <T>(key: string, fallback: T): T => {
  const raw = safeGet(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

export const safeSetJSON = (key: string, value: unknown): void => {
  try {
    safeSet(key, JSON.stringify(value));
  } catch {
    // Unserializable value — skip persisting it.
  }
};
