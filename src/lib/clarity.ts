import Clarity from '@microsoft/clarity';

// Microsoft Clarity (session recordings + heatmaps). Production builds only, so
// local development never records. A build without VITE_CLARITY_PROJECT_ID
// (e.g. the staging CI build) simply runs without it.
//
// Call this only after markAppStarted(): Clarity loads through a <script> tag,
// and until that point the boot watchdog in index.html treats any failed script
// as the app failing to load, so an ad blocker stopping Clarity would put
// "Couldn't load the page" over the screen until the app had rendered.
export const initClarity = (): void => {
  const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID;
  if (!import.meta.env.PROD || !projectId) return;
  Clarity.init(projectId);
};
