import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import ShowWrapper from '../../context/ShowWrapper';
import { Permissions } from '../../enums';

const Reports = () => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col w-full bg-gray-100 overflow-hidden font-poppins">
            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
                <button
                        onClick={() => navigate(-1)}
                        className="mt-1 flex items-center justify-center p-4 rounded-full bg-gray-200 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-all"
                        title="Go Back"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 5l-7 7 7 7" />
                        </svg>
                </button>
                <h1 className="text-2xl font-bold text-gray-800 m-0 flex-grow text-center">
                    Item Reports
                </h1>
            </div>

            <div className="grid grid-cols-2 p-4 gap-2 bg-gray-100 box-border">

                <>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={ROUTES.ITEM_REPORT}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Item Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={ROUTES.MANAGE_ITEMS}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Manage Items</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={ROUTES.ITEM_SOLD_REPORT}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Item Sold Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>
                    </ShowWrapper>
                </>
            </div>
        </div>
    );
};

export default Reports;
