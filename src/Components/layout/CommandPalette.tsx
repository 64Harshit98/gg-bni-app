import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { ArrowRight, Search } from 'lucide-react';

import { Dialog, DialogContent } from '@/Components/ui/dialog';
import { ROUTES } from '../../constants/routes.constants';

interface Destination {
  label: string;
  hint: string;
  to: string;
}

const DESTINATIONS: Destination[] = [
  { label: 'Home', hint: 'Dashboard & sales overview', to: ROUTES.HOME },
  { label: 'Catalogue Home', hint: 'Catalogue dashboard & orders', to: ROUTES.CHOME },
  { label: 'Transactions', hint: 'Journal / billing history', to: ROUTES.JOURNAL },
  { label: 'Account', hint: 'Profile, plans & settings', to: ROUTES.ACCOUNT },
  { label: 'Edit Profile', hint: 'Update business details', to: ROUTES.EDIT_PROFILE },
  { label: 'Add Sales', hint: 'Create a new sale', to: ROUTES.SALES },
  { label: 'Add Purchase', hint: 'Record a purchase', to: ROUTES.PURCHASE },
  { label: 'Add Item', hint: 'Add a new catalogue item', to: ROUTES.ITEM_ADD },
  { label: 'Add User', hint: 'Invite a team member', to: ROUTES.USER_ADD },
  { label: 'Print Barcode', hint: 'Generate item barcodes', to: ROUTES.PRINTQR },
  { label: 'Reports', hint: 'Sales, tax & inventory reports', to: ROUTES.REPORTS },
  { label: 'Settings', hint: 'Taxes, units & preferences', to: ROUTES.MASTERS },
  { label: 'Plans', hint: 'Manage your subscription', to: ROUTES.SUBSCRIPTION_PAGE },
  { label: 'Support', hint: 'Get help from our team', to: ROUTES.SUPPORT_PAGE },
  { label: 'Add-ons', hint: 'Unlock extra features', to: ROUTES.ADDITIONAL_FEATURES },
];

const fuse = new Fuse(DESTINATIONS, { keys: ['label', 'hint'], threshold: 0.35 });

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return DESTINATIONS;
    return fuse.search(query).map((r) => r.item);
  }, [query]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="top-[18%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages & actions…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
            Esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          )}
          {results.map((d) => (
            <button
              key={d.to}
              type="button"
              onClick={() => go(d.to)}
              className="group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <span>
                <span className="block font-medium text-foreground">{d.label}</span>
                <span className="block text-xs text-muted-foreground">{d.hint}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
