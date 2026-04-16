import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import ShowWrapper from '../../context/ShowWrapper';
import { Permissions } from '../../enums';
import { IconClose } from '../../constants/Icons';

const Reports = () => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col w-full bg-gray-100 overflow-hidden font-poppins">
            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-800 m-0 flex-grow text-center">
                    Item Reports
                </h1>
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <IconClose />
                </button>
            </div>

            <div className="grid grid-cols-2 p-4 gap-2 bg-gray-100 box-border">

                <>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_ITEM_REPORT}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Item Report</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_MANAGE_ITEMS}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-sm mb-2 border border-gray-200 text-gray-800 transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Manage Items</span>
                            <span className="text-xl text-gray-500">→</span>
                        </Link>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_SOLD_REPORT}`}
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
