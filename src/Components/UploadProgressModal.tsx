// components/UploadProgressModal.tsx
//
// Shared progress overlay used by both ItemAdd variants.
// The progress-bar colour is passed as a prop so each theme can style it.

import React from 'react';

interface Props {
  current: number;
  total: number;
  /** Tailwind bg class for the progress bar, e.g. 'bg-[#F97316]' or 'bg-sky-500' */
  barColorClass?: string;
}

const UploadProgressModal: React.FC<Props> = ({
  current,
  total,
  barColorClass = 'bg-sky-500',
}) => (
  <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
    <div className="bg-white p-8 rounded-sm shadow-xl w-80 text-center">
      <h3 className="text-lg font-bold mb-4 text-gray-800">Uploading Items...</h3>
      <div className="w-full bg-gray-200 rounded-sm h-4 mb-2 overflow-hidden">
        <div
          className={`${barColorClass} h-4 rounded-sm transition-all duration-100`}
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
      <p className="text-sm text-gray-600 font-mono">{current} / {total} processed</p>
      <p className="text-xs text-gray-400 mt-2">Please do not close this window.</p>
    </div>
  </div>
);

export default UploadProgressModal;
