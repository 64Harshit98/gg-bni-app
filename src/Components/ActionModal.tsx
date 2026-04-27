import React from 'react';
import { IconDownload, IconPrint, IconScanCircle } from '../constants/Icons';
import { FiSend } from 'react-icons/fi';
import { Spinner } from '../constants/Spinner';
import { BillTypeToggle } from './BillTypeToggle';
import type { BillType } from '../Catalogue/hooks/usePdfAction';

export interface ActionModalAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'whatsapp' | 'download' | 'print' | 'qr' | 'custom';
  disabled?: boolean;
  loading?: boolean;
}

interface ActionModalProps {
  
  /** Body copy shown below the bill-type toggle. */
  description?: string;
  /** Current bill type (estimate / bill). */
  billType: BillType;
  onBillTypeChange: (v: BillType) => void;
  /** Action buttons to render. */
  actions: ActionModalAction[];
  onClose: () => void;
}

const variantStyles: Record<string, string> = {
  whatsapp: 'bg-[#25D366] text-white font-bold',
  download: 'bg-blue-600 text-white ',
  print: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
  qr: 'bg-gray-900 text-white hover:bg-gray-800',
  custom: 'bg-slate-600 text-white hover:bg-slate-700',
};

/**
 * Generic action-selection modal (Print / Download / WhatsApp / QR).
 * Composes BillTypeToggle and maps action descriptors to styled buttons.
 *
 * Used in Journal (invoice actions) and OrdersPage (order actions).
 *
 * Usage:
 * ```tsx
 * {pdf.pendingActionItem && (
 *   <ActionModal
 *     billType={pdf.billType}
 *     onBillTypeChange={pdf.setBillType}
 *     actions={[
 *       { label: 'Download PDF', variant: 'download', icon: <IconDownload />, onClick: handleDownload },
 *       { label: 'Print', variant: 'print', icon: <IconPrint />, onClick: handlePrint },
 *     ]}
 *     onClose={pdf.closeActionModal}
 *   />
 * )}
 * ```
 */
export const ActionModal: React.FC<ActionModalProps> = ({
  description,
  billType,
  onBillTypeChange,
  actions,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-sm p-6 w-full max-w-sm mx-4 shadow-xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Bill type toggle */}
        <BillTypeToggle value={billType} onChange={onBillTypeChange} className="mb-4" />

        {description && false && (
          <p className="text-gray-600 mb-6 text-sm">{description}</p>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
              className={`w-full py-2.5 px-4 rounded-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                variantStyles[action.variant ?? 'custom']
              }`}
            >
              {action.loading ? <Spinner /> : action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Re-export icons for convenience when composing action arrays
export { FiSend, IconDownload, IconPrint, IconScanCircle };
