import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface PurchaseHeaderProps {
  title: string;
  invoiceNumber: string;
  onInvoiceNumberChange: (value: string) => void;
  invoiceDate: string;
  onInvoiceDateChange: (value: string) => void;
}

/**
 * Glass sticky header for the Purchase entry page: mobile layout keeps the
 * original date-left / title-center / invoice-number-right arrangement,
 * desktop shows a gradient icon badge + gradient title beside the inline
 * invoice-number/date fields. Extracted verbatim (styling reskinned onto
 * design tokens) from `Purchase.tsx`'s `renderHeader` function.
 */
export const PurchaseHeader: React.FC<PurchaseHeaderProps> = ({
  title,
  invoiceNumber,
  onInvoiceNumberChange,
  invoiceDate,
  onInvoiceDateChange,
}) => {
  return (
    <div className="glass sticky top-0 z-[100] mx-2 mt-2 flex flex-shrink-0 flex-col gap-2 rounded-2xl p-3 shadow-sm md:mx-3 md:mt-3 md:flex-row md:items-center md:justify-between md:gap-4">
      {/* MOBILE: date left, title center, inv no right */}
      <div className="flex w-full items-center justify-between md:hidden">
        <div className="flex flex-col items-center">
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => onInvoiceDateChange(e.target.value)}
            className="w-25 cursor-pointer border-b border-border bg-transparent text-center text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
          />
          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Date</span>
        </div>
        <h1 className="flex-1 text-center text-xl font-bold text-foreground">
          <span className="text-gradient">{title}</span>
        </h1>
        <div className="flex flex-col items-center">
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => onInvoiceNumberChange(e.target.value)}
            className="w-24 border-b border-border bg-transparent text-center text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
          />
          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Inv No</span>
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden items-center gap-3 md:flex">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/25">
          <ShoppingCart className="size-5" />
        </span>
        <h1 className="text-xl font-bold text-foreground">
          <span className="text-gradient">{title}</span>
        </h1>
      </div>
      <div className="hidden items-center gap-4 md:flex">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inv No:</span>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => onInvoiceNumberChange(e.target.value)}
            className="w-24 border-b border-border bg-transparent text-center text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date:</span>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => onInvoiceDateChange(e.target.value)}
            className="w-25 cursor-pointer border-b border-border bg-transparent text-center text-sm font-bold text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>
      </div>
    </div>
  );
};
