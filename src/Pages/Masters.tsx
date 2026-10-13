import { Link, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { ROUTES } from '../constants/routes.constants';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import BackButton from '../Components/BackButton';
import ShopHoursSettingPage from './Settings/ShopHoursSetting';
import { ROLES } from '../enums';
import { useAuth } from '../context/auth-context';

const Masters = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [shopHoursOpen, setShopHoursOpen] = useState(false);


  const isDefaultMastersView =
    location.pathname === '/masters' || location.pathname === '/masters/';
  return (
    <div className="flex flex-col h-screen w-full bg-white shadow-lg overflow-hidden font-poppins">
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <BackButton />
        <h1 className="text-2xl font-bold text-gray-800 m-0 flex-grow text-center">Settings</h1>
      </div>
      <div className="flex-grow p-4 overflow-y-auto bg-gray-100">
        {isDefaultMastersView ? (
          <div className="grid grid-cols-2 gap-3">
            <ShowWrapper requiredPermission={Permissions.ManageSalesSetting}>
              <Link to={ROUTES.SALESETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
                <span className="text-lg font-medium">Sales Setting</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ManagePurchaseSetting}>
              <Link to={ROUTES.PURCHASESETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
                <span className="text-lg font-medium">Purchase Setting</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            {currentUser?.role === ROLES.OWNER && (
              <Link to={ROUTES.USERSETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
                <span className="text-lg font-medium">Users (Salesman, Admin)</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            )}
            <ShowWrapper requiredPermission={Permissions.ManageItemSetting}>
              <Link to={ROUTES.ITEMSETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
                <span className="text-lg font-medium">Items Setting</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            {currentUser?.role === ROLES.OWNER && (
              <Link to={ROUTES.PERMSETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
                <span className="text-lg font-medium">Permission Setting</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            )}
            <ShowWrapper requiredPermission={Permissions.ManageBillSetting}>
              <Link to={ROUTES.BILLSETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
                <span className="text-lg font-medium">Bill Setting</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <Link
              to={ROUTES.BARCODE_SETTING}
              className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
            >
              <span className="text-lg font-medium">Barcode / Label Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            {currentUser?.role === ROLES.OWNER && (
              <button
                onClick={() => setShopHoursOpen(true)}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg w-full text-left"
              >
                <span className="text-lg font-medium">Shop Timing</span>
                <span className="text-xl text-gray-500">→</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white p-6 rounded-sm shadow-md mt-6 min-h-[200px] flex justify-center items-center text-gray-500 italic">
            <Outlet />
          </div>
        )}
      </div>
      {/* Shop Hours Modal */}
      {shopHoursOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-sm shadow-xl w-full max-w-md mx-4 relative">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Shop Timing</h2>
              <button
                onClick={() => setShopHoursOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <ShopHoursSettingPage />
          </div>
        </div>
      )}
    </div>
  );
};

export default Masters;