import { Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { navItems } from '../routes/bottomRoutes'; // Import the Fab component
import { FloatingButton } from '../Components';
import {ROUTES} from '../constants/routes.constants'; // Import ROUTES

const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <main style={{ padding: '1rem', paddingBottom: '60px' }}>
        <Suspense fallback={<div>Loading...</div>}>
          <Outlet />
        </Suspense>
      </main>

      <FloatingButton className=''>
         <Button variant="outline" className="w-full mb-2" onClick={() => navigate(`${ROUTES.MASTERS}/${ROUTES.SALES}`)}>
          Sales
        </Button>
        <Button variant="outline" className="w-full mb-2" onClick={() => navigate(`${ROUTES.MASTERS}/${ROUTES.PURCHASE}`)}>
          Purchase
        </Button>
        <Button variant="outline" className="w-full mb-2" onClick={() => navigate(`${ROUTES.MASTERS}/${ROUTES.ITEM_ADD}`)}>
          Add Item
        </Button>
      </FloatingButton>

      <nav className="fixed bottom-0 left-0 w-full border-t border-slate-200 bg-slate-50">
        <div className="flex justify-around px-4 pt-2 pb-3">
          {navItems.map(({ to, icon, label }) => (
            <Button
              key={to}
              asChild
              variant={location.pathname === to ? 'secondary' : 'ghost'}
              className="flex-1"
            >
              <Link
                to={to}
                className="flex flex-col items-center gap-1 text-xs"
              >
                {icon}
                <span>{label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </nav>
    </>
  );
};

export default MainLayout;
