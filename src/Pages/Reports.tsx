import { Link, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';

const Reports = () => {
  const location = useLocation();

  const isDefaultReportsView =
    location.pathname === '/reports' || location.pathname === '/reports/';

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 shadow-lg overflow-hidden font-poppins">
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-800 m-0 flex-grow text-center">Reports</h1>
      </div>

      <div className="flex grid grid-cols-2 p-4 gap-2 overflow-y-auto bg-gray-100 box-border">
        {isDefaultReportsView ? (
          <>
          <ShowWrapper requiredPermission={Permissions.ViewSalesReport}>
            <Link to={ROUTES.SALES_REPORT} className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Sales Report</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewPurchaseReport}>
            <Link to={ROUTES.PURCHASE_REPORT} className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Purchase Report</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
            <Link to={ROUTES.ITEM_REPORT} className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">Item Report</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
            <Link to={ROUTES.PNL_REPORT} className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline">
              <span className="text-lg font-medium">P&L Report</span>
              <span className="text-xl text-gray-500">→</span>
            </Link>
            </ShowWrapper>
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

export default Reports;