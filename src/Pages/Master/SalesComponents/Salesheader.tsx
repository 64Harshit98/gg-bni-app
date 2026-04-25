import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import { CustomButton } from '../../../Components';
import { Variant } from '../../../enums';

interface SalesHeaderProps {
  /** Page title shown in the header, e.g. "Sales" or "Sales Return" */
  title: string;
  /** When true, hides the Sales / Sales Return nav toggle (used in edit mode) */
  hideNav?: boolean;
  // --- Invoice meta (only needed on the Sales page) ---
  invoiceNumber?: string;
  onInvoiceNumberChange?: (value: string) => void;
  invoiceDate?: string;
  onInvoiceDateChange?: (value: string) => void;
}

const SalesHeader: React.FC<SalesHeaderProps> = ({
  title,
  hideNav = false,
  invoiceNumber,
  onInvoiceNumberChange,
  invoiceDate,
  onInvoiceDateChange,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const showInvoiceMeta = invoiceNumber !== undefined || invoiceDate !== undefined;

  const navButtons = !hideNav && (
    <div className="flex items-center justify-center md:justify-end gap-3">
      <CustomButton
        variant={Variant.Transparent}
        onClick={() => navigate(ROUTES.SALES)}
        active={isActive(ROUTES.SALES)}
      >
        Sales
      </CustomButton>
      <CustomButton
        variant={Variant.Transparent}
        onClick={() => navigate(ROUTES.SALES_RETURN)}
        active={isActive(ROUTES.SALES_RETURN)}
      >
        Sales Return
      </CustomButton>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-200 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">

      {/* ── MOBILE ── */}
      {showInvoiceMeta ? (
        <div className="flex md:hidden items-center justify-between w-full mb-2">
          {/* Date — left */}
          <div className="flex flex-col items-center">
            <input
              type="date"
              value={invoiceDate ?? ''}
              onChange={(e) => onInvoiceDateChange?.(e.target.value)}
              className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer"
            />
            <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">DATE</span>
          </div>

          {/* Title — center */}
          <h1 className="text-2xl font-bold text-gray-800 text-center flex-1">{title}</h1>

          {/* Invoice number — right */}
          <div className="flex flex-col items-center">
            <input
              type="text"
              value={invoiceNumber ?? ''}
              onChange={(e) => onInvoiceNumberChange?.(e.target.value)}
              className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
            />
            <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">INV NO</span>
          </div>
        </div>
      ) : (
        // Simple mobile title (Sales Return page)
        <h1 className="flex-1 md:hidden text-2xl font-bold text-gray-800 text-center mb-2 md:mb-0">
          {title}
        </h1>
      )}

      {/* Mobile nav */}
      <div className=" md:hidden justify-center">{navButtons}</div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex md:flex-row md:items-center w-full md:w-auto gap-1 md:gap-4">
        <h1 className="text-2xl font-bold text-gray-800">{title}</h1>

        {showInvoiceMeta && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">INV NO:</span>
              <input
                type="text"
                value={invoiceNumber ?? ''}
                onChange={(e) => onInvoiceNumberChange?.(e.target.value)}
                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">DATE:</span>
              <input
                type="date"
                value={invoiceDate ?? ''}
                onChange={(e) => onInvoiceDateChange?.(e.target.value)}
                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Desktop nav */}
      <div className="hidden md:flex">{navButtons}</div>
    </div>
  );
};

export default SalesHeader;