import React, { useEffect, type ReactNode } from 'react';
import { markAppBooted } from '../lib/bootStatus';

// Wraps the root app and tells the index.html boot watchdog that React has
// committed its first render (effects run after the first commit), so the
// watchdog stands down instead of swapping in its "Couldn't load" screen.
const BootSignal: React.FC<{ children: ReactNode }> = ({ children }) => {
  useEffect(() => {
    markAppBooted();
  }, []);
  return <>{children}</>;
};

export default BootSignal;
