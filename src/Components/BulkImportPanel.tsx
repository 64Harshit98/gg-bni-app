// components/BulkImportPanel.tsx
//
// The bulk-import card rendered in both the desktop right-panel and the
// mobile section.  All copy is identical; only accent colours differ.

import React from 'react';
import { Spinner } from '../constants/Spinner';

interface Props {
  isUploading: boolean;
  onUploadClick: () => void;
  onDownloadSample: () => void;
  /** Tailwind classes for the upload button */
  uploadBtnClass?: string;
  /** Tailwind classes for the "Download Sample" link */
  downloadLinkClass?: string;
  /** Tailwind classes for the card container */
  cardClass?: string;
  /** Tailwind classes for the heading */
  headingClass?: string;
  /** Tailwind classes for the subtitle */
  subtitleClass?: string;
}

const BulkImportPanel: React.FC<Props> = ({
  isUploading,
  onUploadClick,
  onDownloadSample,
  uploadBtnClass   = 'bg-white text-sky-600 border border-sky-200 hover:bg-sky-50',
  downloadLinkClass = 'text-sky-500 hover:text-sky-700',
  cardClass        = 'bg-sky-50 border border-sky-100',
  headingClass     = 'text-sky-800',
  subtitleClass    = 'text-sky-600',
}) => (
  <div className={`rounded-sm p-5 ${cardClass}`}>
    <h2 className={`text-lg font-bold mb-2 ${headingClass}`}>Bulk Import</h2>
    <p className={`text-sm mb-4 ${subtitleClass}`}>
      Upload Excel/CSV. Missing categories created automatically.
    </p>
    <div className="flex flex-col gap-3">
      <button
        onClick={onUploadClick}
        disabled={isUploading}
        className={`w-full py-3 px-4 rounded-sm font-semibold disabled:bg-gray-100 flex items-center justify-center gap-2 transition-colors ${uploadBtnClass}`}
      >
        {isUploading ? <Spinner /> : 'Upload Excel File'}
      </button>
      <button
        type="button"
        onClick={onDownloadSample}
        disabled={isUploading}
        className={`text-sm underline text-center ${downloadLinkClass}`}
      >
        Download Sample Template
      </button>
    </div>
  </div>
);

export default BulkImportPanel;
