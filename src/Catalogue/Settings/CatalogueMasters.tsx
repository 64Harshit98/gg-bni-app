import { Link, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';
//import CataShowWrapper from '../../context/CataShowWrapper';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';

const CatalogueMasters = () => {
  const location = useLocation();

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


            <div
              className="flex justify-between items-center bg-gray-50 p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-400 cursor-not-allowed relative overflow-hidden"
            >
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                  Coming Soon
                </span>
                <span className="text-lg font-medium">Permission Setting</span>
              </div>

              {/* Optional: Keep the arrow but make it look disabled, or remove it */}
              <span className="text-xl text-gray-300">→</span>
            </div>

          </div>
        ) : (
          <div className="bg-white p-6 rounded-xl shadow-md mt-6 min-h-[200px] flex justify-center items-center text-gray-500 italic">
            <Outlet />
          </div>
        )}
      </div>
    </div>
  );
};

export default CatalogueMasters;