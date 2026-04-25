import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import { CustomButton } from '../../../Components';
import { Variant } from '../../../enums';

interface PurchaseHeaderProps {
  /** Page title shown in the header */
  title: string;

  /** Whether to show the invoice number + date inputs (Purchase page only) */
  showInvoiceControls?: boolean;

  invoiceNumber?: string;
  onInvoiceNumberChange?: (value: string) => void;

  invoiceDate?: string;
  onInvoiceDateChange?: (value: string) => void;

  hideNavButtons?: boolean;
}

const PurchaseHeader: React.FC<PurchaseHeaderProps> = ({
  title,
  showInvoiceControls = false,
  invoiceNumber = '',
  onInvoiceNumberChange,
  invoiceDate = '',
  onInvoiceDateChange,
  hideNavButtons = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const NavButtons = () => (
    <div className="flex items-center justify-center md:justify-end gap-3">
      <CustomButton
        variant={Variant.Transparent}
        onClick={() => navigate(ROUTES.PURCHASE)}
        active={isActive(ROUTES.PURCHASE)}
      >
        Purchase
      </CustomButton>
      <CustomButton
        variant={Variant.Transparent}
        onClick={() => navigate(ROUTES.PURCHASE_RETURN)}
        active={isActive(ROUTES.PURCHASE_RETURN)}
      >
        Purchase Return
      </CustomButton>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-200 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">

      {/* ── MOBILE ─────────────────────────────────────────────────────────── */}
      <div className="flex md:hidden items-center justify-between w-full mb-2">
        {showInvoiceControls ? (
          <>
            {/* Date — left */}
            <div className="flex flex-col items-center">
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => onInvoiceDateChange?.(e.target.value)}
                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer"
              />
              <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">DATE</span>
            </div>

            {/* Title — centre */}
            <h1 className="text-2xl font-bold text-gray-800 text-center flex-1">{title}</h1>

            {/* Invoice number — right */}
            <div className="flex flex-col items-center">
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => onInvoiceNumberChange?.(e.target.value)}
                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
              />
              <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">INV NO</span>
            </div>
          </>
        ) : (
          /* No invoice controls — just a centred title */
          <h1 className="text-2xl font-bold text-gray-800 text-center w-full">{title}</h1>
        )}
      </div>

      {/* Mobile nav buttons (below the title row) */}
      {!hideNavButtons && (
        <div className=" md:hidden justify-center mb-1">
          <NavButtons />
        </div>
      )}

      {/* ── DESKTOP ────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex md:flex-row md:items-center w-full md:w-auto gap-1 md:gap-4">
        <h1 className="text-2xl font-bold text-gray-800">{title}</h1>

        {showInvoiceControls && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">INV NO:</span>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => onInvoiceNumberChange?.(e.target.value)}
                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">DATE:</span>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => onInvoiceDateChange?.(e.target.value)}
                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Desktop nav buttons */}
      {!hideNavButtons && (
        <div className="hidden md:flex">
          <NavButtons />
        </div>
      )}
    </div>
  );
};

export default PurchaseHeader;