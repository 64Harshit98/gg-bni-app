import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { navItems } from '../routes/bottomRoutes';

const MainLayout = () => {
  const location = useLocation();

  return (
    <>
      <main style={{ padding: '1rem', paddingBottom: '60px' }}>
        <Suspense fallback={<div>Loading...</div>}>
          <Outlet />
        </Suspense>
      </main>

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
