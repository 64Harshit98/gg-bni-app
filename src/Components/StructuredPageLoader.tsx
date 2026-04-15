import React, { useEffect, useMemo, useState } from 'react';
import sellarLogo from '../assets/sellar-logo-heading.png';

interface StructuredPageLoaderProps {
  title?: string;
  subtitle?: string;
  steps?: string[];
  progress?: number;
  activeStep?: number;
  minimal?: boolean;
}

const DEFAULT_STEPS = [
  'Loading company data',
  'Syncing items and parties',
  'Applying billing settings',
  'Finalizing screen',
];

const StructuredPageLoader: React.FC<StructuredPageLoaderProps> = ({
  title = 'Opening Sales Voucher',
  subtitle = 'Please wait while we prepare your billing workspace.',
  steps,
  progress,
  activeStep,
  minimal = false,
}) => {
  const [animatedProgress, setAnimatedProgress] = useState(8);

  const visibleSteps = useMemo(() => {
    if (!steps || steps.length === 0) return DEFAULT_STEPS;
    if (steps.length >= 4) return steps.slice(0, 4);
    return [...steps, ...DEFAULT_STEPS.slice(steps.length)];
  }, [steps]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setAnimatedProgress((prev) => {
        if (prev >= 94) return prev;
        const remaining = 94 - prev;
        const baseIncrement = Math.max(0.8, remaining * 0.08);
        const jitter = Math.random() * 1.4;
        return Math.min(94, Number((prev + baseIncrement + jitter).toFixed(1)));
      });
    }, 180);

    return () => window.clearInterval(intervalId);
  }, []);

  const safeProgress = typeof progress === 'number'
    ? Math.max(1, Math.min(99, Math.floor(progress)))
    : Math.max(1, Math.floor(animatedProgress));

  const activeStepIndex = typeof activeStep === 'number'
    ? Math.min(visibleSteps.length - 1, Math.max(0, activeStep - 1))
    : Math.min(visibleSteps.length - 1, Math.floor((safeProgress / 100) * visibleSteps.length));

  if (minimal) {
    return (
      <div className="h-screen w-full bg-gradient-to-br from-[#f2f7ff] via-[#edf3fb] to-[#e8f0fa] flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-lg rounded-sm border border-slate-200 bg-white/90 backdrop-blur-sm shadow-[0_14px_40px_rgba(15,23,42,0.08)] p-7 md:p-8">
          <div className="flex flex-col items-center">
            <img src={sellarLogo} alt="Sellar Logo" className="w-44 md:w-52 mb-6" />
            <div className="h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 transition-[width] duration-500 ease-out"
                style={{ width: `${safeProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-gradient-to-br from-[#f2f7ff] via-[#edf3fb] to-[#e8f0fa] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-xl rounded-sm border border-slate-200 bg-white/90 backdrop-blur-sm shadow-[0_14px_40px_rgba(15,23,42,0.08)] p-5 md:p-7">
        <div className="flex flex-col items-center text-center mb-5">
          <img src={sellarLogo} alt="Sellar Logo" className="w-36 md:w-44 mb-3" />
          <h2 className="text-lg md:text-xl font-bold text-slate-800">{title}</h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>

        <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>Structured progress</span>
          <span>{safeProgress}%</span>
        </div>

        <div className="h-3 w-full overflow-hidden rounded-sm border border-slate-200 bg-slate-100">
          <div
            className="h-full rounded-sm bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 transition-[width] duration-500 ease-out"
            style={{ width: `${safeProgress}%` }}
          />
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {visibleSteps.map((step, index) => {
            const threshold = Math.round(((index + 1) / visibleSteps.length) * 100);
            const isDone = safeProgress >= threshold;
            const isActive = !isDone && index === activeStepIndex;

            return (
              <div key={`${index}-${step}`} className="text-center">
                <div
                  className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-sm border text-[11px] font-bold transition-all ${
                    isDone
                      ? 'bg-sky-500 border-sky-500 text-white'
                      : isActive
                        ? 'bg-sky-100 border-sky-300 text-sky-700'
                        : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  {index + 1}
                </div>
                <p
                  className={`text-[10px] leading-4 ${
                    isDone || isActive ? 'text-slate-700 font-medium' : 'text-slate-400'
                  }`}
                >
                  {step}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StructuredPageLoader;
