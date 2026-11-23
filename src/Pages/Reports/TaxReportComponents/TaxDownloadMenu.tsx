import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, type LucideIcon } from 'lucide-react';
import type { TaxDownloadType } from './taxReportExport.utils';

export interface TaxDownloadOption {
  key: TaxDownloadType;
  label: string;
  hint: string;
  icon: LucideIcon;
}

interface TaxDownloadMenuProps {
  options: TaxDownloadOption[];
  onSelect: (key: TaxDownloadType) => void;
  variant?: 'button' | 'icon';
}

// Mirrors SalesReportComponents/DownloadMenu, but with one entry per GST return.
export default function TaxDownloadMenu({ options, onSelect, variant = 'button' }: TaxDownloadMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      {variant === 'button' ? (
        <button
          onClick={() => setIsOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-sm bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Download size={15} />
          Download
          <ChevronDown size={15} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen((o) => !o)}
          aria-label="Download tax report"
          className="rounded-sm p-2 text-slate-700 transition hover:bg-slate-200"
        >
          <Download size={20} />
        </button>
      )}

      {isOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-sm border border-line bg-white p-1.5 shadow-float">
          {options.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setIsOpen(false);
                onSelect(key);
              }}
              className="flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition hover:bg-sunken"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-blue-600">
                <Icon size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{label}</span>
                {hint && <span className="block text-xs text-slate-500">{hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
