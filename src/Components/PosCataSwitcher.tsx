import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronDown } from '../constants/Icons';
import { SiteItems } from '../routes/SiteRoutes';
import { Permissions } from '../enums';
import { useAuth } from '../context/auth-context';

interface PosCataSwitcherProps {
  // Jis section (layout) ke andar switcher render ho raha hai, wahi label
  // aur highlight decide karega — pathname match pe depend nahi karega,
  // kyunki sub-pages (e.g. /journal) SiteItems me exact match nahi karte.
  current: 'POS' | 'CATALOG';
}

const PosCataSwitcher = ({ current }: PosCataSwitcherProps) => {
  const { currentUser } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const hasCataloguePermission = currentUser?.permissions?.includes(Permissions.ViewCatalogue);

  return (
    <div className="relative inline-block">
      <button
        disabled={!hasCataloguePermission}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`flex w-auto min-w-24 md:w-26 items-center justify-between gap-2 whitespace-nowrap rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 transition-colors ${!hasCataloguePermission ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-slate-200 cursor-pointer'}`}
      >
        <span className="font-medium">{current}</span>
        <IconChevronDown width={16} height={16} className={`flex-shrink-0 transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
      </button>
      {isMenuOpen && hasCataloguePermission && (
        <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-300 rounded-md shadow-lg z-50">
          <ul className="py-1">
            {SiteItems.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium ${label === current ? 'bg-gray-500 text-white' : 'text-slate-700 hover:bg-gray-100'}`}
                >
                  {label}
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