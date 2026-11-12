import ReactDOM from 'react-dom/client';
import './global.css';
import { getSubdomain } from './lib/subdomain';
import { isChunkLoadError, isReloadPending, reloadOnce } from './lib/chunkReload';
import { markAppStarted, reportBootFailure } from './lib/bootStatus';
import { initClarity } from './lib/clarity';
import BootSignal from './app/BootSignal';

// Thin bootstrap. Everything heavy is behind a dynamic import so the entry
// chunk stays tiny, and the visitor only downloads the app they need:
//   <sub>.sellar.in  -> StorefrontApp (buyer-facing catalogue viewer)
//   anything else    -> AdminApp      (merchant dashboard + legacy links)

// Vite fires this when a lazy chunk (or its CSS) fails to preload — almost
// always a deploy that replaced the hashed files under an open tab. Reload
// onto the current build; if we already just did, let the error surface to
// the error boundaries instead of looping.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault();
});

const root = ReactDOM.createRoot(document.getElementById('root')!);

const loadApp = getSubdomain()
  ? import('./app/StorefrontApp')
  : import('./app/AdminApp');

loadApp
  .then(({ default: App }) => {
    markAppStarted();
    root.render(
      <BootSignal>
        <App />
      </BootSignal>
    );
    // Must stay after markAppStarted() — see lib/clarity.ts.
    initClarity();
  })
  .catch((error) => {
    console.error('Failed to load the app bundle:', error);
    // The vite:preloadError listener above may already be reloading.
    if (isReloadPending()) return;
    if (isChunkLoadError(error) && reloadOnce()) return;
    reportBootFailure();
  });
