import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import type { ImportIssue } from '../../../lib/restaurant/importSheet';
import { downloadImportIssues } from './excelImport';

/** What checking a file found, and how to save the good rows. */
export interface ImportPlan {
  /** Rows / recipes ready to save. */
  readyCount: number;
  /** e.g. "raw materials", "recipes (42 ingredient lines)". */
  readyLabel: string;
  issues: ImportIssue[];
  /** Save the ready rows. Gets a progress callback (0–readyCount); resolves to the success text. */
  run: (onProgress: (done: number) => void) => Promise<string>;
}

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** What the file should contain, one or two short lines. */
  hint: string;
  onDownloadTemplate: () => void;
  /** Read and check the file. Throw with a readable message when the file can't be used. */
  analyse: (file: File) => Promise<ImportPlan>;
  issuesFileName: string;
}

type Phase = 'pick' | 'checking' | 'preview' | 'saving' | 'done';

/** Pick an Excel file → see what will be imported and what won't (and why) → import. */
export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  title,
  hint,
  onDownloadTemplate,
  analyse,
  issuesFileName,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState('');

  if (!isOpen) return null;

  const reset = () => {
    setPhase('pick');
    setFileName('');
    setPlan(null);
    setProgress(0);
    setError(null);
    setResult('');
    if (fileRef.current) fileRef.current.value = '';
  };
  const close = () => {
    if (phase === 'saving') return; // don't drop a half-finished import
    reset();
    onClose();
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setPhase('checking');
    try {
      setPlan(await analyse(file));
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.');
      setPhase('pick');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const runImport = async () => {
    if (!plan || plan.readyCount === 0) return;
    setPhase('saving');
    setError(null);
    try {
      setResult(await plan.run(setProgress));
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed. Nothing after the last saved batch was imported.');
      setPhase('preview');
    }
  };

  const issues = plan?.issues ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-[#0f172b]/40 p-0 sm:items-center sm:p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-sm bg-white font-poppins text-[#0f172b] shadow-xl sm:rounded-sm"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#dfe6fb] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#e9faef] text-[#008236]">
              <FileSpreadsheet size={18} />
            </span>
            <div>
              <h2 className="text-sm font-bold">{title}</h2>
              <p className="text-xs text-[#5b6b86]">{hint}</p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-sm p-1 text-[#5b6b86] hover:bg-[#f5f7ff]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-sm border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-xs text-[#b91c1c]">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {(phase === 'pick' || phase === 'checking') && (
            <div className="space-y-3">
              <ol className="space-y-1 text-xs text-[#5b6b86]">
                <li>1. Download the template and fill the <b>Import</b> sheet (the Example sheet shows how).</li>
                <li>2. Upload it here. You'll see what will be added before anything is saved.</li>
              </ol>
              <button
                type="button"
                onClick={onDownloadTemplate}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-xs font-semibold hover:border-[#155dfc] hover:text-[#155dfc]"
              >
                <Download size={14} /> Download template
              </button>
              <button
                type="button"
                disabled={phase === 'checking'}
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-sm border-2 border-dashed border-[#c7d5fb] bg-[#f5f7ff] px-3 py-6 text-xs font-semibold text-[#155dfc] hover:border-[#155dfc] disabled:opacity-60"
              >
                <Upload size={20} />
                {phase === 'checking' ? `Checking ${fileName}…` : 'Choose Excel file (.xlsx, .xls, .csv)'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
          )}

          {(phase === 'preview' || phase === 'saving') && plan && (
            <div className="space-y-3">
              <p className="truncate text-xs text-[#5b6b86]">File: <b className="text-[#0f172b]">{fileName}</b></p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-sm border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2">
                  <div className="text-lg font-bold text-[#008236]">{plan.readyCount}</div>
                  <div className="text-[11px] text-[#166534]">{plan.readyLabel} ready</div>
                </div>
                <div className={`rounded-sm border px-3 py-2 ${issues.length ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#dfe6fb] bg-[#f8fafc]'}`}>
                  <div className={`text-lg font-bold ${issues.length ? 'text-[#b45309]' : 'text-[#5b6b86]'}`}>{issues.length}</div>
                  <div className="text-[11px] text-[#5b6b86]">rows skipped</div>
                </div>
              </div>

              {issues.length > 0 && (
                <div className="rounded-sm border border-[#dfe6fb]">
                  <div className="flex items-center justify-between border-b border-[#dfe6fb] px-3 py-2">
                    <span className="text-xs font-semibold">Skipped rows</span>
                    <button
                      type="button"
                      onClick={() => downloadImportIssues(issuesFileName, issues)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#155dfc] hover:underline"
                    >
                      <Download size={12} /> Download list
                    </button>
                  </div>
                  <ul className="max-h-48 divide-y divide-[#eef2ff] overflow-y-auto">
                    {issues.slice(0, 100).map((i, idx) => (
                      <li key={`${i.row}-${idx}`} className="px-3 py-1.5 text-[11px]">
                        <span className="font-semibold">Row {i.row}</span>
                        <span className="text-[#5b6b86]"> · {i.name} — </span>
                        <span>{i.reason}</span>
                      </li>
                    ))}
                    {issues.length > 100 && (
                      <li className="px-3 py-1.5 text-[11px] text-[#5b6b86]">…and {issues.length - 100} more (download the list)</li>
                    )}
                  </ul>
                </div>
              )}

              {phase === 'saving' && (
                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#eef2ff]">
                    <div
                      className="h-full bg-[#155dfc] transition-all"
                      style={{ width: `${plan.readyCount ? Math.round((progress / plan.readyCount) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-[#5b6b86]">Saving {progress} / {plan.readyCount}…</p>
                </div>
              )}
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 size={32} className="text-[#008236]" />
              <p className="text-sm font-semibold">{result}</p>
              {issues.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadImportIssues(issuesFileName, issues)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#155dfc] hover:underline"
                >
                  <Download size={12} /> Download {issues.length} skipped rows
                </button>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-[#dfe6fb] px-4 py-3">
          {phase === 'preview' && (
            <button type="button" onClick={reset} className="rounded-sm border border-[#dfe6fb] px-3 py-2 text-xs font-semibold hover:bg-[#f5f7ff]">
              Choose another file
            </button>
          )}
          {(phase === 'preview' || phase === 'saving') && (
            <button
              type="button"
              disabled={phase === 'saving' || !plan || plan.readyCount === 0}
              onClick={runImport}
              className="rounded-sm bg-[#155dfc] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1447e6] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === 'saving' ? 'Importing…' : `Import ${plan?.readyCount ?? 0}`}
            </button>
          )}
          {(phase === 'pick' || phase === 'checking' || phase === 'done') && (
            <button type="button" onClick={close} className="rounded-sm border border-[#dfe6fb] px-3 py-2 text-xs font-semibold hover:bg-[#f5f7ff]">
              {phase === 'done' ? 'Done' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ExcelImportModal;
