import { Link } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import ShowWrapper from '../../context/ShowWrapper';
import { Permissions } from '../../enums';
import BackButton from '../../Components/BackButton';

const Reports = () => {

    return (
        <div className="flex flex-col w-full bg-muted overflow-hidden font-poppins">
            <div className="flex items-center justify-between p-4 bg-card border-b border-border shadow-sm flex-shrink-0">
                <BackButton/>
                <h1 className="text-2xl font-bold text-foreground m-0 flex-grow text-center">
                    Item Reports
                </h1>
            </div>

            <div className="grid grid-cols-2 p-4 gap-2 bg-muted box-border">

                <>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_ITEM_REPORT}`}
                            className="flex justify-between items-center bg-card p-4 rounded-sm shadow-sm mb-2 border border-border text-foreground transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Item Report</span>
                            <span className="text-xl text-muted-foreground">→</span>
                        </Link>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_MANAGE_ITEMS}`}
                            className="flex justify-between items-center bg-card p-4 rounded-sm shadow-sm mb-2 border border-border text-foreground transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Manage Items</span>
                            <span className="text-xl text-muted-foreground">→</span>
                        </Link>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_SOLD_REPORT}`}
                            className="flex justify-between items-center bg-card p-4 rounded-sm shadow-sm mb-2 border border-border text-foreground transition-all duration-200 ease-in-out hover:transform hover:-translate-y-0.5 hover:shadow-lg no-underline"
                        >
                            <span className="text-lg font-medium">Item Sold Report</span>
                            <span className="text-xl text-muted-foreground">→</span>
                        </Link>
                    </ShowWrapper>
                </>
            </div>
        </div>
    );
};

export default Reports;
