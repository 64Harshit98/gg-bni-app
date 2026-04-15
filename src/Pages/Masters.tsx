import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { IconClose } from '../constants/Icons';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import {
  ShoppingCart,
  ShoppingBag,
  Users,
  Tag,
  ShieldCheck,
  FileText,
} from 'lucide-react';

const Masters = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isDefaultMastersView =
    location.pathname === '/masters' || location.pathname === '/masters/';

  const settingsCards = [
    { to: ROUTES.SALESETTING, label: 'Sales Setting', icon: ShoppingCart },
    {
      to: ROUTES.PURCHASESETTING,
      label: 'Purchase Setting',
      icon: ShoppingBag,
      requiredPermission: Permissions.ViewPurchaseReport,
    },
    {
      to: ROUTES.USERSETTING,
      label: 'Users (Salesman, Admin)',
      icon: Users,
      requiredPermission: Permissions.ViewPurchaseReport,
    },
    {
      to: ROUTES.ITEMSETTING,
      label: 'Items Setting',
      icon: Tag,
      requiredPermission: Permissions.ViewPurchaseReport,
    },
    { to: ROUTES.PERMSETTING, label: 'Permission Setting', icon: ShieldCheck },
    {
      to: ROUTES.BILLSETTING,
      label: 'Bill Setting',
      icon: FileText,
      requiredPermission: Permissions.ViewPurchaseReport,
    },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-white shadow-lg overflow-hidden font-poppins">
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
        >
          <IconClose />
        </button>
        <h1 className="text-2xl font-bold text-gray-800 m-0 flex-grow text-center">Settings</h1>
      </div>

      <div className="flex-grow p-6 overflow-y-auto bg-gray-100 box-border">
        {isDefaultMastersView ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {settingsCards.map((card) => {
              const Icon = card.icon;
              const cardNode = (
                <Link
                  to={card.to}
                  className="flex flex-col items-start justify-between bg-white p-5 rounded-sm shadow-sm border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-md hover:border-sky-200 no-underline min-h-[120px] group"
                >
                  <div className="p-2 bg-sky-50 rounded-sm mb-3">
                    <Icon size={22} strokeWidth={1.5} className="text-sky-500" />
                  </div>
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium text-gray-700">{card.label}</span>
                    <span className="text-sky-400 text-base">→</span>
                  </div>
                </Link>
              );

              if (card.requiredPermission) {
                return (
                  <ShowWrapper key={card.to} requiredPermission={card.requiredPermission}>
                    {cardNode}
                  </ShowWrapper>
                );
              }

              return <div key={card.to}>{cardNode}</div>;
            })}
          </div>
        ) : (
          <div className="bg-white p-6 rounded-sm shadow-md mt-6 min-h-[200px] flex justify-center items-center text-gray-500 italic">
            <Outlet />
          </div>
        )}
      </div>
    </div>
  );
};

export default Masters;
