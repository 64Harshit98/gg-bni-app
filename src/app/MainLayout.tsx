import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { navItems } from '../routes/bottomRoutes';
import { FloatingButton } from '../Components/FloatingButton';
import { ROUTES } from '../constants/routes.constants';
import { useNavigate } from 'react-router-dom';
import { Permissions } from '../enums';
import ShowWrapper from '../context/ShowWrapper';

const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-gray-100">

      <main className="flex-1 min-h-0 overflow-y-auto p-4">
        <Suspense fallback={<div>Loading...</div>}>
          <Outlet />
        </Suspense>
      </main>

      <FloatingButton className="">
        <Button
          variant="outline"
          className="w-full mb-2 rounded"
          onClick={() => navigate(`${ROUTES.SALES}`)}
        >
          Add Sales
        </Button>
        <ShowWrapper
          requiredPermission={Permissions.ViewTransactions}
        >
          <Button
            variant="outline"
            className="w-full mb-2 rounded"
            onClick={() => navigate(`${ROUTES.PURCHASE}`)}
          >
            Add Purchase
          </Button>
        </ShowWrapper>
        <ShowWrapper
          requiredPermission={Permissions.ViewTransactions}>
          <Button
            variant="outline"
            className="w-full mb-2 rounded"
            onClick={() => navigate(`${ROUTES.ITEM_ADD}`)}
          >
            Add Item
          </Button>
        </ShowWrapper>
        <ShowWrapper
          requiredPermission={Permissions.PrintQR}
        >
          <Button
            variant="outline"
            className="w-full mb-2 rounded"
            onClick={() => navigate(`${ROUTES.PRINTQR}`)}
          >
            Add Barcode
          </Button>
        </ShowWrapper>
        <ShowWrapper
          requiredPermission={Permissions.ViewPNLReport}
        >
          <Button
            variant="outline"
            className="w-full mb-2 rounded"
            onClick={() => navigate(`${ROUTES.USER_ADD}`)}
          >
            Add User
          </Button>
        </ShowWrapper>
      </FloatingButton>

      <nav className="fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white">
        <div className="flex justify-around items-center gap-4 px-4 pt-2 pb-3">
          {navItems.map(({ to, icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-row items-center justify-center gap-1 py-2 rounded-sm text-sm transition-colors border border-[rgba(0,0,0,0.15)] duration-200 ${location.pathname === to ? 'bg-sky-500 text-white' : 'text-black-500 hover:bg-gray-100'}`}
            >
              <div>{icon}</div>
              <span className="font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default MainLayout;
