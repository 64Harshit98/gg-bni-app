import React from 'react';
import type { PurchaseData, Party } from '../../../services/purchase/purchaseReturn.service';
import { formatCurrency } from '../../../utils/formatters';

interface PurchaseReturnVendorSectionProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  isDropdownOpen: boolean;
  onDropdownOpenChange: (open: boolean) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  filteredList: PurchaseData[];
  selectedPurchase: PurchaseData | null;
  onSelectPurchase: (purchase: PurchaseData) => void;
  onClear: () => void;

  returnDate: string;
  onReturnDateChange: (value: string) => void;

  supplierName: string;
  onSupplierNameChange: (value: string) => void;
  isNameDropdownOpen: boolean;
  onNameDropdownOpenChange: (open: boolean) => void;
  nameDropdownRef: React.RefObject<HTMLDivElement | null>;
  filteredPartiesByName: Party[];

  supplierNumber: string;
  onSupplierNumberChange: (value: string) => void;
  isPartyDropdownOpen: boolean;
  onPartyDropdownOpenChange: (open: boolean) => void;
  partyDropdownRef: React.RefObject<HTMLDivElement | null>;
  filteredPartiesByNumber: Party[];

  onSelectParty: (party: Party) => void;
}

/**
 * Original-purchase search + supplier/party detail fields for the Purchase
 * Return page. Extracted verbatim (styling reskinned onto design tokens)
 * from `PurchaseReturn.tsx`'s inline search/details JSX; the party-number
 * sanitization and dropdown-toggle logic stays in the parent page, this
 * component only renders and forwards raw input events.
 */
export const PurchaseReturnVendorSection: React.FC<PurchaseReturnVendorSectionProps> = ({
  searchQuery,
  onSearchQueryChange,
  isDropdownOpen,
  onDropdownOpenChange,
  dropdownRef,
  filteredList,
  selectedPurchase,
  onSelectPurchase,
  onClear,
  returnDate,
  onReturnDateChange,
  supplierName,
  onSupplierNameChange,
  isNameDropdownOpen,
  onNameDropdownOpenChange,
  nameDropdownRef,
  filteredPartiesByName,
  supplierNumber,
  onSupplierNumberChange,
  isPartyDropdownOpen,
  onPartyDropdownOpenChange,
  partyDropdownRef,
  filteredPartiesByNumber,
  onSelectParty,
}) => {
  return (
    <>
      {/* Search Original Purchase */}
      <div className="mb-4 rounded-xl border border-border bg-card p-2 shadow-sm">
        <div className="relative" ref={dropdownRef}>
          <label htmlFor="search-purchase" className="mb-1 block text-sm font-medium text-foreground">Search Original Purchase</label>
          <div className="flex gap-2">
            <input
              type="text" id="search-purchase" value={searchQuery}
              onChange={(e) => { onSearchQueryChange(e.target.value); onDropdownOpenChange(true); }}
              onFocus={() => onDropdownOpenChange(true)}
              placeholder={selectedPurchase ? `${selectedPurchase.partyName} (${selectedPurchase.invoiceNumber})` : "Supplier or Invoice..."}
              className="flex-grow rounded-lg border border-border p-2 outline-none focus:ring-2 focus:ring-ring" autoComplete="off" readOnly={!!selectedPurchase}
            />
            {selectedPurchase && (
              <button onClick={onClear} className="rounded-lg bg-muted px-3 py-2 font-semibold text-foreground hover:bg-accent">
                Clear
              </button>
            )}
          </div>
          {isDropdownOpen && !selectedPurchase && (
            <div className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
              {filteredList.map(item => (
                <div key={item.id} className="cursor-pointer border-b border-border p-3 last:border-0 hover:bg-muted" onClick={() => onSelectPurchase(item)}>
                  <p className="text-sm font-semibold">{item.partyName} <span className="font-normal text-muted-foreground">({item.invoiceNumber})</span></p>
                  <p className="text-xs text-muted-foreground">Amount: {formatCurrency(item.totalAmount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPurchase && (
        <div className="mb-4 rounded-xl border border-border bg-card p-2 shadow-sm">
          <div className="mb-4 space-y-3">
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground">Date</label>
                <input type="date" value={returnDate} onChange={(e) => onReturnDateChange(e.target.value)} className="w-full border-b border-border p-1 text-sm outline-none focus:border-primary" />
              </div>

              {/* PARTY NAME DROPDOWN */}
              <div className="relative" ref={nameDropdownRef}>
                <label className="block text-xs font-bold uppercase text-muted-foreground">Party Name</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => { onSupplierNameChange(e.target.value); onNameDropdownOpenChange(true); }}
                  onFocus={() => onNameDropdownOpenChange(true)}
                  className="w-full border-b border-border p-1 text-sm outline-none focus:border-primary"
                  autoComplete="off"
                  placeholder="Search by name..."
                />
                {isNameDropdownOpen && filteredPartiesByName.length > 0 && (
                  <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                    {filteredPartiesByName.map((party) => (
                      <div
                        key={party.id}
                        className="cursor-pointer border-b p-2 last:border-0 hover:bg-muted"
                        onClick={() => onSelectParty(party)}
                      >
                        <p className="text-sm font-semibold text-foreground">{party.name}</p>
                        <p className="text-xs text-muted-foreground">{party.number}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* PARTY NUMBER DROPDOWN */}
            <div className="relative" ref={partyDropdownRef}>
              <label className="block text-xs font-bold uppercase text-muted-foreground">Party Number</label>
              <input
                type="text"
                value={supplierNumber}
                maxLength={10}
                onChange={(e) => { onSupplierNumberChange(e.target.value); onPartyDropdownOpenChange(true); }}
                onFocus={() => onPartyDropdownOpenChange(true)}
                className="w-full border-b border-border p-1 text-sm outline-none focus:border-primary"
                autoComplete="off"
                placeholder="Search party by number or name..."
              />
              {isPartyDropdownOpen && filteredPartiesByNumber.length > 0 && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                  {filteredPartiesByNumber.map((party) => (
                    <div
                      key={party.id}
                      className="cursor-pointer border-b p-2 last:border-0 hover:bg-muted"
                      onClick={() => onSelectParty(party)}
                    >
                      <p className="text-sm font-semibold text-foreground">{party.name}</p>
                      <p className="text-xs text-muted-foreground">{party.number}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
