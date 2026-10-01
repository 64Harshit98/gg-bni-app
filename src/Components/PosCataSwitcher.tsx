import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Store } from 'lucide-react';
import { db } from '../lib/Firebase';
import { IconChevronDown } from '../constants/Icons';
import { SiteItems } from '../routes/SiteRoutes';
import { Permissions } from '../enums';
import { useAuth } from '../context/auth-context';

interface PosCataSwitcherProps {
  // Jis section (layout) ke andar switcher render ho raha hai, wahi label
  // aur highlight decide karega — pathname match pe depend nahi karega,
  // kyunki sub-pages (e.g. /journal) SiteItems me exact match nahi karte.
  current: 'POS' | 'CATALOG';
  /** Desktop sidebar: full width button reading "<Company> · POS". Mobile header leaves this off ("POS" only). */
  showCompany?: boolean;
}

// Sidebar + mobile header both render a switcher — share one Firestore read.
const nameCache: Record<string, string> = {};

const useCompanyName = (enabled: boolean) => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const [name, setName] = useState<string>(companyId ? nameCache[companyId] ?? '' : '');

  useEffect(() => {
    if (!enabled || !companyId) return;
    if (nameCache[companyId]) { setName(nameCache[companyId]); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'companies', companyId, 'business_info', companyId));
        const n = snap.exists() ? String(snap.data().businessName || '') : '';
        if (n) nameCache[companyId] = n;
        if (!cancelled) setName(n);
      } catch { /* keep plain label */ }
    })();
    return () => { cancelled = true; };
  }, [enabled, companyId]);

  return name;
};

const PosCataSwitcher = ({ current, showCompany = false }: PosCataSwitcherProps) => {
  const { currentUser } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const companyName = useCompanyName(showCompany);

  const hasCataloguePermission = currentUser?.permissions?.includes(Permissions.ViewCatalogue);
  const label = showCompany && companyName ? `${companyName} · ${current}` : current;

  return (
    <div className={showCompany ? 'relative block w-full' : 'relative inline-block'}>
      <button
        disabled={!hasCataloguePermission}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        title={label}
        className={`flex h-[34px] items-center justify-between gap-2 whitespace-nowrap rounded-sm border border-[#7a8aa3] px-2.5 text-xs font-medium text-[#0f172b] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc] md:h-10 md:px-3 md:text-sm ${
          showCompany ? 'w-full' : 'min-w-24'
        } ${!hasCataloguePermission ? 'cursor-not-allowed bg-[#f5f7ff] opacity-50' : 'cursor-pointer bg-white hover:bg-[#f5f7ff]'}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Store className="size-4 flex-shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <IconChevronDown width={16} height={16} className={`flex-shrink-0 transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
      </button>
      {isMenuOpen && hasCataloguePermission && (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]">
          <ul className="p-1">
            {SiteItems.map(({ to, label: itemLabel }) => (
              <li key={to}>
                <Link
                  to={to}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium ${
                    itemLabel === current ? 'bg-[#e6eeff] text-[#155dfc]' : 'text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]'
                  }`}
                >
                  {itemLabel}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PosCataSwitcher;