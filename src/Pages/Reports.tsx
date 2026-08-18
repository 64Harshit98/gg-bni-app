import { Link, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import BackButton from '../Components/BackButton';

const Reports = () => {
  const location = useLocation();
  const isDefaultReportsView =
    location.pathname === '/reports' || location.pathname === '/reports/';

  return (
    <div className="flex flex-col w-full bg-gray-100 overflow-hidden font-poppins">
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <BackButton />
        <h1 className="text-2xl font-bold text-gray-800 m-0 flex-grow text-center">
          Reports
        </h1>
      </div>

      <div className="grid grid-cols-2 p-4 gap-2 bg-gray-100 box-border">
        {isDefaultReportsView ? (
          <>
            <ShowWrapper requiredPermission={Permissions.ViewSalesReport}>
              <Link
                to={ROUTES.SALES_REPORT}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">Sales Report</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewPurchaseReport}>
              <Link
                to={ROUTES.PURCHASE_REPORT}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">Purchase Report</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
              <Link
                to={ROUTES.ITEM_REPORTS}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">Item Reports</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <Link
                to={ROUTES.PNL_REPORT}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">P&L Report</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewExpenseReport}>
              <Link
                to={ROUTES.EXPENSE_REPORT}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">Expense Report</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewStockTransferReport}>
              <Link
                to={ROUTES.STOCK_TRANSFER}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">Stock Transfer Report</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewCustomerReport}>
              <Link
                to={ROUTES.CUSTOMER_REPORT}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">Customer Report</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewPartyLedger}>
              <Link
                to={ROUTES.PARTY_LEDGER}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">Party Ledger</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewTaxReport}>
              <Link
                to={ROUTES.TAX_REPORT}
                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
              >
                <span className="text-lg font-medium">Tax Report</span>
                <span className="text-xl text-gray-500">→</span>
              </Link>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <div
                className="flex justify-between items-center bg-gray-50 p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-400 cursor-not-allowed relative overflow-hidden"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                    Coming Soon
                  </span>
                  <span className="text-lg font-medium">User Report</span>
                </div>

                {/* Optional: Keep the arrow but make it look disabled, or remove it */}
                <span className="text-xl text-gray-300">→</span>
              </div>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <div
                className="flex justify-between items-center bg-gray-50 p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-400 cursor-not-allowed relative overflow-hidden"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                    Coming Soon
                  </span>
                  <span className="text-lg font-medium">Restock Report</span>
                </div>

                {/* Optional: Keep the arrow but make it look disabled, or remove it */}
                <span className="text-xl text-gray-300">→</span>
              </div>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <div
                className="flex justify-between items-center bg-gray-50 p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-400 cursor-not-allowed relative overflow-hidden"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                    Coming Soon
                  </span>
                  <span className="text-lg font-medium">Galla Hisaab Tool</span>
                </div>

                {/* Optional: Keep the arrow but make it look disabled, or remove it */}
                <span className="text-xl text-gray-300">→</span>
              </div>
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
