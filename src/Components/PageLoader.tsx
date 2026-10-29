import React from 'react';

/**
 * In-page loading placeholder: grey blocks for a title, a row of tiles and a
 * list. It fills the content column only — use it inside layouts instead of
 * the full-screen brand Loading screen, which is for app start-up.
 */
const Bone: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden="true" className={`block rounded-sm bg-slate-200/70 motion-safe:animate-pulse ${className}`} />
);

interface PageLoaderProps {
  /** Read out by screen readers. */
  label?: string;
  className?: string;
}

const PageLoader: React.FC<PageLoaderProps> = ({ label = 'Loading…', className = '' }) => (
  <div role="status" aria-busy="true" className={`w-full px-4 py-5 md:px-6 ${className}`}>
    <span className="sr-only">{label}</span>

    <div className="mb-5 grid gap-2">
      <Bone className="h-6 w-40" />
      <Bone className="h-3 w-64 max-w-full" />
    </div>

    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="grid gap-2.5 rounded-sm border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Bone className="h-7 w-7 shrink-0" />
            <Bone className="h-3 w-16" />
          </div>
          <Bone className="h-6 w-24" />
          <Bone className="h-2.5 w-14" />
        </div>
      ))}
    </div>

    <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="flex items-center gap-3 bg-slate-50 px-4 py-3">
        <Bone className="h-3 w-24" />
        <Bone className="ml-auto h-3 w-16" />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 border-t border-slate-100 px-4 py-3.5">
          <Bone className="h-9 w-9 shrink-0" />
          <div className="grid flex-1 gap-1.5">
            <Bone className={`h-3.5 ${i % 2 ? 'w-1/3' : 'w-2/5'}`} />
            <Bone className={`h-2.5 ${i % 2 ? 'w-1/2' : 'w-1/4'}`} />
          </div>
          <Bone className="h-4 w-16" />
        </div>
      ))}
    </div>
  </div>
);

export default PageLoader;
