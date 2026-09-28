import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';

import { ROUTES } from '../../constants/routes.constants';

export interface Destination {
  label: string;
  hint: string;
  to: string;
  keywords?: string; // extra search words (optional)
}

// If TypeScript says a ROUTES key doesn't exist, just delete that line.
export const DESTINATIONS: Destination[] = [
  // --- Main ---
  { label: 'Home', hint: 'Dashboard & sales overview', to: ROUTES.HOME, keywords: 'dashboard' },
  { label: 'Transactions', hint: 'Journal / billing history', to: ROUTES.JOURNAL, keywords: 'journal bills history' },
  { label: 'Account', hint: 'Profile, plans & settings', to: ROUTES.ACCOUNT, keywords: 'profile' },
  { label: 'Edit Profile', hint: 'Update your business profile', to: ROUTES.EDIT_PROFILE, keywords: 'account business' },

  // --- Create / Entry ---
  { label: 'Add Sales', hint: 'Create a new sale', to: ROUTES.SALES, keywords: 'sale bill invoice' },
  { label: 'Sales Return', hint: 'Return items sold to customer', to: ROUTES.SALES_RETURN, keywords: 'return credit note' },
  { label: 'Add Purchase', hint: 'Record a purchase', to: ROUTES.PURCHASE, keywords: 'buy supplier' },
  { label: 'Purchase Return', hint: 'Return items to supplier', to: ROUTES.PURCHASE_RETURN, keywords: 'return debit note' },
  { label: 'Print Barcode', hint: 'Generate item barcodes', to: ROUTES.PRINTQR, keywords: 'qr label' },

  // --- Items & Users ---
  { label: 'Add Item', hint: 'Add a new catalogue item', to: ROUTES.ITEM_ADD, keywords: 'product' },
  { label: 'Item Group', hint: 'Manage item groups', to: ROUTES.ITEM_GROUP, keywords: 'category' },
  { label: 'Manage Items', hint: 'Edit or delete items', to: ROUTES.MANAGE_ITEMS, keywords: 'products stock' },
  { label: 'Add User', hint: 'Invite a team member', to: ROUTES.USER_ADD, keywords: 'staff employee' },

  // --- Reports ---
  { label: 'Reports', hint: 'Sales, tax & inventory reports', to: ROUTES.REPORTS },
  { label: 'Item Report', hint: 'Item wise report', to: ROUTES.ITEM_REPORT },
  { label: 'Items Report', hint: 'All items & stock', to: ROUTES.ITEM_REPORTS, keywords: 'stock inventory' },
  { label: 'Sales Report', hint: 'Sales summary & details', to: ROUTES.SALES_REPORT },
  { label: 'Purchase Report', hint: 'Purchase summary & details', to: ROUTES.PURCHASE_REPORT },
  { label: 'Profit & Loss Report', hint: 'PNL report', to: ROUTES.PNL_REPORT, keywords: 'pnl profit loss' },
  { label: 'Restock Report', hint: 'Low stock items', to: ROUTES.RESTOCK_REPORT, keywords: 'low stock' },
  { label: 'Tax Report', hint: 'GST / tax summary', to: ROUTES.TAX_REPORT, keywords: 'gst' },
  { label: 'Customer Report', hint: 'Customer wise report', to: ROUTES.CUSTOMER_REPORT, keywords: 'party' },
  { label: 'Party Ledger', hint: 'Customer / supplier ledger', to: ROUTES.PARTY_LEDGER, keywords: 'khata udhaar' },
  { label: 'Galla Hisaab', hint: 'Daily cash hisaab tool', to: ROUTES.GALLA_HISAAB_TOOL, keywords: 'cash counter' },
  { label: 'Item Sold Report', hint: 'Items sold details', to: ROUTES.ITEM_SOLD_REPORT },
  { label: 'User Report', hint: 'User wise sales report', to: ROUTES.USER_REPORT, keywords: 'staff' },
  { label: 'Expense Report', hint: 'Expenses summary', to: ROUTES.EXPENSE_REPORT },
  { label: 'Stock Transfer Report', hint: 'Stock transfer history', to: ROUTES.STOCK_TRANSFER },

  // --- Settings ---
  { label: 'Settings', hint: 'Taxes, units & preferences', to: ROUTES.MASTERS, keywords: 'masters' },
  { label: 'Permission Settings', hint: 'User roles & permissions', to: ROUTES.PERMSETTING, keywords: 'roles access' },
  { label: 'Sales Settings', hint: 'Sales preferences', to: ROUTES.SALESETTING },
  { label: 'Purchase Settings', hint: 'Purchase preferences', to: ROUTES.PURCHASESETTING },
  { label: 'User Settings', hint: 'Manage users', to: ROUTES.USERSETTING },
  { label: 'Item Settings', hint: 'Item preferences', to: ROUTES.ITEMSETTING },
  { label: 'Bill Settings', hint: 'Invoice / bill format', to: ROUTES.BILLSETTING, keywords: 'invoice print' },
  { label: 'Barcode Settings', hint: 'Barcode label settings', to: ROUTES.BARCODE_SETTING },

  // --- Others ---
  { label: 'Plans', hint: 'Manage your subscription', to: ROUTES.SUBSCRIPTION_PAGE, keywords: 'subscription upgrade' },
  { label: 'Support', hint: 'Get help from our team', to: ROUTES.SUPPORT_PAGE, keywords: 'help ticket' },
  { label: 'Add-ons', hint: 'Unlock extra features', to: ROUTES.ADDITIONAL_FEATURES, keywords: 'additional services' },
  { label: 'WhatsApp', hint: 'WhatsApp messaging service', to: ROUTES.WHATSAPP_LANDING, keywords: 'message' },
  { label: 'WhatsApp Message Log', hint: 'Sent message history', to: ROUTES.WHATSAPP_MESSAGE_LOG },
];

const C = ROUTES.CHOME;

export const CATALOGUE_DESTINATIONS: Destination[] = [
  { label: 'Catalogue Home', hint: 'Catalogue dashboard', to: C, keywords: 'dashboard' },
  { label: 'Accounts', hint: 'Catalogue account & plans', to: ROUTES.CATALOGUE_ACCOUNTS, keywords: 'profile' },
  { label: 'Edit Profile', hint: 'Update store profile', to: `${C}/${ROUTES.CATA_EDIT}` },
  { label: 'Orders', hint: 'Order details', to: ROUTES.ORDERDETAILS },
  { label: 'Requests', hint: 'Customer requests', to: `${C}/${ROUTES.CATA_REQUEST}` },
  { label: 'Shop', hint: 'Browse shop & place order', to: `${C}/${ROUTES.ORDER}` },
  { label: 'Orders Return', hint: 'Returned orders', to: `${C}/${ROUTES.ORDER_RETURN}` },
  { label: 'Add Product', hint: 'Add a new product', to: `${C}/${ROUTES.ADD_PRODUCT}`, keywords: 'item' },
  { label: 'Item Group', hint: 'Manage item groups', to: `${C}/${ROUTES.CAT_ITEM_GROUP}`, keywords: 'category' },
  { label: 'Manage Items', hint: 'Edit or delete items', to: `${C}/${ROUTES.CATALOGUE_MANAGE_ITEMS}` },

  { label: 'Reports', hint: 'All catalogue reports', to: `${C}/${ROUTES.CATALOGUE_REPORTS}` },
  { label: 'Items', hint: 'Items & stock', to: `${C}/${ROUTES.CATALOGUE_ITEMS}`, keywords: 'stock' },
  { label: 'Item Report', hint: 'Item wise report', to: `${C}/${ROUTES.CATALOGUE_ITEM_REPORT}` },
  { label: 'Sales Report', hint: 'Sales summary', to: `${C}/${ROUTES.CATALOGUE_SALES}` },
  { label: 'Profit & Loss Report', hint: 'PNL report', to: `${C}/${ROUTES.CATALOGUE_PNL_REPORT}`, keywords: 'pnl' },
  { label: 'Customer Report', hint: 'Customer wise report', to: `${C}/${ROUTES.CATALOGUE_CUSTOMER_REPORT}` },
  { label: 'User Report', hint: 'User wise report', to: `${C}/${ROUTES.CATALOGUE_USER_REPORT}` },
  { label: 'Tax Report', hint: 'GST / tax summary', to: `${C}/${ROUTES.CATALOGUE_TAX_REPORT}`, keywords: 'gst' },
  { label: 'Party Ledger', hint: 'Customer ledger', to: `${C}/${ROUTES.CATALOGUE_PARTY_LEDGER}`, keywords: 'khata' },
  { label: 'Item Sold Report', hint: 'Items sold details', to: `${C}/${ROUTES.CATALOGUE_SOLD_REPORT}` },
  { label: 'Expense Report', hint: 'Expenses summary', to: `${C}/${ROUTES.CATALOGUE_EXPENSE_REPORT}` },
  { label: 'Stock Transfer Report', hint: 'Stock transfer history', to: `${C}/${ROUTES.CATALOGUE_STOCK_TRANSFER}` },

  { label: 'Settings', hint: 'Catalogue masters', to: `${C}/${ROUTES.CATA_MASTERS}`, keywords: 'masters' },
  { label: 'Sales Settings', hint: 'Sales preferences', to: `${C}/${ROUTES.CATA_SALE_SETTING}` },
  { label: 'Bill Settings', hint: 'Invoice format', to: `${C}/${ROUTES.CATA_BILL_SETTING}` },
  { label: 'Item Settings', hint: 'Item preferences', to: `${C}/${ROUTES.CATA_ITEM_SETTING}` },
  { label: 'User Settings', hint: 'Manage users', to: `${C}/${ROUTES.CATA_USER_SETTING}` },
  { label: 'Permission Settings', hint: 'Roles & permissions', to: `${C}/${ROUTES.CATA_PERMISSION_SETTING}` },

  { label: 'Support', hint: 'Get help from our team', to: `${C}/${ROUTES.CATA_SUPPORT}`, keywords: 'help' },
  { label: 'Add-ons', hint: 'Additional services', to: `${C}/${ROUTES.CATA_ADDITIONAL_SERVICES}` },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** @deprecated Ignored. List is auto-picked from the current URL. Kept so existing callers don't break. */
  destinations?: Destination[];
}

const abs = (p: string) => (p.startsWith('/') ? p : `/${p}`);

// Catalogue area = anything under CHOME, plus Orders & Accounts pages of catalogue
const isCataloguePath = (pathname: string) => {
  const p = pathname.toLowerCase();
  const roots = [ROUTES.CHOME, ROUTES.ORDERDETAILS, ROUTES.CATALOGUE_ACCOUNTS]
    .filter(Boolean)
    .map((r) => abs(r).toLowerCase());
  return roots.some((r) => p === r || p.startsWith(`${r}/`));
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Path decides the list: Catalogue pages -> CATALOGUE_DESTINATIONS, else POS.
  // (The old `destinations` prop passed by the Catalogue header is intentionally ignored.)
  const activeDestinations = useMemo(
    () => (isCataloguePath(pathname) ? CATALOGUE_DESTINATIONS : DESTINATIONS),
    [pathname]
  );

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeDestinations;
    return activeDestinations.filter((d) =>
      `${d.label} ${d.hint} ${d.keywords ?? ''}`.toLowerCase().includes(q)
    );
  }, [query, activeDestinations]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(abs(to));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center px-4 pt-[15vh]">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-sm border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) go(results[0].to);
            }}
            placeholder="Search pages & actions…"
            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:block">
            Esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No matches.</p>}
          {results.map((d) => (
            <button
              key={d.to + d.label}
              type="button"
              onClick={() => go(d.to)}
              className="group flex w-full items-center justify-between rounded-sm px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-100"
            >
              <span>
                <span className="block font-medium text-slate-800">{d.label}</span>
                <span className="block text-xs text-slate-500">{d.hint}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}