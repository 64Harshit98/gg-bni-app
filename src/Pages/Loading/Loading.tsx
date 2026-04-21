import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import sellarMark from '../../assets/sellar-logo.png';
import bgMain from '../../assets/bg-main.png';

const LOADING_NAMES = ['LOADING', 'SYNCING', 'PREPARING', 'OPENING'];
type ActiveLogo = 'main' | 'mark';

const Loading: React.FC = () => {
  const [activeLogo, setActiveLogo] = useState<ActiveLogo>('main');
  const [activeNameIndex, setActiveNameIndex] = useState(0);

  useEffect(() => {
    const cycle = window.setInterval(() => {
      setActiveLogo((prev) => (prev === 'main' ? 'mark' : 'main'));
      setActiveNameIndex((prev) => (prev + 1) % LOADING_NAMES.length);
    }, 700);

    return () => {
      window.clearInterval(cycle);
    };
  }, []);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-cover bg-center md:bg-[center_top_75%] pb-16"
      style={{ backgroundImage: `url(${bgMain})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/35 via-white/25 to-white/35" />

      <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
        <div className="relative flex flex-col items-center justify-center">
          <div className="pointer-events-none absolute -z-10 h-44 w-44 rounded-full bg-white/70 blur-2xl md:h-56 md:w-56" />

          <div className="relative h-22 w-[280px] md:h-24 md:w-[360px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {activeLogo === 'main' ? (
                <motion.img
                  key="main-logo"
                  src={sellarLogo}
                  alt="Sellar Main Logo"
                  className="absolute w-52 md:w-64 drop-shadow-[0_10px_22px_rgba(15,23,42,0.22)]"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.12, ease: 'easeInOut' }}
                />
              ) : (
                <motion.img
                  key="mark-logo"
                  src={sellarMark}
                  alt="Sellar Mark Logo"
                  className="absolute w-14 md:w-16 drop-shadow-[0_10px_22px_rgba(15,23,42,0.22)]"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.08 }}
                  transition={{ duration: 0.1, ease: 'easeInOut' }}
                />
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4 min-h-[20px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={LOADING_NAMES[activeNameIndex]}
                className="text-[11px] font-semibold tracking-[0.12em] text-slate-700/80 uppercase"
                initial={{ opacity: 0, y: 8, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
              >
                {LOADING_NAMES[activeNameIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>

  );
};

export default Loading;
