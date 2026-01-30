import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { IconClose } from '../constants/Icons';

const Masters = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isDefaultMastersView =
    location.pathname === '/masters' || location.pathname === '/masters/';

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
          <>
            <Link to={ROUTES.SALESETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Sales Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            <Link to={ROUTES.PURCHASESETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Purchase Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            <Link to={ROUTES.USERSETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Users (Salesman, Admin)</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            <Link to={ROUTES.ITEMSETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Items Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            <Link to={ROUTES.PERMSETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Permission Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            <Link to={ROUTES.BILLSETTING} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-4 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Bill Setting</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
          </>
        ) : (
          <div className="bg-white p-6 rounded-xl shadow-md mt-6 min-h-[200px] flex justify-center items-center text-gray-500 italic">
            <Outlet />
          </div>
        )}
      </div>
    </div>
  );
};

export default Masters;