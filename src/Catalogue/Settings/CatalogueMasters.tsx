import { Link, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';
//import CataShowWrapper from '../../context/CataShowWrapper';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
import { useAuth } from '../../context/auth-context';
import { ROLES } from '../../enums';
import { useState } from 'react';
import ShopHoursSettingPage from '../../Pages/Settings/ShopHoursSetting';

const CatalogueMasters = () => {
  const location = useLocation();
  const { currentUser } = useAuth();
  const [shopHoursOpen, setShopHoursOpen] = useState(false);

  const isDefaultMastersView =
    location.pathname === '/catalogue-home/cata-masters' || location.pathname === '/catalogue-home/cata-masters/';
  console.log(location.pathname);
  return (
    <div className="flex flex-col h-screen w-full bg-white shadow-lg overflow-hidden font-poppins">
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <BackButton />
        <h1 className="text-2xl font-bold text-gray-800 m-0 flex-grow text-center">Settings</h1>
      </div>
      <div className="flex-grow p-6 overflow-y-auto bg-gray-100 box-border">
        {isDefaultMastersView ? (
          <div className="grid grid-cols-2 gap-3">

            <Link to={`${ROUTES.CHOME}/${ROUTES.CATA_SALE_SETTING}`} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Sales Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>


            <Link to={`${ROUTES.CHOME}/${ROUTES.CATA_BILL_SETTING}`} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Bill Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>


            <Link to={`${ROUTES.CHOME}/${ROUTES.CATA_ITEM_SETTING}`} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Item Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>


            <Link
              to={`${ROUTES.CHOME}/${ROUTES.CATA_USER_SETTING}`}
              className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
            >
              <span className="text-lg font-medium">User Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>


            <Link
              to={`${ROUTES.CHOME}/${ROUTES.CATA_PERMISSION_SETTING}`}
              className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
            >
              <span className="text-lg font-medium">Permission Setting</span>
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
          <div className="bg-white p-6 rounded-xl shadow-md mt-6 min-h-[200px] flex justify-center items-center text-gray-500 italic">
            <Outlet />
          </div>
        )}
      </div>
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
            <ShopHoursSettingPage theme="orange" />
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogueMasters;