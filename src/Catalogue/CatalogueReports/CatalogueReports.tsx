import { Link, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';

const Reports = () => {
    const location = useLocation();
    // Check if the current path is the base reports path
    const isDefaultReportsView =
        location.pathname === `${ROUTES.CHOME}/${ROUTES.CATALOGUE_REPORTS}` || location.pathname === `${ROUTES.REPORTS}/`;

    return (
        <div className="flex flex-col h-screen w-full bg-gray-100 shadow-lg overflow-hidden font-poppins">
            {/* Header (Unchanged) */}
            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
                <BackButton />
                <h1 className="text-2xl font-bold text-gray-900 m-0 flex-grow text-center">Reports</h1>
            </div>

            <div className="grid grid-cols-2 p-4 gap-2 bg-gray-100 box-border">
                {isDefaultReportsView ? (
                    <>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_SALES}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Sales Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>

                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_CUSTOMER_REPORT}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Customer Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>

                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_PNL_REPORT}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Profit & Loss Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>

                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_ITEMS}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Item Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_PARTY_LEDGER}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Party Ledger</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_EXPENSE_REPORT}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Expense Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>

                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_STOCK_TRANSFER}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Stock Transfer Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>

                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-400 cursor-not-allowed relative overflow-hidden">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                                    Coming Soon
                                </span>
                                <span className="text-lg font-medium">User Report</span>
                            </div>
                            <span className="text-xl text-gray-300">→</span>
                        </div>

                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-400 cursor-not-allowed relative overflow-hidden">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                                    Coming Soon
                                </span>
                                <span className="text-lg font-medium">Tax Report</span>
                            </div>
                            <span className="text-xl text-gray-300">→</span>
                        </div>

                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-400 cursor-not-allowed relative overflow-hidden">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                                    Coming Soon
                                </span>
                                <span className="text-lg font-medium">Restock Report</span>
                            </div>
                            <span className="text-xl text-gray-300">→</span>
                        </div>
                    </>
                ) : (
                    <div className="bg-white p-2 md:p-6 rounded-sm shadow-md min-h-[200px]">
                        <Outlet />
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;