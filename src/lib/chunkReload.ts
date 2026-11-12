// Recovery for "the JS file this page needs no longer exists" — the classic
// post-deploy failure: a tab (or a cached HTML shell) still points at the
// previous build's hashed chunks, which the new deploy removed. Every browser
// words that failure differently, and Safari's wording was the one the old
// ErrorBoundary check missed, so the detection lives here in one place and is
// shared by ErrorBoundary, GlobalError and the `vite:preloadError` listener.

const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module', // Chrome / Edge
  'importing a module script failed', // Safari / iOS
  'error loading dynamically imported module', // Firefox
  'unable to preload css', // Vite CSS preload
  'is not a valid javascript mime type', // index.html served in place of a chunk
  'expected a javascript', // older Chrome wording of the MIME error
  'loading chunk', // ChunkLoadError
  'loading css chunk',
];

export const isChunkLoadError = (error: unknown): boolean => {
  if (!error) return false;
  const err = error as { name?: unknown; message?: unknown };
  if (err.name === 'ChunkLoadError') return true;
  const message = String(err.message ?? error).toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

const RELOAD_KEY = 'sellar:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

let reloadPending = false;

// True once reloadOnce() has started a reload in this page — error screens
// use it to show "Updating…" instead of flashing a crash message while the
// browser is already navigating to the fresh build.
export const isReloadPending = (): boolean => reloadPending;

// Reloads the page to pick up the current build, at most once per cooldown
// window so a chunk that is genuinely missing can't trap the tab in a reload
// loop. Returns false when it declined to reload (caller should show its own
// error UI instead).
export const reloadOnce = (): boolean => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    // Storage blocked (Safari "Block All Cookies", some webviews) — fall
    // through and allow the reload; the cooldown just can't be enforced.
  }

  if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;

  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // see above
  }
  reloadPending = true;
  window.location.reload();
  return true;
};
